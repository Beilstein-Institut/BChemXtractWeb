"""Health check endpoints for the BChemXtract Web API.

Two-tier health system (D-08):
- GET /health -- Minimal status for Docker HEALTHCHECK (fast, cheap)
- GET /health/detail -- Full diagnostics: heap, thread pool, JAR version
"""

import glob
import logging

import jpype
from fastapi import APIRouter

from app.config import settings
from app.models.health import HealthDetailResponse, HealthResponse
from app.services.jvm_bridge import get_pool_stats, run_in_jvm_thread

logger = logging.getLogger(__name__)

router = APIRouter(tags=["health"])


def _get_jar_version() -> str:
    """Extract JAR version from the BChemXtract JAR filename.

    Scans the configured jar_path for the fat JAR and extracts
    the version string from the filename pattern:
    bchemxtract-{version}-jar-with-dependencies.jar

    Returns:
        Version string (e.g., "1.0"), or "" if JAR not found.
    """
    jars = glob.glob(
        f"{settings.jar_path}/bchemxtract-*-jar-with-dependencies.jar"
    )
    if not jars:
        return ""
    # Extract version from filename: bchemxtract-1.0-jar-with-dependencies.jar
    filename = jars[0].rsplit("/", 1)[-1]
    # Strip prefix and suffix to get version
    prefix = "bchemxtract-"
    suffix = "-jar-with-dependencies.jar"
    if filename.startswith(prefix) and filename.endswith(suffix):
        return filename[len(prefix) : -len(suffix)]
    return filename


@router.get("/health", response_model=HealthResponse)
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
        "heap_used_mb": int(
            (rt.totalMemory() - rt.freeMemory()) / (1024 * 1024)
        ),
        "heap_free_mb": int(rt.freeMemory() / (1024 * 1024)),
        "available_processors": int(rt.availableProcessors()),
    }


@router.get("/health/detail", response_model=HealthDetailResponse)
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
    diagnostics = await run_in_jvm_thread(
        _collect_jvm_diagnostics, timeout=5.0
    )

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
