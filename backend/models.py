from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, ForeignKey, Table
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
    copy_settings = relationship(
        "TradingCopySetting",
        back_populates="channel",
        cascade="all, delete-orphan",
    )


class TradingCopySetting(Base):
    __tablename__ = "trading_copy_settings"

    id = Column(Integer, primary_key=True, index=True)
    channel_id = Column(Integer, ForeignKey("channels.id", ondelete="CASCADE"), index=True)
    rule_name = Column(String, nullable=True)
    match_type = Column(String, default="contains")
    filtered_message = Column(Text)
    output_message = Column(Text, nullable=True)
    priority = Column(Integer, default=0)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    channel = relationship("Channel", back_populates="copy_settings")


class ActivityLog(Base):
    __tablename__ = "activity_logs"

    id = Column(Integer, primary_key=True, index=True)
    bot_id = Column(Integer, ForeignKey("bots.id"), index=True)
    channel_id = Column(Integer, ForeignKey("channels.id"), nullable=True, index=True)
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
