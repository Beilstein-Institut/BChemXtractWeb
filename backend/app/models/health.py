"""Pydantic models for health check responses."""

from pydantic import BaseModel


class HealthResponse(BaseModel):
    """Minimal health check for Docker HEALTHCHECK."""

    status: str


class HealthDetailResponse(BaseModel):
    """Detailed health diagnostics.

    Includes heap usage, thread pool stats, JAR version, and JVM info.
    """

    status: str
    jvm_running: bool
    jvm_version: str | None = None
    jar_version: str = ""
    heap_max_mb: int = 0
    heap_used_mb: int = 0
    heap_free_mb: int = 0
    available_processors: int = 0
    thread_pool_workers: int = 0
    thread_pool_active: int = 0
