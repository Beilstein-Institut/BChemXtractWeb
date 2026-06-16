"""Settings-validator tests (synchronous; no event loop).

These cover the :class:`app.config.Settings` startup validators that refuse
misconfigured deployments before the app even starts.

The ``api_keys`` field and its validator were removed — admin-minted API
keys live in the ``api_keys`` Postgres table now, gated by ``X-Admin-Secret``.
The remaining startup-time validators are ``_validate_auth_secrets``
(≥32-char ``SECRET_KEY`` / ``ADMIN_SECRET`` / ``APP_DB_PASSWORD`` in
production) and ``_validate_prod_cors`` (refuses a ``localhost`` origin
under ``DEBUG=false``).
"""

from __future__ import annotations

import pytest

from app.config import Settings

_OK_SECRET = "a" * 32
_OK_ADMIN = "b" * 32
_OK_APP_DB = "c" * 32
_OK_CORS = '["https://app.example.com"]'


@pytest.fixture
def prod_env(monkeypatch):
    """Pre-set a valid prod-mode env so each test mutates only the var
    under inspection. Returns the monkeypatch handle for further setenv
    / delenv calls.
    """
    monkeypatch.setenv("DEBUG", "false")
    monkeypatch.setenv("SECRET_KEY", _OK_SECRET)
    monkeypatch.setenv("ADMIN_SECRET", _OK_ADMIN)
    monkeypatch.setenv("APP_DB_PASSWORD", _OK_APP_DB)
    monkeypatch.setenv("CORS_ORIGINS", _OK_CORS)
    return monkeypatch


@pytest.fixture
def debug_env(monkeypatch):
    """Pre-set a valid debug-mode env (short secrets allowed)."""
    monkeypatch.setenv("DEBUG", "true")
    monkeypatch.setenv("SECRET_KEY", "x")
    monkeypatch.setenv("ADMIN_SECRET", "y")
    monkeypatch.setenv("APP_DB_PASSWORD", "z")
    return monkeypatch


def test_settings_refuses_short_secret_key_in_prod(prod_env) -> None:
    """_validate_auth_secrets rejects a short SECRET_KEY under DEBUG=false."""
    prod_env.setenv("SECRET_KEY", "tooshort")
    with pytest.raises(Exception) as exc_info:
        Settings()  # type: ignore[call-arg]
    assert "SECRET_KEY" in str(exc_info.value)


def test_settings_refuses_short_admin_secret_in_prod(prod_env) -> None:
    """_validate_auth_secrets rejects a short ADMIN_SECRET under DEBUG=false."""
    prod_env.setenv("ADMIN_SECRET", "short")
    with pytest.raises(Exception) as exc_info:
        Settings()  # type: ignore[call-arg]
    assert "ADMIN_SECRET" in str(exc_info.value)


def test_settings_accepts_short_secrets_in_debug(debug_env) -> None:
    """Debug mode relaxes the ≥32-char rule (local dev convenience)."""
    s = Settings()  # type: ignore[call-arg]
    assert s.debug is True


def test_settings_prod_cors_rejects_localhost(prod_env) -> None:
    """_validate_prod_cors refuses localhost origins under DEBUG=false."""
    prod_env.setenv("CORS_ORIGINS", '["http://localhost:3000"]')
    with pytest.raises(Exception) as exc_info:
        Settings()  # type: ignore[call-arg]
    assert "localhost" in str(exc_info.value).lower()


def test_settings_expose_docs_defaults_to_debug(monkeypatch) -> None:
    """EXPOSE_OPENAPI_DOCS tracks DEBUG when not explicitly set —
    on under DEBUG=true, off under DEBUG=false.
    """
    monkeypatch.delenv("EXPOSE_OPENAPI_DOCS", raising=False)

    # Debug mode → defaults on.
    monkeypatch.setenv("DEBUG", "true")
    monkeypatch.setenv("SECRET_KEY", "x")
    monkeypatch.setenv("ADMIN_SECRET", "y")
    monkeypatch.setenv("APP_DB_PASSWORD", "z")
    assert Settings().expose_openapi_docs is True  # type: ignore[call-arg]

    # Prod mode → defaults off.
    monkeypatch.setenv("DEBUG", "false")
    monkeypatch.setenv("SECRET_KEY", _OK_SECRET)
    monkeypatch.setenv("ADMIN_SECRET", _OK_ADMIN)
    monkeypatch.setenv("APP_DB_PASSWORD", _OK_APP_DB)
    monkeypatch.setenv("CORS_ORIGINS", _OK_CORS)
    assert Settings().expose_openapi_docs is False  # type: ignore[call-arg]


def test_settings_expose_docs_explicit_override(prod_env) -> None:
    """Explicit EXPOSE_OPENAPI_DOCS=true overrides the DEBUG-derived default."""
    prod_env.setenv("EXPOSE_OPENAPI_DOCS", "true")
    assert Settings().expose_openapi_docs is True  # type: ignore[call-arg]


def test_pubchem_settings_defaults(debug_env) -> None:
    """PubChem enrichment ships disabled with conservative defaults."""
    s = Settings()  # type: ignore[call-arg]
    assert s.pubchem_enabled is False
    assert s.pubchem_base_url == "https://pubchem.ncbi.nlm.nih.gov/rest/pug"
    assert s.pubchem_timeout_secs == 10.0
    assert s.pubchem_rate_per_sec == 4.0
    assert s.pubchem_max_concurrency == 4
    assert s.pubchem_contact_email == ""
    assert s.pubchem_cache_ttl_days == 180
    assert s.pubchem_negative_ttl_days == 14
    assert s.pubchem_synonyms_cap == 12
    assert s.pubchem_enrich_batch_max == 50
    assert s.rate_limit_pubchem == "60/minute"


def test_pubchem_rate_per_sec_capped_below_pubchem_limit(debug_env) -> None:
    """Reject a configured rate that would exceed PubChem's 5 req/s policy."""
    debug_env.setenv("PUBCHEM_RATE_PER_SEC", "9")
    with pytest.raises(Exception) as exc_info:
        Settings()  # type: ignore[call-arg]
    assert "PUBCHEM_RATE_PER_SEC" in str(exc_info.value)
