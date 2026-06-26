"""Tests for the async single-file extraction endpoints.

POST /api/extract/jobs   — validate + queue, return task_id
GET  /api/extract/jobs/{task_id} — owner-scoped status poll

The Celery task and AsyncResult are faked so no worker/JVM runs; these tests
exercise validation, the queue handoff, ownership binding, and state mapping.
"""

from httpx import AsyncClient

from tests.conftest import TEST_SESSION_COOKIE

_OTHER_SESSION = "22222222-2222-4222-8222-222222222222"


class _FakeOwnerStore:
    """Minimal Redis stand-in for the job-owner records (mirrors test_batch)."""

    def __init__(self) -> None:
        self._d: dict[str, bytes] = {}

    def set(self, key: str, value: str, ex: int | None = None) -> None:
        self._d[key] = value.encode() if isinstance(value, str) else value

    def get(self, key: str) -> bytes | None:
        return self._d.get(key)


class _FakeAsyncResultHandle:
    """What apply_async returns — only .id is read."""

    def __init__(self, id: str) -> None:
        self.id = id


class _FakeResult:
    """AsyncResult stand-in for the status endpoint."""

    def __init__(
        self, *, ready: bool = True, failed: bool = False, result=None
    ) -> None:
        self._ready, self._failed, self._result = ready, failed, result

    def ready(self) -> bool:
        return self._ready

    def failed(self) -> bool:
        return self._failed

    @property
    def result(self):
        return self._result


async def test_submit_queues_and_returns_task_id(
    client_csrf: AsyncClient, cdx_file_bytes: bytes, monkeypatch
) -> None:
    """A valid upload is queued; the task_id is returned and owner recorded."""
    from app.routers import extract as extract_mod
    from app.services import job_ownership as jo

    store = _FakeOwnerStore()
    monkeypatch.setattr(jo, "owner_store", lambda: store)
    monkeypatch.setattr(
        extract_mod.extract_file_task,
        "apply_async",
        lambda *a, **k: _FakeAsyncResultHandle("task-xyz"),
    )

    resp = await client_csrf.post(
        "/api/extract/jobs",
        files={"file": ("a.cdx", cdx_file_bytes, "chemical/x-cdx")},
    )

    assert resp.status_code == 202
    assert resp.json()["task_id"] == "task-xyz"
    # Owner bound to the submitting session under the task id.
    assert store.get(jo.job_owner_key("task-xyz")) == (
        f"sid:{TEST_SESSION_COOKIE}".encode()
    )


async def test_submit_rejects_unrecognized_format(client_csrf: AsyncClient) -> None:
    """A non-CDX/CDXML upload fails fast with 415 — nothing is queued."""
    resp = await client_csrf.post(
        "/api/extract/jobs",
        files={
            "file": (
                "a.cdx",
                b"this is plainly not a chemdraw file",
                "application/octet-stream",
            )
        },
    )
    assert resp.status_code == 415


async def test_status_processing(client_csrf: AsyncClient, monkeypatch) -> None:
    """A not-yet-ready task reports state=processing."""
    from app.routers import extract as extract_mod
    from app.services import job_ownership as jo

    store = _FakeOwnerStore()
    store.set(jo.job_owner_key("t-proc"), f"sid:{TEST_SESSION_COOKIE}")
    monkeypatch.setattr(jo, "owner_store", lambda: store)
    monkeypatch.setattr(
        extract_mod, "AsyncResult", lambda *a, **k: _FakeResult(ready=False)
    )

    resp = await client_csrf.get("/api/extract/jobs/t-proc")
    assert resp.status_code == 200
    assert resp.json() == {"state": "processing", "extraction_id": None, "error": None}


async def test_status_done(client_csrf: AsyncClient, monkeypatch) -> None:
    """A completed task reports state=done with the extraction_id."""
    from app.routers import extract as extract_mod
    from app.services import job_ownership as jo

    store = _FakeOwnerStore()
    store.set(jo.job_owner_key("t-done"), f"sid:{TEST_SESSION_COOKIE}")
    monkeypatch.setattr(jo, "owner_store", lambda: store)
    monkeypatch.setattr(
        extract_mod,
        "AsyncResult",
        lambda *a, **k: _FakeResult(result={"extraction_id": 42, "error": None}),
    )

    resp = await client_csrf.get("/api/extract/jobs/t-done")
    assert resp.status_code == 200
    assert resp.json() == {"state": "done", "extraction_id": 42, "error": None}


async def test_status_failed_when_task_returns_error(
    client_csrf: AsyncClient, monkeypatch
) -> None:
    """A task that returned an error dict reports state=failed with the message."""
    from app.routers import extract as extract_mod
    from app.services import job_ownership as jo

    store = _FakeOwnerStore()
    store.set(jo.job_owner_key("t-fail"), f"sid:{TEST_SESSION_COOKIE}")
    monkeypatch.setattr(jo, "owner_store", lambda: store)
    monkeypatch.setattr(
        extract_mod,
        "AsyncResult",
        lambda *a, **k: _FakeResult(
            result={"extraction_id": None, "error": "CDK parse failed"}
        ),
    )

    resp = await client_csrf.get("/api/extract/jobs/t-fail")
    assert resp.status_code == 200
    body = resp.json()
    assert body["state"] == "failed"
    assert body["error"] == "CDK parse failed"


async def test_status_done_without_extraction_id_is_failed(
    client_csrf: AsyncClient, monkeypatch
) -> None:
    """A terminal task with no persisted row (e.g. revoked) reports failed, not
    a bogus 'done' with a null id the client would poll on until its deadline."""
    from app.routers import extract as extract_mod
    from app.services import job_ownership as jo

    store = _FakeOwnerStore()
    store.set(jo.job_owner_key("t-noid"), f"sid:{TEST_SESSION_COOKIE}")
    monkeypatch.setattr(jo, "owner_store", lambda: store)
    monkeypatch.setattr(
        extract_mod,
        "AsyncResult",
        lambda *a, **k: _FakeResult(result={"extraction_id": None, "error": None}),
    )

    resp = await client_csrf.get("/api/extract/jobs/t-noid")
    assert resp.status_code == 200
    body = resp.json()
    assert body["state"] == "failed"
    assert body["extraction_id"] is None


async def test_status_foreign_owner_404(client_csrf: AsyncClient, monkeypatch) -> None:
    """Polling a job owned by another session returns 404 (no state leak)."""
    from app.services import job_ownership as jo

    store = _FakeOwnerStore()
    store.set(jo.job_owner_key("t-foreign"), f"sid:{_OTHER_SESSION}")
    monkeypatch.setattr(jo, "owner_store", lambda: store)

    resp = await client_csrf.get("/api/extract/jobs/t-foreign")
    assert resp.status_code == 404
