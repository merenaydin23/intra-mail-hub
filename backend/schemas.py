from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime

class UserBase(BaseModel):
    name: str
    email: str
    region_id: Optional[int] = None
    dealer_code: Optional[str] = None

class UserCreate(UserBase):
    role_id: int

class UserResponse(UserBase):
    id: int
    is_active: bool
    role_id: int

    class Config:
        orm_mode = True

class MessageBase(BaseModel):
    subject: Optional[str] = None
    body: str
    is_broadcast: bool = False

class AIMetadataResponse(BaseModel):
    summary: Optional[str] = None
    suggested_replies: Optional[List[str]] = None
    sentiment_score: Optional[str] = None

    class Config:
        orm_mode = True

class MessageResponse(MessageBase):
    id: int
    sender_id: int
    created_at: datetime
    ai_metadata: Optional[AIMetadataResponse] = None

    class Config:
        orm_mode = True

class MessageSendRequest(MessageBase):
    recipient_ids: List[int]
