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

import logging
import re

import jpype

from app.errors import ExtractionError
from app.models.chemistry import (
    ReactionResponse,
    SubstanceInfoResponse,
    SubstanceResponse,
)
from app.services.depiction import render_substance_svg, _set_svg_dimensions
from app.services.depiction import SVG_TARGET_WIDTH, SVG_TARGET_HEIGHT
from app.services.format_detector import detect_format
from app.services.jvm_bridge import run_in_jvm_thread

logger = logging.getLogger(__name__)

# Timeout for the primary xtractUnique path. If exceeded, we fall back
# to the fragment-level extraction which bypasses InChI computation.
_XTRACT_UNIQUE_TIMEOUT = 10.0

# Timeout for the fragment-level fallback (typically completes in <1s).
_FRAGMENT_FALLBACK_TIMEOUT = 90.0


# ---------------------------------------------------------------------------
# Private null-coercion functions (D-09)
# ---------------------------------------------------------------------------


def _coerce_substance(java_sub) -> dict:
    """Convert a BCXSubstance Java object to a dict with no nulls.

    All nullable String fields are coerced to empty string.
    The abbreviations Map is converted to a Python dict.

    Args:
        java_sub: A Java BCXSubstance instance.

    Returns:
        Dict ready for SubstanceResponse(**d) construction.
    """
    return {
        "inchi": str(java_sub.getInchi() or ""),
        "inchi_key": str(java_sub.getInchiKey() or ""),
        "smiles": str(java_sub.getSmiles() or ""),
        "extended_smiles": str(java_sub.getExtendedSmiles() or ""),
        "iupac_name": str(java_sub.getIupacName() or ""),
        "molecular_formula": str(java_sub.getMolecularFormula() or ""),
        "aux_info": str(java_sub.getAuxInfo() or ""),
        "mdlv3000": "",
        "abbreviations": {
            str(k): str(v)
            for k, v in (java_sub.getAbbreviations() or {}).items()
        },
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
        ],
        "products": [
            _coerce_reaction_component(c)
            for c in (java_rxn.getProducts() or [])
        ],
        "agents": [
            _coerce_reaction_component(c)
            for c in (java_rxn.getAgents() or [])
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
        input_stream = ByteArrayInputStream(
            jpype.JArray(jpype.JByte)(file_bytes)
        )

    if format_type == "cdx":
        reader_cls = jpype.JClass(
            "org.beilstein.chemxtract.cdx.reader.CDXReader"
        )
    else:
        reader_cls = jpype.JClass(
            "org.beilstein.chemxtract.cdx.reader.CDXMLReader"
        )

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
            "Java substance extraction failed: %s\n%s",
            str(exc),
            exc.stacktrace() if hasattr(exc, "stacktrace") else str(exc),
        )
        raise ExtractionError("Failed to extract substances from file") from exc


def _extract_reactions_sync(
    file_bytes: bytes, format_type: str
) -> list[dict]:
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

        ReactionXtractor = jpype.JClass(  # noqa: N806
            "org.beilstein.chemxtract.xtractor.ReactionXtractor"
        )

        xtractor = ReactionXtractor()
        reactions = xtractor.xtract(document)

        return [_coerce_reaction(r) for r in reactions]
    except jpype.JException as exc:
        logger.error(
            "Java reaction extraction failed: %s\n%s",
            str(exc),
            exc.stacktrace() if hasattr(exc, "stacktrace") else str(exc),
        )
        raise ExtractionError("Failed to extract reactions from file") from exc


def _render_atom_container_svg(container) -> str:
    """Render a CDK IAtomContainer to SVG via DepictionGenerator.

    Same rendering pipeline as render_substance_svg but accepts a raw
    IAtomContainer instead of a BCXSubstance. Used by the fragment
    fallback path where we have CDK molecules but no BCXSubstance wrapper.

    Returns empty string on any failure — never raises.
    """
    try:
        if container is None:
            return ""

        DepictionGenerator = jpype.JClass(  # noqa: N806
            "org.openscience.cdk.depict.DepictionGenerator"
        )
        dg = DepictionGenerator().withAtomColors().withFillToFit()
        depiction = dg.depict(container)
        svg_str = str(depiction.toSvgStr())
        return _set_svg_dimensions(svg_str, SVG_TARGET_WIDTH, SVG_TARGET_HEIGHT)
    except Exception as exc:
        logger.warning("SVG rendering failed for atom container: %s", exc)
        return ""


def _render_with_cdk_layout(container) -> str:
    """Re-layout a molecule with CDK's StructureDiagramGenerator and render.

    Generates fresh 2D coordinates instead of using the original CDX
    coordinates. Produces cleaner layouts for complex structures where
    the ChemDraw layout has long crossing bonds.

    Returns empty string on any failure — never raises.
    """
    try:
        if container is None:
            return ""

        StructureDiagramGenerator = jpype.JClass(  # noqa: N806
            "org.openscience.cdk.layout.StructureDiagramGenerator"
        )
        DepictionGenerator = jpype.JClass(  # noqa: N806
            "org.openscience.cdk.depict.DepictionGenerator"
        )

        sdg = StructureDiagramGenerator()
        sdg.setMolecule(container)
        sdg.generateCoordinates()
        mol_laid_out = sdg.getMolecule()

        dg = DepictionGenerator().withAtomColors().withFillToFit()
        depiction = dg.depict(mol_laid_out)
        svg_str = str(depiction.toSvgStr())
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
    fragment_results, fragment_info = _extract_fragments_from_document(
        document
    )
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
                d["svg"] = render_substance_svg(s)
                results.append(d)

            return results, _coerce_substance_info(info)
        except jpype.JException as exc:
            logger.warning("xtractUnique failed: %s", str(exc)[:100])
            return None
        finally:
            try:
                jpype.java.lang.Thread.detach()
            except Exception:
                pass

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
            return [], {
                "no_fragments": 0, "no_inchis": 0, "no_substances": 0,
            }

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
                        1 for j in range(atom_count)
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
                    try:
                        mf = MolecularFormulaManipulator.getMolecularFormula(
                            component
                        )
                        if mf is not None:
                            formula = str(
                                MolecularFormulaManipulator.getString(mf)
                            )
                    except Exception:
                        pass

                    svg_cdx = _render_atom_container_svg(component)
                    svg = _render_with_cdk_layout(component) or svg_cdx

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
            "Fragment fallback: %d fragments → %d unique substances "
            "(%d errors)",
            total_fragments, len(results), errors,
        )
        return results, info

    except jpype.JException as exc:
        logger.error(
            "Fragment fallback extraction failed: %s\n%s",
            str(exc),
            exc.stacktrace() if hasattr(exc, "stacktrace") else str(exc),
        )
        raise ExtractionError(
            "Failed to extract substances from file"
        ) from exc


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
        _extract_with_fallback_sync, file_bytes, format_type,
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
