"""PubChem enrichment orchestration: cache read -> resolve -> cache write.

Owns the match-status decision and TTL freshness. All PubChem I/O is
delegated to ``app.services.pubchem``; this module only touches the
``pubchem_compounds`` cache and builds the ``PubChemEnrichment`` DTO.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.chemistry import PubChemEnrichItem, PubChemEnrichment
from app.models.orm import PubChemCompound
from app.services import pubchem

_COMPOUND_PAGE = pubchem.PUBCHEM_COMPOUND_PAGE


def _now() -> datetime:
    return datetime.now(UTC)


def _is_fresh(row: PubChemCompound, *, detail: bool) -> bool:
    """Tier-1 freshness uses status-dependent TTL. Tier-2 also requires the
    detail columns to have been fetched."""
    ttl_days = (
        settings.pubchem_cache_ttl_days
        if row.status == "exact"
        else settings.pubchem_negative_ttl_days
    )
    stamp = row.fetched_at
    if stamp.tzinfo is None:
        stamp = stamp.replace(tzinfo=UTC)
    fresh = _now() - stamp < timedelta(days=ttl_days)
    if detail and row.detail_fetched_at is None and row.status != "absent":
        return False
    return fresh


def _row_to_dto(row: PubChemCompound) -> PubChemEnrichment:
    url = f"{_COMPOUND_PAGE}/{row.cid}" if row.cid is not None else None
    return PubChemEnrichment(
        inchi_key=row.inchi_key,
        status=row.status,  # type: ignore[arg-type]
        cid=row.cid,
        iupac_name=row.iupac_name,
        molecular_formula=row.molecular_formula,
        molecular_weight=float(row.molecular_weight)
        if row.molecular_weight is not None
        else None,
        canonical_smiles=row.canonical_smiles,
        isomeric_smiles=row.isomeric_smiles,
        xlogp=row.xlogp,
        pubchem_url=url,
        connectivity_cid_count=row.connectivity_cid_count,
        title=row.title,
        synonyms=list(row.synonyms or []),
        description=row.description,
        description_source=row.description_source,
    )


async def _read(db: AsyncSession, inchi_key: str) -> PubChemCompound | None:
    return await db.get(PubChemCompound, inchi_key)


async def _resolve_tier1(item: PubChemEnrichItem) -> dict:
    """Run the exact -> scaffold -> absent ladder. Returns a column dict."""
    exact = await pubchem.resolve_exact_cids(item.inchi_key)
    if exact:
        props = await pubchem.fetch_core_properties(exact[0])
        return {
            "status": "exact",
            "cid": exact[0],
            "connectivity_cid_count": 0,
            **props,
        }
    scaffold = await pubchem.resolve_connectivity_cids(item.smiles)
    if scaffold:
        props = await pubchem.fetch_core_properties(scaffold[0])
        return {
            "status": "scaffold",
            "cid": scaffold[0],
            "connectivity_cid_count": len(scaffold),
            **props,
        }
    return {"status": "absent", "cid": None, "connectivity_cid_count": 0}


def _apply(row: PubChemCompound, cols: dict) -> None:
    row.status = cols["status"]
    row.cid = cols.get("cid")
    row.connectivity_cid_count = cols.get("connectivity_cid_count", 0)
    row.molecular_formula = cols.get("molecular_formula")
    row.molecular_weight = cols.get("molecular_weight")
    row.canonical_smiles = cols.get("canonical_smiles")
    row.isomeric_smiles = cols.get("isomeric_smiles")
    row.iupac_name = cols.get("iupac_name")
    row.xlogp = cols.get("xlogp")
    row.fetched_at = _now()


async def _upsert_tier1(
    db: AsyncSession, inchi_key: str, cols: dict
) -> PubChemCompound:
    row = await _read(db, inchi_key)
    if row is None:
        row = PubChemCompound(inchi_key=inchi_key, status=cols["status"])
        db.add(row)
    _apply(row, cols)
    await db.flush()
    return row


async def enrich_batch(
    db: AsyncSession, items: list[PubChemEnrichItem]
) -> dict[str, PubChemEnrichment]:
    """Tier-1 enrichment for a batch. Cache-first; resolves only on miss or
    stale row. Per-item failures degrade to status 'absent' (transient)."""
    out: dict[str, PubChemEnrichment] = {}
    for item in items:
        row = await _read(db, item.inchi_key)
        if row is not None and _is_fresh(row, detail=False):
            out[item.inchi_key] = _row_to_dto(row)
            continue
        try:
            cols = await _resolve_tier1(item)
            row = await _upsert_tier1(db, item.inchi_key, cols)
            # Build the DTO from in-memory values BEFORE commit so the
            # response never depends on post-commit attribute access (robust
            # regardless of the session's expire_on_commit setting).
            dto = _row_to_dto(row)
            await db.commit()
            out[item.inchi_key] = dto
        except pubchem.PubChemError:
            await db.rollback()
            # Serve stale data if we have it; otherwise a transient 'absent'
            # that is NOT cached (so a later call retries).
            if row is not None:
                out[item.inchi_key] = _row_to_dto(row)
            else:
                out[item.inchi_key] = PubChemEnrichment(
                    inchi_key=item.inchi_key, status="absent"
                )
    return out


async def enrich_detail(db: AsyncSession, inchi_key: str) -> PubChemEnrichment:
    """Tier-2: ensure a row exists (exact-only resolve if missing — detail can
    be opened without a prior batch), then fill synonyms + description."""
    row = await _read(db, inchi_key)
    if row is None:
        cols = {"status": "absent", "cid": None, "connectivity_cid_count": 0}
        try:
            exact = await pubchem.resolve_exact_cids(inchi_key)
            if exact:
                props = await pubchem.fetch_core_properties(exact[0])
                cols = {
                    "status": "exact",
                    "cid": exact[0],
                    "connectivity_cid_count": 0,
                    **props,
                }
        except pubchem.PubChemError:
            return PubChemEnrichment(inchi_key=inchi_key, status="absent")
        row = await _upsert_tier1(db, inchi_key, cols)
        await db.commit()

    if row.cid is not None and not _is_fresh(row, detail=True):
        try:
            syn = await pubchem.fetch_synonyms(row.cid)
            desc = await pubchem.fetch_description(row.cid)
            row.synonyms = syn
            row.title = desc.get("title")
            row.description = desc.get("description")
            row.description_source = desc.get("description_source")
            row.detail_fetched_at = _now()
            await db.flush()
            dto = _row_to_dto(row)
            await db.commit()
            return dto
        except pubchem.PubChemError:
            await db.rollback()
    return _row_to_dto(row)
