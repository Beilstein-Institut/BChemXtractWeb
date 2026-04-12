"""Application configuration via Pydantic BaseSettings.

Loads environment variables from .env file with typed validation.
All backend configuration is centralized here.
"""

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
    jvm_max_heap: str = "512m"
    jpype_workers: int = 4
    jvm_opts: str | None = None


settings = Settings()
