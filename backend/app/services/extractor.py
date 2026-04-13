"""Chemical structure and reaction extraction via BChemXtract Java bridge.

All Java class interactions are isolated in this module. Every JPype call
runs through run_in_jvm_thread for thread safety. Every Java model object
is null-coerced before leaving this module.
"""

import logging

import jpype

from app.errors import ExtractionError
from app.models.chemistry import (
    ReactionResponse,
    SubstanceInfoResponse,
    SubstanceResponse,
)
from app.services.depiction import render_substance_svg
from app.services.format_detector import detect_format
from app.services.jvm_bridge import run_in_jvm_thread

logger = logging.getLogger(__name__)


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


def _extract_substances_with_svg_sync(
    file_bytes: bytes, format_type: str
) -> tuple[list[dict], dict]:
    """Extract substances and render SVGs (blocking, runs in thread pool).

    Extends _extract_substances_sync by adding per-substance SVG rendering
    via CDK DepictionGenerator. SVG failures for individual substances are
    non-fatal per D-03 -- the substance dict gets svg="" and extraction
    continues.

    Args:
        file_bytes: Raw file content bytes.
        format_type: Either "cdx" or "cdxml".

    Returns:
        Tuple of (list of coerced substance dicts with svg, coerced info
        dict).

    Raises:
        ExtractionError: If Java extraction itself fails.
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

        results = []
        for s in substances:
            d = _coerce_substance(s)
            d["svg"] = render_substance_svg(s)
            results.append(d)

        return results, _coerce_substance_info(info)
    except jpype.JException as exc:
        logger.error(
            "Java substance extraction failed: %s\n%s",
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
) -> tuple[list[SubstanceResponse], SubstanceInfoResponse]:
    """Extract chemical substances with SVG depictions from a file.

    Like extract_substances but also renders publication-quality SVGs
    for each substance via CDK DepictionGenerator. Format detection is
    performed by the caller (the router) so the detected format can be
    included in the response metadata.

    Args:
        file_bytes: Raw file content bytes (CDX or CDXML).
        format_type: Pre-detected format ("cdx" or "cdxml").

    Returns:
        Tuple of (list of SubstanceResponse with svg,
        SubstanceInfoResponse).

    Raises:
        ExtractionError: If Java extraction fails.
    """
    # Extraction with SVG rendering needs a longer timeout than the
    # default 30s because the first call triggers JVM class loading
    # for CDK DepictionGenerator + BChemXtract (cold-start overhead).
    raw_substances, raw_info = await run_in_jvm_thread(
        _extract_substances_with_svg_sync, file_bytes, format_type,
        timeout=120.0,
    )
    return (
        [SubstanceResponse(**d) for d in raw_substances],
        SubstanceInfoResponse(**raw_info),
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
