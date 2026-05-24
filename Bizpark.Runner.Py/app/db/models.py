import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Enum, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase

from app.config import settings


class Base(DeclarativeBase):
    pass


class TaskStatus(str, enum.Enum):
    QUEUED = "QUEUED"
    PROCESSING = "PROCESSING"
    PENDING_APPROVAL = "PENDING_APPROVAL"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class TaskType(str, enum.Enum):
    WEBSITE_GENERATION = "WEBSITE_GENERATION"
    SOCIAL_MEDIA_CONTENT = "SOCIAL_MEDIA_CONTENT"
    BLOG_POST_WRITING = "BLOG_POST_WRITING"
    GOOGLE_REVIEW_REPLY = "GOOGLE_REVIEW_REPLY"


class AgentTask(Base):
    # Table and column names match exactly what TypeORM created
    __tablename__ = "AgentTask"
    __table_args__ = {"schema": settings.runner_db_schema}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    businessId = Column("businessId", String, nullable=False)
    taskType = Column(
        "taskType",
        Enum(TaskType, name="TaskType", schema=settings.runner_db_schema, create_type=False),
        nullable=False,
    )
    status = Column(
        "status",
        Enum(TaskStatus, name="TaskStatus", schema=settings.runner_db_schema, create_type=False),
        nullable=False,
        default=TaskStatus.QUEUED,
    )
    inputData = Column("inputData", JSONB, default={})
    outputData = Column("outputData", JSONB, nullable=True)
    logs = Column("logs", Text, nullable=True)
    createdAt = Column("createdAt", DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updatedAt = Column(
        "updatedAt",
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
