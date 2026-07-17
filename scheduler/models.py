from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


class PriorityTier(str, Enum):
    CRITICAL = "critical"
    STANDARD = "standard"
    FLEXIBLE = "flexible"


class JobStatus(str, Enum):
    PENDING = "pending"
    DEFERRED = "deferred"
    RUNNING = "running"
    COMPLETED = "completed"


@dataclass
class Job:
    job_id: str
    namespace: str
    priority_tier: PriorityTier
    image: str
    command: Optional[str] = None
    region_tag: str = "us-east"
    status: JobStatus = JobStatus.PENDING
    container_id: Optional[str] = None
    defer_count: int = field(default=0)
