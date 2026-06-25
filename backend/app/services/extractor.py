"""Chemical structure and reaction extraction via BChemXtract Java bridge.

All Java class interactions are isolated in this module. Every JPype call
runs through run_in_jvm_thread for thread safety. Every Java model object
is null-coerced before leaving this module.

Extraction has two paths:
  1. Primary: SubstanceXtractor.xtractUnique — rich data (InChI, InChIKey,
     SMILES, formula) but internally computes InChI which can hang on
     complex structures (R-groups, large dendrimers).
  2. Fallback: FragmentConverter + CDK SmilesGenerator.isomeric — extracts
     SMILES (with stereochemistry) and molecular formula directly from CDX
     fragments, bypassing InChI entirely. Fast and robust for complex
     structures, but produces less metadata (no InChI/InChIKey).
     isomeric() preserves R/S and E/Z stereo without using InChI.

The async extract_substances_with_svg function tries the primary path
with a 30s timeout. On timeout, it transparently falls back to the
fragment path and adds a warning to the response.
"""

import contextlib
import logging
import re
import threading
from collections import Counter

import jpype

from app.errors import ExtractionError
from app.models.chemistry import (
    ReactionResponse,
    SubstanceInfoResponse,
    SubstanceResponse,
)
from app.services.depiction import (
    SVG_TARGET_HEIGHT,
    SVG_TARGET_WIDTH,
    _make_depiction_generator,
    _set_svg_dimensions,
    render_substance_svg,
    render_substance_svg_cdk_layout,
    sanitize_svg,
)
from app.services.format_detector import detect_format
from app.services.jvm_bridge import run_in_jvm_thread

logger = logging.getLogger(__name__)

# Timeout for the primary xtractUnique path. If exceeded, we fall back
# to the fragment-level extraction which bypasses InChI computation.
_XTRACT_UNIQUE_TIMEOUT = 10.0

# Timeout for the whole fragment-first extraction (the outer
# ``run_in_jvm_thread`` budget). Stage 1 + Stage 2 are individually bounded
# below; this stays as a backstop.
_FRAGMENT_FALLBACK_TIMEOUT = 90.0

# Hard ceiling on Stage 1 (parse + fragment SMILES + depiction). Real files
# finish in <1s; a crafted/pathological graph can make CDK's SMILES or
# depiction generator hang, so we bound it. Generous headroom for genuinely
# large legitimate files while still well under the outer budget.
_FRAGMENT_STAGE1_TIMEOUT = 60.0

# Backstop timeout for recomputing InChI from the fragment SMILES when
# xtractUnique didn't deliver it (see _enrich_inchi_from_smiles_sync). This is
# only a safety net: JPype cannot interrupt a running InChI call, so the real
# guard is the size cap below — we never START InChI on a molecule big enough
# to hang.
_INCHI_FROM_SMILES_TIMEOUT = 20.0

# Skip InChI recomputation above this many heavy (non-H) atoms. InChI
# generation blows up super-linearly on large, highly-symmetric molecules: a
# 162-heavy-atom supramolecular cage takes ~5 min (and is what makes
# xtractUnique time out in the first place), while normal molecules (well
# under 100 heavy atoms) finish in well under a second. Oversized molecules
# keep an empty InChI and a SMILES-hash surrogate key.
_MAX_INCHI_HEAVY_ATOMS = 100

# Secondary guard for when the molecular formula is missing: skip InChI for
# very long SMILES (polymers/cages) for the same reason.
_MAX_INCHI_SMILES_LEN = 1500

_ELEMENT_COUNT_RE = re.compile(r"([A-Z][a-z]?)(\d*)")


def _heavy_atom_count(formula: str) -> int:
    """Sum of non-hydrogen atom counts parsed from a molecular formula string.

    Returns 0 for an unparseable/empty formula (caller falls back to the
    SMILES-length guard). Charge suffixes and brackets are ignored — only
    ``Element[count]`` runs contribute.
    """
    total = 0
    for element, count in _ELEMENT_COUNT_RE.findall(formula or ""):
        if not element or element == "H":
            continue
        total += int(count) if count else 1
    return total


# CDK SmilesParser + DepictionGenerator can deadlock on polymer/dendrimer
# SMILES > 1500 chars (same root cause as canonicalize.py
# MAX_CANONICALIZE_LEN). Guard with a hard cap — length over this yields an
# empty SVG + per-reaction warning, never a hung JVM.
MAX_REACTION_SMILES_LEN = 1500

# Reaction SVG is wider than substance SVG (600x400 vs 450x450).
SVG_REACTION_TARGET_WIDTH = 600
SVG_REACTION_TARGET_HEIGHT = 400


# ---------------------------------------------------------------------------
# Private null-coercion functions
# ---------------------------------------------------------------------------


_MAX_ABBREV_ENTRIES = 100
_MAX_ABBREV_VALUE_LEN = 10_000

_EMPTY_SUBSTANCE_INFO: dict[str, int] = {
    "no_fragments": 0,
    "no_inchis": 0,
    "no_substances": 0,
}


def _java_stacktrace(exc: jpype.JException) -> str:
    """Return the Java stack trace for a JException, falling back to ``str``."""
    getter = getattr(exc, "stacktrace", None)
    return getter() if callable(getter) else str(exc)


def _coerce_substance(java_sub) -> dict:
    """Convert a BCXSubstance Java object to a dict with no nulls.

    All nullable String fields are coerced to empty string.
    The abbreviations Map is converted to a Python dict, bounded to
    :const:`_MAX_ABBREV_ENTRIES` entries and :const:`_MAX_ABBREV_VALUE_LEN`
    characters per key/value pair so a crafted ChemDraw file cannot drive
    unbounded memory growth through this field.

    Args:
        java_sub: A Java BCXSubstance instance.

    Returns:
        Dict ready for SubstanceResponse(**d) construction.
    """
    java_abbrevs = java_sub.getAbbreviations() or {}
    abbreviations: dict[str, str] = {}
    for k, v in java_abbrevs.items():
        if len(abbreviations) >= _MAX_ABBREV_ENTRIES:
            break
        sk = str(k)[:_MAX_ABBREV_VALUE_LEN]
        sv = str(v)[:_MAX_ABBREV_VALUE_LEN]
        abbreviations[sk] = sv

    return {
        "inchi": str(java_sub.getInchi() or ""),
        "inchi_key": str(java_sub.getInchiKey() or ""),
        "smiles": str(java_sub.getSmiles() or ""),
        "extended_smiles": str(java_sub.getExtendedSmiles() or ""),
        "iupac_name": str(java_sub.getIupacName() or ""),
        "molecular_formula": str(java_sub.getMolecularFormula() or ""),
        "aux_info": str(java_sub.getAuxInfo() or ""),
        "mdlv3000": "",
        "abbreviations": abbreviations,
    }


def _coerce_reaction_component(java_comp) -> dict:
    """Convert a BCXReactionComponent Java object to a dict with no nulls.

    Nullable String fields are coerced to empty string.
    Primitive float fields pass through directly.

    Args:
        java_comp: A Java BCXReactionComponent instance.

    Returns:
        Dict ready for ReactionComponentResponse(**d) construction.
    """
    return {
        "inchi": str(java_comp.getInchi() or ""),
        "inchi_key": str(java_comp.getInchiKey() or ""),
        "cdx_top": float(java_comp.getCdxTop()),
        "cdx_left": float(java_comp.getCdxLeft()),
        "cdx_bottom": float(java_comp.getCdxBottom()),
        "cdx_right": float(java_comp.getCdxRight()),
    }


def _reaction_smiles_roles(reaction_smiles: str) -> dict[str, list[str]] | None:
    """Split a reaction SMILES into its per-role component fragments.

    Reaction SMILES are ``reactants>agents>products`` with ``.`` separating
    fragments within each role (``A>>B`` means no agents). Returns None when
    the string doesn't have exactly three ``>``-delimited sections, so the
    caller falls back to the Java component lists untouched.
    """
    parts = reaction_smiles.split(">")
    if len(parts) != 3:
        return None
    return {
        "reactants": [f for f in parts[0].split(".") if f],
        "agents": [f for f in parts[1].split(".") if f],
        "products": [f for f in parts[2].split(".") if f],
    }


def _cdk_inchi_tools():
    """Return (SmilesParser, InChIGeneratorFactory) or None if CDK is absent.

    Used to recompute a component's InChI/InChIKey from its SMILES fragment.
    Must be called on a JVM-attached thread (inside run_in_jvm_thread).
    """
    try:
        builder = jpype.JClass(
            "org.openscience.cdk.silent.SilentChemObjectBuilder"
        ).getInstance()
        parser = jpype.JClass("org.openscience.cdk.smiles.SmilesParser")(builder)
        igf = jpype.JClass(
            "org.openscience.cdk.inchi.InChIGeneratorFactory"
        ).getInstance()
        return parser, igf
    except Exception:  # noqa: BLE001 — CDK/InChI unavailable: skip recovery
        return None


def _inchi_from_smiles(smiles: str, parser, igf) -> tuple[str, str]:
    """Compute (inchi, inchi_key) for a single SMILES fragment via CDK.

    Returns ("", "") on any parse/InChI failure so the caller can detect an
    unresolved fragment and decline to fabricate a component.
    """
    try:
        mol = parser.parseSmiles(smiles)
        gen = igf.getInChIGenerator(mol)
        return str(gen.getInchi() or ""), str(gen.getInchiKey() or "")
    except Exception:  # noqa: BLE001 — bad fragment: treated as unresolved
        return "", ""


def _enrich_inchi_from_smiles_sync(substances: list[dict]) -> list[dict]:
    """Fill empty inchi/inchi_key on fragment-path substances from their SMILES.

    xtractUnique computes InChI for the whole document at once; when it times
    out (one huge molecule is enough), every substance falls back to the
    fragment path with no InChI. SMILES extraction still succeeds, so we
    recompute InChI per molecule here via CDK — the small molecules in a file
    that also contains a giant one then still get a real InChI + InChIKey.

    Molecules above :data:`_MAX_INCHI_HEAVY_ATOMS` (or, if the formula is
    missing, a SMILES longer than :data:`_MAX_INCHI_SMILES_LEN`) are skipped:
    InChI generation blows up on exactly those molecules — it is what made
    xtractUnique time out — and JPype cannot interrupt a running InChI call, so
    the size cap (which never starts the call) is the only reliable guard.
    Skipped molecules keep an empty InChI (and get a SMILES-hash surrogate key
    at persistence). Mutates and returns the list. Must run on a JVM-attached
    thread (via :func:`_run_jvm_subtask`).
    """
    try:
        if not jpype.isThreadAttachedToJVM():
            jpype.attachThreadToJVM()
        tools = _cdk_inchi_tools()
        if tools is None:
            return substances
        parser, igf = tools
        recovered = 0
        skipped_large = 0
        for s in substances:
            smiles = s.get("smiles") or ""
            if s.get("inchi") or not smiles:
                continue
            heavy = _heavy_atom_count(s.get("molecular_formula") or "")
            too_large = (
                heavy > _MAX_INCHI_HEAVY_ATOMS
                if heavy
                else len(smiles) > _MAX_INCHI_SMILES_LEN
            )
            if too_large:
                skipped_large += 1
                continue
            inchi, inchi_key = _inchi_from_smiles(smiles, parser, igf)
            if inchi:
                s["inchi"] = inchi
                if inchi_key:
                    s["inchi_key"] = inchi_key
                recovered += 1
        if recovered or skipped_large:
            logger.info(
                "Recovered InChI from SMILES for %d/%d fragment substances "
                "(%d skipped as too large)",
                recovered,
                len(substances),
                skipped_large,
            )
        return substances
    finally:
        with contextlib.suppress(Exception):
            jpype.java.lang.Thread.detach()


def _coerce_role(java_list, role_frags: list[str] | None, cdk) -> list[dict]:
    """Coerce one reaction role (reactants/products/agents) to component dicts.

    BChemXtract sometimes leaves a ``null`` in a role's component list even
    though the reaction SMILES contains that component (its per-component InChI
    build failed). Dropping the null undercounts the role. When that happens,
    recover the missing component(s) from the reaction SMILES: the fragment
    whose recomputed InChIKey isn't already covered by a populated component is
    the dropped one. Recovered components carry InChI + InChIKey but zero
    coordinates (upstream gave us none).

    Recovery only runs when a null is present AND the fragments reconcile
    cleanly against the populated components; otherwise the populated list is
    returned unchanged, so the common (null-free) path is untouched.
    """
    raw = list(java_list or [])
    coerced = [_coerce_reaction_component(c) for c in raw if c is not None]
    null_count = len(raw) - len(coerced)
    if null_count == 0 or not role_frags or cdk is None:
        return coerced

    parser, igf = cdk
    resolved = [_inchi_from_smiles(f, parser, igf) for f in role_frags]
    if any(not key for _inchi, key in resolved):
        return coerced  # a fragment didn't resolve — don't risk a wrong count

    # Match each fragment to a populated component by InChIKey; the leftovers
    # are the dropped nulls.
    populated = Counter(c["inchi_key"] for c in coerced)
    recovered: list[dict] = []
    for inchi, key in resolved:
        if populated[key] > 0:
            populated[key] -= 1
        else:
            recovered.append(
                {
                    "inchi": inchi,
                    "inchi_key": key,
                    "cdx_top": 0.0,
                    "cdx_left": 0.0,
                    "cdx_bottom": 0.0,
                    "cdx_right": 0.0,
                }
            )
    if len(recovered) != null_count:
        return coerced  # didn't reconcile (e.g. salt/normalization) — leave as-is
    return coerced + recovered


def _coerce_reaction(java_rxn) -> dict:
    """Convert a BCXReaction Java object to a dict with no nulls.

    All nullable String fields are coerced to empty string. Collection fields
    (reactants, products, agents) are coerced per component, with dropped-null
    components recovered from the reaction SMILES (see ``_coerce_role``).

    Args:
        java_rxn: A Java BCXReaction instance.

    Returns:
        Dict ready for ReactionResponse(**d) construction.
    """
    reaction_smiles = str(java_rxn.getReactionSmiles() or "")
    roles = _reaction_smiles_roles(reaction_smiles)

    # Only stand up CDK InChI tools when a role actually has a dropped null to
    # recover — the null-free path pays nothing.
    has_null = roles is not None and any(
        lst is not None and any(c is None for c in lst)
        for lst in (
            java_rxn.getReactants(),
            java_rxn.getProducts(),
            java_rxn.getAgents(),
        )
    )
    cdk = _cdk_inchi_tools() if has_null else None

    return {
        "rinchi": str(java_rxn.getRinchi() or ""),
        "rinchi_key": str(java_rxn.getRinchiKey() or ""),
        "short_rinchi_key": str(java_rxn.getShortRinchiKey() or ""),
        "long_rinchi_key": str(java_rxn.getLongRinchiKey() or ""),
        "web_rinchi_key": str(java_rxn.getWebRinchiKey() or ""),
        "reaction_smiles": reaction_smiles,
        "aux_info": str(java_rxn.getAuxInfo() or ""),
        "reactants": _coerce_role(
            java_rxn.getReactants(), roles and roles["reactants"], cdk
        ),
        "products": _coerce_role(
            java_rxn.getProducts(), roles and roles["products"], cdk
        ),
        "agents": _coerce_role(java_rxn.getAgents(), roles and roles["agents"], cdk),
    }


def _coerce_substance_info(java_info) -> dict:
    """Convert a BCXSubstanceInfo Java object to a dict.

    All fields are primitive ints -- no null coercion needed, just type cast.

    Args:
        java_info: A Java BCXSubstanceInfo instance.

    Returns:
        Dict ready for SubstanceInfoResponse(**d) construction.
    """
    return {
        "no_fragments": int(java_info.getNoFragments()),
        "no_inchis": int(java_info.getNoInchis()),
        "no_substances": int(java_info.getNoSubstances()),
    }


# ---------------------------------------------------------------------------
# Private Java reader and extraction functions (run inside thread pool)
# ---------------------------------------------------------------------------


def _read_document(file_bytes: bytes, format_type: str):
    """Parse CDX/CDXML bytes into a CDDocument via the appropriate Java reader.

    Must be called inside run_in_jvm_thread (on a JVM-attached thread).

    Args:
        file_bytes: Raw file content bytes.
        format_type: Either "cdx" or "cdxml" (from detect_format).

    Returns:
        A Java CDDocument object.
    """
    ByteArrayInputStream = jpype.JClass("java.io.ByteArrayInputStream")  # noqa: N806

    # Try direct bytes first; fall back to JArray(JByte) if needed
    try:
        input_stream = ByteArrayInputStream(file_bytes)
    except TypeError:
        input_stream = ByteArrayInputStream(jpype.JArray(jpype.JByte)(file_bytes))

    if format_type == "cdx":
        reader_cls = jpype.JClass("org.beilstein.chemxtract.cdx.reader.CDXReader")
    else:
        reader_cls = jpype.JClass("org.beilstein.chemxtract.cdx.reader.CDXMLReader")

    return reader_cls.readDocument(input_stream)


def _extract_substances_sync(
    file_bytes: bytes, format_type: str
) -> tuple[list[dict], dict]:
    """Extract substances from file bytes (blocking, runs in thread pool).

    Args:
        file_bytes: Raw file content bytes.
        format_type: Either "cdx" or "cdxml".

    Returns:
        Tuple of (list of coerced substance dicts, coerced info dict).

    Raises:
        jpype.JException: If Java extraction fails (caught by caller).
    """
    try:
        document = _read_document(file_bytes, format_type)

        BCXSubstanceInfo = jpype.JClass(  # noqa: N806
            "org.beilstein.chemxtract.model.BCXSubstanceInfo"
        )
        SubstanceXtractor = jpype.JClass(  # noqa: N806
            "org.beilstein.chemxtract.xtractor.SubstanceXtractor"
        )

        info = BCXSubstanceInfo()
        xtractor = SubstanceXtractor()
        substances = xtractor.xtractUnique(document, info)

        return (
            [_coerce_substance(s) for s in substances],
            _coerce_substance_info(info),
        )
    except jpype.JException as exc:
        logger.error(
            "Java substance extraction failed: %s\n%s", exc, _java_stacktrace(exc)
        )
        raise ExtractionError("Failed to extract substances from file") from exc


def _extract_reactions_sync(file_bytes: bytes, format_type: str) -> list[dict]:
    """Extract reactions from file bytes (blocking, runs in thread pool).

    Args:
        file_bytes: Raw file content bytes.
        format_type: Either "cdx" or "cdxml".

    Returns:
        List of coerced reaction dicts.

    Raises:
        jpype.JException: If Java extraction fails (caught by caller).
    """
    try:
        document = _read_document(file_bytes, format_type)

        BCXReactionInfo = jpype.JClass(  # noqa: N806
            "org.beilstein.chemxtract.model.BCXReactionInfo"
        )
        ReactionXtractor = jpype.JClass(  # noqa: N806
            "org.beilstein.chemxtract.xtractor.ReactionXtractor"
        )

        info = BCXReactionInfo()
        xtractor = ReactionXtractor()
        reactions = xtractor.xtract(document, info)

        return [_coerce_reaction(r) for r in reactions]
    except jpype.JException as exc:
        logger.error(
            "Java reaction extraction failed: %s\n%s", exc, _java_stacktrace(exc)
        )
        raise ExtractionError("Failed to extract reactions from file") from exc


def _extract_reactions_with_svg_sync(
    file_bytes: bytes, format_type: str
) -> tuple[list[dict], list[str]]:
    """Extract reactions AND render each reaction's SVG in one JVM attach.

    SVG rendering happens inline with extraction so thread attach/detach
    cost is paid once. Per-reaction render failures produce `svg=""` +
    warning, never fail the whole call.

    Returns:
        Tuple of (list of reaction dicts with svg field populated,
        list of per-reaction warnings — one per failed render).
    """
    try:
        document = _read_document(file_bytes, format_type)

        BCXReactionInfo = jpype.JClass(  # noqa: N806
            "org.beilstein.chemxtract.model.BCXReactionInfo"
        )
        ReactionXtractor = jpype.JClass(  # noqa: N806
            "org.beilstein.chemxtract.xtractor.ReactionXtractor"
        )
        info = BCXReactionInfo()
        xtractor = ReactionXtractor()
        reactions = xtractor.xtract(document, info)

        coerced: list[dict] = []
        warnings: list[str] = []
        for idx, r in enumerate(reactions):
            d = _coerce_reaction(r)
            svg, render_warning = _render_reaction_svg(d["reaction_smiles"])
            d["svg"] = svg
            if render_warning:
                warnings.append(f"Reaction {idx + 1}: {render_warning}")
            coerced.append(d)
        return coerced, warnings
    except jpype.JException as exc:
        logger.error(
            "Java reaction+SVG extraction failed: %s\n%s", exc, _java_stacktrace(exc)
        )
        raise ExtractionError("Failed to extract reactions from file") from exc


def _render_atom_container_svg(container) -> str:
    """Render a CDK IAtomContainer to SVG with original coordinates.

    Uses the 2D coordinates already present on the molecule (from ChemDraw
    CDX via FragmentConverter). Smart hydrogen display via IUPAC rules.

    Returns empty string on any failure — never raises.
    """
    try:
        if container is None:
            return ""
        dg = _make_depiction_generator()
        svg_str = str(dg.depict(container).toSvgStr())
        sized = _set_svg_dimensions(svg_str, SVG_TARGET_WIDTH, SVG_TARGET_HEIGHT)
        # Strip any scriptable markup before the SVG is stored/served — matches
        # the invariant the depiction module's _depict_container_to_svg holds.
        return sanitize_svg(sized)
    except Exception as exc:
        logger.warning("SVG rendering failed for atom container: %s", exc)
        return ""


def _render_reaction_svg(reaction_smiles: str) -> tuple[str, str]:
    """Render a reaction SMILES to a combined CDK SVG.

    Returns (svg, warning) tuple. Empty svg + non-empty warning signals
    a per-reaction render failure; empty warning + empty svg signals a
    guarded/skipped empty input. Never raises.

    Must be called inside a JVM-attached thread (caller enforces via
    run_in_jvm_thread). Requires `>` in the input (reaction separator) and
    hard-guards length > MAX_REACTION_SMILES_LEN.
    """
    if not reaction_smiles:
        return "", ""
    if ">" not in reaction_smiles:
        # BChemXtract always emits `A.B>C>D.E` format; missing `>` means
        # the reaction is malformed or empty.
        return "", ""
    if len(reaction_smiles) > MAX_REACTION_SMILES_LEN:
        logger.warning(
            "Reaction SMILES exceeds %d chars (%d) — skipping depiction "
            "to avoid CDK deadlock.",
            MAX_REACTION_SMILES_LEN,
            len(reaction_smiles),
        )
        return "", (
            f"Reaction depiction skipped: reaction SMILES exceeds "
            f"{MAX_REACTION_SMILES_LEN} characters."
        )
    try:
        SilentChemObjectBuilder = jpype.JClass(  # noqa: N806
            "org.openscience.cdk.silent.SilentChemObjectBuilder"
        )
        SmilesParser = jpype.JClass(  # noqa: N806
            "org.openscience.cdk.smiles.SmilesParser"
        )
        StructureDiagramGenerator = jpype.JClass(  # noqa: N806
            "org.openscience.cdk.layout.StructureDiagramGenerator"
        )
        DepictionGenerator = jpype.JClass(  # noqa: N806
            "org.openscience.cdk.depict.DepictionGenerator"
        )

        builder = SilentChemObjectBuilder.getInstance()
        parser = SmilesParser(builder)
        reaction = parser.parseReactionSmiles(reaction_smiles)

        # Regenerate 2D coords per IAtomContainer for clean layout. Per-
        # component layout failure is non-fatal — DepictionGenerator will
        # still render whatever coordinates are present.
        sdg = StructureDiagramGenerator()
        for container_set in (
            reaction.getReactants(),
            reaction.getProducts(),
            reaction.getAgents(),
        ):
            for i in range(container_set.getAtomContainerCount()):
                mol = container_set.getAtomContainer(i)
                try:
                    sdg.setMolecule(mol)
                    sdg.generateCoordinates()
                except Exception:  # noqa: BLE001
                    logger.debug("SDG failed for a reaction component")

        dg = (
            DepictionGenerator()
            .withAtomColors()
            .withFillToFit()
            .withSize(
                float(SVG_REACTION_TARGET_WIDTH),
                float(SVG_REACTION_TARGET_HEIGHT),
            )
        )
        svg_str = str(dg.depict(reaction).toSvgStr())
        sized = _set_svg_dimensions(
            svg_str, SVG_REACTION_TARGET_WIDTH, SVG_REACTION_TARGET_HEIGHT
        )
        # Sanitize before the reaction SVG is stored/served (see sibling
        # renderers): strip <script>/on*=/javascript: so stored markup is inert.
        return sanitize_svg(sized), ""
    except Exception as exc:  # noqa: BLE001 — never raise from depiction
        logger.warning(
            "Reaction depiction failed for %r: %s", reaction_smiles[:80], exc
        )
        return "", "Reaction depiction failed — rendered as SMILES fallback."


def _render_with_cdk_layout(container) -> str:
    """Re-layout a molecule with CDK's StructureDiagramGenerator and render.

    Generates fresh 2D coordinates instead of using the original CDX
    coordinates. Produces cleaner layouts for complex structures where
    the ChemDraw layout has long crossing bonds. Smart hydrogen display.

    Returns empty string on any failure — never raises.
    """
    try:
        if container is None:
            return ""

        StructureDiagramGenerator = jpype.JClass(  # noqa: N806
            "org.openscience.cdk.layout.StructureDiagramGenerator"
        )

        sdg = StructureDiagramGenerator()
        sdg.setMolecule(container)
        sdg.generateCoordinates()
        mol_laid_out = sdg.getMolecule()

        dg = _make_depiction_generator()
        svg_str = str(dg.depict(mol_laid_out).toSvgStr())
        sized = _set_svg_dimensions(svg_str, SVG_TARGET_WIDTH, SVG_TARGET_HEIGHT)
        return sanitize_svg(sized)
    except Exception as exc:
        logger.warning("CDK layout + render failed: %s", exc)
        return ""


def _run_jvm_subtask(fn, timeout: float, label: str):
    """Run a JVM-bound callable on a daemon thread with a hard timeout.

    Returns ``fn()``'s value, or raises :class:`TimeoutError` if it does not
    finish within ``timeout`` seconds. Any other exception from ``fn`` is
    re-raised on the caller's thread.

    On timeout the daemon thread is abandoned: it keeps a JVM thread until the
    native call returns (or the process exits), but the *calling* JPype pool
    worker is freed immediately. Without this, a CDK call that hangs on a
    crafted/pathological graph (SMILES generation or depiction on a huge
    symmetric molecule) would pin a pool worker for the full outer timeout and
    never release it, so a few crafted uploads could exhaust the fixed JPype
    pool and stall the whole API (CWE-400). A daemon thread (not a
    ThreadPoolExecutor) is used so an abandoned hung call never blocks
    interpreter shutdown.

    ``fn`` must attach itself to the JVM and detach in a ``finally``.
    """
    box: dict[str, object] = {}
    done = threading.Event()

    def _runner() -> None:
        try:
            box["value"] = fn()
        except BaseException as exc:  # noqa: BLE001 — re-raised on caller thread
            box["error"] = exc
        finally:
            done.set()

    threading.Thread(target=_runner, name=label, daemon=True).start()
    if not done.wait(timeout):
        raise TimeoutError(f"{label} exceeded {timeout:.0f}s")
    if "error" in box:
        raise box["error"]  # type: ignore[misc]
    return box.get("value")


def _extract_with_fallback_sync(
    file_bytes: bytes, format_type: str
) -> tuple[list[dict], dict, bool]:
    """Fragment-first extraction with optional xtractUnique enrichment.

    Always runs the fast fragment-level extraction first (typically <1s).
    Then attempts xtractUnique with a thread timeout to get richer data
    (InChI, InChIKey). If xtractUnique hangs (common with R-groups, large
    dendrimers where InChI computation enters an infinite loop), the
    fragment results are returned immediately.

    The fragment path uses SmilesGenerator.isomeric() which preserves
    R/S and E/Z stereochemistry — no InChI dependency.

    Both stages run on daemon threads with hard timeouts (see
    :func:`_run_jvm_subtask`) so a hung CDK call cannot pin the calling JPype
    pool worker.

    Args:
        file_bytes: Raw file content bytes.
        format_type: Either "cdx" or "cdxml".

    Returns:
        Tuple of (substance dicts with svg, info dict, used_fallback bool).

    Raises:
        ExtractionError: If document parsing or fragment extraction fails.
        TimeoutError: If Stage 1 exceeds ``_FRAGMENT_STAGE1_TIMEOUT`` (maps
            to 503); the calling pool worker is freed.
    """

    # Stage 1: parse + fragment extraction (SMILES + depiction). This is the
    # fast, reliable path — but its CDK SMILES/depiction calls are also the
    # hang surface, so it is bounded on its own daemon thread.
    def _stage1():
        try:
            if not jpype.isThreadAttachedToJVM():
                jpype.attachThreadToJVM()
            document = _read_document(file_bytes, format_type)
            results, info = _extract_fragments_from_document(document)
            return document, results, info
        finally:
            with contextlib.suppress(Exception):
                jpype.java.lang.Thread.detach()

    try:
        document, fragment_results, fragment_info = _run_jvm_subtask(
            _stage1, _FRAGMENT_STAGE1_TIMEOUT, "xtract-stage1"
        )
    except TimeoutError:
        logger.warning(
            "Stage 1 fragment extraction timed out after %.0fs",
            _FRAGMENT_STAGE1_TIMEOUT,
        )
        raise
    except jpype.JException as exc:
        logger.error("Document parsing failed: %s", exc)
        raise ExtractionError("Failed to parse file") from exc

    logger.info(
        "Fragment extraction: %d substances from %d fragments",
        fragment_info["no_substances"],
        fragment_info["no_fragments"],
    )

    # Stage 2: attempt xtractUnique enrichment with a timeout.
    # xtractUnique computes InChI internally and can hang forever on
    # complex structures. We run it on a daemon thread with a short
    # timeout — if it completes, we use its richer data; if not, we
    # return the fragment results.
    def _try_xtract_unique():
        """Run xtractUnique on a daemon thread. Attaches to JVM."""
        try:
            if not jpype.isThreadAttachedToJVM():
                jpype.attachThreadToJVM()

            BCXSubstanceInfo = jpype.JClass(  # noqa: N806
                "org.beilstein.chemxtract.model.BCXSubstanceInfo"
            )
            SubstanceXtractor = jpype.JClass(  # noqa: N806
                "org.beilstein.chemxtract.xtractor.SubstanceXtractor"
            )

            info = BCXSubstanceInfo()
            xtractor = SubstanceXtractor()
            substances = xtractor.xtractUnique(document, info)

            results = []
            for s in substances:
                d = _coerce_substance(s)
                # Canonical semantics: svg = fresh CDK layout, svg_cdx =
                # ChemDraw original coords. Each render is independent —
                # empty results stay empty (no cross-fallback), so the
                # frontend can disable the corresponding button with an
                # accurate tooltip.
                d["svg"] = render_substance_svg_cdk_layout(s)
                d["svg_cdx"] = render_substance_svg(s)
                results.append(d)

            return results, _coerce_substance_info(info)
        except jpype.JException as exc:
            logger.warning("xtractUnique failed: %s", str(exc)[:100])
            return None
        finally:
            with contextlib.suppress(Exception):
                jpype.java.lang.Thread.detach()

    try:
        result = _run_jvm_subtask(
            _try_xtract_unique, _XTRACT_UNIQUE_TIMEOUT, "xtract-enrich"
        )
    except TimeoutError:
        logger.warning(
            "xtractUnique timed out after %.0fs — using fragment results",
            _XTRACT_UNIQUE_TIMEOUT,
        )
        result = None

    if result is not None:
        logger.info(
            "xtractUnique succeeded: %d substances (enriched)",
            len(result[0]),
        )
        return result[0], result[1], False

    # xtractUnique timed out or failed — recover InChI per molecule from the
    # SMILES we already have, so a file with one huge molecule still yields a
    # real InChI for its smaller molecules. Guarded by its own daemon-thread
    # timeout; a timeout keeps whatever was recovered before it fired.
    try:
        fragment_results = _run_jvm_subtask(
            lambda: _enrich_inchi_from_smiles_sync(fragment_results),
            _INCHI_FROM_SMILES_TIMEOUT,
            "inchi-from-smiles",
        )
    except TimeoutError:
        logger.warning(
            "InChI-from-SMILES recovery timed out — returning SMILES-only results"
        )

    return fragment_results, fragment_info, True


def _extract_fragments_from_document(document) -> tuple[list[dict], dict]:
    """Extract substances from an already-parsed CDDocument via fragments.

    Converts each CDX fragment to a CDK IAtomContainer, generates absolute
    SMILES, molecular formula, and SVG. Deduplicates by SMILES. Bypasses
    InChI entirely — those fields are left empty.

    Args:
        document: A pre-parsed Java CDDocument object.

    Returns:
        Tuple of (list of substance dicts with svg, info dict).

    Raises:
        ExtractionError: If fragment enumeration or conversion fails.
    """
    try:
        CDDocumentUtils = jpype.JClass(  # noqa: N806
            "org.beilstein.chemxtract.cdx.CDDocumentUtils"
        )
        FragmentConverter = jpype.JClass(  # noqa: N806
            "org.beilstein.chemxtract.converter.FragmentConverter"
        )
        SilentChemObjectBuilder = jpype.JClass(  # noqa: N806
            "org.openscience.cdk.silent.SilentChemObjectBuilder"
        )
        SmilesGenerator = jpype.JClass(  # noqa: N806
            "org.openscience.cdk.smiles.SmilesGenerator"
        )
        MolecularFormulaManipulator = jpype.JClass(  # noqa: N806
            "org.openscience.cdk.tools.manipulator.MolecularFormulaManipulator"
        )

        fragments = CDDocumentUtils.getListOfFragments(document)
        if not fragments:
            return [], dict(_EMPTY_SUBSTANCE_INFO)

        builder = SilentChemObjectBuilder.getInstance()
        converter = FragmentConverter(builder)
        smigen = SmilesGenerator.isomeric()

        seen_smiles: dict[str, dict] = {}
        total_fragments = 0
        errors = 0

        ConnectivityChecker = jpype.JClass(  # noqa: N806
            "org.openscience.cdk.graph.ConnectivityChecker"
        )

        for frag in fragments:
            total_fragments += 1
            try:
                mol = converter.convert(frag)
                if mol is None or mol.getAtomCount() == 0:
                    continue

                # Split disconnected components so each substance renders
                # cleanly. Without this, a fragment containing a dendrimer
                # + counterions + H2 molecules would render as one huge
                # image with stray lines from distant disconnected atoms.
                if ConnectivityChecker.isConnected(mol):
                    components = [mol]
                else:
                    mol_set = ConnectivityChecker.partitionIntoMolecules(mol)
                    components = [
                        mol_set.getAtomContainer(i)
                        for i in range(mol_set.getAtomContainerCount())
                    ]

                for component in components:
                    atom_count = component.getAtomCount()
                    if atom_count == 0:
                        continue

                    # Skip trivial fragments: H2, single atoms, etc.
                    # These are not meaningful chemical structures.
                    heavy_count = sum(
                        1
                        for j in range(atom_count)
                        if component.getAtom(j).getAtomicNumber() > 1
                    )
                    if heavy_count < 1:
                        continue

                    smiles = str(smigen.create(component) or "")
                    if not smiles:
                        continue

                    if smiles in seen_smiles:
                        continue

                    formula = ""
                    with contextlib.suppress(Exception):
                        mf = MolecularFormulaManipulator.getMolecularFormula(component)
                        if mf is not None:
                            formula = str(MolecularFormulaManipulator.getString(mf))

                    # No cross-fallback — empty stays empty so the
                    # frontend can accurately disable the corresponding
                    # layout button.
                    svg_cdx = _render_atom_container_svg(component)
                    svg = _render_with_cdk_layout(component)

                    seen_smiles[smiles] = {
                        "inchi": "",
                        "inchi_key": "",
                        "smiles": smiles,
                        "extended_smiles": "",
                        "iupac_name": "",
                        "molecular_formula": formula,
                        "aux_info": "",
                        "mdlv3000": "",
                        "abbreviations": {},
                        "svg": svg,
                        "svg_cdx": svg_cdx,
                    }
            except Exception as exc:
                errors += 1
                logger.warning(
                    "Fragment %d conversion failed: %s", total_fragments, exc
                )

        results = list(seen_smiles.values())
        info = {
            "no_fragments": total_fragments,
            "no_inchis": 0,
            "no_substances": len(results),
        }

        logger.info(
            "Fragment fallback: %d fragments → %d unique substances (%d errors)",
            total_fragments,
            len(results),
            errors,
        )
        return results, info

    except jpype.JException as exc:
        logger.error(
            "Fragment fallback extraction failed: %s\n%s",
            exc,
            _java_stacktrace(exc),
        )
        raise ExtractionError("Failed to extract substances from file") from exc


# ---------------------------------------------------------------------------
# Public async functions
# ---------------------------------------------------------------------------


async def extract_substances(
    file_bytes: bytes,
) -> tuple[list[SubstanceResponse], SubstanceInfoResponse]:
    """Extract chemical substances from a CDX/CDXML file.

    Detects the file format, routes to the correct Java reader, extracts
    substances via BChemXtract, and returns typed Pydantic models with
    all null fields coerced to defaults.

    Args:
        file_bytes: Raw file content bytes (CDX or CDXML).

    Returns:
        Tuple of (list of SubstanceResponse, SubstanceInfoResponse).

    Raises:
        FormatDetectionError: If the file format is not CDX or CDXML.
        ExtractionError: If Java extraction fails.
    """
    format_type = detect_format(file_bytes)
    raw_substances, raw_info = await run_in_jvm_thread(
        _extract_substances_sync, file_bytes, format_type
    )
    return (
        [SubstanceResponse(**d) for d in raw_substances],
        SubstanceInfoResponse(**raw_info),
    )


async def extract_substances_with_svg(
    file_bytes: bytes,
    format_type: str,
) -> tuple[list[SubstanceResponse], SubstanceInfoResponse, list[str]]:
    """Extract chemical substances with SVG depictions from a file.

    Uses a two-stage strategy:
      1. Try SubstanceXtractor.xtractUnique (30s timeout) — rich data
         with InChI, InChIKey, SMILES, formula, and SVG.
      2. On timeout, fall back to FragmentConverter + SmilesGenerator
         (90s timeout) — SMILES, formula, and SVG but no InChI/InChIKey.

    The fallback is transparent to the caller. A warning is appended
    when fallback is used so the UI can inform the user.

    Args:
        file_bytes: Raw file content bytes (CDX or CDXML).
        format_type: Pre-detected format ("cdx" or "cdxml").

    Returns:
        Tuple of (list of SubstanceResponse with svg,
        SubstanceInfoResponse, list of extraction warnings).

    Raises:
        ExtractionError: If both paths fail.
    """
    warnings: list[str] = []

    # Single-thread extraction: tries xtractUnique first, falls back to
    # fragment-level extraction on the same thread if xtractUnique throws
    # a Java exception. This avoids thread-pool contention where a hung
    # xtractUnique thread blocks fallback calls on separate threads.
    raw_substances, raw_info, used_fallback = await run_in_jvm_thread(
        _extract_with_fallback_sync,
        file_bytes,
        format_type,
        timeout=_FRAGMENT_FALLBACK_TIMEOUT,
    )

    if used_fallback:
        warnings.append(
            "File contains complex structures. Extracted via direct "
            "fragment conversion — SMILES and structure images are "
            "available, but InChI and InChIKey are not computed for "
            "this file."
        )

    return (
        [SubstanceResponse(**d) for d in raw_substances],
        SubstanceInfoResponse(**raw_info),
        warnings,
    )


async def extract_reactions(
    file_bytes: bytes,
) -> list[ReactionResponse]:
    """Extract chemical reactions from a CDX/CDXML file.

    Detects the file format, routes to the correct Java reader, extracts
    reactions via BChemXtract, and returns typed Pydantic models with
    all null fields coerced to defaults.

    Args:
        file_bytes: Raw file content bytes (CDX or CDXML).

    Returns:
        List of ReactionResponse models.

    Raises:
        FormatDetectionError: If the file format is not CDX or CDXML.
        ExtractionError: If Java extraction fails.
    """
    format_type = detect_format(file_bytes)
    raw_reactions = await run_in_jvm_thread(
        _extract_reactions_sync, file_bytes, format_type
    )
    return [ReactionResponse(**d) for d in raw_reactions]


async def extract_reactions_with_svg(
    file_bytes: bytes,
    format_type: str,
    timeout: float = 30.0,
) -> tuple[list[ReactionResponse], list[str]]:
    """Extract reactions with rendered SVGs.

    Args:
        file_bytes: Raw CDX/CDXML content.
        format_type: "cdx" or "cdxml".
        timeout: Hard cap in seconds; raised as TimeoutError by
            run_in_jvm_thread if exceeded.

    Returns:
        (list of ReactionResponse with svg populated, list of warnings).

    Raises:
        TimeoutError: run_in_jvm_thread exceeded `timeout`.
        ExtractionError: Java-side extraction failure.
    """
    raw_reactions, warnings = await run_in_jvm_thread(
        _extract_reactions_with_svg_sync,
        file_bytes,
        format_type,
        timeout=timeout,
    )
    return (
        [ReactionResponse(**d) for d in raw_reactions],
        warnings,
    )
