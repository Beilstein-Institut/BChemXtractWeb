"""Tests for health check endpoints (INFRA-04)."""

from httpx import AsyncClient


async def test_health_returns_ok(client: AsyncClient) -> None:
    """GET /api/health returns 200 with status ok when JVM is running."""
    response = await client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"


async def test_health_detail_returns_jvm_info(client: AsyncClient) -> None:
    """GET /api/health/detail returns full JVM diagnostics."""
    response = await client.get("/api/health/detail")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["jvm_running"] is True
    assert isinstance(data["jvm_version"], str)
    assert len(data["jvm_version"]) > 0
    assert data["heap_max_mb"] > 0
    assert data["heap_used_mb"] >= 0
    assert data["heap_free_mb"] >= 0
    assert data["available_processors"] > 0
    assert data["thread_pool_workers"] > 0


async def test_health_detail_contains_all_fields(
    client: AsyncClient,
) -> None:
    """GET /api/health/detail response includes every expected field."""
    response = await client.get("/api/health/detail")
    data = response.json()
    expected_fields = {
        "status",
        "jvm_running",
        "jvm_version",
        "jar_version",
        "heap_max_mb",
        "heap_used_mb",
        "heap_free_mb",
        "available_processors",
        "thread_pool_workers",
        "thread_pool_active",
    }
    assert expected_fields.issubset(data.keys())


async def test_health_detail_includes_jar_version(
    client: AsyncClient,
) -> None:
    """GET /api/health/detail includes jar_version field per D-08."""
    response = await client.get("/api/health/detail")
    data = response.json()
    assert "jar_version" in data
    # jar_version is a string (may be empty if JAR not yet built)
    assert isinstance(data["jar_version"], str)
