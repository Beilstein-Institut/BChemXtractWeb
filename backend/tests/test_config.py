"""Settings-validator tests (synchronous; no event loop).

These cover the :class:`app.config.Settings` startup validators that refuse
misconfigured deployments before the app even starts.
"""

from __future__ import annotations

import pytest

from app.config import Settings


def test_settings_refuses_empty_api_keys_in_prod(monkeypatch) -> None:
    """The settings validator raises when DEBUG=false + API_KEYS empty."""
    monkeypatch.setenv("DEBUG", "false")
    monkeypatch.setenv("API_KEYS", "[]")
    with pytest.raises(Exception) as exc_info:
        Settings()  # type: ignore[call-arg]
    assert "API_KEYS" in str(exc_info.value)


def test_settings_accepts_empty_keys_in_debug(monkeypatch) -> None:
    """Debug mode permits no keys (local dev convenience)."""
    monkeypatch.setenv("DEBUG", "true")
    monkeypatch.setenv("API_KEYS", "[]")
    s = Settings()  # type: ignore[call-arg]
    assert s.api_keys == []
    assert s.debug is True


def test_settings_rejects_short_keys(monkeypatch) -> None:
    """Keys shorter than 16 chars are rejected at startup."""
    monkeypatch.setenv("DEBUG", "false")
    monkeypatch.setenv("API_KEYS", '["tooshort"]')
    with pytest.raises(Exception) as exc_info:
        Settings()  # type: ignore[call-arg]
    assert "16 characters" in str(exc_info.value)


def test_settings_dedupes_duplicate_keys(monkeypatch) -> None:
    """Duplicate API keys in the list are de-duplicated."""
    key = "a" * 32
    monkeypatch.setenv("DEBUG", "false")
    monkeypatch.setenv("API_KEYS", f'["{key}", "{key}"]')
    s = Settings()  # type: ignore[call-arg]
    assert s.api_keys == [key]


def test_settings_expose_docs_defaults_to_debug(monkeypatch) -> None:
    monkeypatch.setenv("DEBUG", "true")
    monkeypatch.setenv("API_KEYS", "[]")
    monkeypatch.delenv("EXPOSE_OPENAPI_DOCS", raising=False)
    s = Settings()  # type: ignore[call-arg]
    assert s.expose_openapi_docs is True

    monkeypatch.setenv("DEBUG", "false")
    monkeypatch.setenv("API_KEYS", f'["{"b" * 32}"]')
    s = Settings()  # type: ignore[call-arg]
    assert s.expose_openapi_docs is False


def test_settings_expose_docs_explicit_override(monkeypatch) -> None:
    monkeypatch.setenv("DEBUG", "false")
    monkeypatch.setenv("API_KEYS", f'["{"c" * 32}"]')
    monkeypatch.setenv("EXPOSE_OPENAPI_DOCS", "true")
    s = Settings()  # type: ignore[call-arg]
    assert s.expose_openapi_docs is True
