from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional


class DashboardLogin(BaseModel):
    username: str
    password: str


class DashboardToken(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class DashboardUser(BaseModel):
    username: str


class BotCreate(BaseModel):
    name: str
    api_id: str
    api_hash: str
    bot_token: str
    session_name: str = "session"


class BotUpdate(BaseModel):
    name: Optional[str] = None
    api_id: Optional[str] = None
    api_hash: Optional[str] = None
    bot_token: Optional[str] = None
    session_name: Optional[str] = None
    is_active: Optional[bool] = None


class BotResponse(BaseModel):
    id: int
    name: str
    api_id: str
    api_hash: str
    bot_token: str
    session_name: str
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class BotDetailResponse(BotResponse):
    channels: List["ChannelResponse"] = []
    logs: List["ActivityLogResponse"] = []


class TradingCopySettingCreate(BaseModel):
    rule_name: Optional[str] = None
    match_type: str = "contains"
    filtered_message: str
    output_message: Optional[str] = None
    priority: int = 0


class TradingCopySettingResponse(BaseModel):
    id: int
    channel_id: int
    rule_name: Optional[str] = None
    match_type: str
    filtered_message: str
    output_message: Optional[str] = None
    priority: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ChannelDestinationCreate(BaseModel):
    destination_name: str
    destination_handle: str
    is_active: bool = True
    use_rule_output: bool = True
    custom_output_message: Optional[str] = None


class ChannelDestinationResponse(BaseModel):
    id: int
    channel_id: int
    destination_name: str
    destination_handle: str
    is_active: bool
    use_rule_output: bool
    custom_output_message: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ChannelCreate(BaseModel):
    name: str
    channel_handle: str
    target_channel: str = ""
    forward_message: bool = True
    copy_settings: List[TradingCopySettingCreate] = []
    destinations: List[ChannelDestinationCreate] = []


class ChannelUpdate(BaseModel):
    name: Optional[str] = None
    channel_handle: Optional[str] = None
    target_channel: Optional[str] = None
    forward_message: Optional[bool] = None
    copy_settings: Optional[List[TradingCopySettingCreate]] = None
    destinations: Optional[List[ChannelDestinationCreate]] = None


class ChannelResponse(BaseModel):
    id: int
    name: str
    channel_handle: str
    target_channel: str
    forward_message: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ChannelDetailResponse(ChannelResponse):
    bots: List["BotResponse"] = []
    logs: List["ActivityLogResponse"] = []
    copy_settings: List["TradingCopySettingResponse"] = []
    destinations: List["ChannelDestinationResponse"] = []


class ActivityLogResponse(BaseModel):
    id: int
    bot_id: int
    channel_id: Optional[int] = None
    destination_id: Optional[int] = None
    destination_handle: Optional[str] = None
    telegram_message_id: Optional[int] = None
    telegram_message_date: Optional[datetime] = None
    delay_seconds: Optional[int] = None
    message: str
    log_type: str
    created_at: datetime

    class Config:
        from_attributes = True


class ActivityLogCreate(BaseModel):
    message: str
    log_type: str = "info"
    channel_id: Optional[int] = None


class ChannelPostCreate(BaseModel):
    message: str
    destination_ids: Optional[List[int]] = None


class RulePreviewRequest(BaseModel):
    sample_message: str
    match_type: str = "contains"
    filtered_message: str
    output_message: Optional[str] = None


class RulePreviewResponse(BaseModel):
    matched: bool
    output_message: Optional[str] = None
    variables: dict[str, str] = {}
    error: Optional[str] = None


class TelegramSessionStatus(BaseModel):
    id: Optional[int] = None
    is_active: bool
    needs_password: bool = False
    phone_number: Optional[str] = None
    user_id: Optional[str] = None
    first_name: Optional[str] = None
    username: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class TelegramReaderStatus(BaseModel):
    state: str
    is_running: bool
    is_authorized: bool
    last_error: Optional[str] = None
    last_connected_at: Optional[str] = None
    last_disconnected_at: Optional[str] = None
    reconnect_attempts: int = 0
    updated_at: Optional[str] = None
    active_session: Optional[TelegramSessionStatus] = None


class TelegramLoginStart(BaseModel):
    api_id: str
    api_hash: str
    phone_number: str


class TelegramLoginVerify(BaseModel):
    code: str


class TelegramLoginPassword(BaseModel):
    password: str


class BotChannelLink(BaseModel):
    bot_id: int
    channel_id: int


BotDetailResponse.model_rebuild()
ChannelDetailResponse.model_rebuild()
