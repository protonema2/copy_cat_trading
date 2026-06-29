import asyncio
import json
import os
import re
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload
from telethon import TelegramClient, events
from telethon.sessions import StringSession

from .database import SessionLocal
from .message_rules import apply_copy_settings, render_output_template
from .models import (
    ActivityLog,
    Bot,
    Channel,
    ChannelDestination,
    ProcessedTelegramMessage,
    TelegramUserSession,
)
from .security import decrypt_text


ENTRY_KEYWORDS = [
    "READY FOR THE SIGNAL",
    "GOLD BUY NOW",
    "GOLD SELL NOW",
    "XAUUSD BUY",
    "XAUUSD SELL",
]


class CopyTraderService:
    def __init__(self, bot_id: int | None = None, channel_id: int | None = None):
        self.bot_id = bot_id
        self.channel_id = channel_id
        self.reader_client: Optional[TelegramClient] = None
        self.ready = asyncio.Event()
        self.poll_task: Optional[asyncio.Task] = None
        self.last_signals: dict[tuple[int, int], str] = {}
        self.stop_requested = False
        self.reconnect_attempts = 0
        self.waiting_for_session_logged = False
        self.last_alert_key: str | None = None
        self.status = {
            "state": "idle",
            "is_running": False,
            "is_authorized": False,
            "last_error": None,
            "last_connected_at": None,
            "last_disconnected_at": None,
            "reconnect_attempts": 0,
            "updated_at": datetime.utcnow().isoformat(),
        }

    async def start(self):
        self.stop_requested = False

        while not self.stop_requested:
            wait_for_session = False
            db = SessionLocal()
            try:
                self.set_status("starting", is_running=False, is_authorized=False, last_error=None)
                user_session = get_active_user_session(db)
                if not user_session:
                    message = "Telegram user session is not active. Complete Telegram login in the dashboard before starting listeners."
                    if not self.waiting_for_session_logged:
                        log_system_error(db, message)
                        self.waiting_for_session_logged = True
                    await self.send_alert_once(
                        db,
                        "waiting_for_session",
                        f"CopyCat alert: Telegram user session is not active. Copy forwarding is waiting for a new Telegram login.",
                    )
                    self.set_status("waiting_for_session", is_running=False, is_authorized=False, last_error=message)
                    self.ready.clear()
                    wait_for_session = True
                else:
                    self.waiting_for_session_logged = False
                    self.reader_client = build_user_reader_client(user_session)

                    @self.reader_client.on(events.NewMessage)
                    async def handler(event):
                        await self.handle_telegram_message(event.message, source="live")

                    await self.reader_client.connect()
                    if not await self.reader_client.is_user_authorized():
                        message = "Telegram user session is not authorized. Log in the user session before starting the backend."
                        log_system_error(db, message)
                        user_session.is_active = False
                        user_session.updated_at = datetime.utcnow()
                        db.commit()
                        await self.reader_client.disconnect()
                        self.reader_client = None
                        self.ready.clear()
                        await self.send_alert_once(
                            db,
                            "invalid_session",
                            f"CopyCat alert: Telegram user session is invalid or unauthorized. Copy forwarding is paused until you log in again.",
                        )
                        self.set_status("invalid_session", is_running=False, is_authorized=False, last_error=message)
                        wait_for_session = True
                    else:
                        self.ready.set()
                        self.reconnect_attempts = 0
                        self.last_alert_key = None
                        self.set_status(
                            "connected",
                            is_running=True,
                            is_authorized=True,
                            last_error=None,
                            last_connected_at=datetime.utcnow().isoformat(),
                            reconnect_attempts=0,
                        )
                        self.poll_task = asyncio.create_task(self.poll_recent_messages())
                        print("Copy trader reader started. Listening to active linked channels.")
            except Exception as exc:
                db.rollback()
                self.ready.clear()
                self.reconnect_attempts += 1
                self.set_status(
                    "error",
                    is_running=False,
                    is_authorized=False,
                    last_error=str(exc),
                    reconnect_attempts=self.reconnect_attempts,
                )
                log_system_error(db, f"Copy trader reader failed to start: {exc}")
            finally:
                db.close()

            if wait_for_session:
                await self.wait_for_session_delay()
                continue

            if not self.reader_client or not self.reader_client.is_connected():
                await self.reconnect_delay()
                continue

            try:
                await self.reader_client.run_until_disconnected()
                if not self.stop_requested:
                    self.reconnect_attempts += 1
                    await self.send_alert_once(
                        db=None,
                        key="reader_disconnected",
                        message="CopyCat alert: Telegram reader disconnected. The service will keep trying to reconnect.",
                    )
                    self.set_status(
                        "disconnected",
                        is_running=False,
                        is_authorized=False,
                        last_error="Telegram reader disconnected",
                        last_disconnected_at=datetime.utcnow().isoformat(),
                        reconnect_attempts=self.reconnect_attempts,
                    )
            except Exception as exc:
                self.reconnect_attempts += 1
                await self.send_alert_once(
                    db=None,
                    key="reader_disconnected",
                    message=f"CopyCat alert: Telegram reader disconnected: {exc}. The service will keep trying to reconnect.",
                )
                self.set_status(
                    "disconnected",
                    is_running=False,
                    is_authorized=False,
                    last_error=str(exc),
                    last_disconnected_at=datetime.utcnow().isoformat(),
                    reconnect_attempts=self.reconnect_attempts,
                )
            finally:
                self.ready.clear()
                if self.poll_task:
                    self.poll_task.cancel()
                    self.poll_task = None
                if self.reader_client:
                    await self.reader_client.disconnect()
                    self.reader_client = None

            if not self.stop_requested:
                await self.reconnect_delay()

    async def stop(self):
        self.stop_requested = True
        if self.poll_task:
            self.poll_task.cancel()
        if self.reader_client:
            await self.reader_client.disconnect()
        self.ready.clear()
        self.set_status(
            "stopped",
            is_running=False,
            is_authorized=False,
            last_disconnected_at=datetime.utcnow().isoformat(),
        )

    async def reconnect_delay(self):
        delay = min(60, 5 * max(1, self.reconnect_attempts))
        await asyncio.sleep(delay)

    async def wait_for_session_delay(self):
        await asyncio.sleep(int(os.getenv("COPY_TRADER_SESSION_WAIT_SECONDS", "15")))

    async def send_alert_once(self, db: Session | None, key: str, message: str) -> None:
        if self.last_alert_key == key:
            return

        self.last_alert_key = key
        await send_system_alert(db, message)

    def set_status(self, state: str, **updates):
        self.status.update(updates)
        self.status["state"] = state
        self.status["updated_at"] = datetime.utcnow().isoformat()
        self.status["reconnect_attempts"] = self.reconnect_attempts if "reconnect_attempts" not in updates else updates["reconnect_attempts"]

    def get_status(self) -> dict:
        return dict(self.status)

    async def post_cms_message(
        self,
        message: str,
        bot_id: int | None = None,
        channel_id: int | None = None,
        destination_ids: list[int] | None = None,
    ):
        await asyncio.wait_for(self.ready.wait(), timeout=15)

        db = SessionLocal()
        try:
            target_bot_id = bot_id or self.bot_id
            target_channel_id = channel_id or self.channel_id
            channel = db.query(Channel).filter(Channel.id == target_channel_id).first()
            if not channel or not target_bot_id:
                raise ValueError("Channel or bot not found")

            text = message.strip()
            if not text:
                raise ValueError("Message cannot be empty")

            destinations = get_selected_destinations(channel, destination_ids)
            if not destinations:
                raise ValueError("Channel has no active destinations")

            for destination in destinations:
                try:
                    await post_with_bot_token(target_bot_id, destination.destination_handle, text)
                except Exception as exc:
                    self.log_activity(
                        db,
                        target_bot_id,
                        target_channel_id,
                        f"Failed to post CMS message to {destination.destination_handle}: {exc}",
                        "error",
                        destination_id=destination.id,
                        destination_handle=destination.destination_handle,
                    )
                    continue

                self.log_activity(
                    db,
                    target_bot_id,
                    target_channel_id,
                    f"CMS message posted to {destination.destination_handle}: {text}",
                    "cms_post_sent",
                    destination_id=destination.id,
                    destination_handle=destination.destination_handle,
                )
        finally:
            db.close()

    async def handle_telegram_message(self, message, source: str):
        db = SessionLocal()
        try:
            active_pairs = get_active_channel_pairs(db)
            if not active_pairs:
                return

            matched_pairs = []
            for bot, channel in active_pairs:
                if await message_matches_channel(self.reader_client, message, channel):
                    matched_pairs.append((bot, channel))

            for bot, channel in matched_pairs:
                await self.process_message_for_pair(db, bot, channel, message, source)
        finally:
            db.close()

    async def poll_recent_messages(self):
        interval = int(os.getenv("COPY_TRADER_POLL_INTERVAL_SECONDS", "15"))
        limit = int(os.getenv("COPY_TRADER_POLL_LIMIT", "5"))

        while True:
            try:
                await asyncio.sleep(interval)
                await self.ready.wait()

                db = SessionLocal()
                try:
                    unique_channels = {
                        channel.id: channel
                        for _bot, channel in get_active_channel_pairs(db)
                    }
                finally:
                    db.close()

                for channel in unique_channels.values():
                    try:
                        async for message in self.reader_client.iter_messages(
                            channel.channel_handle,
                            limit=limit,
                        ):
                            await self.handle_telegram_message(message, source="poll")
                    except Exception as exc:
                        db = SessionLocal()
                        try:
                            log_system_error(
                                db,
                                f"Polling failed for {channel.channel_handle}: {exc}",
                                channel_id=channel.id,
                            )
                        finally:
                            db.close()
            except asyncio.CancelledError:
                return
            except Exception as exc:
                db = SessionLocal()
                try:
                    log_system_error(db, f"Copy trader polling loop failed: {exc}")
                finally:
                    db.close()

    async def process_message_for_pair(self, db: Session, bot: Bot, channel: Channel, message, source: str):
        telegram_message_id = getattr(message, "id", None)
        telegram_message_date = normalize_datetime(getattr(message, "date", None))
        delay_seconds = calculate_delay_seconds(telegram_message_date)

        if telegram_message_id and not mark_message_processed(
            db,
            bot.id,
            channel.id,
            telegram_message_id,
            telegram_message_date,
        ):
            return

        msg = message.text or message.message or ""
        if not msg:
            msg = getattr(message, "caption", "") or ""

        text = msg.strip()
        if not text:
            self.log_activity(
                db,
                bot.id,
                channel.id,
                f"Non-text activity received from {channel.channel_handle}",
                "channel_activity",
                telegram_message_id,
                telegram_message_date,
                delay_seconds,
            )
            return

        cleaned = clean_message(text)
        self.log_activity(
            db,
            bot.id,
            channel.id,
            f"Message received from {channel.channel_handle} via {source}; delay={delay_seconds}s: {cleaned}",
            "channel_activity",
            telegram_message_id,
            telegram_message_date,
            delay_seconds,
        )

        if not channel.forward_message:
            self.log_activity(
                db,
                bot.id,
                channel.id,
                f"Forward message is disabled for {channel.channel_handle}",
                "message_ignored",
                telegram_message_id,
                telegram_message_date,
                delay_seconds,
            )
            return

        destinations = get_active_destinations(channel)
        if not destinations:
            self.log_activity(
                db,
                bot.id,
                channel.id,
                f"No active destination channels configured for {channel.channel_handle}",
                "error",
                telegram_message_id,
                telegram_message_date,
                delay_seconds,
            )
            return

        configured_output = apply_copy_settings(channel.copy_settings, text)
        if channel.copy_settings:
            if not configured_output:
                self.log_activity(
                    db,
                    bot.id,
                    channel.id,
                    f"Message did not match any filtered message for {channel.channel_handle}",
                    "message_filtered",
                    telegram_message_id,
                    telegram_message_date,
                    delay_seconds,
                )
                return

            try:
                await self.post_to_destinations(
                    db,
                    bot,
                    channel,
                    destinations,
                    configured_output.output_message,
                    configured_output.variables or {},
                    "template_sent",
                    telegram_message_id,
                    telegram_message_date,
                    delay_seconds,
                )
            except Exception:
                pass
            return

        signal = find_entry_keyword(text)
        if not signal:
            if not should_forward_all_messages():
                self.log_activity(
                    db,
                    bot.id,
                    channel.id,
                    f"Ignored message without entry keyword from {channel.channel_handle}",
                    "signal_ignored",
                    telegram_message_id,
                    telegram_message_date,
                    delay_seconds,
                )
                return

            self.log_activity(
                db,
                bot.id,
                channel.id,
                f"Forwarding non-signal message to {len(destinations)} destination(s)",
                "message_received",
                telegram_message_id,
                telegram_message_date,
                delay_seconds,
            )
        else:
            signal_key = (bot.id, channel.id)
            if signal == self.last_signals.get(signal_key):
                self.log_activity(
                    db,
                    bot.id,
                    channel.id,
                    f"Ignored duplicate signal: {signal}",
                    "signal_duplicate",
                    telegram_message_id,
                    telegram_message_date,
                    delay_seconds,
                )
                return

            self.log_activity(
                db,
                bot.id,
                channel.id,
                f"Signal matched ({signal}); forwarding to {len(destinations)} destination(s)",
                "signal_received",
                telegram_message_id,
                telegram_message_date,
                delay_seconds,
            )

        await self.post_to_destinations(
            db,
            bot,
            channel,
            destinations,
            cleaned,
            {"original_message": text},
            "signal_sent" if signal else "message_sent",
            telegram_message_id,
            telegram_message_date,
            delay_seconds,
        )

        if signal:
            self.last_signals[(bot.id, channel.id)] = signal

    async def post_to_destinations(
        self,
        db: Session,
        bot: Bot,
        channel: Channel,
        destinations: list[ChannelDestination],
        default_message: str,
        variables: dict[str, str],
        success_log_type: str,
        telegram_message_id: int | None,
        telegram_message_date: datetime | None,
        delay_seconds: int | None,
    ):
        for destination in destinations:
            output_message = resolve_destination_output(destination, default_message, variables)
            try:
                await post_with_bot_token(bot.id, destination.destination_handle, output_message)
            except Exception as exc:
                self.log_activity(
                    db,
                    bot.id,
                    channel.id,
                    f"Failed to post to {destination.destination_handle}: {exc}",
                    "error",
                    telegram_message_id,
                    telegram_message_date,
                    delay_seconds,
                    destination_id=destination.id,
                    destination_handle=destination.destination_handle,
                )
                continue

            self.log_activity(
                db,
                bot.id,
                channel.id,
                f"Posted to {destination.destination_handle}: {output_message}",
                success_log_type,
                telegram_message_id,
                telegram_message_date,
                delay_seconds,
                destination_id=destination.id,
                destination_handle=destination.destination_handle,
            )

    def log_activity(
        self,
        db: Session,
        bot_id: int,
        channel_id: int | None,
        message: str,
        log_type: str,
        telegram_message_id: int | None = None,
        telegram_message_date: datetime | None = None,
        delay_seconds: int | None = None,
        destination_id: int | None = None,
        destination_handle: str | None = None,
    ):
        log = ActivityLog(
            bot_id=bot_id,
            channel_id=channel_id,
            destination_id=destination_id,
            destination_handle=destination_handle,
            telegram_message_id=telegram_message_id,
            telegram_message_date=telegram_message_date,
            delay_seconds=delay_seconds,
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


def get_active_channel_pairs(db: Session) -> list[tuple[Bot, Channel]]:
    bots = db.query(Bot).options(
        selectinload(Bot.channels).selectinload(Channel.copy_settings),
        selectinload(Bot.channels).selectinload(Channel.destinations),
    ).filter(Bot.is_active == True).all()

    return [
        (bot, channel)
        for bot in bots
        for channel in bot.channels
    ]


def get_active_destinations(channel: Channel) -> list[ChannelDestination]:
    destinations = [
        destination
        for destination in channel.destinations
        if destination.is_active and destination.destination_handle
    ]
    if destinations:
        return destinations

    if channel.target_channel:
        return [
            ChannelDestination(
                id=None,
                channel_id=channel.id,
                destination_name=channel.target_channel,
                destination_handle=channel.target_channel,
                is_active=True,
                use_rule_output=True,
            )
        ]

    return []


def get_selected_destinations(channel: Channel, destination_ids: list[int] | None) -> list[ChannelDestination]:
    active_destinations = get_active_destinations(channel)
    if not destination_ids:
        return active_destinations

    selected_ids = {int(destination_id) for destination_id in destination_ids}
    return [
        destination
        for destination in active_destinations
        if destination.id in selected_ids
    ]


def resolve_destination_output(
    destination: ChannelDestination,
    default_message: str,
    variables: dict[str, str],
) -> str:
    if destination.use_rule_output or not destination.custom_output_message:
        return default_message

    return render_output_template(destination.custom_output_message, default_message, variables)


def build_user_reader_client(user_session: TelegramUserSession) -> TelegramClient:
    return TelegramClient(
        StringSession(decrypt_text(user_session.session_string) or ""),
        int(user_session.api_id),
        user_session.api_hash,
    )


async def message_matches_channel(client: TelegramClient, message, channel: Channel) -> bool:
    try:
        chat = await message.get_chat()
    except Exception:
        chat = None

    handle = (channel.channel_handle or "").strip().lower()
    if not handle:
        return False

    candidates = set()

    if chat is not None:
        username = getattr(chat, "username", None)
        if username:
            candidates.add(username.lower())
            candidates.add(f"@{username.lower()}")

        chat_id = getattr(chat, "id", None)
        if chat_id is not None:
            candidates.add(str(chat_id))
            candidates.add(str(get_peer_id(chat_id)))

    return handle in candidates or handle.lstrip("@") in candidates


def get_peer_id(chat_id: int) -> int:
    return int(f"-100{chat_id}") if chat_id > 0 else chat_id


def mark_message_processed(
    db: Session,
    bot_id: int,
    channel_id: int,
    telegram_message_id: int,
    telegram_message_date: datetime | None,
) -> bool:
    processed = ProcessedTelegramMessage(
        bot_id=bot_id,
        channel_id=channel_id,
        telegram_message_id=telegram_message_id,
        telegram_message_date=telegram_message_date,
    )
    db.add(processed)

    try:
        db.commit()
        return True
    except IntegrityError:
        db.rollback()
        return False


def normalize_datetime(value) -> datetime | None:
    if not value:
        return None

    if value.tzinfo is not None:
        return value.astimezone(timezone.utc).replace(tzinfo=None)

    return value


def calculate_delay_seconds(telegram_message_date: datetime | None) -> int | None:
    if not telegram_message_date:
        return None

    return max(0, int((datetime.utcnow() - telegram_message_date).total_seconds()))


def log_system_error(
    db: Session,
    message: str,
    channel_id: int | None = None,
):
    bot = db.query(Bot).filter(Bot.is_active == True).first()
    if not bot:
        print(message)
        return

    log = ActivityLog(
        bot_id=bot.id,
        channel_id=channel_id,
        message=message,
        log_type="error",
    )
    db.add(log)
    db.commit()


async def send_system_alert(db: Session | None, message: str) -> None:
    alert_chat_id = os.getenv("COPY_TRADER_ALERT_CHAT_ID", "").strip()
    if not alert_chat_id:
        return

    owns_db = db is None
    active_db = db or SessionLocal()
    try:
        bot = active_db.query(Bot).filter(Bot.is_active == True).first()
        if not bot:
            print(f"Could not send alert because no active bot exists: {message}")
            return

        await asyncio.to_thread(send_bot_message, bot.bot_token, alert_chat_id, message)
    except Exception as exc:
        print(f"Could not send Telegram alert: {exc}")
    finally:
        if owns_db:
            active_db.close()


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


def start_copy_trader_background(bot_id: int | None = None, channel_id: int | None = None):
    service = CopyTraderService(bot_id=bot_id, channel_id=channel_id)
    task = asyncio.create_task(service.start())
    return service, task
