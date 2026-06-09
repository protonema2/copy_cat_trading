from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional


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


class ChannelCreate(BaseModel):
    name: str
    channel_handle: str
    target_channel: str = ""
    forward_message: bool = True
    copy_settings: List[TradingCopySettingCreate] = []


class ChannelUpdate(BaseModel):
    name: Optional[str] = None
    channel_handle: Optional[str] = None
    target_channel: Optional[str] = None
    forward_message: Optional[bool] = None
    copy_settings: Optional[List[TradingCopySettingCreate]] = None


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


class ActivityLogResponse(BaseModel):
    id: int
    bot_id: int
    channel_id: Optional[int] = None
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
