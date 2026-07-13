from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, Text, JSON
from sqlalchemy.orm import declarative_base, relationship
from datetime import datetime

Base = declarative_base()

class Role(Base):
    __tablename__ = 'roles'
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True) # local_employee, local_boss, region_employee, region_boss, factory_employee, factory_admin
    permissions = Column(JSON) # JSON based RBAC details
    users = relationship("User", back_populates="role")

class User(Base):
    __tablename__ = 'users'
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    role_id = Column(Integer, ForeignKey('roles.id'))
    region_id = Column(Integer, nullable=True) # For ABAC logic
    dealer_code = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)

    role = relationship("Role", back_populates="users")
    sent_messages = relationship("Message", back_populates="sender")

class Message(Base):
    __tablename__ = 'messages'
    id = Column(Integer, primary_key=True, index=True)
    sender_id = Column(Integer, ForeignKey('users.id'))
    subject = Column(String, nullable=True)
    body = Column(Text, nullable=False)
    is_broadcast = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    sender = relationship("User", back_populates="sent_messages")
    recipients = relationship("MessageRecipient", back_populates="message")
    ai_metadata = relationship("AIMetadata", back_populates="message", uselist=False)

class MessageRecipient(Base):
    __tablename__ = 'message_recipients'
    id = Column(Integer, primary_key=True, index=True)
    message_id = Column(Integer, ForeignKey('messages.id'))
    recipient_id = Column(Integer, ForeignKey('users.id'))
    is_read = Column(Boolean, default=False)
    read_at = Column(DateTime, nullable=True)

    message = relationship("Message", back_populates="recipients")
    recipient = relationship("User")

class AIMetadata(Base):
    __tablename__ = 'ai_metadata'
    id = Column(Integer, primary_key=True, index=True)
    message_id = Column(Integer, ForeignKey('messages.id'), unique=True)
    summary = Column(Text, nullable=True)
    suggested_replies = Column(JSON, nullable=True)
    sentiment_score = Column(String, nullable=True)
    
    message = relationship("Message", back_populates="ai_metadata")
