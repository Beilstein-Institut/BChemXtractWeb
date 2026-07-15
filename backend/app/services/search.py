"""Search service: dispatch by type, attribution JOIN, SMARTS iterate.

Entry point: :func:`execute_search` — called by ``backend/app/routers/search.py``.

Dispatch:

- ``type='auto'``  → :func:`detect_search_type` classifies the query into one
  of ``{inchi_key, formula, smiles}``.
- ``type='inchi_key'`` → indexed ``WHERE inchi_key = :key``.
- ``type='formula'``   → indexed ``WHERE molecular_formula = :formula``.
- ``type='smiles'``, ``match='canonical'`` → canonicalize query via
  :func:`app.services.canonicalize.canonicalize_smiles`; match against
  ``Substance.canonical_smiles``.
- ``type='smiles'``, ``match='literal'``   → match against the raw
  ``Substance.smiles`` column (no canonicalization).
- ``type='substructure'`` → iterate candidate substances; run CDK
  ``SmartsPattern.matches()``; collect hits + matched atom indices; skip
  unparsable rows with a per-result warning.

Post-match attribution: one additional SELECT joins
Substance → ExtractionSubstance → Extraction and aggregates "found in N
extractions" per result (grouped in Python — fast, no N+1 risk for the
≤ 2k-substance v1 scale bound).

Scope:

- ``'global'`` — every substance the caller owns. Substances are read
  through an ``ExtractionSubstance`` JOIN so Postgres RLS scopes the result
  to the caller's session (the ``substances`` table itself has no RLS).
- ``'extraction:{id}'`` — restricts to substances linked to that extraction
  via :class:`app.models.orm.ExtractionSubstance` (IDOR-safe; mirrors
  the ``export.py`` pattern).

JVM policy: **all** CDK calls go through
:func:`app.services.jvm_bridge.run_in_jvm_thread`. Never call CDK directly
from an async handler.

Polymer-SMILES guard: the
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
    InvalidSmilesError,
)
from app.models.chemistry import (
    INCHI_KEY_PATTERN,
    SearchExtractionRef,
    SearchRequest,
    SearchResponse,
    SearchResult,
    SubstanceResponse,
)
from app.models.orm import Extraction, ExtractionSubstance, Substance
from app.services.canonicalize import canonicalize_smiles
from app.services.depiction import render_substance_svg_with_highlight
from app.services.jvm_bridge import run_in_jvm_thread_abandonable
from app.services.persistence import SURROGATE_INCHI_KEY_RE

logger = logging.getLogger(__name__)

# Precedence: inchi_key > formula > smiles.
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
# only be the full shape. Compiled from the canonical INCHI_KEY_PATTERN so the
# shape is defined once (shared with the request models / pubchem router).
_INCHI_KEY_RE = re.compile(INCHI_KEY_PATTERN)
_FORMULA_RE = re.compile(r"\A(?:[A-Z][a-z]?\d{0,5}){1,60}\Z")

# Surrogate keys (S-prefixed SMILES hashes) fail _INCHI_KEY_RE but are a stable
# per-substance identifier; the share/deep-link path resolves one by exact
# match. The format is owned by persistence (SURROGATE_INCHI_KEY_RE).

# Polymer-SMILES deadlock ceiling. Same threshold applied inside
# :func:`canonicalize._canonicalize_smiles_sync` — CDK's ``SmartsPattern``
# matching path is *also* subject to the deadlock, so we apply the same
# ceiling to the substructure candidate set.
# Stored SMILES longer than this are silently excluded from substructure
# iteration and counted as "skipped" in the response warnings.
MAX_SUBSTRUCT_SMILES_LEN = 1500

# Per-hit attribution list cap: bounds response size even when a single
# substance appears in thousands of extractions.
_MAX_ATTRIBUTION_REFS = 20

# Skipped-id logging cap (avoid log flood when many rows fail to parse).
_MAX_LOGGED_SKIPPED = 20


def detect_search_type(raw: str) -> str:
    """Auto-detect the search type for a raw user query.

    Never returns ``"substructure"`` — substructure requires an explicit
    ``type='substructure'`` on the request, because it is too expensive to
    run on every keystroke / auto-dispatch.

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
    they never should have seen. The guard now rejects malformed
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
    """Build a ``SELECT Substance`` that is always RLS-scoped to the caller.

    The ``substances`` table is a global, ``inchi_key``-deduplicated pool
    with NO row-level security of its own — one molecule legitimately
    belongs to many sessions, so a per-row owner column would be wrong.
    Cross-session isolation is therefore enforced by **always** joining
    through :class:`ExtractionSubstance`, which carries ``FORCE ROW LEVEL
    SECURITY`` scoped to the caller's ``session_id`` / ``api_key_hash``.
    A bare ``select(Substance)`` would bypass that and expose every
    session's structures (CWE-639), so even the ``'global'`` scope goes
    through the join — "global" means "everything the caller owns".

    ``.distinct()`` collapses the duplicate ``Substance`` rows the join
    produces when a molecule appears in more than one of the caller's
    extractions. When ``scope_extraction_id`` is given, further restrict to
    that single extraction (still RLS-scoped, so a guessed id from another
    session yields nothing).
    """
    stmt = (
        select(Substance)
        .join(
            ExtractionSubstance,
            Substance.id == ExtractionSubstance.substance_id,
        )
        .distinct()
    )
    if scope_extraction_id is not None:
        stmt = stmt.where(ExtractionSubstance.extraction_id == scope_extraction_id)
    return stmt


async def _search_inchi_key(
    q: str, scope_eid: int | None, db: AsyncSession
) -> list[Substance]:
    """Indexed exact / prefix InChI key match.

    The user-supplied key is stripped and uppercased before matching, so
    ``"  uhovqnzjysornb-uhffffaoysa-n  "`` collapses to the canonical
    27-character form. Accepted shapes (PubChem-style partial matching):

    * ``<14>-<10>-<1>`` — full key, matched exactly.
    * ``<14>-<10>`` — returns every stored key sharing skeleton + stereo
      (any protonation).
    * ``<14>`` — returns every stored key sharing the skeleton (any
      stereo / isotope / protonation).

    A surrogate key (``S…``, minted for InChI-less fragment substances) is
    matched exactly — it is a SMILES hash, so prefix matching is meaningless.
    This is what lets a share/deep-link to such a structure resolve.

    Malformed input raises :class:`InvalidInchiKeyError` (422 /
    INVALID_INCHI_KEY). The LIKE branch is safe: the regex restricts
    the pattern to ``[A-Z]`` + hyphens, so no SQL wildcard characters
    (``%``, ``_``) can enter the pattern.
    """
    normalized = q.strip().upper()
    # Surrogate keys (digits present) fail the real-InChIKey regex but are a
    # valid stable identifier — match them exactly (bound param, injection-safe).
    if SURROGATE_INCHI_KEY_RE.match(normalized):
        stmt = _base_substance_select(scope_eid).where(
            Substance.inchi_key == normalized
        )
        return list((await db.execute(stmt)).scalars().all())
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
    """Indexed exact molecular formula match.

    No canonicalization is applied — the user types ``C6H6`` and we match
    against the stored string exactly. (A B-tree index on
    ``molecular_formula`` backs this query.)
    """
    stmt = _base_substance_select(scope_eid).where(
        Substance.molecular_formula == q.strip()
    )
    return list((await db.execute(stmt)).scalars().all())


async def _search_smiles(
    q: str, match_mode: str, scope_eid: int | None, db: AsyncSession
) -> list[Substance]:
    """SMILES match — ``'canonical'`` (default) or ``'literal'``.

    ``canonical`` canonicalizes the query via
    :func:`app.services.canonicalize.canonicalize_smiles` and matches against
    the ``Substance.canonical_smiles`` column populated by the
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
    raw_query: str,
    stereo: bool,
    rows: list[tuple[int, str]],
) -> tuple[list[tuple[int, list[int], list[int], bool, str]], list[int]]:
    """Blocking query parse + per-target match + per-hit highlight render.

    JVM-thread-bound; call through :func:`run_in_jvm_thread`.

    Delegates matching to :mod:`app.services.substructure`. Produces one
    tuple per hit carrying:

      - substance_id
      - sorted matched target-atom indices
      - sorted matched target-bond indices (per-mapping reconstructed)
      - partial_match flag (True if mapping cap was hit)
      - highlight SVG (or ``""`` if render failed)

    Args:
        raw_query: user-supplied SMILES or SMARTS.
        stereo: if True, enforce stereo matching; if False (default),
            query stereo features are stripped before matching.
        rows: already length-filtered ``(substance_id, smiles)`` candidates.

    Returns:
        ``(hits, skipped)`` where ``hits`` is the list of five-tuples
        above and ``skipped`` is the list of substance_ids whose stored
        SMILES failed to parse.

    Raises:
        InvalidQueryError / QueryTooLargeError: query parse failed. Both
            map to 422 via the bridge_error_handler.
    """
    from app.services.substructure import (
        enumerate_matches,
        parse_query,
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
    target_parser = SmilesParser(builder)
    aromaticity = Aromaticity(
        ElectronDonation.daylight(),
        Cycles.or_(Cycles.all(), Cycles.cdkAromaticSet()),
    )

    # Parse once — query is reused across every candidate target. Errors
    # propagate unchanged so the bridge_error_handler can map them to
    # 422 responses.
    parsed = parse_query(raw_query, match_stereo=stereo)

    # Accessibility title embedded in each highlighted SVG. The helper
    # HTML-escapes the title to prevent user-supplied queries from breaking
    # SVG structure.
    highlight_title = f"Matches {raw_query[:80]}"

    hits: list[tuple[int, list[int], list[int], bool, str]] = []
    skipped: list[int] = []

    for substance_id, smi in rows:
        if not smi:
            skipped.append(substance_id)
            continue
        try:
            target = target_parser.parseSmiles(smi)
            # Apply aromaticity perception so aromatic queries (c1ccccc1)
            # match stored Kekulé SMILES after CDK's default parse — same
            # recipe used in the canonicalize service. Aromaticity
            # can raise non-JException, so guard with a broad except.
            AtomContainerManipulator.percieveAtomTypesAndConfigureAtoms(target)
            aromaticity.apply(target)
        except Exception:  # noqa: BLE001 — CDK can throw non-JException here
            skipped.append(substance_id)
            continue

        try:
            result = enumerate_matches(parsed, target)
        except jpype.JException:
            # Matching itself failed (rare; e.g. inconsistent molecule
            # after aromaticity). Treat as skipped, not a hit.
            skipped.append(substance_id)
            continue

        if not result.matched:
            continue

        # Render per-hit highlight SVG in the same JVM
        # pass. The helper has its own two-tier fallback (highlight →
        # plain → ""), so a render failure never breaks the hit —
        # match_svg just comes back as "" which execute_search converts
        # to None on the wire.
        match_svg = render_substance_svg_with_highlight(
            target,
            atom_indices=result.atom_indices,
            bond_indices=result.bond_indices,
            title=highlight_title,
        )
        hits.append(
            (
                substance_id,
                result.atom_indices,
                result.bond_indices,
                result.partial_match,
                match_svg,
            )
        )

    return hits, skipped


async def _search_substructure(
    raw_query: str,
    stereo: bool,
    scope_eid: int | None,
    db: AsyncSession,
) -> tuple[
    list[Substance],
    dict[int, list[int]],  # atom_map
    dict[int, list[int]],  # bond_map
    dict[int, bool],  # partial_map
    dict[int, str],  # svg_map
    int,  # skipped_count
]:
    """Substructure iterate + per-hit highlight render.

    Delegates to :mod:`app.services.substructure` for matching and returns
    per-hit bond indices + partial_match flag alongside the existing atom /
    svg maps.

    Applies the ``MAX_SUBSTRUCT_SMILES_LEN`` polymer-SMILES ceiling via SQL
    prefilter so the candidate rows handed to CDK never include inputs
    that would deadlock the JVM. Over-length rows are counted as
    "skipped_oversize" so the response warnings surface the real total.

    Returns:
        ``(matched_substances, atom_index_by_substance_id,
        bond_index_by_substance_id, partial_match_by_substance_id,
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
    # — the UX distinction is "we tried but couldn't process this",
    # not "why". Scope-restricted when applicable so the count matches
    # the candidate universe.
    # Count via the same RLS-protected join as the candidate select so the
    # oversize tally never reflects substances outside the caller's scope.
    oversize_stmt = (
        select(func.count(func.distinct(Substance.id)))
        .select_from(Substance)
        .join(
            ExtractionSubstance,
            Substance.id == ExtractionSubstance.substance_id,
        )
        .where(func.length(Substance.smiles) > MAX_SUBSTRUCT_SMILES_LEN)
    )
    if scope_eid is not None:
        oversize_stmt = oversize_stmt.where(
            ExtractionSubstance.extraction_id == scope_eid
        )
    oversize_count = int((await db.execute(oversize_stmt)).scalar_one() or 0)

    id_smi = [(int(s.id), s.smiles or "") for s in candidate_rows]

    hits, skipped = await run_in_jvm_thread_abandonable(
        _substructure_sync, raw_query, stereo, id_smi, label="substructure-search"
    )
    hit_ids = {sid for sid, _, _, _, _ in hits}
    atom_map: dict[int, list[int]] = {sid: atoms for sid, atoms, _, _, _ in hits}
    bond_map: dict[int, list[int]] = {sid: bonds for sid, _, bonds, _, _ in hits}
    partial_map: dict[int, bool] = {sid: p for sid, _, _, p, _ in hits}
    # Only keep non-empty SVGs in the map — _to_substance_response default
    # (match_svg=None) applies for hits whose render fell through to "".
    svg_map: dict[int, str] = {sid: svg for sid, _, _, _, svg in hits if svg}

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
    return matched, atom_map, bond_map, partial_map, svg_map, total_skipped


async def _load_attribution(
    substance_ids: list[int], db: AsyncSession
) -> dict[int, list[SearchExtractionRef]]:
    """Load extraction attribution for a set of substance IDs.

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
    persisted (deduplication only stores identifiers + structure
    fields). For stored-substance responses we set them explicitly to
    their Pydantic defaults — an empty string for the two text fields
    and an empty dict for ``abbreviations``.

    Setting these explicitly (not relying on Pydantic default-factory
    serialization) makes the contract self-documenting and keeps the
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
         the 2k-substance scale).
      5. Load attribution for the page's substances with a single JOIN.
      6. Assemble the :class:`SearchResponse` with warnings.
    """
    effective_type = _resolve_effective_type(payload)
    scope_eid = _parse_scope(payload.scope)

    warnings: list[str] = []
    atom_map: dict[int, list[int]] = {}
    bond_map: dict[int, list[int]] = {}
    partial_map: dict[int, bool] = {}
    svg_map: dict[int, str] = {}
    skipped_count = 0

    # Dispatch by type. Pydantic Literal validation rejects unknown
    # types before we reach this point, so the final else is purely
    # defensive against a future type addition landing without a handler.
    if effective_type == "inchi_key":
        substances = await _search_inchi_key(payload.query, scope_eid, db)
    elif effective_type == "formula":
        substances = await _search_formula(payload.query, scope_eid, db)
    elif effective_type == "smiles":
        substances = await _search_smiles(payload.query, payload.match, scope_eid, db)
    elif effective_type == "substructure":
        (
            substances,
            atom_map,
            bond_map,
            partial_map,
            svg_map,
            skipped_count,
        ) = await _search_substructure(payload.query, payload.stereo, scope_eid, db)
    else:  # pragma: no cover
        raise ExtractionError(f"Unknown search type {effective_type!r}")

    if skipped_count:
        warnings.append(
            f"{skipped_count} substances could not be parsed and were skipped"
        )

    total = len(substances)
    # Paginate (simple in-memory slice — bounded by the ≤ 2k scale).
    start = (payload.page - 1) * payload.size
    end = start + payload.size
    page_subs = substances[start:end]
    page_ids = [int(s.id) for s in page_subs]

    attribution = await _load_attribution(page_ids, db)

    # ``svg_map`` is populated only on substructure hits — non-
    # substructure branches leave it empty so ``.get()`` returns None,
    # satisfying the SearchResult Pydantic default: the frontend component
    # prefers match_svg over the stored svg when present.
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
                match_bond_indices=bond_map.get(sid, []),
                partial_match=partial_map.get(sid, False),
            )
        )

    return SearchResponse(
        results=results,
        total=total,
        page=payload.page,
        size=payload.size,
        warnings=warnings,
    )
