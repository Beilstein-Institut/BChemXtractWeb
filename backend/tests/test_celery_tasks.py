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


def test_extract_file_task_returns_error_dict_on_failure():
    """Task returns error dict (not raises) when extraction fails (D-09)."""
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
