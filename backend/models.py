from sqlalchemy import Column, Integer, String, Boolean, DateTime, Float, Text, ForeignKey, Table, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from datetime import datetime

from .database import Base

# Association table for bot-channel relationships
bot_channel_association = Table(
    'bot_channel_association',
    Base.metadata,
    Column('bot_id', Integer, ForeignKey('bots.id', ondelete='CASCADE')),
    Column('channel_id', Integer, ForeignKey('channels.id', ondelete='CASCADE'))
)


class Bot(Base):
    __tablename__ = "bots"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    api_id = Column(String)
    api_hash = Column(String)
    bot_token = Column(String)
    session_name = Column(String, default="session")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    channels = relationship(
        "Channel",
        secondary=bot_channel_association,
        back_populates="bots"
    )
    logs = relationship("ActivityLog", back_populates="bot", cascade="all, delete-orphan")


class Channel(Base):
    __tablename__ = "channels"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    channel_handle = Column(String, unique=True)
    target_channel = Column(String)
    forward_message = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    bots = relationship(
        "Bot",
        secondary=bot_channel_association,
        back_populates="channels"
    )
    logs = relationship("ActivityLog", back_populates="channel")
    destinations = relationship(
        "ChannelDestination",
        back_populates="channel",
        cascade="all, delete-orphan",
    )
    copy_settings = relationship(
        "TradingCopySetting",
        back_populates="channel",
        cascade="all, delete-orphan",
    )


class ChannelDestination(Base):
    __tablename__ = "channel_destinations"

    id = Column(Integer, primary_key=True, index=True)
    channel_id = Column(Integer, ForeignKey("channels.id", ondelete="CASCADE"), index=True)
    destination_name = Column(String)
    destination_handle = Column(String)
    is_active = Column(Boolean, default=True)
    use_rule_output = Column(Boolean, default=True)
    custom_output_message = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    channel = relationship("Channel", back_populates="destinations")


class TradingCopySetting(Base):
    __tablename__ = "trading_copy_settings"

    id = Column(Integer, primary_key=True, index=True)
    channel_id = Column(Integer, ForeignKey("channels.id", ondelete="CASCADE"), index=True)
    rule_name = Column(String, nullable=True)
    match_type = Column(String, default="contains")
    filtered_message = Column(Text)
    output_message = Column(Text, nullable=True)
    priority = Column(Integer, default=0)
    # Signal capture config — JSON-encoded field maps set per rule by the operator
    signal_capture_enabled = Column(Boolean, default=False)
    signal_field_map = Column(Text, nullable=True)   # JSON: {"emiten":"var","entry_price":"var",...}
    signal_target_vars = Column(Text, nullable=True)  # JSON: [{"label":"TP1","var":"tp1"},...]
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    channel = relationship("Channel", back_populates="copy_settings")


class ActivityLog(Base):
    __tablename__ = "activity_logs"

    id = Column(Integer, primary_key=True, index=True)
    bot_id = Column(Integer, ForeignKey("bots.id"), index=True)
    channel_id = Column(Integer, ForeignKey("channels.id"), nullable=True, index=True)
    destination_id = Column(Integer, ForeignKey("channel_destinations.id"), nullable=True, index=True)
    destination_handle = Column(String, nullable=True)
    telegram_message_id = Column(Integer, nullable=True, index=True)
    telegram_message_date = Column(DateTime, nullable=True)
    delay_seconds = Column(Integer, nullable=True)
    message = Column(Text)
    log_type = Column(String)  # "signal_received", "signal_sent", "error", "info"
    created_at = Column(DateTime, server_default=func.now(), index=True)

    bot = relationship("Bot", back_populates="logs")
    channel = relationship("Channel", back_populates="logs")


class TelegramUserSession(Base):
    __tablename__ = "telegram_user_sessions"

    id = Column(Integer, primary_key=True, index=True)
    api_id = Column(String)
    api_hash = Column(String)
    phone_number = Column(String)
    session_string = Column(Text, nullable=True)
    phone_code_hash = Column(String, nullable=True)
    is_active = Column(Boolean, default=False, index=True)
    needs_password = Column(Boolean, default=False)
    user_id = Column(String, nullable=True)
    first_name = Column(String, nullable=True)
    username = Column(String, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class ProcessedTelegramMessage(Base):
    __tablename__ = "processed_telegram_messages"
    __table_args__ = (
        UniqueConstraint(
            "bot_id",
            "channel_id",
            "telegram_message_id",
            name="uq_processed_telegram_message",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    bot_id = Column(Integer, ForeignKey("bots.id"), index=True)
    channel_id = Column(Integer, ForeignKey("channels.id"), index=True)
    telegram_message_id = Column(Integer, index=True)
    telegram_message_date = Column(DateTime, nullable=True)
    processed_at = Column(DateTime, server_default=func.now(), index=True)


class InstrumentSymbolMap(Base):
    """Maps operator-typed names (e.g. "GOLD", "XAUUSD") to price-feed symbols (e.g. "XAU/USD")."""
    __tablename__ = "instrument_symbol_maps"

    id = Column(Integer, primary_key=True, index=True)
    display_name = Column(String, nullable=False, unique=True, index=True)
    price_feed_symbol = Column(String, nullable=False)
    active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class Signal(Base):
    __tablename__ = "signals"

    id = Column(Integer, primary_key=True, index=True)
    bot_id = Column(Integer, ForeignKey("bots.id"), nullable=True, index=True)
    channel_id = Column(Integer, ForeignKey("channels.id"), nullable=True, index=True)
    source_message_id = Column(Integer, nullable=True, index=True)
    emiten = Column(String, nullable=True)
    price_feed_symbol = Column(String, nullable=True, index=True)
    signal_type = Column(String, nullable=True)          # "BUY" / "SELL"
    entry_price = Column(Float, nullable=True)
    stop_loss = Column(Float, nullable=True)
    exit_price = Column(Float, nullable=True)
    status = Column(String, default="OPEN", nullable=False, index=True)  # OPEN / TP_HIT / SL_HIT / CLOSED
    pending_sl_broadcast = Column(Boolean, default=False, index=True)
    raw_message = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now(), index=True)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    targets = relationship("SignalTarget", back_populates="signal", cascade="all, delete-orphan")
    bot = relationship("Bot")
    channel = relationship("Channel")


class SignalTarget(Base):
    __tablename__ = "signal_targets"

    id = Column(Integer, primary_key=True, index=True)
    signal_id = Column(Integer, ForeignKey("signals.id", ondelete="CASCADE"), nullable=False, index=True)
    label = Column(String, nullable=False)   # e.g. "TP1", "TP2"
    price = Column(Float, nullable=False)
    achieved = Column(Boolean, default=False, nullable=False)
    achieved_at = Column(DateTime, nullable=True)
    achieved_by = Column(String, nullable=True)  # "AUTO" / "MANUAL"

    signal = relationship("Signal", back_populates="targets")
