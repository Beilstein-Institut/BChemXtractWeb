"""Health check endpoint for the BChemXtract Web API.

Provides a lightweight endpoint for monitoring and Docker HEALTHCHECK.
"""

from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/health")
async def health_check() -> dict[str, str]:
    """Return a simple health status.

    Returns:
        JSON object with status "ok" when the service is running.
    """
    return {"status": "ok"}
