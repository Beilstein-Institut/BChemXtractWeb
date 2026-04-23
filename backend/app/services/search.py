"""Search service: dispatch by type, attribution JOIN, SMARTS iterate (Phase 9).

Entry point: :func:`execute_search` — called by ``backend/app/routers/search.py``.

Dispatch (per D-14 + RESEARCH.md §Pattern 9):

- ``type='auto'``  → :func:`detect_search_type` classifies the query into one
  of ``{inchi_key, formula, smiles}``.
- ``type='inchi_key'`` → indexed ``WHERE inchi_key = :key`` (SRCH-01).
- ``type='formula'``   → indexed ``WHERE molecular_formula = :formula`` (SRCH-02).
- ``type='smiles'``, ``match='canonical'`` → canonicalize query via
  :func:`app.services.canonicalize.canonicalize_smiles`; match against
  ``Substance.canonical_smiles`` (SRCH-03).
- ``type='smiles'``, ``match='literal'``   → match against the raw
  ``Substance.smiles`` column (no canonicalization).
- ``type='substructure'`` → iterate candidate substances; run CDK
  ``SmartsPattern.matches()``; collect hits + matched atom indices; skip
  unparsable rows with a per-result warning (SRCH-04, D-09).

Post-match attribution (D-10): one additional SELECT joins
Substance → ExtractionSubstance → Extraction and aggregates "found in N
extractions" per result (grouped in Python — fast, no N+1 risk for the
≤ 2k-substance v1 scale bound by D-07).

Scope (D-20):

- ``'global'`` — all substances.
- ``'extraction:{id}'`` — restricts to substances linked to that extraction
  via :class:`app.models.orm.ExtractionSubstance` (IDOR-safe; mirrors
  the ``export.py`` pattern).

JVM policy: **all** CDK calls go through
:func:`app.services.jvm_bridge.run_in_jvm_thread`. Never call CDK directly
from an async handler.

Polymer-SMILES guard (release blocker from Plan 02 carry-over): the
substructure branch applies a hard ``LENGTH(smiles) <= MAX_SUBSTRUCT_SMILES_LEN``
SQL prefilter before iterating, because CDK's ``SmartsPattern.matches()`` and
Daylight aromaticity perception hang for 10+ minutes on SMILES >= 1500 chars
and the JVM ignores SIGALRM during native graph operations.
"""

from __future__ import annotations

import logging
import re
from collections import defaultdict

import jpype
from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import (
    ExtractionError,
    InvalidInchiKeyError,
    InvalidSmartsError,
    InvalidSmilesError,
)
from app.models.chemistry import (
    SearchExtractionRef,
    SearchRequest,
    SearchResponse,
    SearchResult,
    SubstanceResponse,
)
from app.models.orm import Extraction, ExtractionSubstance, Substance
from app.services.canonicalize import canonicalize_smiles
from app.services.depiction import render_substance_svg_with_highlight
from app.services.jvm_bridge import run_in_jvm_thread

logger = logging.getLogger(__name__)

# Per RESEARCH §Pattern 9 — precedence: inchi_key > formula > smiles.
# Anchored to prevent ReDoS.
#
# The formula pattern is linear-time even on pathological CPython `re`
# input because (a) there is no ambiguity between the repeat group and
# what comes after it (the trailing ``\Z`` anchors the match), (b) the
# inner digit run is capped via ``{0,5}`` (no element in the periodic
# table has >5 significant repeat digits in a realistic formula), and
# (c) the outer repeat is capped via ``{1,60}`` so even adversarial
# inputs cannot drive backtracking. Regression covered by
# ``tests/test_formula_regex_redos.py``.
# Accepts full ``<14>-<10>-<1>`` keys and PubChem-style partial prefixes:
# the 14-char connectivity block alone, or ``<14>-<10>`` (connectivity +
# stereo). :func:`_search_inchi_key` distinguishes full vs partial by
# ``len(normalized) == 27`` — a 27-char string matching this pattern can
# only be the full shape.
_INCHI_KEY_RE = re.compile(r"\A[A-Z]{14}(?:-[A-Z]{10}(?:-[A-Z])?)?\Z")
_FORMULA_RE = re.compile(r"\A(?:[A-Z][a-z]?\d{0,5}){1,60}\Z")

# Polymer-SMILES deadlock ceiling. Same threshold Plan 02 applies inside
# :func:`canonicalize._canonicalize_smiles_sync` — CDK's ``SmartsPattern``
# matching path is *also* subject to the deadlock, so we apply the same
# ceiling to the substructure candidate set (threat model T-09-03-03/04).
# Stored SMILES longer than this are silently excluded from substructure
# iteration and counted as "skipped" in the response warnings.
MAX_SUBSTRUCT_SMILES_LEN = 1500

# Per-hit attribution list cap (threat model T-09-03-04/06: bounds response
# size even when a single substance appears in thousands of extractions).
_MAX_ATTRIBUTION_REFS = 20

# Skipped-id logging cap (avoid log flood when many rows fail to parse).
_MAX_LOGGED_SKIPPED = 20


def detect_search_type(raw: str) -> str:
    """Auto-detect the search type for a raw user query (D-01).

    Never returns ``"substructure"`` — substructure requires an explicit
    ``type='substructure'`` on the request (D-03: substructure is too
    expensive to run on every keystroke / auto-dispatch).

    Args:
        raw: The raw query string (will be stripped).

    Returns:
        One of ``"inchi_key"``, ``"formula"``, or ``"smiles"``.

    Raises:
        ValueError: If ``raw`` is empty or only whitespace. Callers should
            convert this to an HTTP 400 or let Pydantic ``min_length=1``
            reject the request before it reaches this function.
    """
    stripped = raw.strip()
    if not stripped:
        raise ValueError("empty query")
    if _INCHI_KEY_RE.match(stripped.upper()):
        return "inchi_key"
    if _FORMULA_RE.match(stripped):
        return "formula"
    return "smiles"


def _parse_scope(scope: str) -> int | None:
    """Return the extraction_id for ``'extraction:N'``, else ``None`` (global).

    Previously malformed scope strings silently fell back to ``"global"``,
    which is an IDOR-adjacent footgun once multi-tenant auth lands: a user
    mistypes ``"extraction:"`` and gets results across every extraction
    they never should have seen (SEC M-06). The guard now rejects malformed
    scope explicitly with 400 so the failure is visible to the caller.
    """
    if scope == "global":
        return None
    if not scope.startswith("extraction:"):
        raise HTTPException(
            status_code=400,
            detail=("Invalid scope. Must be 'global' or 'extraction:<integer id>'."),
        )
    try:
        eid = int(scope.split(":", 1)[1])
    except (ValueError, IndexError) as err:
        raise HTTPException(
            status_code=400,
            detail=(
                "Invalid scope. 'extraction:' must be followed by a positive "
                "integer extraction id."
            ),
        ) from err
    if eid <= 0:
        raise HTTPException(
            status_code=400,
            detail="Scope extraction id must be a positive integer.",
        )
    return eid


def _resolve_effective_type(payload: SearchRequest) -> str:
    """Resolve a ``'auto'`` type via detection; pass through otherwise."""
    if payload.type == "auto":
        return detect_search_type(payload.query)
    return payload.type


def _base_substance_select(scope_extraction_id: int | None):
    """Build a ``SELECT Substance`` statement with optional IDOR-safe scope.

    When ``scope_extraction_id`` is given, JOIN through
    :class:`ExtractionSubstance` and filter — this mirrors the ``export.py``
    pattern (lines 62-67) proven to close the IDOR hole. The ``.distinct()``
    call protects against duplicate substance rows when a substance appears
    more than once inside the same extraction.
    """
    if scope_extraction_id is None:
        return select(Substance)
    return (
        select(Substance)
        .join(
            ExtractionSubstance,
            Substance.id == ExtractionSubstance.substance_id,
        )
        .where(ExtractionSubstance.extraction_id == scope_extraction_id)
        .distinct()
    )


async def _search_inchi_key(
    q: str, scope_eid: int | None, db: AsyncSession
) -> list[Substance]:
    """SRCH-01: indexed exact / prefix InChI key match.

    The user-supplied key is stripped and uppercased before matching, so
    ``"  uhovqnzjysornb-uhffffaoysa-n  "`` collapses to the canonical
    27-character form. Accepted shapes (PubChem-style partial matching):

    * ``<14>-<10>-<1>`` — full key, matched exactly.
    * ``<14>-<10>`` — returns every stored key sharing skeleton + stereo
      (any protonation).
    * ``<14>`` — returns every stored key sharing the skeleton (any
      stereo / isotope / protonation).

    Malformed input raises :class:`InvalidInchiKeyError` (422 /
    INVALID_INCHI_KEY). The LIKE branch is safe: the regex restricts
    the pattern to ``[A-Z]`` + hyphens, so no SQL wildcard characters
    (``%``, ``_``) can enter the pattern.
    """
    normalized = q.strip().upper()
    if not _INCHI_KEY_RE.match(normalized):
        raise InvalidInchiKeyError(
            "InChI key must be 14 letters, optionally followed by "
            "'-' + 10 letters, optionally followed by '-' + 1 letter."
        )
    base = _base_substance_select(scope_eid)
    # Post-regex, 27 chars is the only way to be a full <14>-<10>-<1>.
    if len(normalized) == 27:
        stmt = base.where(Substance.inchi_key == normalized)
    else:
        stmt = base.where(Substance.inchi_key.like(f"{normalized}-%"))
    return list((await db.execute(stmt)).scalars().all())


async def _search_formula(
    q: str, scope_eid: int | None, db: AsyncSession
) -> list[Substance]:
    """SRCH-02: indexed exact molecular formula match.

    No canonicalization is applied — the user types ``C6H6`` and we match
    against the stored string exactly. (Plan 02 added a B-tree index on
    ``molecular_formula`` for this query.)
    """
    stmt = _base_substance_select(scope_eid).where(
        Substance.molecular_formula == q.strip()
    )
    return list((await db.execute(stmt)).scalars().all())


async def _search_smiles(
    q: str, match_mode: str, scope_eid: int | None, db: AsyncSession
) -> list[Substance]:
    """SRCH-03: SMILES match — ``'canonical'`` (default) or ``'literal'``.

    ``canonical`` canonicalizes the query via
    :func:`app.services.canonicalize.canonicalize_smiles` and matches against
    the ``Substance.canonical_smiles`` column populated by Plan 02's
    write-through + Alembic backfill (the column is indexed). If the query
    can't be parsed by CDK, raise :class:`InvalidSmilesError`.

    ``literal`` bypasses canonicalization entirely and matches the raw
    ``Substance.smiles`` column — useful when the user typed a SMILES
    fragment they specifically want to find verbatim.
    """
    if match_mode == "literal":
        stmt = _base_substance_select(scope_eid).where(Substance.smiles == q)
        return list((await db.execute(stmt)).scalars().all())

    canonical = await canonicalize_smiles(q)
    if not canonical:
        raise InvalidSmilesError("The SMILES string could not be parsed by CDK.")
    stmt = _base_substance_select(scope_eid).where(
        Substance.canonical_smiles == canonical
    )
    return list((await db.execute(stmt)).scalars().all())


def _substructure_sync(
    smarts: str,
    rows: list[tuple[int, str]],
) -> tuple[list[tuple[int, list[int], str]], list[int]]:
    """Blocking SMARTS iterate + per-hit highlight render. JVM-thread-bound.

    Uses the *new* CDK SMARTS package path
    ``org.openscience.cdk.smarts.SmartsPattern`` (RESEARCH Pitfall 1 — the
    legacy ``org.openscience.cdk.smiles.smarts.SmartsPattern`` is deprecated
    and behaves differently).

    Plan 04 extension: for every hit, render a tinted SVG via
    :func:`app.services.depiction.render_substance_svg_with_highlight`
    *in the same pass*. Doing the render here (while the parsed mol is
    still in scope on the JVM thread) avoids a second parse + second
    thread-attach round-trip per hit.

    Args:
        smarts: User-supplied SMARTS pattern. Validated by
            ``SmartsPattern.create()`` — malformed patterns raise
            :class:`jpype.JException` which we translate to
            :class:`InvalidSmartsError`.
        rows: Candidate ``(substance_id, smiles)`` tuples — already
            length-filtered by the caller to ``<= MAX_SUBSTRUCT_SMILES_LEN``
            to avoid the polymer-SMILES deadlock.

    Returns:
        ``(hits, skipped)`` where ``hits`` is a list of
        ``(substance_id, sorted_matched_atom_indices, match_svg)`` triples
        and ``skipped`` is the list of ``substance_id`` values whose stored
        SMILES could not be parsed by CDK.
    """
    SmartsPattern = jpype.JClass(  # noqa: N806
        "org.openscience.cdk.smarts.SmartsPattern"
    )
    SmilesParser = jpype.JClass(  # noqa: N806
        "org.openscience.cdk.smiles.SmilesParser"
    )
    SilentChemObjectBuilder = jpype.JClass(  # noqa: N806
        "org.openscience.cdk.silent.SilentChemObjectBuilder"
    )
    Aromaticity = jpype.JClass(  # noqa: N806
        "org.openscience.cdk.aromaticity.Aromaticity"
    )
    ElectronDonation = jpype.JClass(  # noqa: N806
        "org.openscience.cdk.aromaticity.ElectronDonation"
    )
    Cycles = jpype.JClass(  # noqa: N806
        "org.openscience.cdk.graph.Cycles"
    )
    AtomContainerManipulator = jpype.JClass(  # noqa: N806
        "org.openscience.cdk.tools.manipulator.AtomContainerManipulator"
    )

    builder = SilentChemObjectBuilder.getInstance()
    parser = SmilesParser(builder)
    aromaticity = Aromaticity(
        ElectronDonation.daylight(),
        Cycles.or_(Cycles.all(), Cycles.cdkAromaticSet()),
    )

    try:
        pattern = SmartsPattern.create(smarts)
    except jpype.JException as exc:
        # Truncate the Java message — full stack stays server-side
        # (threat model T-09-03-07: no Java frames in response).
        raise InvalidSmartsError(f"Invalid SMARTS pattern: {str(exc)[:200]}") from exc

    # Accessibility title embedded in each highlighted SVG per UI-SPEC
    # §Accessibility. The helper HTML-escapes the title to prevent
    # user-supplied SMARTS from breaking SVG structure (threat T-09-04-02).
    highlight_title = f"Matches {smarts[:80]}"

    hits: list[tuple[int, list[int], str]] = []
    skipped: list[int] = []
    for substance_id, smi in rows:
        if not smi:
            skipped.append(substance_id)
            continue
        try:
            mol = parser.parseSmiles(smi)
            # Apply aromaticity perception so aromatic SMARTS (c1ccccc1)
            # match stored Kekulé SMILES after CDK's default parse — same
            # recipe used in Plan 02's canonicalize service. Aromaticity
            # can raise non-JException, so guard with a broad except.
            AtomContainerManipulator.percieveAtomTypesAndConfigureAtoms(mol)
            aromaticity.apply(mol)
        except Exception:  # noqa: BLE001
            skipped.append(substance_id)
            continue
        try:
            if not pattern.matches(mol):
                continue
            mappings = pattern.matchAll(mol).uniqueAtoms()
            int2d = mappings.toArray()
        except jpype.JException:
            # Matching itself failed (rare; e.g. inconsistent molecule after
            # aromaticity). Treat as skipped, not a hit.
            skipped.append(substance_id)
            continue
        target_indices: set[int] = {int(idx) for row in int2d for idx in row}
        sorted_indices = sorted(target_indices)
        # Plan 04: render per-hit highlight SVG in the same JVM pass.
        # The helper has its own two-tier fallback (highlight → plain → ""),
        # so a render failure never breaks the hit — match_svg just comes
        # back as "" which execute_search converts to None on the wire.
        match_svg = render_substance_svg_with_highlight(
            mol, sorted_indices, title=highlight_title
        )
        hits.append((substance_id, sorted_indices, match_svg))
    return hits, skipped


async def _search_substructure(
    smarts: str, scope_eid: int | None, db: AsyncSession
) -> tuple[list[Substance], dict[int, list[int]], dict[int, str], int]:
    """SRCH-04: CDK SMARTS over every candidate substance + highlight SVGs.

    Applies the ``MAX_SUBSTRUCT_SMILES_LEN`` polymer-SMILES ceiling via SQL
    prefilter so the candidate rows handed to CDK never include inputs
    that would deadlock the JVM. Over-length rows are counted as
    "skipped_oversize" so the response warnings surface the real total.

    Plan 04: :func:`_substructure_sync` now also renders a tinted SVG per
    hit (Apple Blue at 0x40 alpha per UI-SPEC §Color) in the same JVM
    pass. The per-hit SVG is returned here as ``svg_by_substance_id`` so
    :func:`execute_search` can set ``SearchResult.match_svg`` without a
    second JVM-crossing round-trip.

    Returns:
        ``(matched_substances, atom_index_by_substance_id,
        svg_by_substance_id, skipped_count)`` where ``skipped_count``
        combines oversize-prefilter skips and CDK parse skips into a
        single user-visible number.
    """
    # Candidate rows for iteration — apply the polymer-SMILES guard here
    # (NOT in canonicalize, because substructure uses raw smiles, not the
    # canonical_smiles column). This is a SQL prefilter so no Python-side
    # iteration of oversize rows ever reaches the JVM.
    candidate_stmt = _base_substance_select(scope_eid).where(
        func.length(Substance.smiles) <= MAX_SUBSTRUCT_SMILES_LEN
    )
    candidate_rows = list((await db.execute(candidate_stmt)).scalars().all())

    # Separately count rows excluded by the polymer-SMILES prefilter so
    # the user sees "N substances could not be parsed and were skipped"
    # include oversize inputs in the same bucket as CDK parse failures
    # (D-09: the UX distinction is "we tried but couldn't process this",
    # not "why"). Scope-restricted when applicable so the count matches
    # the candidate universe.
    oversize_stmt = (
        select(func.count())
        .select_from(Substance)
        .where(func.length(Substance.smiles) > MAX_SUBSTRUCT_SMILES_LEN)
    )
    if scope_eid is not None:
        oversize_stmt = oversize_stmt.join(
            ExtractionSubstance,
            Substance.id == ExtractionSubstance.substance_id,
        ).where(ExtractionSubstance.extraction_id == scope_eid)
    oversize_count = int((await db.execute(oversize_stmt)).scalar_one() or 0)

    id_smi = [(int(s.id), s.smiles or "") for s in candidate_rows]

    # :func:`_substructure_sync` now returns (id, atoms, match_svg) triples
    # so we can thread the per-hit SVG directly into SearchResult.match_svg
    # without a second JVM round-trip.
    hits, skipped = await run_in_jvm_thread(_substructure_sync, smarts, id_smi)
    hit_ids = {sid for sid, _, _ in hits}
    atom_map: dict[int, list[int]] = {sid: atoms for sid, atoms, _ in hits}
    # Only keep non-empty SVGs in the map — _to_substance_response default
    # (match_svg=None) applies for hits whose render fell through to "".
    svg_map: dict[int, str] = {sid: svg for sid, _, svg in hits if svg}

    # Preserve substance row order from the initial SELECT so downstream
    # pagination is deterministic across repeated queries.
    matched = [s for s in candidate_rows if int(s.id) in hit_ids]

    total_skipped = len(skipped) + oversize_count
    if skipped:
        logger.warning(
            "Substructure search skipped %d unparsable substance row(s): %s",
            len(skipped),
            skipped[:_MAX_LOGGED_SKIPPED],
        )
    if oversize_count:
        logger.warning(
            "Substructure search excluded %d substance(s) with SMILES > %d chars",
            oversize_count,
            MAX_SUBSTRUCT_SMILES_LEN,
        )
    return matched, atom_map, svg_map, total_skipped


async def _load_attribution(
    substance_ids: list[int], db: AsyncSession
) -> dict[int, list[SearchExtractionRef]]:
    """Load extraction attribution for a set of substance IDs (D-10).

    One SELECT joins Substance → ExtractionSubstance → Extraction and
    returns the per-substance list of extractions newest-first. The caller
    truncates the list to :data:`_MAX_ATTRIBUTION_REFS` before serializing.
    """
    if not substance_ids:
        return {}
    rows = await db.execute(
        select(
            Substance.id,
            Extraction.id,
            Extraction.filename,
            Extraction.created_at,
        )
        .join(
            ExtractionSubstance,
            ExtractionSubstance.substance_id == Substance.id,
        )
        .join(
            Extraction,
            Extraction.id == ExtractionSubstance.extraction_id,
        )
        .where(Substance.id.in_(substance_ids))
        .order_by(Substance.id, Extraction.created_at.desc())
    )
    grouped: dict[int, list[SearchExtractionRef]] = defaultdict(list)
    for s_id, e_id, filename, created_at in rows:
        grouped[int(s_id)].append(
            SearchExtractionRef(
                extraction_id=int(e_id),
                filename=str(filename),
                created_at=created_at.isoformat(),
            )
        )
    return grouped


def _to_substance_response(s: Substance) -> SubstanceResponse:
    """ORM Substance → API SubstanceResponse.

    NOTE on DTO-only fields: ``iupac_name``, ``aux_info``, and
    ``abbreviations`` exist on :class:`SubstanceResponse` (see
    ``backend/app/models/chemistry.py`` lines 12-26) but **not** on the
    :class:`Substance` ORM row. They are populated during live extraction
    from the CDK ``BCXSubstance`` object and lost when the substance is
    persisted (Phase 5 deduplication only stores identifiers + structure
    fields). For stored-substance responses we set them explicitly to
    their Pydantic defaults — an empty string for the two text fields
    and an empty dict for ``abbreviations``.

    Setting these explicitly (not relying on Pydantic default-factory
    serialization) makes the contract self-documenting and keeps Plan 07
    frontend test mocks (``SearchResults.test.tsx``, ``SearchResultCard``)
    stable across Pydantic minor versions.
    """
    return SubstanceResponse(
        id=int(s.id),
        inchi_key=s.inchi_key,
        inchi=s.inchi,
        smiles=s.smiles,
        extended_smiles=s.extended_smiles,
        iupac_name="",  # DTO-only default — not stored on Substance ORM
        molecular_formula=s.molecular_formula,
        aux_info="",  # DTO-only default — not stored on Substance ORM
        mdlv3000=s.mdlv3000,
        abbreviations={},  # DTO-only default — not stored on Substance ORM
        svg=s.svg,
        svg_cdx=s.svg_cdx,
    )


async def execute_search(payload: SearchRequest, db: AsyncSession) -> SearchResponse:
    """Execute a search and return paginated results + attribution.

    Flow:
      1. Resolve ``type='auto'`` via :func:`detect_search_type`.
      2. Parse ``scope`` into ``extraction_id`` (or None for global).
      3. Dispatch to the per-type handler.
      4. Paginate the matched rows (simple in-memory slice — bounded by
         D-07 2k scale).
      5. Load attribution for the page's substances with a single JOIN.
      6. Assemble the :class:`SearchResponse` with warnings.
    """
    effective_type = _resolve_effective_type(payload)
    scope_eid = _parse_scope(payload.scope)

    warnings: list[str] = []
    atom_map: dict[int, list[int]] = {}
    svg_map: dict[int, str] = {}
    skipped_count = 0

    # Dispatch per D-14. Pydantic Literal validation rejects unknown
    # types before we reach this point, so the final else is purely
    # defensive against a future type addition landing without a handler.
    if effective_type == "inchi_key":
        substances = await _search_inchi_key(payload.query, scope_eid, db)
    elif effective_type == "formula":
        substances = await _search_formula(payload.query, scope_eid, db)
    elif effective_type == "smiles":
        substances = await _search_smiles(payload.query, payload.match, scope_eid, db)
    elif effective_type == "substructure":
        substances, atom_map, svg_map, skipped_count = await _search_substructure(
            payload.query, scope_eid, db
        )
    else:  # pragma: no cover
        raise ExtractionError(f"Unknown search type {effective_type!r}")

    if skipped_count:
        warnings.append(
            f"{skipped_count} substances could not be parsed and were skipped"
        )

    total = len(substances)
    # Paginate (simple in-memory slice — bounded by D-07 ≤ 2k scale).
    start = (payload.page - 1) * payload.size
    end = start + payload.size
    page_subs = substances[start:end]
    page_ids = [int(s.id) for s in page_subs]

    attribution = await _load_attribution(page_ids, db)

    # Plan 04: ``svg_map`` is populated only on substructure hits — non-
    # substructure branches leave it empty so ``.get()`` returns None,
    # satisfying the SearchResult Pydantic default (UI-SPEC §Match
    # Highlighting: "component prefers match_svg over the stored svg
    # when present").
    results: list[SearchResult] = []
    for s in page_subs:
        sid = int(s.id)
        attributions = attribution.get(sid, [])
        results.append(
            SearchResult(
                substance=_to_substance_response(s),
                extraction_count=len(attributions),
                extractions=attributions[:_MAX_ATTRIBUTION_REFS],
                match_svg=svg_map.get(sid),
                match_atom_indices=atom_map.get(sid, []),
            )
        )

    return SearchResponse(
        results=results,
        total=total,
        page=payload.page,
        size=payload.size,
        warnings=warnings,
    )
