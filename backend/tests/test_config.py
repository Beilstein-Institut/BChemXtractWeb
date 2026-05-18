"""Settings-validator tests (synchronous; no event loop).

These cover the :class:`app.config.Settings` startup validators that refuse
misconfigured deployments before the app even starts.

Phase 11 (Plan 11-05) removed the ``api_keys`` field and its validator —
admin-minted API keys live in the ``api_keys`` Postgres table now, gated
by ``X-Admin-Secret``. The remaining startup-time validators are
``_validate_phase11_secrets`` (≥32-char ``SECRET_KEY`` / ``ADMIN_SECRET`` /
``APP_DB_PASSWORD`` in production) and ``_validate_prod_cors`` (refuses a
``localhost`` origin under ``DEBUG=false``).
"""

from __future__ import annotations

import pytest

from app.config import Settings

_OK_SECRET = "a" * 32
_OK_ADMIN = "b" * 32
_OK_APP_DB = "c" * 32


def test_settings_refuses_short_secret_key_in_prod(monkeypatch) -> None:
    """_validate_phase11_secrets rejects a short SECRET_KEY under DEBUG=false."""
    monkeypatch.setenv("DEBUG", "false")
    monkeypatch.setenv("SECRET_KEY", "tooshort")
    monkeypatch.setenv("ADMIN_SECRET", _OK_ADMIN)
    monkeypatch.setenv("APP_DB_PASSWORD", _OK_APP_DB)
    monkeypatch.setenv("CORS_ORIGINS", '["https://app.example.com"]')
    with pytest.raises(Exception) as exc_info:
        Settings()  # type: ignore[call-arg]
    assert "SECRET_KEY" in str(exc_info.value)


def test_settings_refuses_short_admin_secret_in_prod(monkeypatch) -> None:
    """_validate_phase11_secrets rejects a short ADMIN_SECRET under DEBUG=false."""
    monkeypatch.setenv("DEBUG", "false")
    monkeypatch.setenv("SECRET_KEY", _OK_SECRET)
    monkeypatch.setenv("ADMIN_SECRET", "short")
    monkeypatch.setenv("APP_DB_PASSWORD", _OK_APP_DB)
    monkeypatch.setenv("CORS_ORIGINS", '["https://app.example.com"]')
    with pytest.raises(Exception) as exc_info:
        Settings()  # type: ignore[call-arg]
    assert "ADMIN_SECRET" in str(exc_info.value)


def test_settings_accepts_short_secrets_in_debug(monkeypatch) -> None:
    """Debug mode relaxes the ≥32-char rule (local dev convenience)."""
    monkeypatch.setenv("DEBUG", "true")
    monkeypatch.setenv("SECRET_KEY", "x")
    monkeypatch.setenv("ADMIN_SECRET", "y")
    monkeypatch.setenv("APP_DB_PASSWORD", "z")
    s = Settings()  # type: ignore[call-arg]
    assert s.debug is True


def test_settings_prod_cors_rejects_localhost(monkeypatch) -> None:
    """_validate_prod_cors refuses localhost origins under DEBUG=false."""
    monkeypatch.setenv("DEBUG", "false")
    monkeypatch.setenv("SECRET_KEY", _OK_SECRET)
    monkeypatch.setenv("ADMIN_SECRET", _OK_ADMIN)
    monkeypatch.setenv("APP_DB_PASSWORD", _OK_APP_DB)
    monkeypatch.setenv("CORS_ORIGINS", '["http://localhost:3000"]')
    with pytest.raises(Exception) as exc_info:
        Settings()  # type: ignore[call-arg]
    assert "localhost" in str(exc_info.value).lower()


def test_settings_expose_docs_defaults_to_debug(monkeypatch) -> None:
    monkeypatch.setenv("DEBUG", "true")
    monkeypatch.setenv("SECRET_KEY", "x")
    monkeypatch.setenv("ADMIN_SECRET", "y")
    monkeypatch.setenv("APP_DB_PASSWORD", "z")
    monkeypatch.delenv("EXPOSE_OPENAPI_DOCS", raising=False)
    s = Settings()  # type: ignore[call-arg]
    assert s.expose_openapi_docs is True

    monkeypatch.setenv("DEBUG", "false")
    monkeypatch.setenv("SECRET_KEY", _OK_SECRET)
    monkeypatch.setenv("ADMIN_SECRET", _OK_ADMIN)
    monkeypatch.setenv("APP_DB_PASSWORD", _OK_APP_DB)
    monkeypatch.setenv("CORS_ORIGINS", '["https://app.example.com"]')
    s = Settings()  # type: ignore[call-arg]
    assert s.expose_openapi_docs is False


def test_settings_expose_docs_explicit_override(monkeypatch) -> None:
    monkeypatch.setenv("DEBUG", "false")
    monkeypatch.setenv("SECRET_KEY", _OK_SECRET)
    monkeypatch.setenv("ADMIN_SECRET", _OK_ADMIN)
    monkeypatch.setenv("APP_DB_PASSWORD", _OK_APP_DB)
    monkeypatch.setenv("CORS_ORIGINS", '["https://app.example.com"]')
    monkeypatch.setenv("EXPOSE_OPENAPI_DOCS", "true")
    s = Settings()  # type: ignore[call-arg]
    assert s.expose_openapi_docs is True
