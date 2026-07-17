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
        rate_limit_default: Default per-IP rate limit applied to every route
            via ``SlowAPIMiddleware``. Format: ``"<count>/<period>"`` (slowapi
            syntax, e.g. ``"60/minute"``).
        rate_limit_upload: Per-IP rate limit for single-file upload routes
            (``/api/extract``, ``/api/reactions``). Expensive JVM calls.
        rate_limit_batch: Per-IP rate limit for ``/api/batch`` (most expensive).
        rate_limit_search: Per-IP rate limit for ``/api/search`` (substructure
            search can hold the JVM for up to 30 s).
        rate_limit_export: Per-IP rate limit for ``/api/export`` (bulk data).
        rate_limit_render: Per-IP rate limit for
            ``/api/extractions/{id}/render.svg`` (faithful CDX/CDXML render).
            Shares the 16-slot in-flight JVM semaphore with extract/search, so
            it needs its own cap rather than relying on the generic default.
        rate_limit_storage_uri: Backing store for slowapi. ``memory://`` (default,
            single-instance) or ``redis://...`` when scaling out.
        expose_openapi_docs: When False, ``/docs``, ``/redoc`` and
            ``/openapi.json`` are suppressed. Defaults to ``debug``.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
    )

    # database_url has no default — every deployment (dev, test,
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

    # --- Cookie + API key + admin auth secrets ---
    secret_key: str = Field(
        default="",
        description=(
            "Server-side secret used as the PBKDF2 salt for API-key lookup "
            "hashes AND as the HMAC key for CSRF tokens. "
            ">= 32 chars required in production (DEBUG=false). "
            "A single key serves both purposes — domain separation comes "
            "from the distinct input shapes, not from splitting keys — so "
            "rotating it invalidates "
            "every stored API-key hash AND every outstanding CSRF token. "
            "Generate via: python -c "
            "'import secrets; print(secrets.token_urlsafe(32))'"
        ),
    )
    admin_secret: str = Field(
        default="",
        description=(
            "Admin-endpoint gate. Compared constant-time "
            "against the inbound X-Admin-Secret header. >= 32 chars "
            "required in production. Safe to rotate via "
            "`./deploy.sh --rotate-keys`."
        ),
    )
    api_key_default_expiry_days: int = 90
    """Default expiry for new API keys. Override per-key
    via the POST /api/admin/api-keys body."""

    api_key_max_expiry_days: int = 365
    """Hard cap on per-key expiry. Values above are clamped."""

    audit_log_retention_days: int = 365
    """Audit log retention (~12 months). The Celery beat
    task deletes rows older than this daily at 03:00 UTC."""

    # --- Rate limiting (slowapi-backed) ---
    rate_limit_default: str = "120/minute"
    rate_limit_upload: str = "10/minute"
    rate_limit_batch: str = "3/minute"
    rate_limit_search: str = "30/minute"
    rate_limit_export: str = "30/minute"
    rate_limit_render: str = "30/minute"
    # Async extraction status poll: the frontend polls ~1/s for up to ~3 min, so
    # this needs its own generous bucket (override_defaults=True) — the 120/min
    # default would 429 a long or concurrent extraction into a spurious failure.
    rate_limit_poll: str = "600/minute"
    rate_limit_storage_uri: str = "memory://"

    # --- OpenAPI documentation surface gating ---
    expose_openapi_docs: bool | None = None
    """When None, resolves to ``debug`` at startup. Explicitly set to a bool
    to override (e.g. allow docs in prod behind the API-key gate for an
    internal staging environment)."""

    # JVM settings
    jvm_max_heap: str = "512m"
    """Max JVM heap size. Configurable via JVM_MAX_HEAP env var."""

    jpype_workers: int = 4
    """Thread pool size for JPype calls. Configurable via JPYPE_WORKERS."""

    jvm_opts: str | None = None
    """Optional extra JVM flags (e.g. '-XX:+UseG1GC'). Configurable via JVM_OPTS."""

    max_upload_size: int = 50 * 1024 * 1024
    """Max upload file size in bytes. Default 50 MB."""

    reaction_timeout_secs: float = 30.0
    """Hard timeout for POST /api/reactions JVM call.

    On timeout, the endpoint returns HTTP 200 with reactions=[] and a
    warning — NOT 408/503. Configurable via REACTION_TIMEOUT_SECS env var.
    """

    cdx_render_timeout_secs: float = 30.0
    """Hard timeout for the faithful CDX->SVG render JVM call.

    Guards GET /api/extractions/{id}/render.svg. Configurable via
    CDX_RENDER_TIMEOUT_SECS env var.
    """

    celery_broker_url: str = "redis://redis:6379/0"
    """Celery broker URL. Configurable via CELERY_BROKER_URL env var."""

    celery_result_backend: str = "redis://redis:6379/1"
    """Celery result backend URL. Configurable via CELERY_RESULT_BACKEND env var."""

    # --- PubChem enrichment (opt-in; default OFF) ---
    pubchem_enabled: bool = False
    """Server kill-switch for PubChem enrichment. When False the
    /api/pubchem/* endpoints return PUBCHEM_DISABLED and the frontend hides
    the feature. Privacy: enabling sends extracted InChIKeys (and connectivity
    SMILES for scaffold matching) to the U.S. NIH PubChem service."""

    pubchem_base_url: str = "https://pubchem.ncbi.nlm.nih.gov/rest/pug"
    pubchem_timeout_secs: float = 10.0
    pubchem_rate_per_sec: float = 4.0
    """In-process token-bucket rate. Must stay <= 5 (PubChem policy).
    Sufficient as a single value because the backend is one uvicorn process
    (JVM-per-process constraint)."""

    pubchem_max_concurrency: int = 4
    pubchem_contact_email: str = ""
    """Sent in the descriptive User-Agent per NCBI etiquette. Set to an ops
    address in deployed config."""

    pubchem_cache_ttl_days: int = 180
    """Freshness window for 'exact' cache rows (stable mapping)."""

    pubchem_negative_ttl_days: int = 14
    """Freshness window for 'scaffold' / 'absent' rows — re-checked sooner
    because PubChem grows over time."""

    pubchem_synonyms_cap: int = 12
    rate_limit_pubchem: str = "60/minute"

    @model_validator(mode="after")
    def _validate_jar_path(self) -> "Settings":
        """Reject path traversal in jar_path and resolve to absolute."""
        if ".." in self.jar_path:
            raise ValueError(f"jar_path must not contain '..': {self.jar_path}")
        self.jar_path = str(Path(self.jar_path).resolve())
        return self

    @model_validator(mode="after")
    def _validate_auth_secrets(self) -> "Settings":
        """Refuse to start in production without the auth secrets.

        The auth model uses two server-side secrets in place of a legacy
        Bearer ``API_KEYS`` env-list: ``SECRET_KEY`` (a single key acting
        as both the PBKDF2 salt for API-key lookup hashes and the CSRF
        HMAC key) and ``ADMIN_SECRET`` (admin-endpoint gate). In
        DEBUG=true (dev/test) short or empty values are allowed.
        """
        if not self.debug:
            if len(self.secret_key) < 32:
                raise ValueError(
                    "SECRET_KEY must be at least 32 characters when "
                    "DEBUG=false. Generate via: python -c "
                    "'import secrets; print(secrets.token_urlsafe(32))'"
                )
            if len(self.admin_secret) < 32:
                raise ValueError(
                    "ADMIN_SECRET must be at least 32 characters when "
                    "DEBUG=false. (see SECRET_KEY for generation command)"
                )
        return self

    @model_validator(mode="after")
    def _validate_prod_cors(self) -> "Settings":
        """Refuse to start in production with a dev origin in CORS_ORIGINS.

        The bcx_sid cookie sets Secure
        based on whether localhost / 127.0.0.1 appears in
        ``cors_origins`` (see ``app.core.session._is_dev_origin_set``).
        A production deploy that forgets to swap localhost out drops
        Secure silently and the cookie travels over plain HTTP. Reject
        at startup so the operator notices before users do.
        """
        if not self.debug and any(
            "localhost" in origin or "127.0.0.1" in origin
            for origin in self.cors_origins
        ):
            raise ValueError(
                "CORS_ORIGINS contains a localhost / 127.0.0.1 origin "
                "while DEBUG=false. This would disable the Secure flag "
                "on bcx_sid. Remove dev origins before starting in prod."
            )
        return self

    @model_validator(mode="after")
    def _resolve_docs_exposure(self) -> "Settings":
        """Default ``expose_openapi_docs`` to ``debug`` when unset."""
        if self.expose_openapi_docs is None:
            self.expose_openapi_docs = self.debug
        return self

    @model_validator(mode="after")
    def _validate_pubchem_rate(self) -> "Settings":
        """PubChem policy is <= 5 requests/second per IP. Refuse a config
        that would knowingly violate it."""
        if self.pubchem_rate_per_sec > 5:
            raise ValueError(
                "PUBCHEM_RATE_PER_SEC must be <= 5 (PubChem usage policy). "
                f"Got {self.pubchem_rate_per_sec}."
            )
        return self


settings = Settings()
