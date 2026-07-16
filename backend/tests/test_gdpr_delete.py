"""GDPR Article 17 delete tests.

- DELETE /api/me/data cascades extractions → join tables → orphan-sweep
  substances/reactions referenced only by the deleted extractions.
- `data.deleted` audit row is inserted in the SAME transaction, so the
  deletion and its audit record succeed or fail atomically.
- Response sets `bcx_sid=; Max-Age=0; Path=/`.
- Other sessions' extractions are untouched.
"""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select, text

from app.models.orm import (
    AuditLog,
    Extraction,
    ExtractionSubstance,
    Substance,
)
from app.services.db import AsyncSessionLocal
from tests.conftest import skip_under_superuser_db

pytestmark = pytest.mark.asyncio


SID_DELETE = "77777777-7777-4777-8777-777777777777"
SID_KEEP = "88888888-8888-4888-8888-888888888888"


async def _seed_extraction_with_substance(
    session_id: str, smiles: str
) -> tuple[int, int]:
    async with AsyncSessionLocal() as db:
        await db.execute(
            text("SELECT set_config('app.session_id', :sid, true)"),
            {"sid": session_id},
        )
        extraction = Extraction(
            session_id=session_id,
            api_key_hash=None,
            filename=f"gdpr-{smiles}.cdx",
            file_size=10,
            format="cdx",
            structure_count=1,
            extraction_time_ms=0.0,
            reaction_count=0,
            warnings=[],
        )
        db.add(extraction)
        await db.flush()

        substance = Substance(
            smiles=smiles,
            inchi=f"InChI=1S/{smiles}",
            inchi_key=f"X{smiles}YZ",
            dedup_key=f"X{smiles}YZ",
        )
        db.add(substance)
        await db.flush()

        join = ExtractionSubstance(
            extraction_id=extraction.id,
            substance_id=substance.id,
            session_id=session_id,
            api_key_hash=None,
        )
        db.add(join)
        await db.commit()
        return extraction.id, substance.id


async def _get_csrf_token(ac: AsyncClient) -> str:
    resp = await ac.get("/api/csrf-token")
    assert resp.status_code == 200, resp.text
    return resp.json()["csrf_token"]


@skip_under_superuser_db
async def test_gdpr_delete_cascades_orphan_sweep(started_app):
    """DELETE /api/me/data removes caller's extractions + sweeps orphan
    substances. Substances referenced by OTHER sessions' extractions are
    preserved.
    """
    eid_del, sid_del = await _seed_extraction_with_substance(SID_DELETE, "CCO")
    eid_keep, sid_keep = await _seed_extraction_with_substance(SID_KEEP, "CCC")

    transport = ASGITransport(app=started_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        ac.cookies.set("bcx_sid", SID_DELETE)
        token = await _get_csrf_token(ac)
        resp = await ac.delete("/api/me/data", headers={"X-CSRF-Token": token})
        assert resp.status_code == 204, resp.text

    async with AsyncSessionLocal() as db:
        await db.execute(text("SET LOCAL row_security = off"))

        result = await db.execute(
            select(func.count(Extraction.id)).where(Extraction.id == eid_del)
        )
        assert result.scalar_one() == 0, "caller's extraction not deleted"

        result = await db.execute(
            select(func.count(Substance.id)).where(Substance.id == sid_del)
        )
        assert result.scalar_one() == 0, f"orphan substance {sid_del} not swept"

        result = await db.execute(
            select(func.count(Extraction.id)).where(Extraction.id == eid_keep)
        )
        assert result.scalar_one() == 1, "other session's extraction was deleted"
        result = await db.execute(
            select(func.count(Substance.id)).where(Substance.id == sid_keep)
        )
        assert result.scalar_one() == 1, "other session's substance was swept"


async def test_gdpr_delete_audit_in_transaction(started_app, monkeypatch):
    """If the in-transaction audit insert fails, the whole DELETE rolls back
    atomically.
    """
    eid, _ = await _seed_extraction_with_substance(SID_DELETE, "CN")

    # me.py imports the helper at module load (``from app.services.audit
    # import audit_log_insert_in_session``), so the live reference is
    # bound on ``app.routers.me`` — patching the source module does not
    # affect the already-resolved import. Patch the local binding.
    from app.routers import me as me_module

    async def boom(*args, **kwargs):
        raise RuntimeError("simulated audit DB outage")

    monkeypatch.setattr(me_module, "audit_log_insert_in_session", boom)

    # ASGITransport raises app exceptions by default; disable that so we get
    # the FastAPI-translated 5xx response from unhandled_exception_handler.
    transport = ASGITransport(app=started_app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        ac.cookies.set("bcx_sid", SID_DELETE)
        token = await _get_csrf_token(ac)
        resp = await ac.delete("/api/me/data", headers={"X-CSRF-Token": token})
        assert resp.status_code >= 500, (
            f"audit failure should surface; got {resp.status_code}: {resp.text}"
        )

    async with AsyncSessionLocal() as db:
        await db.execute(text("SET LOCAL row_security = off"))
        result = await db.execute(
            select(func.count(Extraction.id)).where(Extraction.id == eid)
        )
        assert result.scalar_one() == 1, (
            "data.deleted audit failed but extraction was still deleted — "
            "audit + delete must be atomic"
        )


async def test_gdpr_delete_clears_cookie(started_app):
    """Response sets Set-Cookie: bcx_sid=; Max-Age=0; Path=/."""
    await _seed_extraction_with_substance(SID_DELETE, "CO")

    transport = ASGITransport(app=started_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        ac.cookies.set("bcx_sid", SID_DELETE)
        token = await _get_csrf_token(ac)
        resp = await ac.delete("/api/me/data", headers={"X-CSRF-Token": token})
        assert resp.status_code == 204, resp.text
        set_cookie = resp.headers.get("set-cookie", "")
        assert "bcx_sid=" in set_cookie
        assert "max-age=0" in set_cookie.lower()
        assert "path=/" in set_cookie.lower()


async def test_gdpr_delete_emits_audit_row(started_app):
    """Successful delete leaves exactly one new `data.deleted` audit row."""
    await _seed_extraction_with_substance(SID_DELETE, "CN1CCCCC1")

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(func.count(AuditLog.id)).where(AuditLog.event == "data.deleted")
        )
        n_before = int(result.scalar_one())

    transport = ASGITransport(app=started_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        ac.cookies.set("bcx_sid", SID_DELETE)
        token = await _get_csrf_token(ac)
        resp = await ac.delete("/api/me/data", headers={"X-CSRF-Token": token})
        assert resp.status_code == 204, resp.text

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(func.count(AuditLog.id)).where(AuditLog.event == "data.deleted")
        )
        n_after = int(result.scalar_one())

    assert n_after == n_before + 1, (
        f"expected +1 data.deleted row, got {n_after - n_before}"
    )
