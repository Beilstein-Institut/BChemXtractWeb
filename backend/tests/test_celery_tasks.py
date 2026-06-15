"""Unit tests for extraction.extract_file_task Celery task."""

import base64
from unittest.mock import patch

import pytest


@pytest.fixture(autouse=True)
def celery_eager_memory(monkeypatch):
    """Configure Celery to run tasks synchronously with an in-memory backend.

    Overrides broker and backend URLs so no Redis connection is needed.
    Must be applied before importing the celery_app.
    """

    monkeypatch.setenv("CELERY_BROKER_URL", "memory://")
    monkeypatch.setenv("CELERY_RESULT_BACKEND", "cache+memory://")

    from app.celery_app import celery_app

    celery_app.conf.update(
        task_always_eager=True,
        task_eager_propagates=True,
        broker_url="memory://",
        result_backend="cache+memory://",
    )
    yield
    # Restore defaults (tests are isolated by fixture scope)
    celery_app.conf.update(
        task_always_eager=False,
        broker_url="redis://redis:6379/0",
        result_backend="redis://redis:6379/1",
    )


def test_extract_file_task_returns_success_dict():
    """Task returns dict with expected keys on success."""
    from app.tasks.extraction import extract_file_task

    mock_sub = {
        "inchi": "",
        "inchi_key": "AAAA",
        "smiles": "C",
        "extended_smiles": "",
        "iupac_name": "",
        "molecular_formula": "CH4",
        "aux_info": "",
        "mdlv3000": "",
        "abbreviations": {},
        "svg": "",
    }
    mock_info = {"no_fragments": 1, "no_inchis": 1, "no_substances": 1}

    with (
        patch(
            "app.tasks.extraction._extract_with_fallback_sync",
            return_value=([mock_sub], mock_info, False),
        ),
        patch("app.tasks.extraction.detect_format", return_value="cdx"),
        patch("app.tasks.extraction.asyncio.run", return_value=42),
    ):
        result = extract_file_task.apply(
            args=(base64.b64encode(b"fake_bytes").decode(), "test.cdx", "batch-uuid")
        ).get()

    assert result["filename"] == "test.cdx"
    assert result["structure_count"] == 1
    assert result["extraction_id"] == 42
    assert result["error"] is None


def test_extract_file_task_stashes_rls_scope_on_session():
    """Worker must stash (session_id, api_key_hash) on db.info before
    save_extraction so the after_begin listener (services/db.py) applies
    the RLS GUCs on every BEGIN. Without it, INSERTs under the prod role
    raise InsufficientPrivilege (the extractions policy uses USING for
    writes too). Test inspects info directly — independent of whether the
    test DB enforces RLS — so regressions surface in the unit suite.
    """
    from app.tasks.extraction import extract_file_task

    mock_sub = {
        "inchi": "",
        "inchi_key": "BBBB",
        "smiles": "CC",
        "extended_smiles": "",
        "iupac_name": "",
        "molecular_formula": "C2H6",
        "aux_info": "",
        "mdlv3000": "",
        "abbreviations": {},
        "svg": "",
    }
    mock_info = {"no_fragments": 1, "no_inchis": 1, "no_substances": 1}

    sid = "44444444-4444-4444-8444-444444444444"
    akh_hex = "cd" * 32  # arbitrary fake key_hash

    captured_scope: list[tuple[str | None, bytes | None]] = []

    class _FakeExtraction:
        id = 99
        batch_id: str | None = None

    async def _fake_save_extraction(db, response, scope):
        # The fix puts (session_id, akh) on db.info BEFORE this call.
        captured_scope.append(db.info.get("rls_scope"))
        return _FakeExtraction()

    with (
        patch(
            "app.tasks.extraction._extract_with_fallback_sync",
            return_value=([mock_sub], mock_info, False),
        ),
        patch("app.tasks.extraction.detect_format", return_value="cdx"),
        patch(
            "app.tasks.extraction.save_extraction",
            side_effect=_fake_save_extraction,
        ),
    ):
        result = extract_file_task.apply(
            args=(base64.b64encode(b"fake_bytes").decode(), "scope.cdx", "batch-uuid"),
            kwargs={"session_id": sid, "api_key_hash_hex": akh_hex},
        ).get()

    assert result["error"] is None, result
    assert captured_scope == [(sid, bytes.fromhex(akh_hex))], (
        "Worker did not stash (session_id, api_key_hash) on db.info "
        "before save_extraction — RLS GUCs will not be applied and "
        "every INSERT under the prod bchemxtract_app role will fail "
        "with InsufficientPrivilege"
    )


def test_extract_file_task_returns_error_dict_on_failure():
    """Task returns error dict (not raises) when extraction fails."""
    from app.tasks.extraction import extract_file_task

    with patch(
        "app.tasks.extraction.detect_format", side_effect=ValueError("bad format")
    ):
        result = extract_file_task.apply(
            args=(base64.b64encode(b"bad_bytes").decode(), "bad.cdx", "batch-uuid")
        ).get()

    assert result["error"] is not None
    assert "bad format" in result["error"]
    assert result["structure_count"] == 0
