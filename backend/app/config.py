"""Application configuration via Pydantic BaseSettings.

Loads environment variables from .env file with typed validation.
All backend configuration is centralized here.
"""

from pathlib import Path

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Typed application settings loaded from environment variables.

    Attributes:
        database_url: PostgreSQL connection string (async psycopg driver).
        java_home: Path to JDK installation. None lets JPype auto-detect.
        jar_path: Directory containing the BChemXtract fat JAR.
        cors_origins: Allowed CORS origins for frontend access.
        debug: Enable debug mode (verbose logging, etc.).
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
    )

    database_url: str = (
        "postgresql+psycopg://postgres:postgres@localhost:5432/bchemxtract"
    )
    java_home: str | None = None
    jar_path: str = "jars"
    cors_origins: list[str] = ["http://localhost:5173"]
    debug: bool = False

    # JVM settings (Phase 2)
    jvm_max_heap: str = "512m"
    """Max JVM heap size (D-01/D-03). Configurable via JVM_MAX_HEAP env var."""

    jpype_workers: int = 4
    """Thread pool size for JPype calls (D-04). Configurable via JPYPE_WORKERS."""

    jvm_opts: str | None = None
    """Optional extra JVM flags (e.g. '-XX:+UseG1GC'). Configurable via JVM_OPTS."""

    max_upload_size: int = 50 * 1024 * 1024
    """Max upload file size in bytes (D-05). Default 50 MB."""

    reaction_timeout_secs: float = 30.0
    """Hard timeout for POST /api/reactions JVM call (Plan 10 D-06).

    On timeout, the endpoint returns HTTP 200 with reactions=[] and a
    warning — NOT 408/503. Configurable via REACTION_TIMEOUT_SECS env var.
    """

    celery_broker_url: str = "redis://redis:6379/0"
    """Celery broker URL. Configurable via CELERY_BROKER_URL env var."""

    celery_result_backend: str = "redis://redis:6379/1"
    """Celery result backend URL. Configurable via CELERY_RESULT_BACKEND env var."""

    @model_validator(mode="after")
    def _validate_jar_path(self) -> "Settings":
        """Reject path traversal in jar_path and resolve to absolute."""
        if ".." in self.jar_path:
            raise ValueError(
                f"jar_path must not contain '..': {self.jar_path}"
            )
        self.jar_path = str(Path(self.jar_path).resolve())
        return self


settings = Settings()
