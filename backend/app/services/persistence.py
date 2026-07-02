"""Persistence service: save extractions to PostgreSQL with deduplication.

All three public functions accept an AsyncSession from get_db() or a test fixture.
save_extraction() and delete_extraction_by_id() call db.commit() internally.
enforce_cap() also commits internally as a housekeeping step.
"""

import asyncio
import hashlib
import logging
import re

from sqlalchemy import delete, func, select, text, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chemistry import (
    ExtractionResponse,
    ReactionComponentResponse,
    ReactionResponse,
)
from app.models.orm import (
    Extraction,
    ExtractionReaction,
    ExtractionSubstance,
    Reaction,
    Substance,
)
from app.services.canonicalize import canonicalize_smiles

logger = logging.getLogger(__name__)

MAX_EXTRACTIONS = 500

# Surrogate InChIKey for fragment-path substances that have no real InChI:
# "S" + 13 hex + "-" + 10 hex + "-N" (uppercase SHA-256 of the SMILES). Real
# InChIKeys are letters-only, so a surrogate never collides with one. The
# builder and the matcher live together so the byte layout is defined once;
# search.py imports SURROGATE_INCHI_KEY_RE to resolve share/deep-links to such
# structures.
SURROGATE_INCHI_KEY_RE = re.compile(r"\AS[0-9A-F]{13}-[0-9A-F]{10}-N\Z")


def make_surrogate_inchi_key(smiles: str) -> str:
    """Mint a deterministic surrogate InChIKey from a SMILES (see module note)."""
    h = hashlib.sha256(smiles.encode()).hexdigest().upper()
    return f"S{h[:13]}-{h[13:23]}-N"


"""Retention cap: oldest extraction auto-deleted when limit is reached."""

CANONICAL_BATCH_SIZE = 32
"""Canonicalize substances in chunks of
~32 via asyncio.gather so JVM-thread-pool waits overlap. Target: ≤ 1 s
added latency per 100 substances, vs ~3 s for sequential (100 × 30 ms).
Tune if the JVM pool size changes in jvm_bridge.py.
"""


async def save_extraction(
    db: AsyncSession,
    response: ExtractionResponse,
    scope: tuple[str | None, bytes | None] = (None, None),
) -> Extraction:
    """Persist one extraction result and deduplicate its substances.

    Steps:
      1. Insert an Extraction row.
      2. Upsert each Substance via ON CONFLICT (inchi_key) DO NOTHING.
      3. Fetch IDs for all substances (new + existing) by inchi_key.
      4. Insert ExtractionSubstance join rows.
      5. Commit and refresh.
      6. Enforce 500-record cap.

    Args:
        db: AsyncSession from get_db() dependency.
        response: ExtractionResponse from the extraction pipeline.
        scope: ``(session_id, api_key_hash)`` ownership pair.
            The router-side ``get_scoped_db`` dependency populates this via
            ``request.state.scope``; the Celery batch worker passes it
            explicitly through task kwargs. Default ``(None, None)`` is for
            internal/non-runtime callers (migration helpers, ad-hoc tests).
            FORCE RLS is in effect — rows inserted with
            ``(None, None)`` are unreachable by any user request.

    Returns:
        The newly created Extraction ORM instance with id populated.
    """
    # Unpack owner columns for explicit write-through.
    # Defence-in-depth — the join-row inserts below set the same columns
    # rather than relying on RLS to filter join-row reads via the JOIN.
    session_id, api_key_hash = scope

    # Step 1: Insert Extraction row
    extraction = Extraction(
        filename=response.filename,
        file_size=response.file_size,
        format=response.format,
        structure_count=response.structure_count,
        abbreviation_count=response.abbreviation_count,
        extraction_time_ms=response.extraction_time_ms,
        warnings=response.warnings,
        session_id=session_id,
        api_key_hash=api_key_hash,
    )
    db.add(extraction)
    await db.flush()  # get extraction.id without committing

    # Step 2: Build substance data.
    # Substances from the fallback extractor have no InChI/InChIKey.
    # Generate a synthetic key from SMILES so they can still be stored
    # and deduplicated. Uses InChIKey format: 14 chars + hyphen + 10 chars
    # + hyphen + 1 char = 27 chars total. Prefix "S" marks it as
    # SMILES-derived (real InChIKeys never start with "S").
    for s in response.substances:
        if not s.inchi_key and s.smiles:
            s.inchi_key = make_surrogate_inchi_key(s.smiles)

    valid_substances = [s for s in response.substances if s.inchi_key]
    if valid_substances:
        substance_data = [
            {
                "inchi_key": s.inchi_key,
                "inchi": s.inchi,
                "smiles": s.smiles,
                "extended_smiles": s.extended_smiles,
                "molecular_formula": s.molecular_formula,
                "svg": s.svg,
                "svg_cdx": s.svg_cdx,
                "mdlv3000": s.mdlv3000,
                # placeholder — overwritten by the chunked gather below.
                "canonical_smiles": None,
            }
            for s in valid_substances
        ]

        # Canonical-SMILES write-through via CHUNKED asyncio.gather.
        # Per-substance canonicalization is I/O-bound on the JVM thread pool
        # (~30 ms each). Sequential awaits would add 30 ms × N seconds of
        # latency (15 s for 500 substances). Chunked gather overlaps the
        # waits so the total cost is ~(N / pool_size) × 30 ms (≤ 1 s per
        # 100 substances).
        #
        # Best-effort, log-and-continue per the auto-persist philosophy.
        # Individual canonicalization failures must NEVER break extraction:
        # return_exceptions=True keeps the gather alive even if one raises.
        canonical_results: list[str | BaseException] = []
        for start in range(0, len(substance_data), CANONICAL_BATCH_SIZE):
            chunk = substance_data[start : start + CANONICAL_BATCH_SIZE]
            canonical_results.extend(
                await asyncio.gather(
                    *(canonicalize_smiles(item.get("smiles") or "") for item in chunk),
                    return_exceptions=True,
                )
            )

        for item, result in zip(substance_data, canonical_results, strict=True):
            if isinstance(result, BaseException):
                # Per-item failure — log and leave NULL. Do NOT re-raise.
                logger.exception(
                    "Canonicalization failed for substance %s; leaving NULL",
                    (item.get("inchi_key") or "")[:20],
                )
                item["canonical_smiles"] = None
                continue
            # canonicalize_smiles returns "" on parse failure; store as NULL
            # so unparsable rows match the backfill semantics.
            item["canonical_smiles"] = result or None

        # ON CONFLICT DO NOTHING: first-seen metadata wins
        await db.execute(
            pg_insert(Substance)
            .values(substance_data)
            .on_conflict_do_nothing(index_elements=["inchi_key"])
        )

        # Step 3: Fetch IDs for all substances (new + pre-existing), keyed by
        # inchi_key so we can both build the join rows and heal blank SVGs.
        inchi_keys = [s.inchi_key for s in valid_substances]
        result = await db.execute(
            select(Substance.id, Substance.inchi_key).where(
                Substance.inchi_key.in_(inchi_keys)
            )
        )
        id_by_key = {key: sid for sid, key in result.all()}
        substance_ids = list(id_by_key.values())

        # Heal blank SVGs on pre-existing rows. ON CONFLICT DO NOTHING above
        # keeps first-seen metadata — so a substance first persisted with an
        # empty svg (e.g. a render that OOM'd under memory pressure in an
        # earlier deploy) keeps serving a blank image forever, because every
        # later re-upload discards its freshly-rendered good SVG on conflict.
        # We already hold that good SVG here, so fill it in. update_substance_svgs
        # only writes columns that are still '' (its CASE/WHERE guard), so this
        # heals blanks without ever clobbering a good existing render, and is a
        # no-op for the common case where the row was stored non-blank.
        for s in valid_substances:
            if not (s.svg or s.svg_cdx):
                continue
            sid = id_by_key.get(s.inchi_key)
            if sid is not None:
                await update_substance_svgs(db, sid, s.svg, s.svg_cdx)

        # Step 4: Insert join rows (ignore duplicates — re-extracting same file)
        # Owner columns mirror the parent Extraction so RLS
        # filtering on the join table works even without JOIN propagation.
        if substance_ids:
            join_data = [
                {
                    "extraction_id": extraction.id,
                    "substance_id": sid,
                    "position": index,
                    "session_id": session_id,
                    "api_key_hash": api_key_hash,
                }
                for index, sid in enumerate(substance_ids)
            ]
            await db.execute(
                pg_insert(ExtractionSubstance)
                .values(join_data)
                .on_conflict_do_nothing()
            )

    await db.commit()
    await db.refresh(extraction)

    # Step 6: Enforce retention cap — separate transaction
    await enforce_cap(db)

    return extraction


async def enforce_cap(db: AsyncSession, max_count: int = MAX_EXTRACTIONS) -> None:
    """Delete oldest extractions when count exceeds max_count, then orphan-clean.

    Inline cleanup: no trigger, no scheduled task. Runs after every
    successful save_extraction(). Safe to call when count is within cap.

    Args:
        db: AsyncSession from get_db() dependency.
        max_count: Maximum number of extractions to keep. Default 500.
    """
    total = await db.scalar(select(func.count()).select_from(Extraction))
    if total is None or total <= max_count:
        return

    # Keep the most recent max_count extractions; delete the rest
    keep_subq = (
        select(Extraction.id)
        .order_by(Extraction.created_at.desc())
        .limit(max_count)
        .subquery()
    )
    await db.execute(
        delete(Extraction).where(Extraction.id.not_in(select(keep_subq.c.id)))
    )

    # Delete orphaned substances (no remaining extraction_substances link)
    await db.execute(
        delete(Substance).where(
            Substance.id.not_in(select(ExtractionSubstance.substance_id))
        )
    )

    await db.commit()
    logger.info(
        "enforce_cap: trimmed to %d extractions, removed orphaned substances",
        max_count,
    )


async def delete_extraction_by_id(db: AsyncSession, extraction_id: int) -> bool:
    """Delete a single extraction record and clean up orphaned substances + reactions.

    The CASCADE FKs on extraction_substances.extraction_id and
    extraction_reactions.extraction_id remove join rows. After deletion,
    substances and reactions with no remaining links are removed.

    Args:
        db: AsyncSession from get_db() dependency.
        extraction_id: Primary key of the Extraction to delete.

    Returns:
        True if the extraction existed and was deleted, False if not found.
    """
    extraction = await db.get(Extraction, extraction_id)
    if extraction is None:
        return False

    await db.delete(extraction)
    await db.flush()

    # Remove orphaned substances (no remaining extraction_substances rows)
    await db.execute(
        delete(Substance).where(
            Substance.id.not_in(select(ExtractionSubstance.substance_id))
        )
    )

    # Orphan Reaction cleanup (mirror orphan-substance cleanup above).
    await db.execute(
        delete(Reaction).where(
            Reaction.id.not_in(select(ExtractionReaction.reaction_id))
        )
    )

    await db.commit()
    return True


async def delete_extractions_by_batch_id(db: AsyncSession, batch_id: str) -> int:
    """Delete every extraction tagged with ``batch_id``, then orphan-sweep.

    Used when a batch is cancelled and the partial results must be removed
    (clean slate). The CASCADE FKs on extraction_substances / extraction_reactions
    remove join rows; the orphan sweeps then drop substances and reactions that
    no longer link to any extraction (shared/deduped rows still referenced by
    other extractions are kept). RLS scopes the DELETE to the caller's own rows.

    Does NOT commit — the caller owns the transaction so the deletion and its
    audit row land atomically (mirrors the history single-delete path).

    Returns:
        Number of extraction rows deleted.
    """
    result = await db.execute(delete(Extraction).where(Extraction.batch_id == batch_id))
    deleted = result.rowcount or 0
    await db.flush()

    await db.execute(
        delete(Substance).where(
            Substance.id.not_in(select(ExtractionSubstance.substance_id))
        )
    )
    await db.execute(
        delete(Reaction).where(
            Reaction.id.not_in(select(ExtractionReaction.reaction_id))
        )
    )
    return deleted


async def update_substance_svgs(
    db: AsyncSession,
    substance_id: int,
    svg: str,
    svg_cdx: str,
) -> None:
    """Conditionally persist backfilled SVGs.

    Only writes each column when the current DB value is empty — so two
    concurrent detail-view requests don't race-overwrite each other's
    work, and a successful prior backfill is never clobbered by a
    later-failed re-render.

    Caller is responsible for committing the transaction. This helper is
    called from the GET /api/history/{id} read path in a per-substance
    loop; committing here would turn a single read into N transactions
    and foist a commit side-effect on callers that only wanted an UPDATE.
    """
    await db.execute(
        text(
            "UPDATE substances SET "
            "  svg = CASE WHEN svg = '' THEN :svg ELSE svg END, "
            "  svg_cdx = CASE WHEN svg_cdx = '' THEN :svg_cdx ELSE svg_cdx END "
            "WHERE id = :id AND (svg = '' OR svg_cdx = '')"
        ),
        {"id": substance_id, "svg": svg, "svg_cdx": svg_cdx},
    )


# ---------------------------------------------------------------------------
# Reaction persistence
# ---------------------------------------------------------------------------


def _reaction_dedup_key(rxn: ReactionResponse) -> str:
    """Compute the UNIQUE dedup value for a reaction row.

    Upstream BChemXtract never populates rinchi_key (verified in
    ReactionXtractor.java:132). We use
    long_rinchi_key as the primary dedup column; fall back to
    ``NO_RINCHI_{sha1(reaction_smiles)}`` when RInChI generation yielded
    nothing. ``NO_RINCHI_EMPTY`` is a last-resort sentinel for reactions that
    have neither a long_rinchi_key nor a reaction_smiles.
    """
    if rxn.long_rinchi_key:
        return rxn.long_rinchi_key
    if rxn.reaction_smiles:
        h = hashlib.sha1(rxn.reaction_smiles.encode("utf-8")).hexdigest()
        return f"NO_RINCHI_{h}"
    return "NO_RINCHI_EMPTY"


async def get_or_create_extraction_row(
    db: AsyncSession,
    *,
    filename: str,
    file_size: int,
    format: str,
    file_hash: str,
    scope: tuple[str | None, bytes | None] = (None, None),
) -> int:
    """Find or create the Extraction row a reactions call should attach to.

    When a user hits /api/reactions before /api/extract
    ever ran for this file, there's no Extraction row. Create a minimal one
    (structure_count=0, extraction_time_ms=0) so history stays consistent
    with the "{N} substances . {M} reactions" chip rule.

    Idempotence: v1 uses (filename, file_size, format) tuple as the
    fingerprint -- close-enough for common re-upload-identical-file flows.
    The SHA-256-based upgrade path (store a dedicated file_hash column and
    look up by it) is deferred -- for a
    single-user app this is acceptable v1 scope. The ``file_hash`` parameter
    is accepted but unused in v1; it's retained in the signature so callers
    compute it once and the upgrade path is drop-in.

    When a new row is created here it lands with the
    caller's (session_id, api_key_hash) scope so RLS reads via the matching
    cookie/key return it. The lookup query runs under the RLS context set
    by ``get_scoped_db`` so cross-session collisions are structurally
    impossible (a different scope's row with the same fingerprint is
    invisible and a fresh row is minted instead).

    Args:
        db: async session.
        filename: original upload filename.
        file_size: raw bytes length.
        format: "cdx" or "cdxml".
        file_hash: SHA-256 of file_bytes (reserved for v2 upgrade path).
        scope: ``(session_id, api_key_hash)`` ownership pair.

    Returns:
        extraction_id of the matched-or-created row.
    """
    session_id, api_key_hash = scope

    # Look up by filename + file_size + format as a fingerprint approximation.
    result = await db.execute(
        select(Extraction)
        .where(
            Extraction.filename == filename,
            Extraction.file_size == file_size,
            Extraction.format == format,
        )
        .order_by(Extraction.id.desc())
        .limit(1)
    )
    existing = result.scalar_one_or_none()
    if existing is not None:
        return existing.id

    # Create a new minimal Extraction row.
    extraction = Extraction(
        filename=filename,
        file_size=file_size,
        format=format,
        structure_count=0,
        extraction_time_ms=0.0,
        warnings=[],
        session_id=session_id,
        api_key_hash=api_key_hash,
    )
    db.add(extraction)
    await db.commit()
    await db.refresh(extraction)
    return extraction.id


async def save_reactions(
    db: AsyncSession,
    extraction_id: int,
    reactions: list[ReactionResponse],
    scope: tuple[str | None, bytes | None] = (None, None),
) -> int:
    """Persist reactions for an extraction.

    Mirrors the save_extraction pattern:
      1. Upsert each Reaction via ON CONFLICT (long_rinchi_key) DO NOTHING.
      2. Fetch IDs for all reactions by dedup key.
      3. Insert ExtractionReaction join rows with position.
      4. Update Extraction.reaction_count.
      5. Commit.

    Failures are allowed to raise -- the router is responsible for catching
    and logging (best-effort).

    Args:
        db: async session.
        extraction_id: parent Extraction row id (must exist).
        reactions: list of ReactionResponse; may be empty (still updates
            reaction_count to 0).
        scope: ``(session_id, api_key_hash)`` ownership pair.
            Written onto the ExtractionReaction join rows so RLS filtering
            applies to direct queries against the join table.

    Returns:
        extraction_id unchanged on success.
    """
    session_id, api_key_hash = scope
    if not reactions:
        await db.execute(
            update(Extraction)
            .where(Extraction.id == extraction_id)
            .values(reaction_count=0)
        )
        await db.commit()
        return extraction_id

    reaction_rows = [
        {
            "long_rinchi_key": _reaction_dedup_key(r),
            "rinchi": r.rinchi,
            "rinchi_key": r.rinchi_key,  # always "" in v1 -- forward-compat
            "short_rinchi_key": r.short_rinchi_key,
            "web_rinchi_key": r.web_rinchi_key,
            "reaction_smiles": r.reaction_smiles,
            "aux_info": r.aux_info,
            "svg": r.svg,
            "components": {
                "reactants": [c.model_dump() for c in r.reactants],
                "products": [c.model_dump() for c in r.products],
                "agents": [c.model_dump() for c in r.agents],
            },
        }
        for r in reactions
    ]

    # Dedup on long_rinchi_key (first-seen wins)
    await db.execute(
        pg_insert(Reaction)
        .values(reaction_rows)
        .on_conflict_do_nothing(index_elements=["long_rinchi_key"])
    )

    # Fetch ids for both newly-inserted and pre-existing rows
    dedup_keys = [row["long_rinchi_key"] for row in reaction_rows]
    id_result = await db.execute(
        select(Reaction.id, Reaction.long_rinchi_key).where(
            Reaction.long_rinchi_key.in_(dedup_keys)
        )
    )
    id_by_key = {key: rid for rid, key in id_result.all()}

    join_rows = [
        {
            "extraction_id": extraction_id,
            "reaction_id": id_by_key[row["long_rinchi_key"]],
            "position": idx,
            "session_id": session_id,
            "api_key_hash": api_key_hash,
        }
        for idx, row in enumerate(reaction_rows)
        if row["long_rinchi_key"] in id_by_key
    ]
    if join_rows:
        await db.execute(
            pg_insert(ExtractionReaction).values(join_rows).on_conflict_do_nothing()
        )

    # Update reaction_count on Extraction
    await db.execute(
        update(Extraction)
        .where(Extraction.id == extraction_id)
        .values(reaction_count=len(reactions))
    )
    await db.commit()
    return extraction_id


async def get_extraction_reactions(
    db: AsyncSession,
    extraction_id: int,
) -> tuple[Extraction, list[ReactionResponse]] | None:
    """Fetch cached reactions for an extraction (history-hydration).

    Returns ``(extraction_row, reactions)`` where reactions are the cached
    ``Reaction`` rows joined through ``ExtractionReaction`` and ordered by
    ``ExtractionReaction.position``. Each row is converted to a
    ``ReactionResponse`` Pydantic instance so the router can return it
    directly.

    Returns None when the extraction_id doesn't exist -- router converts
    this to a 404 ErrorResponse. An extraction that EXISTS but has zero
    reactions returns ``(extraction_row, [])`` -- router returns 200 with
    empty list.
    """
    ext_result = await db.execute(
        select(Extraction).where(Extraction.id == extraction_id)
    )
    extraction = ext_result.scalar_one_or_none()
    if extraction is None:
        return None

    rxn_result = await db.execute(
        select(Reaction)
        .join(
            ExtractionReaction,
            Reaction.id == ExtractionReaction.reaction_id,
        )
        .where(ExtractionReaction.extraction_id == extraction_id)
        .order_by(ExtractionReaction.position)
    )
    rows = rxn_result.scalars().all()

    reactions: list[ReactionResponse] = []
    for row in rows:
        components = row.components or {}
        reactions.append(
            ReactionResponse(
                rinchi=row.rinchi or "",
                rinchi_key=row.rinchi_key or "",
                short_rinchi_key=row.short_rinchi_key or "",
                long_rinchi_key=row.long_rinchi_key or "",
                web_rinchi_key=row.web_rinchi_key or "",
                reaction_smiles=row.reaction_smiles or "",
                aux_info=row.aux_info or "",
                reactants=[
                    ReactionComponentResponse(**c)
                    for c in components.get("reactants", [])
                ],
                products=[
                    ReactionComponentResponse(**c)
                    for c in components.get("products", [])
                ],
                agents=[
                    ReactionComponentResponse(**c) for c in components.get("agents", [])
                ],
                svg=row.svg or "",
            )
        )
    return extraction, reactions
