"""Health check endpoints for the BChemXtract Web API.

Two-tier health system (D-08):
- GET /health -- Minimal status for Docker HEALTHCHECK (fast, cheap)
- GET /health/detail -- Full diagnostics: heap, thread pool, JAR version
"""

import logging
from pathlib import Path

import jpype
from fastapi import APIRouter, Depends

from app.config import settings
from app.core.security import require_admin_auth
from app.models.chemistry import ErrorResponse
from app.models.health import HealthDetailResponse, HealthResponse
from app.services.jvm_bridge import get_pool_stats, run_in_jvm_thread

logger = logging.getLogger(__name__)

router = APIRouter()

_JAR_NAME_PREFIX = "bchemxtract-"
_JAR_NAME_SUFFIX = "-jar-with-dependencies.jar"


def _get_jar_version() -> str:
    """Extract the BChemXtract version from the fat-JAR filename.

    Scans the configured ``jar_path`` for any
    ``bchemxtract-{version}-jar-with-dependencies.jar`` and returns
    ``{version}``. Returns ``""`` when no matching JAR exists and the
    full filename when the JAR is present but doesn't match the pattern.
    """
    matches = sorted(
        Path(settings.jar_path).glob(f"{_JAR_NAME_PREFIX}*{_JAR_NAME_SUFFIX}")
    )
    if not matches:
        return ""
    filename = matches[0].name
    if filename.startswith(_JAR_NAME_PREFIX) and filename.endswith(_JAR_NAME_SUFFIX):
        return filename[len(_JAR_NAME_PREFIX) : -len(_JAR_NAME_SUFFIX)]
    return filename


@router.get(
    "/health",
    response_model=HealthResponse,
    operation_id="healthCheck",
    summary="Liveness check",
    description=(
        "Minimal health check suitable for Docker HEALTHCHECK probes. "
        'Returns `"ok"` if the JVM is running, `"degraded"` otherwise. '
        "No JVM calls — only reads the started flag — so it is fast and "
        "cheap to poll."
    ),
    responses={
        200: {
            "description": "Health result computed.",
            "content": {
                "application/json": {
                    "example": {"status": "ok"},
                }
            },
        },
        500: {"model": ErrorResponse, "description": "Internal server error."},
    },
    tags=["health"],
)
async def health_check() -> HealthResponse:
    """Minimal health check for Docker HEALTHCHECK.

    Returns status "ok" if JVM is running, "degraded" otherwise.
    Fast and cheap -- no JVM calls, just checks the flag.

    Returns:
        HealthResponse with status "ok" or "degraded".
    """
    status = "ok" if jpype.isJVMStarted() else "degraded"
    return HealthResponse(status=status)


def _collect_jvm_diagnostics() -> dict:
    """Collect JVM heap and runtime diagnostics.

    Must be called from a JVM-attached thread (via run_in_jvm_thread).

    Returns:
        Dict with jvm_version, heap stats, and processor count.
    """
    Runtime = jpype.JClass("java.lang.Runtime")  # noqa: N806
    rt = Runtime.getRuntime()
    return {
        "jvm_version": str(jpype.getJVMVersion()),
        "heap_max_mb": int(rt.maxMemory() / (1024 * 1024)),
        "heap_used_mb": int((rt.totalMemory() - rt.freeMemory()) / (1024 * 1024)),
        "heap_free_mb": int(rt.freeMemory() / (1024 * 1024)),
        "available_processors": int(rt.availableProcessors()),
    }


@router.get(
    "/health/detail",
    response_model=HealthDetailResponse,
    operation_id="healthDetail",
    summary="Detailed JVM diagnostics (authenticated)",
    description=(
        "Return full diagnostics: JVM heap (max/used/free MB), available "
        "processors, thread-pool workers/active counts, JVM version, and "
        "JAR version parsed from the BChemXtract fat-JAR filename. JVM "
        "diagnostic calls run in the thread pool to avoid blocking the "
        'event loop. When the JVM is not running, returns `status="degraded"` '
        "with `jvm_running=false` and the remaining fields defaulted.\n\n"
        "Requires the admin secret (`X-Admin-Secret` header) — unlike "
        "`/health`, this endpoint discloses internal JVM/CDK/BChemXtract "
        "versions useful for targeted CVE lookup and is therefore "
        "protected (Phase 11 D-18 / Open Q #4)."
    ),
    responses={
        200: {"description": "Diagnostics collected successfully."},
        401: {
            "model": ErrorResponse,
            "description": "Missing or invalid admin secret.",
        },
        503: {
            "model": ErrorResponse,
            "description": "JVM unavailable or diagnostic call timed out.",
        },
        500: {"model": ErrorResponse, "description": "Internal server error."},
    },
    tags=["health"],
    dependencies=[Depends(require_admin_auth)],
)
async def health_detail() -> HealthDetailResponse:
    """Detailed health diagnostics.

    Returns JVM heap usage, thread pool statistics, JAR version,
    JVM version, and processor count. Runs JVM diagnostic calls via
    the thread pool to avoid blocking the event loop.

    Returns:
        HealthDetailResponse with full diagnostics including jar_version (D-08).
    """
    jvm_running = jpype.isJVMStarted()

    if not jvm_running:
        return HealthDetailResponse(
            status="degraded",
            jvm_running=False,
        )

    # Collect JVM diagnostics via thread pool (blocking JVM call)
    diagnostics = await run_in_jvm_thread(_collect_jvm_diagnostics, timeout=5.0)

    # Thread pool stats (Python-side, no JVM call needed)
    pool_stats = get_pool_stats()
    pool_workers = pool_stats["workers"]
    pool_active = pool_stats["active"]

    # JAR version from filename (Python-side, no JVM call needed)
    jar_version = _get_jar_version()

    return HealthDetailResponse(
        status="ok",
        jvm_running=True,
        jvm_version=diagnostics["jvm_version"],
        jar_version=jar_version,
        heap_max_mb=diagnostics["heap_max_mb"],
        heap_used_mb=diagnostics["heap_used_mb"],
        heap_free_mb=diagnostics["heap_free_mb"],
        available_processors=diagnostics["available_processors"],
        thread_pool_workers=pool_workers,
        thread_pool_active=pool_active,
    )
