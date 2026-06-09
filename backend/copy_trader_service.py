import asyncio
import json
import os
import re
import urllib.error
import urllib.request
from typing import Optional

from sqlalchemy.orm import Session
from telethon import TelegramClient, events
from telethon.sessions import StringSession

from .database import SessionLocal
from .message_rules import apply_copy_settings
from .models import ActivityLog, Bot, Channel, TelegramUserSession


ENTRY_KEYWORDS = [
    "READY FOR THE SIGNAL",
    "GOLD BUY NOW",
    "GOLD SELL NOW",
    "XAUUSD BUY",
    "XAUUSD SELL",
]

class CopyTraderService:
    def __init__(self, bot_id: int, channel_id: int):
        self.bot_id = bot_id
        self.channel_id = channel_id
        self.reader_client: Optional[TelegramClient] = None
        self.last_signal: Optional[str] = None
        self.ready = asyncio.Event()

    async def start(self):
        db = SessionLocal()
        try:
            bot = db.query(Bot).filter(Bot.id == self.bot_id).first()
            channel = db.query(Channel).filter(Channel.id == self.channel_id).first()
            if not bot or not channel:
                return

            if not bot.is_active:
                print(f"Copy trader {self.bot_id}/{self.channel_id} did not start because bot is inactive.")
                return

            user_session = get_active_user_session(db)
            if not user_session:
                self._log(
                    db,
                    "Telegram user session is not active. Complete Telegram login in the dashboard before starting listeners.",
                    "error",
                )
                return

            self.reader_client = build_user_reader_client(user_session)

            @self.reader_client.on(events.NewMessage(chats=channel.channel_handle))
            async def handler(event):
                await self._handle_message(event)

            await self.reader_client.connect()
            if not await self.reader_client.is_user_authorized():
                self._log(
                    db,
                    "Telegram user session is not authorized. Log in the user session before starting the backend.",
                    "error",
                )
                await self.reader_client.disconnect()
                return

            self.ready.set()
            print(
                f"Copy trader started. Listening to {channel.channel_handle}, forwarding to {channel.target_channel}.",
            )
        finally:
            db.close()

        await self.reader_client.run_until_disconnected()

    async def stop(self):
        if self.reader_client:
            await self.reader_client.disconnect()
        self.ready.clear()

    async def post_cms_message(self, message: str):
        await asyncio.wait_for(self.ready.wait(), timeout=15)

        db = SessionLocal()
        try:
            channel = db.query(Channel).filter(Channel.id == self.channel_id).first()
            if not channel:
                raise ValueError("Channel not found")

            text = message.strip()
            if not text:
                raise ValueError("Message cannot be empty")

            try:
                await post_with_bot_token(self.bot_id, channel.target_channel, text)
            except Exception as exc:
                self._log(db, f"Failed to post CMS message to {channel.target_channel}: {exc}", "error")
                raise

            self._log(db, f"CMS message posted to {channel.target_channel}: {text}", "cms_post_sent")
        finally:
            db.close()

    async def _handle_message(self, event):
        db = SessionLocal()
        try:
            bot = db.query(Bot).filter(Bot.id == self.bot_id).first()
            channel = db.query(Channel).filter(Channel.id == self.channel_id).first()
            if not bot or not channel:
                return

            msg = event.message.text or event.message.message or ""
            if not msg:
                msg = getattr(event.message, "caption", "") or ""

            text = msg.strip()
            if not text:
                self._log(db, f"Non-text activity received from {channel.channel_handle}", "channel_activity")
                return

            cleaned = clean_message(text)
            self._log(db, f"Message received from {channel.channel_handle}: {cleaned}", "channel_activity")

            if not channel.forward_message:
                self._log(db, f"Forward message is disabled for {channel.channel_handle}", "message_ignored")
                return

            if not channel.target_channel:
                self._log(db, f"Target channel is empty for {channel.channel_handle}", "error")
                return

            configured_output = apply_copy_settings(channel.copy_settings, text)
            if channel.copy_settings:
                if not configured_output:
                    self._log(db, f"Message did not match any filtered message for {channel.channel_handle}", "message_filtered")
                    return

                try:
                    await post_with_bot_token(bot.id, channel.target_channel, configured_output.output_message)
                except Exception as exc:
                    self._log(db, f"Failed to post configured output to {channel.target_channel}: {exc}", "error")
                    return

                self._log(db, f"Configured output posted to {channel.target_channel}: {configured_output.output_message}", "template_sent")
                return

            signal = find_entry_keyword(text)
            if not signal:
                if not should_forward_all_messages():
                    self._log(db, f"Ignored message without entry keyword from {channel.channel_handle}", "signal_ignored")
                    return

                self._log(db, f"Forwarding non-signal message to {channel.target_channel}", "message_received")
            else:
                if signal == self.last_signal:
                    self._log(db, f"Ignored duplicate signal: {signal}", "signal_duplicate")
                    return

                self._log(db, f"Signal matched ({signal}); forwarding to {channel.target_channel}", "signal_received")

            try:
                await post_with_bot_token(bot.id, channel.target_channel, cleaned)
            except Exception as exc:
                self._log(db, f"Failed to post copied message to {channel.target_channel}: {exc}", "error")
                return

            if signal:
                self.last_signal = signal
                self._log(db, f"Signal forwarded to {channel.target_channel}: {cleaned}", "signal_sent")
            else:
                self._log(db, f"Message forwarded to {channel.target_channel}: {cleaned}", "message_sent")
        finally:
            db.close()

    def _log(self, db: Session, message: str, log_type: str):
        log = ActivityLog(
            bot_id=self.bot_id,
            channel_id=self.channel_id,
            message=message,
            log_type=log_type,
        )
        db.add(log)
        db.commit()


def clean_message(message: str) -> str:
    message = re.sub(r"http\S+", "", message)
    message = re.sub(r"\s+", " ", message)
    return message.strip()


def find_entry_keyword(text: str) -> Optional[str]:
    upper = text.upper()
    for keyword in ENTRY_KEYWORDS:
        if keyword in upper:
            return keyword
    return None


def should_forward_all_messages() -> bool:
    return os.getenv("COPY_TRADER_FORWARD_ALL", "true").lower() == "true"


def get_active_user_session(db: Session) -> Optional[TelegramUserSession]:
    return db.query(TelegramUserSession).filter(
        TelegramUserSession.is_active == True
    ).order_by(TelegramUserSession.updated_at.desc()).first()


def build_user_reader_client(user_session: TelegramUserSession) -> TelegramClient:
    return TelegramClient(
        StringSession(user_session.session_string),
        int(user_session.api_id),
        user_session.api_hash,
    )


async def post_with_bot_token(bot_id: int, target_channel: str, message: str) -> None:
    db = SessionLocal()
    try:
        bot = db.query(Bot).filter(Bot.id == bot_id).first()
        if not bot:
            raise ValueError("Bot not found")

        await asyncio.to_thread(send_bot_message, bot.bot_token, target_channel, message)
    finally:
        db.close()


def send_bot_message(bot_token: str, target_channel: str, message: str) -> None:
    request = urllib.request.Request(
        f"https://api.telegram.org/bot{bot_token}/sendMessage",
        data=json.dumps({
            "chat_id": target_channel,
            "text": message,
        }).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            response_body = response.read().decode("utf-8")
            if response.status >= 400:
                raise RuntimeError(f"{response.status} {response_body}")
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"{exc.code} {exc.read().decode('utf-8')}") from exc


def register_configured_copy_trader(db: Session) -> tuple[Optional[int], Optional[int]]:
    api_id = os.getenv("TELEGRAM_API_ID")
    api_hash = os.getenv("TELEGRAM_API_HASH")
    bot_token = os.getenv("TELEGRAM_BOT_TOKEN")
    session_name = os.getenv("TELEGRAM_SESSION_NAME", "session")
    source_channel = os.getenv("TELEGRAM_SOURCE_CHANNEL")
    target_channel = os.getenv("TELEGRAM_TARGET_CHANNEL")

    bot = db.query(Bot).filter(Bot.bot_token == bot_token).first()
    if not bot:
        bot = db.query(Bot).filter(Bot.name == "Telegram Copy Trader").first()

    if not bot:
        bot = Bot(
            name="Telegram Copy Trader",
            api_id=api_id,
            api_hash=api_hash,
            bot_token=bot_token,
            session_name=session_name,
            is_active=True,
        )
        db.add(bot)
    else:
        bot.api_id = api_id
        bot.api_hash = api_hash
        bot.bot_token = bot_token
        bot.session_name = session_name

    channel = db.query(Channel).filter(Channel.channel_handle == source_channel).first()
    if not channel:
        channel = Channel(
            name=source_channel.lstrip("@") or "Source Channel",
            channel_handle=source_channel,
            target_channel=target_channel,
        )
        db.add(channel)
    else:
        channel.target_channel = target_channel

    db.commit()
    db.refresh(bot)
    db.refresh(channel)

    if channel not in bot.channels:
        bot.channels.append(channel)
        db.commit()

    return bot.id, channel.id


def start_copy_trader_background(bot_id: int, channel_id: int):
    service = CopyTraderService(bot_id=bot_id, channel_id=channel_id)
    task = asyncio.create_task(service.start())
    return service, task
