from fastapi import FastAPI, Depends, HTTPException, WebSocket, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session
from telethon import TelegramClient
from telethon.errors import SessionPasswordNeededError
from telethon.sessions import StringSession
from datetime import datetime, timedelta
from types import SimpleNamespace
import base64
import csv
import hashlib
import hmac
import io
import json
import os
import secrets
import time

from .copy_trader_service import register_configured_copy_trader, start_copy_trader_background
from .database import engine, get_db, Base, SessionLocal
from .message_rules import apply_copy_setting
from .models import Bot, Channel, ChannelDestination, ActivityLog, TelegramUserSession, TradingCopySetting, bot_channel_association
from .security import decrypt_text, encrypt_text, is_encrypted
from .schemas import (
    DashboardLogin, DashboardToken, DashboardUser,
    BotCreate, BotUpdate, BotResponse, BotDetailResponse,
    ChannelCreate, ChannelUpdate, ChannelResponse, ChannelDetailResponse,
    ActivityLogResponse, ActivityLogCreate, ChannelPostCreate,
    RulePreviewRequest, RulePreviewResponse,
    TelegramSessionStatus, TelegramLoginStart, TelegramLoginVerify, TelegramLoginPassword,
    TelegramReaderStatus, BotChannelLink
)

def create_tables() -> None:
    try:
        Base.metadata.create_all(bind=engine)
    except Exception as exc:
        print(f"WARNING: Could not create tables on startup: {exc}")


def ensure_runtime_columns() -> None:
    inspector = inspect(engine)

    with engine.begin() as conn:
        bot_columns = {column["name"] for column in inspector.get_columns("bots")}
        if "session_name" not in bot_columns:
            conn.execute(text("ALTER TABLE bots ADD COLUMN session_name VARCHAR"))
        conn.execute(text("UPDATE bots SET session_name = 'session' WHERE session_name IS NULL"))

        log_columns = {column["name"] for column in inspector.get_columns("activity_logs")}
        if "channel_id" not in log_columns:
            conn.execute(text("ALTER TABLE activity_logs ADD COLUMN channel_id INTEGER"))
        if "destination_id" not in log_columns:
            conn.execute(text("ALTER TABLE activity_logs ADD COLUMN destination_id INTEGER"))
        if "destination_handle" not in log_columns:
            conn.execute(text("ALTER TABLE activity_logs ADD COLUMN destination_handle VARCHAR"))
        if "telegram_message_id" not in log_columns:
            conn.execute(text("ALTER TABLE activity_logs ADD COLUMN telegram_message_id INTEGER"))
        if "telegram_message_date" not in log_columns:
            conn.execute(text("ALTER TABLE activity_logs ADD COLUMN telegram_message_date TIMESTAMP"))
        if "delay_seconds" not in log_columns:
            conn.execute(text("ALTER TABLE activity_logs ADD COLUMN delay_seconds INTEGER"))

        channel_columns = {column["name"] for column in inspector.get_columns("channels")}
        if "forward_message" not in channel_columns:
            conn.execute(text("ALTER TABLE channels ADD COLUMN forward_message BOOLEAN"))
        conn.execute(text("UPDATE channels SET forward_message = true WHERE forward_message IS NULL"))

        table_names = set(inspector.get_table_names())
        if "trading_copy_settings" in table_names:
            setting_columns = {column["name"] for column in inspector.get_columns("trading_copy_settings")}
            if "rule_name" not in setting_columns:
                conn.execute(text("ALTER TABLE trading_copy_settings ADD COLUMN rule_name VARCHAR"))
            if "match_type" not in setting_columns:
                conn.execute(text("ALTER TABLE trading_copy_settings ADD COLUMN match_type VARCHAR"))
            if "priority" not in setting_columns:
                conn.execute(text("ALTER TABLE trading_copy_settings ADD COLUMN priority INTEGER"))
            conn.execute(text("UPDATE trading_copy_settings SET match_type = 'contains' WHERE match_type IS NULL"))
            conn.execute(text("UPDATE trading_copy_settings SET priority = 0 WHERE priority IS NULL"))


def encrypt_existing_telegram_sessions() -> None:
    db = SessionLocal()
    try:
        sessions = db.query(TelegramUserSession).filter(
            TelegramUserSession.session_string.isnot(None)
        ).all()
        changed = False
        for session in sessions:
            if session.session_string and not is_encrypted(session.session_string):
                session.session_string = encrypt_text(session.session_string)
                session.updated_at = datetime.utcnow()
                changed = True

        if changed:
            db.commit()
    finally:
        db.close()


def migrate_existing_channel_destinations() -> None:
    db = SessionLocal()
    try:
        channels = db.query(Channel).all()
        changed = False
        for channel in channels:
            if channel.destinations or not channel.target_channel:
                continue

            channel.destinations = [
                ChannelDestination(
                    destination_name=channel.target_channel.lstrip("@") or "Default Destination",
                    destination_handle=channel.target_channel,
                    is_active=True,
                    use_rule_output=True,
                )
            ]
            changed = True

        if changed:
            db.commit()
    finally:
        db.close()

app = FastAPI(title="Copy Trading Dashboard API")

DASHBOARD_ADMIN_USERNAME = os.getenv("DASHBOARD_ADMIN_USERNAME", "admin")
DASHBOARD_ADMIN_PASSWORD = os.getenv("DASHBOARD_ADMIN_PASSWORD", "changeme")
DASHBOARD_AUTH_SECRET = os.getenv("DASHBOARD_AUTH_SECRET", "change-me-before-production")
DASHBOARD_TOKEN_EXPIRE_SECONDS = int(os.getenv("DASHBOARD_TOKEN_EXPIRE_SECONDS", "43200"))
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS",
        "http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:8000,http://localhost:8000",
    ).split(",")
    if origin.strip()
]
AUTH_PUBLIC_PATHS = {"/api/auth/login", "/health"}
AUTH_PUBLIC_PREFIXES = ("/docs", "/openapi.json", "/redoc")

if (
    DASHBOARD_ADMIN_PASSWORD == "changeme"
    or DASHBOARD_AUTH_SECRET == "change-me-before-production"
):
    print("WARNING: Dashboard auth is using default credentials/secret. Change them before production.")


def base64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def base64url_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def create_access_token(username: str) -> str:
    payload = {
        "sub": username,
        "exp": int(time.time()) + DASHBOARD_TOKEN_EXPIRE_SECONDS,
    }
    payload_data = base64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signature = hmac.new(
        DASHBOARD_AUTH_SECRET.encode("utf-8"),
        payload_data.encode("ascii"),
        hashlib.sha256,
    ).digest()
    return f"{payload_data}.{base64url_encode(signature)}"


def verify_access_token(token: str) -> str | None:
    try:
        payload_data, provided_signature = token.split(".", 1)
        expected_signature = hmac.new(
            DASHBOARD_AUTH_SECRET.encode("utf-8"),
            payload_data.encode("ascii"),
            hashlib.sha256,
        ).digest()
        if not hmac.compare_digest(base64url_decode(provided_signature), expected_signature):
            return None

        payload = json.loads(base64url_decode(payload_data))
        if int(payload.get("exp", 0)) < int(time.time()):
            return None
        return payload.get("sub")
    except Exception:
        return None


def authenticated_username(request: Request) -> str:
    authorization = request.headers.get("Authorization", "")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=401, detail="Authentication required")

    username = verify_access_token(token)
    if not username:
        raise HTTPException(status_code=401, detail="Invalid or expired authentication token")
    return username


@app.middleware("http")
async def require_dashboard_auth(request: Request, call_next):
    path = request.url.path
    if request.method == "OPTIONS":
        return await call_next(request)
    if path in AUTH_PUBLIC_PATHS or any(path.startswith(prefix) for prefix in AUTH_PUBLIC_PREFIXES):
        return await call_next(request)
    if not path.startswith("/api"):
        return await call_next(request)

    authorization = request.headers.get("Authorization", "")
    scheme, _, token = authorization.partition(" ")
    username = verify_access_token(token) if scheme.lower() == "bearer" and token else None
    if not username:
        return JSONResponse(
            status_code=401,
            content={"detail": "Authentication required"},
        )

    request.state.dashboard_user = username
    return await call_next(request)


@app.post("/api/auth/login", response_model=DashboardToken)
def login_dashboard(credentials: DashboardLogin):
    if not (
        secrets.compare_digest(credentials.username, DASHBOARD_ADMIN_USERNAME)
        and secrets.compare_digest(credentials.password, DASHBOARD_ADMIN_PASSWORD)
    ):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    return {
        "access_token": create_access_token(credentials.username),
        "token_type": "bearer",
        "expires_in": DASHBOARD_TOKEN_EXPIRE_SECONDS,
    }


@app.get("/api/auth/me", response_model=DashboardUser)
def get_dashboard_user(request: Request):
    return {"username": authenticated_username(request)}


def build_copy_settings(settings: list) -> list[TradingCopySetting]:
    copy_settings = []
    for index, setting in enumerate(settings or []):
        filtered_message = setting.filtered_message.strip()
        if not filtered_message:
            continue

        output_message = setting.output_message.strip() if setting.output_message else None
        copy_settings.append(
            TradingCopySetting(
                rule_name=setting.rule_name.strip() if setting.rule_name else None,
                match_type=setting.match_type or "contains",
                filtered_message=filtered_message,
                output_message=output_message or None,
                priority=setting.priority if setting.priority is not None else index,
            )
        )

    return copy_settings


def build_channel_destinations(destinations: list) -> list[ChannelDestination]:
    built_destinations = []
    for destination in destinations or []:
        destination_handle = destination.destination_handle.strip()
        if not destination_handle:
            continue

        custom_output_message = (
            destination.custom_output_message.strip()
            if destination.custom_output_message
            else None
        )
        built_destinations.append(
            ChannelDestination(
                destination_name=destination.destination_name.strip() or destination_handle,
                destination_handle=destination_handle,
                is_active=destination.is_active,
                use_rule_output=destination.use_rule_output,
                custom_output_message=custom_output_message or None,
            )
        )

    return built_destinations


def replace_channel_copy_settings(db: Session, channel: Channel, settings: list) -> None:
    db.query(TradingCopySetting).filter(
        TradingCopySetting.channel_id == channel.id
    ).delete()
    db.flush()
    channel.copy_settings = build_copy_settings(settings)


def replace_channel_destinations(db: Session, channel: Channel, destinations: list) -> None:
    existing_destinations = list(channel.destinations)
    existing_by_id = {destination.id: destination for destination in existing_destinations}
    unmatched_ids = set(existing_by_id)
    synced_destinations = []

    for destination_data in destinations or []:
        destination_handle = destination_data.destination_handle.strip()
        if not destination_handle:
            continue

        destination = None
        destination_id = getattr(destination_data, "id", None)
        if destination_id is not None:
            destination = existing_by_id.get(destination_id)
            if destination is None:
                raise HTTPException(
                    status_code=400,
                    detail=f"Destination {destination_id} does not belong to this channel",
                )
        else:
            # Keep compatibility with clients that predate destination IDs in update payloads.
            destination = next(
                (
                    candidate
                    for candidate in existing_destinations
                    if candidate.id in unmatched_ids
                    and candidate.destination_handle == destination_handle
                ),
                None,
            )

        if destination is None:
            destination = ChannelDestination(channel=channel)
            db.add(destination)
        else:
            unmatched_ids.discard(destination.id)

        custom_output_message = (
            destination_data.custom_output_message.strip()
            if destination_data.custom_output_message
            else None
        )
        destination.destination_name = (
            destination_data.destination_name.strip() or destination_handle
        )
        destination.destination_handle = destination_handle
        destination.is_active = destination_data.is_active
        destination.use_rule_output = destination_data.use_rule_output
        destination.custom_output_message = custom_output_message or None
        synced_destinations.append(destination)

    if unmatched_ids:
        db.query(ActivityLog).filter(
            ActivityLog.destination_id.in_(unmatched_ids)
        ).update(
            {ActivityLog.destination_id: None},
            synchronize_session=False,
        )
        for destination_id in unmatched_ids:
            db.delete(existing_by_id[destination_id])

    db.flush()
    channel.target_channel = first_active_destination_handle(synced_destinations)


def first_active_destination_handle(destinations: list) -> str:
    for destination in destinations or []:
        if destination.is_active and destination.destination_handle:
            return destination.destination_handle

    for destination in destinations or []:
        if destination.destination_handle:
            return destination.destination_handle

    return ""


def active_copy_traders() -> dict[tuple[int, int], tuple[object, object]]:
    if not hasattr(app.state, "copy_traders"):
        app.state.copy_traders = {}
    return app.state.copy_traders


def start_linked_copy_trader(bot_id: int, channel_id: int) -> None:
    ensure_reader_running()


def ensure_reader_running() -> None:
    traders = active_copy_traders()
    key = ("reader", 0)
    if key in traders:
        _service, task = traders[key]
        if not task.done():
            return
        traders.pop(key)

    service, task = start_copy_trader_background()
    traders[key] = (service, task)


def start_all_active_copy_traders(db: Session) -> None:
    linked_pairs = (
        db.query(Bot.id, Channel.id)
        .join(Bot.channels)
        .filter(Bot.is_active == True)
        .all()
    )

    for linked_bot_id, linked_channel_id in linked_pairs:
        start_linked_copy_trader(linked_bot_id, linked_channel_id)


async def stop_all_copy_traders() -> None:
    traders = active_copy_traders()
    for service, task in list(traders.values()):
        await service.stop()
        task.cancel()
    traders.clear()


def telegram_session_status(session: TelegramUserSession | None) -> dict:
    if not session:
        return {"is_active": False, "needs_password": False}

    return {
        "id": session.id,
        "is_active": session.is_active,
        "needs_password": session.needs_password,
        "phone_number": session.phone_number,
        "user_id": session.user_id,
        "first_name": session.first_name,
        "username": session.username,
        "created_at": session.created_at,
        "updated_at": session.updated_at,
    }


def latest_telegram_session(db: Session) -> TelegramUserSession | None:
    return db.query(TelegramUserSession).order_by(
        TelegramUserSession.updated_at.desc(),
        TelegramUserSession.created_at.desc(),
    ).first()


async def save_authorized_session(
    db: Session,
    session: TelegramUserSession,
    client: TelegramClient,
) -> TelegramUserSession:
    me = await client.get_me()

    db.query(TelegramUserSession).filter(
        TelegramUserSession.id != session.id
    ).update({"is_active": False})

    session.session_string = client.session.save()
    session.session_string = encrypt_text(session.session_string)
    session.phone_code_hash = None
    session.needs_password = False
    session.is_active = True
    session.user_id = str(me.id)
    session.first_name = me.first_name
    session.username = me.username
    session.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(session)
    return session


async def sign_in_pending_session(
    db: Session,
    session: TelegramUserSession,
    code: str | None = None,
    password: str | None = None,
) -> TelegramUserSession:
    client = TelegramClient(
        StringSession(decrypt_text(session.session_string) or ""),
        int(session.api_id),
        session.api_hash,
    )

    await client.connect()
    try:
        if password is not None:
            await client.sign_in(password=password)
        else:
            await client.sign_in(
                phone=session.phone_number,
                code=code,
                phone_code_hash=session.phone_code_hash,
            )

        return await save_authorized_session(db, session, client)
    except SessionPasswordNeededError:
        session.session_string = encrypt_text(client.session.save())
        session.needs_password = True
        session.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(session)
        return session
    finally:
        await client.disconnect()


@app.get("/api/telegram-session/status", response_model=TelegramSessionStatus)
def get_telegram_session_status(db: Session = Depends(get_db)):
    active = db.query(TelegramUserSession).filter(
        TelegramUserSession.is_active == True
    ).order_by(TelegramUserSession.updated_at.desc()).first()

    return telegram_session_status(active or latest_telegram_session(db))


@app.get("/api/telegram-reader/status", response_model=TelegramReaderStatus)
def get_telegram_reader_status(db: Session = Depends(get_db)):
    service_task = active_copy_traders().get(("reader", 0))
    if service_task:
        service, task = service_task
        status = service.get_status()
        if task.done() and status.get("state") not in {"stopped", "invalid_session", "waiting_for_session"}:
            status = {
                **status,
                "state": "stopped",
                "is_running": False,
                "is_authorized": False,
                "last_error": "Telegram reader task is not running",
            }
    else:
        status = {
            "state": "not_started",
            "is_running": False,
            "is_authorized": False,
            "last_error": None,
            "last_connected_at": None,
            "last_disconnected_at": None,
            "reconnect_attempts": 0,
            "updated_at": datetime.utcnow().isoformat(),
        }

    active = db.query(TelegramUserSession).filter(
        TelegramUserSession.is_active == True
    ).order_by(TelegramUserSession.updated_at.desc()).first()
    status["active_session"] = telegram_session_status(active or latest_telegram_session(db))
    return status


@app.post("/api/telegram-session/start", response_model=TelegramSessionStatus)
async def start_telegram_login(login: TelegramLoginStart, db: Session = Depends(get_db)):
    client = TelegramClient(StringSession(), int(login.api_id), login.api_hash)

    await client.connect()
    try:
        sent_code = await client.send_code_request(login.phone_number)

        session = TelegramUserSession(
            api_id=login.api_id,
            api_hash=login.api_hash,
            phone_number=login.phone_number,
            session_string=encrypt_text(client.session.save()),
            phone_code_hash=sent_code.phone_code_hash,
            is_active=False,
            needs_password=False,
        )
        db.add(session)
        db.commit()
        db.refresh(session)
        return telegram_session_status(session)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Telegram login start failed: {exc}") from exc
    finally:
        await client.disconnect()


@app.post("/api/telegram-session/verify", response_model=TelegramSessionStatus)
async def verify_telegram_login(login: TelegramLoginVerify, db: Session = Depends(get_db)):
    session = latest_telegram_session(db)
    if not session or session.is_active:
        raise HTTPException(status_code=400, detail="No pending Telegram login found")

    try:
        session = await sign_in_pending_session(db, session, code=login.code)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Telegram code verification failed: {exc}") from exc

    if session.is_active:
        start_all_active_copy_traders(db)

    return telegram_session_status(session)


@app.post("/api/telegram-session/password", response_model=TelegramSessionStatus)
async def complete_telegram_2fa(login: TelegramLoginPassword, db: Session = Depends(get_db)):
    session = latest_telegram_session(db)
    if not session or not session.needs_password:
        raise HTTPException(status_code=400, detail="No Telegram 2FA password is required")

    try:
        session = await sign_in_pending_session(db, session, password=login.password)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Telegram 2FA login failed: {exc}") from exc

    if session.is_active:
        start_all_active_copy_traders(db)

    return telegram_session_status(session)


@app.delete("/api/telegram-session")
async def logout_telegram_session(db: Session = Depends(get_db)):
    await stop_all_copy_traders()
    db.query(TelegramUserSession).update({
        "is_active": False,
        "needs_password": False,
        "phone_code_hash": None,
    })
    db.commit()
    ensure_reader_running()
    return {"message": "Telegram user session deactivated"}


def get_copy_trader(bot_id: int, channel_id: int):
    return active_copy_traders().get(("reader", 0))


@app.on_event("startup")
async def on_startup() -> None:
    create_tables()
    ensure_runtime_columns()
    migrate_existing_channel_destinations()
    encrypt_existing_telegram_sessions()

    auto_register = os.getenv("COPY_TRADER_AUTO_REGISTER", "false").lower() == "true"
    if auto_register:
        db = SessionLocal()
        try:
            bot_id, channel_id = register_configured_copy_trader(db)
        finally:
            db.close()

        if bot_id and channel_id:
            start_linked_copy_trader(bot_id, channel_id)

    db = SessionLocal()
    try:
        start_all_active_copy_traders(db)
    finally:
        db.close()
    ensure_reader_running()


@app.on_event("shutdown")
async def on_shutdown() -> None:
    await stop_all_copy_traders()

# CORS middleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==================== BOT ENDPOINTS ====================

@app.get("/api/bots", response_model=list[BotResponse])
def list_bots(db: Session = Depends(get_db)):
    """Get all bots"""
    return db.query(Bot).all()


@app.post("/api/bots", response_model=BotResponse)
def create_bot(bot: BotCreate, db: Session = Depends(get_db)):
    """Create a new bot"""
    existing = db.query(Bot).filter(Bot.name == bot.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Bot with this name already exists")
    
    db_bot = Bot(**bot.dict())
    db.add(db_bot)
    db.commit()
    db.refresh(db_bot)
    return db_bot


@app.get("/api/bots/{bot_id}", response_model=BotDetailResponse)
def get_bot(bot_id: int, db: Session = Depends(get_db)):
    """Get bot details with channels and logs"""
    bot = db.query(Bot).filter(Bot.id == bot_id).first()
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")
    return bot


@app.put("/api/bots/{bot_id}", response_model=BotResponse)
def update_bot(bot_id: int, bot_update: BotUpdate, db: Session = Depends(get_db)):
    """Update bot details"""
    bot = db.query(Bot).filter(Bot.id == bot_id).first()
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")
    
    update_data = bot_update.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(bot, key, value)
    
    bot.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(bot)
    return bot


@app.delete("/api/bots/{bot_id}")
def delete_bot(bot_id: int, db: Session = Depends(get_db)):
    """Delete a bot"""
    bot = db.query(Bot).filter(Bot.id == bot_id).first()
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")
    
    db.delete(bot)
    db.commit()
    return {"message": "Bot deleted successfully"}


@app.patch("/api/bots/{bot_id}/toggle", response_model=BotResponse)
async def toggle_bot(bot_id: int, db: Session = Depends(get_db)):
    """Toggle bot active/inactive"""
    bot = db.query(Bot).filter(Bot.id == bot_id).first()
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")
    
    bot.is_active = not bot.is_active
    bot.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(bot)

    if bot.is_active:
        for channel in bot.channels:
            start_linked_copy_trader(bot.id, channel.id)
    else:
        traders = active_copy_traders()
        for key in list(traders):
            if key[0] == bot.id:
                service, task = traders.pop(key)
                await service.stop()
                task.cancel()

    return bot


# ==================== CHANNEL ENDPOINTS ====================

@app.get("/api/channels", response_model=list[ChannelDetailResponse])
def list_channels(db: Session = Depends(get_db)):
    """Get all channels"""
    return db.query(Channel).all()


@app.post("/api/channels", response_model=ChannelResponse)
def create_channel(channel: ChannelCreate, db: Session = Depends(get_db)):
    """Create a new channel"""
    existing = db.query(Channel).filter(Channel.name == channel.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Channel with this name already exists")
    
    channel_data = channel.dict(exclude={"copy_settings", "destinations"})
    db_channel = Channel(**channel_data)
    db_channel.copy_settings = build_copy_settings(channel.copy_settings)
    db_channel.destinations = build_channel_destinations(channel.destinations)
    if not db_channel.destinations and db_channel.target_channel:
        db_channel.destinations = build_channel_destinations([
            SimpleNamespace(
                destination_name=db_channel.target_channel.lstrip("@") or "Default Destination",
                destination_handle=db_channel.target_channel,
                is_active=True,
                use_rule_output=True,
                custom_output_message=None,
            )
        ])
    db_channel.target_channel = first_active_destination_handle(db_channel.destinations)
    db.add(db_channel)
    db.commit()
    db.refresh(db_channel)
    return db_channel


@app.get("/api/channels/{channel_id}", response_model=ChannelDetailResponse)
def get_channel(channel_id: int, db: Session = Depends(get_db)):
    """Get channel details with linked bots"""
    channel = db.query(Channel).filter(Channel.id == channel_id).first()
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    return channel


@app.get("/api/channels/{channel_id}/logs", response_model=list[ActivityLogResponse])
def get_channel_logs(
    channel_id: int,
    limit: int = Query(100, le=1000),
    skip: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    """Get activity logs for a channel"""
    channel = db.query(Channel).filter(Channel.id == channel_id).first()
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")

    return db.query(ActivityLog).filter(
        ActivityLog.channel_id == channel_id
    ).order_by(ActivityLog.created_at.desc()).offset(skip).limit(limit).all()


@app.post("/api/channels/{channel_id}/post-message")
async def post_channel_message(
    channel_id: int,
    post: ChannelPostCreate,
    db: Session = Depends(get_db)
):
    """Post a new CMS-authored message to the channel's destination channel."""
    channel = db.query(Channel).filter(Channel.id == channel_id).first()
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")

    bot = next((linked_bot for linked_bot in channel.bots if linked_bot.is_active), None)
    if not bot:
        raise HTTPException(status_code=400, detail="Channel has no active linked bot")

    start_linked_copy_trader(bot.id, channel.id)
    service_task = get_copy_trader(bot.id, channel.id)
    if not service_task:
        raise HTTPException(status_code=500, detail="Copy trader service is not available")

    service, _task = service_task
    try:
        await service.post_cms_message(post.message, bot.id, channel.id, post.destination_ids)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Telegram post failed: {exc}") from exc

    return {"message": "Message posted successfully"}


@app.post("/api/rules/preview", response_model=RulePreviewResponse)
def preview_copy_rule(preview: RulePreviewRequest):
    """Preview one filtered-message rule against a sample Telegram message."""
    setting = SimpleNamespace(
        id=None,
        match_type=preview.match_type,
        filtered_message=preview.filtered_message,
        output_message=preview.output_message,
        priority=0,
    )

    try:
        result = apply_copy_setting(setting, preview.sample_message)
    except Exception as exc:
        return {
            "matched": False,
            "variables": {},
            "error": str(exc),
        }

    if not result:
        return {
            "matched": False,
            "variables": {},
        }

    return {
        "matched": True,
        "output_message": result.output_message,
        "variables": result.variables or {},
    }


@app.put("/api/channels/{channel_id}", response_model=ChannelResponse)
async def update_channel(channel_id: int, channel_update: ChannelUpdate, db: Session = Depends(get_db)):
    """Update channel details"""
    channel = db.query(Channel).filter(Channel.id == channel_id).first()
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    
    update_data = channel_update.dict(exclude_unset=True, exclude={"copy_settings", "destinations"})
    for key, value in update_data.items():
        setattr(channel, key, value)

    if channel_update.copy_settings is not None:
        replace_channel_copy_settings(db, channel, channel_update.copy_settings)
    if channel_update.destinations is not None:
        replace_channel_destinations(db, channel, channel_update.destinations)
    elif "target_channel" in update_data:
        channel.target_channel = update_data.get("target_channel") or ""
    
    channel.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(channel)

    if any(bot.is_active for bot in channel.bots):
        start_linked_copy_trader(channel.bots[0].id, channel.id)

    return channel


@app.delete("/api/channels/{channel_id}")
async def delete_channel(channel_id: int, db: Session = Depends(get_db)):
    """Delete a channel"""
    channel = db.query(Channel).filter(Channel.id == channel_id).first()
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")

    db.delete(channel)
    db.commit()
    return {"message": "Channel deleted successfully"}


# ==================== BOT-CHANNEL LINKING ====================

@app.post("/api/bots/{bot_id}/channels/{channel_id}")
async def link_bot_channel(bot_id: int, channel_id: int, db: Session = Depends(get_db)):
    """Link a bot to a channel"""
    bot = db.query(Bot).filter(Bot.id == bot_id).first()
    channel = db.query(Channel).filter(Channel.id == channel_id).first()
    
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    
    if channel not in bot.channels:
        bot.channels.append(channel)
        db.commit()

    if bot.is_active:
        start_linked_copy_trader(bot.id, channel.id)
    
    return {"message": "Bot linked to channel successfully"}


@app.delete("/api/bots/{bot_id}/channels/{channel_id}")
async def unlink_bot_channel(bot_id: int, channel_id: int, db: Session = Depends(get_db)):
    """Unlink a bot from a channel"""
    bot = db.query(Bot).filter(Bot.id == bot_id).first()
    channel = db.query(Channel).filter(Channel.id == channel_id).first()
    
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    
    if channel in bot.channels:
        bot.channels.remove(channel)
        db.commit()

    return {"message": "Bot unlinked from channel successfully"}


# ==================== ACTIVITY LOG ENDPOINTS ====================

@app.get("/api/bots/{bot_id}/logs", response_model=list[ActivityLogResponse])
def get_bot_logs(
    bot_id: int,
    limit: int = Query(100, le=1000),
    skip: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    """Get activity logs for a bot"""
    bot = db.query(Bot).filter(Bot.id == bot_id).first()
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")
    
    logs = db.query(ActivityLog).filter(
        ActivityLog.bot_id == bot_id
    ).order_by(ActivityLog.created_at.desc()).offset(skip).limit(limit).all()
    
    return logs


@app.get("/api/bots/{bot_id}/logs/export")
def export_bot_logs(
    bot_id: int,
    days: int = Query(7, ge=1, le=365),
    db: Session = Depends(get_db)
):
    """Export bot logs to CSV"""
    bot = db.query(Bot).filter(Bot.id == bot_id).first()
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")
    
    start_date = datetime.utcnow() - timedelta(days=days)
    logs = db.query(ActivityLog).filter(
        ActivityLog.bot_id == bot_id,
        ActivityLog.created_at >= start_date
    ).order_by(ActivityLog.created_at.desc()).all()
    
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["ID", "Bot ID", "Message", "Log Type", "Created At"])
    for log in logs:
        writer.writerow([log.id, log.bot_id, log.message, log.log_type, log.created_at])
    
    return {
        "filename": f"bot_{bot_id}_logs_{datetime.utcnow().strftime('%Y%m%d')}.csv",
        "content": output.getvalue()
    }


@app.post("/api/bots/{bot_id}/logs")
def add_activity_log(
    bot_id: int,
    activity_log: ActivityLogCreate,
    db: Session = Depends(get_db)
):
    """Add activity log (called by bot)"""
    bot = db.query(Bot).filter(Bot.id == bot_id).first()
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")
    
    log = ActivityLog(
        bot_id=bot_id,
        channel_id=activity_log.channel_id,
        message=activity_log.message,
        log_type=activity_log.log_type
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


# ==================== WEBSOCKET (Real-time updates) ====================

class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[int, list] = {}

    async def connect(self, bot_id: int, websocket: WebSocket):
        await websocket.accept()
        if bot_id not in self.active_connections:
            self.active_connections[bot_id] = []
        self.active_connections[bot_id].append(websocket)

    def disconnect(self, bot_id: int, websocket: WebSocket):
        self.active_connections[bot_id].remove(websocket)

    async def broadcast(self, bot_id: int, message: dict):
        if bot_id in self.active_connections:
            for connection in self.active_connections[bot_id]:
                try:
                    await connection.send_json(message)
                except:
                    pass


manager = ConnectionManager()


@app.websocket("/ws/bots/{bot_id}/logs")
async def websocket_logs(websocket: WebSocket, bot_id: int):
    """WebSocket for real-time log updates"""
    await manager.connect(bot_id, websocket)
    try:
        while True:
            data = await websocket.receive_text()
    except Exception:
        manager.disconnect(bot_id, websocket)


@app.post("/api/bots/{bot_id}/notify-log")
async def notify_log(
    bot_id: int,
    activity_log: ActivityLogCreate,
    db: Session = Depends(get_db)
):
    """Notify connected WebSocket clients about new logs"""
    bot = db.query(Bot).filter(Bot.id == bot_id).first()
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")
    
    log = ActivityLog(
        bot_id=bot_id,
        channel_id=activity_log.channel_id,
        message=activity_log.message,
        log_type=activity_log.log_type
    )
    db.add(log)
    db.commit()
    db.refresh(log)

    await manager.broadcast(bot_id, {
        "type": "log_update",
        "id": log.id,
        "channel_id": log.channel_id,
        "message": log.message,
        "log_type": log.log_type,
        "timestamp": log.created_at.isoformat() if log.created_at else datetime.utcnow().isoformat()
    })
    
    return log


# ==================== HEALTH CHECK ====================

@app.get("/health")
def health_check():
    """Health check endpoint"""
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
