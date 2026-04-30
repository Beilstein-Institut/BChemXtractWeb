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
)
from app.services.format_detector import detect_format
from app.services.jvm_bridge import run_in_jvm_thread

logger = logging.getLogger(__name__)

# Timeout for the primary xtractUnique path. If exceeded, we fall back
# to the fragment-level extraction which bypasses InChI computation.
_XTRACT_UNIQUE_TIMEOUT = 10.0

# Timeout for the fragment-level fallback (typically completes in <1s).
_FRAGMENT_FALLBACK_TIMEOUT = 90.0

# Plan 10 Pitfall 6: CDK SmilesParser + DepictionGenerator can deadlock on
# polymer/dendrimer SMILES > 1500 chars (same root cause as Phase 9
# canonicalize.py MAX_CANONICALIZE_LEN). Guard with a hard cap — length
# over this yields an empty SVG + per-reaction warning, never a hung JVM.
MAX_REACTION_SMILES_LEN = 1500

# Plan 10 D-12: reaction SVG is wider than substance SVG (600x400 vs 450x450).
SVG_REACTION_TARGET_WIDTH = 600
SVG_REACTION_TARGET_HEIGHT = 400


# ---------------------------------------------------------------------------
# Private null-coercion functions (D-09)
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
    unbounded memory growth through this field (SEC L-06).

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


def _coerce_reaction(java_rxn) -> dict:
    """Convert a BCXReaction Java object to a dict with no nulls.

    All nullable String fields are coerced to empty string.
    Collection fields (reactants, products, agents) are coerced per component.

    Args:
        java_rxn: A Java BCXReaction instance.

    Returns:
        Dict ready for ReactionResponse(**d) construction.
    """
    # The Java lists themselves may be null (handled by `or []`) AND may
    # contain null entries (handled by `if c is not None`) — v1.1 inserts
    # nulls into the agents list for certain reaction shapes.
    return {
        "rinchi": str(java_rxn.getRinchi() or ""),
        "rinchi_key": str(java_rxn.getRinchiKey() or ""),
        "short_rinchi_key": str(java_rxn.getShortRinchiKey() or ""),
        "long_rinchi_key": str(java_rxn.getLongRinchiKey() or ""),
        "web_rinchi_key": str(java_rxn.getWebRinchiKey() or ""),
        "reaction_smiles": str(java_rxn.getReactionSmiles() or ""),
        "aux_info": str(java_rxn.getAuxInfo() or ""),
        "reactants": [
            _coerce_reaction_component(c)
            for c in (java_rxn.getReactants() or [])
            if c is not None
        ],
        "products": [
            _coerce_reaction_component(c)
            for c in (java_rxn.getProducts() or [])
            if c is not None
        ],
        "agents": [
            _coerce_reaction_component(c)
            for c in (java_rxn.getAgents() or [])
            if c is not None
        ],
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

    # Try direct bytes first; fall back to JArray(JByte) if needed (A4)
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

    Plan 10 D-12/D-13/D-15: SVG rendering happens inline with extraction
    so thread attach/detach cost is paid once. Per-reaction render
    failures produce `svg=""` + warning, never fail the whole call.

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
        return _set_svg_dimensions(svg_str, SVG_TARGET_WIDTH, SVG_TARGET_HEIGHT)
    except Exception as exc:
        logger.warning("SVG rendering failed for atom container: %s", exc)
        return ""


def _render_reaction_svg(reaction_smiles: str) -> tuple[str, str]:
    """Render a reaction SMILES to a combined CDK SVG (Plan 10 D-12/D-13/D-15).

    Returns (svg, warning) tuple. Empty svg + non-empty warning signals
    a per-reaction render failure; empty warning + empty svg signals a
    guarded/skipped empty input. Never raises (D-13).

    Must be called inside a JVM-attached thread (caller enforces via
    run_in_jvm_thread). Pitfall 3: requires `>` in input. Pitfall 6:
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
        return sized, ""
    except Exception as exc:  # noqa: BLE001 — D-13: never raise from depiction
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
        return _set_svg_dimensions(svg_str, SVG_TARGET_WIDTH, SVG_TARGET_HEIGHT)
    except Exception as exc:
        logger.warning("CDK layout + render failed: %s", exc)
        return ""


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

    Args:
        file_bytes: Raw file content bytes.
        format_type: Either "cdx" or "cdxml".

    Returns:
        Tuple of (substance dicts with svg, info dict, used_fallback bool).

    Raises:
        ExtractionError: If fragment extraction fails.
    """
    import concurrent.futures

    try:
        document = _read_document(file_bytes, format_type)
    except jpype.JException as exc:
        logger.error("Document parsing failed: %s", exc)
        raise ExtractionError("Failed to parse file") from exc

    # Stage 1: always run fragment extraction first (fast, reliable)
    fragment_results, fragment_info = _extract_fragments_from_document(document)
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

    pool = concurrent.futures.ThreadPoolExecutor(
        max_workers=1, thread_name_prefix="xtract-enrich"
    )
    future = pool.submit(_try_xtract_unique)
    try:
        result = future.result(timeout=_XTRACT_UNIQUE_TIMEOUT)
        if result is not None:
            logger.info(
                "xtractUnique succeeded: %d substances (enriched)",
                len(result[0]),
            )
            pool.shutdown(wait=False)
            return result[0], result[1], False
    except concurrent.futures.TimeoutError:
        logger.warning(
            "xtractUnique timed out after %.0fs — using fragment results",
            _XTRACT_UNIQUE_TIMEOUT,
        )
    # Don't wait for the hung thread — shut down immediately.
    # The daemon thread will be abandoned (it holds a JVM thread
    # until xtractUnique eventually completes or the process exits).
    pool.shutdown(wait=False, cancel_futures=True)

    # Return fragment results (xtractUnique timed out or failed)
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
    """Extract reactions with rendered SVGs (Plan 10 D-12/D-15).

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
