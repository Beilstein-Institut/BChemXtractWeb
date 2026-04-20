"""Application configuration via Pydantic BaseSettings.

Loads environment variables from .env file with typed validation.
All backend configuration is centralized here.
"""

from pathlib import Path

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Typed application settings loaded from environment variables.

    Attributes:
        database_url: PostgreSQL connection string (async psycopg driver).
        java_home: Path to JDK installation. None lets JPype auto-detect.
        jar_path: Directory containing the BChemXtract fat JAR.
        cors_origins: Allowed CORS origins for frontend access.
        debug: Enable debug mode (verbose logging, etc.).
        api_keys: Valid API keys accepted via ``Authorization: Bearer <key>``.
            Empty allowed only when ``debug=True``. In non-debug mode the
            startup validator refuses to initialise without at least one key.
        rate_limit_default: Default per-IP rate limit applied to every route
            via ``SlowAPIMiddleware``. Format: ``"<count>/<period>"`` (slowapi
            syntax, e.g. ``"60/minute"``).
        rate_limit_upload: Per-IP rate limit for single-file upload routes
            (``/api/extract``, ``/api/reactions``). Expensive JVM calls.
        rate_limit_batch: Per-IP rate limit for ``/api/batch`` (most expensive).
        rate_limit_search: Per-IP rate limit for ``/api/search`` (substructure
            search can hold the JVM for up to 30 s).
        rate_limit_export: Per-IP rate limit for ``/api/export`` (bulk data).
        rate_limit_storage_uri: Backing store for slowapi. ``memory://`` (default,
            single-instance) or ``redis://...`` when scaling out.
        expose_openapi_docs: When False, ``/docs``, ``/redoc`` and
            ``/openapi.json`` are suppressed. Defaults to ``debug``.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
    )

    # SEC H-04: database_url has no default — every deployment (dev, test,
    # prod, CI) MUST supply it explicitly. Previously the default carried a
    # well-known ``postgres:postgres`` credential pair that is also the
    # fallback used by a naive ``docker-compose up`` so a misconfigured
    # deployment could reach production with that pair intact.
    database_url: str = Field(
        ...,
        description=(
            "PostgreSQL DSN. Required at startup. Example: "
            "``postgresql+psycopg://user:password@host:5432/dbname``"
        ),
    )
    java_home: str | None = None
    jar_path: str = "jars"
    cors_origins: list[str] = ["http://localhost:5173"]
    debug: bool = False

    # --- Authentication & authorisation (Phase SEC-1) ---
    api_keys: list[str] = Field(
        default_factory=list,
        description=(
            "Accepted bearer keys. Empty is only valid in debug mode; "
            "non-debug startup fails without at least one non-empty key."
        ),
    )

    # --- Rate limiting (Phase SEC-1, slowapi-backed) ---
    rate_limit_default: str = "120/minute"
    rate_limit_upload: str = "10/minute"
    rate_limit_batch: str = "3/minute"
    rate_limit_search: str = "30/minute"
    rate_limit_export: str = "30/minute"
    rate_limit_storage_uri: str = "memory://"

    # --- OpenAPI documentation surface gating (Phase SEC-1) ---
    expose_openapi_docs: bool | None = None
    """When None, resolves to ``debug`` at startup. Explicitly set to a bool
    to override (e.g. allow docs in prod behind the API-key gate for an
    internal staging environment)."""

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

    @model_validator(mode="after")
    def _validate_api_keys(self) -> "Settings":
        """Reject empty API keys, de-duplicate, and refuse empty list in prod.

        In non-debug mode, refusing to start without keys prevents a silent
        "no auth" deployment — the single most common way security middleware
        gets accidentally disabled.
        """
        cleaned = (k.strip() for k in self.api_keys if k and k.strip())
        # dict.fromkeys preserves first-seen order while de-duplicating.
        unique = list(dict.fromkeys(cleaned))
        if any(len(k) < 16 for k in unique):
            raise ValueError(
                "API_KEYS entries must be at least 16 characters "
                "(use `python -c \"import secrets; print(secrets.token_urlsafe(32))\"` "
                "to generate one)."
            )
        if not unique and not self.debug:
            raise ValueError(
                "API_KEYS must be set when DEBUG=false. Configure at least "
                "one key of length >= 16 (e.g. via .env: "
                "API_KEYS='[\"<secret>\"]'). Refusing to start without "
                "authentication."
            )
        self.api_keys = unique
        return self

    @model_validator(mode="after")
    def _resolve_docs_exposure(self) -> "Settings":
        """Default ``expose_openapi_docs`` to ``debug`` when unset."""
        if self.expose_openapi_docs is None:
            self.expose_openapi_docs = self.debug
        return self


settings = Settings()
