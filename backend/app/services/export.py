"""Export format generators for POST /api/export.

All six export formats are implemented here:
  - SDF: CDK SDFWriter (JVM thread required)
  - JSON: pure Python dict serialization
  - CSV: pure Python csv stdlib
  - PNG: rasterized from the stored SVG of the requested depiction via
    cairosvg; falls back per structure to CDK DepictionGenerator.toImg()
    when no stored SVG exists (JVM thread required for the fallback only)
  - SVG: served from the stored SVG of the requested depiction
  - V3000: CDK MDLV3000Writer (JVM thread required)
  - RXN: empty RDF stub (D-11, Phase 10 will populate)

Per D-08: single unified generate_export() function dispatches to per-format helpers.
Per D-09: CDK/Java handles SDF, V3000. Python handles JSON, CSV, SVG, PNG.

Depiction contract (image formats): exports must match what the UI
displays. ``depiction="cdk"`` selects the stored ``svg`` column (fresh
CDK layout); ``depiction="cdx"`` selects ``svg_cdx`` (original ChemDraw
coordinates). When the requested layout is missing for a structure the
other stored layout is used — the same fallback the frontend applies
when rendering — so the exported image always equals the displayed one.
PNG rasterizes that exact stored SVG (supersedes the original D-10
SMILES-reparse pipeline, which could expand abbreviations and re-layout
differently from the on-screen depiction); the SMILES pipeline remains
as the per-structure fallback when no stored SVG exists at all.

Security:
  T-08-03: CDK SmilesParser exceptions caught per-molecule — never crash full export.
  T-08-04: ZIP entry filenames sanitized in _build_zip() against path traversal.
  T-08-05: PNG export hard-limited to 200 structures.
"""

import asyncio
import csv
import io
import json
import logging
import zipfile
from datetime import UTC, datetime

import cairosvg
from fastapi import HTTPException

from app.services.filenames import safe_filename
from app.services.jvm_bridge import run_in_jvm_thread

_logger = logging.getLogger(__name__)

_PNG_LIMIT = 200

# Rasterization target for PNG export. Matches the legacy CDK
# DepictionGenerator size so existing consumers see no dimension change.
_PNG_SIZE = 1000


def _pick_depiction_svg(substance: dict, depiction: str) -> str:
    """Return the stored SVG matching ``depiction``, with display-parity fallback.

    "cdx" prefers the original-ChemDraw-coordinates render (``svg_cdx``),
    "cdk" prefers the fresh CDK layout (``svg``). When the preferred field
    is empty the other one is returned — identical to the frontend's
    rendering fallback — so exports always match what the user sees.
    Returns "" when neither layout exists.
    """
    preferred, other = ("svg_cdx", "svg") if depiction == "cdx" else ("svg", "svg_cdx")
    return substance.get(preferred) or substance.get(other) or ""


# IN-01: date is generated at call time in _generate_rxn_stub() — not hardcoded here.


# ---------------------------------------------------------------------------
# Filename helpers
# ---------------------------------------------------------------------------


def _single_filename(substance: dict, fmt: str) -> str:
    """Single-structure filename: {inchi_key_8chars}_{fmt}.{ext}"""
    inchi_key = substance.get("inchi_key", "")
    prefix = inchi_key[:8] if inchi_key else f"substance_{substance.get('id', 0):04d}"
    exts = {
        "sdf": "sdf",
        "json": "json",
        "csv": "csv",
        "png": "png",
        "svg": "svg",
        "v3000": "mol",
        "rxn": "rxn",
    }
    return f"{prefix}_{fmt}.{exts.get(fmt, 'dat')}"


def _zip_filename(fmt: str) -> str:
    """Multi-structure ZIP filename: bchemxtract_export_{fmt}_{YYYYMMDD}.zip.

    SEC L-01: use UTC rather than ``date.today()`` (container-local tz)
    so filename dates are deterministic across host timezones.
    """
    today_utc = datetime.now(UTC).date().strftime("%Y%m%d")
    return f"bchemxtract_export_{fmt}_{today_utc}.zip"


# ---------------------------------------------------------------------------
# ZIP builder
# ---------------------------------------------------------------------------


def _build_zip(entries: list[tuple[str, bytes]]) -> bytes:
    """Build in-memory ZIP from (filename, content) pairs.

    Sanitises every entry name through :func:`safe_filename` (allowlist
    ``[A-Za-z0-9._-]`` + 128-char cap) so no entry can carry path
    separators, null bytes, CR/LF, or other unprintables that might
    surprise a ZIP consumer (SEC M-03, T-08-04).
    """
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for name, content in entries:
            zf.writestr(safe_filename(name), content)
    buf.seek(0)
    return buf.read()


# ---------------------------------------------------------------------------
# JVM-dependent generators (must run inside run_in_jvm_thread)
# ---------------------------------------------------------------------------


def _generate_sdf_sync(substances: list[dict]) -> bytes:
    """Generate multi-record SDF bytes. Must run inside run_in_jvm_thread.

    Uses StructureDiagramGenerator for 2D layout (avoids all-zero coordinates
    — Pitfall 2 from RESEARCH.md). Skips substances with empty SMILES (Pitfall 5).

    Args:
        substances: List of substance dicts with at minimum a ``smiles`` key.

    Returns:
        UTF-8 encoded SDF bytes (multi-record, $$$$ separated).
    """
    import jpype

    SDFWriter = jpype.JClass("org.openscience.cdk.io.SDFWriter")  # noqa: N806
    StringWriter = jpype.JClass("java.io.StringWriter")  # noqa: N806
    SmilesParser = jpype.JClass("org.openscience.cdk.smiles.SmilesParser")  # noqa: N806
    SilentChemObjectBuilder = jpype.JClass(  # noqa: N806
        "org.openscience.cdk.silent.SilentChemObjectBuilder"
    )
    StructureDiagramGenerator = jpype.JClass(  # noqa: N806
        "org.openscience.cdk.layout.StructureDiagramGenerator"
    )

    parser = SmilesParser(SilentChemObjectBuilder.getInstance())
    sdg = StructureDiagramGenerator()
    sw = StringWriter()
    writer = SDFWriter(sw)
    try:
        for s in substances:
            if not s.get("smiles"):
                continue
            try:
                mol = parser.parseSmiles(s["smiles"])
                sdg.setMolecule(mol)
                sdg.generateCoordinates()
                writer.write(sdg.getMolecule())
            except Exception:  # noqa: BLE001
                # T-08-03: Skip unparseable SMILES — never crash the whole export
                _logger.debug(
                    "Skipping substance id=%s during SDF export: unparseable SMILES",
                    s.get("id"),
                )
    finally:
        # CR-02: always close the JVM-side SDFWriter/StringWriter, even if an
        # unexpected exception (e.g. Java OutOfMemoryError) escapes the inner
        # per-molecule try/except above.
        writer.close()
    return str(sw.toString()).encode("utf-8")


def _generate_png_sync(smiles: str, width: int = 1000, height: int = 1000) -> bytes:
    """Generate PNG bytes for one molecule via CDK DepictionGenerator.

    Must run inside run_in_jvm_thread. Returns b'' on failure.

    D-10 compliance: uses CDK DepictionGenerator (same pipeline as stored `svg`
    field), not cairosvg or svglib (not in conda env). Consistent visual output.

    Args:
        smiles: SMILES string for the molecule.
        width: Image width in pixels (default 1000).
        height: Image height in pixels (default 1000).

    Returns:
        PNG bytes or b'' if SMILES is empty or parsing fails.
    """
    if not smiles:
        return b""

    import jpype

    try:
        SmilesParser = jpype.JClass("org.openscience.cdk.smiles.SmilesParser")  # noqa: N806
        SilentChemObjectBuilder = jpype.JClass(  # noqa: N806
            "org.openscience.cdk.silent.SilentChemObjectBuilder"
        )
        DepictionGenerator = jpype.JClass(  # noqa: N806
            "org.openscience.cdk.depict.DepictionGenerator"
        )
        StandardGenerator = jpype.JClass(  # noqa: N806
            "org.openscience.cdk.renderer.generators.standard.StandardGenerator"
        )
        SymbolVisibility = jpype.JClass(  # noqa: N806
            "org.openscience.cdk.renderer.SymbolVisibility"
        )
        StructureDiagramGenerator = jpype.JClass(  # noqa: N806
            "org.openscience.cdk.layout.StructureDiagramGenerator"
        )
        ByteArrayOutputStream = jpype.JClass("java.io.ByteArrayOutputStream")  # noqa: N806
        ImageIO = jpype.JClass("javax.imageio.ImageIO")  # noqa: N806

        mol = SmilesParser(SilentChemObjectBuilder.getInstance()).parseSmiles(smiles)
        sdg = StructureDiagramGenerator()
        sdg.setMolecule(mol)
        sdg.generateCoordinates()

        dg = (
            DepictionGenerator()
            .withAtomColors()
            .withFillToFit()
            .withParam(
                StandardGenerator.Visibility,
                SymbolVisibility.iupacRecommendations(),
            )
            .withSize(float(width), float(height))
        )
        baos = ByteArrayOutputStream()
        ImageIO.write(dg.depict(sdg.getMolecule()).toImg(), "PNG", baos)
        return bytes(baos.toByteArray())
    except Exception:  # noqa: BLE001
        _logger.debug(
            "PNG generation failed for SMILES %r — returning empty bytes", smiles[:40]
        )
        return b""


def _rasterize_svg_sync(svg_markup: str, size: int = _PNG_SIZE) -> bytes:
    """Rasterize stored SVG markup to PNG bytes via cairosvg.

    This is the primary PNG path: the stored SVG is exactly what the UI
    displays, so the PNG pixel-matches the chosen depiction. CDK emits
    glyphs as vector paths (no ``<text>`` elements), so rasterization is
    font-independent. The stored SVGs have their CDK white-backdrop rect
    stripped at storage time (SEC L-05), so an explicit white background
    is applied here to match the legacy CDK ``toImg()`` output.

    Pure Python / no JVM. Returns b'' on any failure so the caller can
    fall back to the SMILES-based CDK pipeline (T-08-03 spirit: one bad
    structure never crashes the whole export).
    """
    if not svg_markup:
        return b""
    try:
        return cairosvg.svg2png(
            bytestring=svg_markup.encode("utf-8"),
            output_width=size,
            output_height=size,
            background_color="#ffffff",
        )
    except Exception as exc:  # noqa: BLE001 — contract: never raise
        _logger.warning("SVG rasterization failed — falling back to CDK: %s", exc)
        return b""


def _generate_v3000_sync(smiles: str) -> bytes:
    """Generate MDL V3000 .mol bytes from SMILES. Must run inside run_in_jvm_thread.

    Uses MDLV3000Writer (verified in JAR). Runs StructureDiagramGenerator first
    to generate valid 2D coordinates (Pitfall 2 from RESEARCH.md).

    Args:
        smiles: SMILES string for the molecule.

    Returns:
        UTF-8 encoded V3000 molfile bytes or b'' if SMILES empty/unparseable.
    """
    if not smiles:
        return b""

    import jpype

    try:
        SmilesParser = jpype.JClass("org.openscience.cdk.smiles.SmilesParser")  # noqa: N806
        SilentChemObjectBuilder = jpype.JClass(  # noqa: N806
            "org.openscience.cdk.silent.SilentChemObjectBuilder"
        )
        StructureDiagramGenerator = jpype.JClass(  # noqa: N806
            "org.openscience.cdk.layout.StructureDiagramGenerator"
        )
        MDLV3000Writer = jpype.JClass("org.openscience.cdk.io.MDLV3000Writer")  # noqa: N806
        StringWriter = jpype.JClass("java.io.StringWriter")  # noqa: N806

        mol = SmilesParser(SilentChemObjectBuilder.getInstance()).parseSmiles(smiles)
        sdg = StructureDiagramGenerator()
        sdg.setMolecule(mol)
        sdg.generateCoordinates()
        sw = StringWriter()
        writer = MDLV3000Writer(sw)
        try:
            writer.write(sdg.getMolecule())
        finally:
            # CR-02: always close the JVM-side MDLV3000Writer/StringWriter,
            # even if an unexpected exception escapes writer.write().
            writer.close()
        return str(sw.toString()).encode("utf-8")
    except Exception:  # noqa: BLE001
        _logger.debug(
            "V3000 generation failed for SMILES %r — returning empty bytes", smiles[:40]
        )
        return b""


# Plan 10 Pitfall 6: same polymer-SMILES guard as extractor.py
_MAX_EXPORT_REACTION_SMILES_LEN = 1500


def _generate_rxn_sync(reactions: list[dict]) -> bytes:
    """Generate RXN/multi-reaction bytes via CDK MDLRXNWriter (Plan 10 D-22 amended).

    MUST run inside run_in_jvm_thread -- JPype calls are JVM-thread-attached.

    CDK's MDLRXNWriter.write(IReactionSet) natively emits:
      - 1 reaction  -> single $RXN record
      - N reactions -> N records with $$$$ separator between them
    This is the CDK-native multi-reaction container. MDLRDFWriter does
    NOT exist in CDK 2.12 (verified via `unzip -l` -- see RESEARCH).

    Filters: reactions with empty reaction_smiles, no ">" separator, or
    reaction_smiles longer than _MAX_EXPORT_REACTION_SMILES_LEN (1500)
    are skipped (Pitfalls 3 and 6). Unparseable SMILES are caught
    per-reaction and logged at DEBUG, not raised.

    Args:
        reactions: list of reaction dicts with at minimum ``reaction_smiles``.

    Returns:
        UTF-8 encoded CTfile bytes. Empty bytes if no reactions parse.
    """
    import jpype

    # Filter eligible reactions (">", non-empty, length guard)
    eligible = []
    for r in reactions:
        smi = r.get("reaction_smiles") or ""
        if not smi or ">" not in smi:
            continue
        if len(smi) > _MAX_EXPORT_REACTION_SMILES_LEN:
            _logger.warning(
                "RXN export: skipping oversized reaction (%d chars)",
                len(smi),
            )
            continue
        eligible.append(r)

    if not eligible:
        return b""

    try:
        SilentChemObjectBuilder = jpype.JClass(  # noqa: N806
            "org.openscience.cdk.silent.SilentChemObjectBuilder"
        )
        SmilesParser = jpype.JClass(  # noqa: N806
            "org.openscience.cdk.smiles.SmilesParser"
        )
        # Prefer silent ReactionSet; fall back to base class if missing.
        try:
            ReactionSet = jpype.JClass(  # noqa: N806
                "org.openscience.cdk.silent.ReactionSet"
            )
        except Exception:  # noqa: BLE001  # pragma: no cover - depends on CDK variant
            ReactionSet = jpype.JClass("org.openscience.cdk.ReactionSet")  # noqa: N806
        StructureDiagramGenerator = jpype.JClass(  # noqa: N806
            "org.openscience.cdk.layout.StructureDiagramGenerator"
        )
        MDLRXNWriter = jpype.JClass("org.openscience.cdk.io.MDLRXNWriter")  # noqa: N806
        StringWriter = jpype.JClass("java.io.StringWriter")  # noqa: N806

        parser = SmilesParser(SilentChemObjectBuilder.getInstance())
        sdg = StructureDiagramGenerator()
        rxn_set = ReactionSet()

        for r in eligible:
            try:
                reaction = parser.parseReactionSmiles(r["reaction_smiles"])
                for cs in (
                    reaction.getReactants(),
                    reaction.getProducts(),
                    reaction.getAgents(),
                ):
                    for i in range(cs.getAtomContainerCount()):
                        mol = cs.getAtomContainer(i)
                        # Per-component layout failure is non-fatal --
                        # MDLRXNWriter writes whatever coordinates exist.
                        try:
                            sdg.setMolecule(mol)
                            sdg.generateCoordinates()
                        except Exception:  # noqa: BLE001, S110
                            pass
                rxn_set.addReaction(reaction)
            except Exception:  # noqa: BLE001
                _logger.debug(
                    "Skipping reaction during RXN export: unparseable smiles %r",
                    r.get("reaction_smiles", "")[:80],
                )

        if rxn_set.getReactionCount() == 0:
            return b""

        sw = StringWriter()
        writer = MDLRXNWriter(sw)
        try:
            writer.write(rxn_set)
        finally:
            writer.close()
        return str(sw.toString()).encode("utf-8")
    except Exception as exc:  # noqa: BLE001
        _logger.warning("RXN export failed: %s", exc)
        return b""


# ---------------------------------------------------------------------------
# Pure Python generators (no JVM thread needed)
# ---------------------------------------------------------------------------


def _generate_json(substances: list[dict]) -> bytes:
    """JSON array of substance dicts. Pure Python — no JVM thread needed.

    Args:
        substances: List of substance dicts.

    Returns:
        UTF-8 encoded JSON bytes.
    """
    rows = [
        {
            "id": s.get("id"),
            "inchi_key": s.get("inchi_key", ""),
            "smiles": s.get("smiles", ""),
            "molecular_formula": s.get("molecular_formula", ""),
            "inchi": s.get("inchi", ""),
            "iupac_name": s.get("iupac_name", ""),
            "extended_smiles": s.get("extended_smiles", ""),
        }
        for s in substances
    ]
    return json.dumps(rows, indent=2).encode("utf-8")


CSV_COLUMNS = [
    "id",
    "inchi_key",
    "smiles",
    "molecular_formula",
    "inchi",
    "iupac_name",
    "extended_smiles",
]


def _generate_csv(substances: list[dict]) -> bytes:
    """CSV with header row. Pure Python — no JVM thread needed.

    Args:
        substances: List of substance dicts.

    Returns:
        UTF-8 encoded CSV bytes with header line.
    """
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=CSV_COLUMNS, extrasaction="ignore")
    writer.writeheader()
    for s in substances:
        writer.writerow({col: s.get(col, "") for col in CSV_COLUMNS})
    return buf.getvalue().encode("utf-8")


def _svg_entries(
    substances: list[dict], depiction: str = "cdk"
) -> list[tuple[str, bytes]]:
    """Build ``(filename, svg_bytes)`` entries from substance dicts.

    Filename construction uses inchi_key prefix + sequential index directly
    to ensure unique entry names (avoids silent overwrites from identical
    InChI key prefixes). The SVG content is selected per substance by
    ``depiction`` (see :func:`_pick_depiction_svg`); substances with no
    stored SVG in either layout are skipped.

    Args:
        substances: List of substance dicts with ``svg``/``svg_cdx`` and
            ``inchi_key`` fields.
        depiction: "cdk" or "cdx" layout selector.

    Returns:
        List of ``(filename, utf8_bytes)`` pairs, one per substance with
        non-empty SVG content.
    """
    entries: list[tuple[str, bytes]] = []
    for i, s in enumerate(substances):
        svg_content = _pick_depiction_svg(s, depiction)
        if not svg_content:
            continue
        inchi_key = s.get("inchi_key", "")
        prefix = inchi_key[:8] if inchi_key else f"substance_{s.get('id', 0):04d}"
        filename = f"{prefix}_{i:04d}.svg"
        entries.append((filename, svg_content.encode("utf-8")))
    return entries


def _generate_rxn_stub() -> bytes:
    """RXN/RDfile stub. Returns minimal valid RDF header with current date.

    Reaction data will be populated in Phase 10 (D-11). Returns only the
    RDfile header so the response has valid Content-Type: chemical/x-mdl-rdfile.

    IN-01: $DATM is generated at call time so exported files are stamped with
    the actual download date rather than the hardcoded development date.

    SEC L-01: use UTC so RDfile stamps are deterministic across host tz.

    Returns:
        Minimal RDF header bytes.
    """
    datm = datetime.now(UTC).date().strftime("%Y/%m/%d")
    return f"$RDFILE 1\n$DATM    {datm}\n".encode()


# ---------------------------------------------------------------------------
# Top-level dispatcher
# ---------------------------------------------------------------------------


async def generate_export(
    substances: list[dict],
    fmt: str,
    depiction: str = "cdk",
) -> tuple[bytes, str, str]:
    """Generate export bytes for the given format.

    Dispatches to the appropriate format generator. JVM-dependent formats
    (sdf, v3000, and the PNG fallback path) are dispatched via
    run_in_jvm_thread. Pure Python formats (json, csv, svg, rxn) and the
    primary PNG rasterization run on a worker thread or directly.

    Args:
        substances: List of substance dicts from the ORM layer.
        fmt: Export format string (validated upstream by Pydantic ExportRequest).
        depiction: 2D layout for the image formats (png/svg): "cdk" for the
            fresh CDK layout, "cdx" for original ChemDraw coordinates
            (validated upstream by Pydantic). Ignored by other formats.

    Returns:
        Tuple of (content_bytes, media_type, filename).

    Raises:
        HTTPException 400: PNG export exceeds _PNG_LIMIT substances.
        HTTPException 422: Unknown format (Pydantic should catch this upstream).
    """
    multi_name = _zip_filename(fmt)

    if fmt == "sdf":
        content = await run_in_jvm_thread(_generate_sdf_sync, substances)
        filename = (
            _single_filename(substances[0], "sdf")
            if len(substances) == 1
            else multi_name.replace(".zip", ".sdf")
        )
        return content, "chemical/x-mdl-sdfile", filename

    if fmt == "json":
        return (
            _generate_json(substances),
            "application/json",
            multi_name.replace(".zip", ".json"),
        )

    if fmt == "csv":
        return (
            _generate_csv(substances),
            "text/csv",
            multi_name.replace(".zip", ".csv"),
        )

    if fmt == "svg":
        svg_entries = _svg_entries(substances, depiction)
        if len(svg_entries) == 1:
            return svg_entries[0][1], "image/svg+xml", svg_entries[0][0]
        return _build_zip(svg_entries), "application/zip", multi_name

    if fmt == "png":
        if len(substances) > _PNG_LIMIT:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"PNG export is limited to {_PNG_LIMIT} structures at a time. "
                    "Select fewer structures or use SDF/SVG for bulk export."
                ),
            )
        png_entries: list[tuple[str, bytes]] = []
        for s in substances:
            # Primary path: rasterize the stored SVG of the requested
            # depiction so the PNG matches what the UI displays. Fallback:
            # legacy CDK SMILES-reparse pipeline when no stored SVG exists
            # or rasterization fails for this structure.
            svg_markup = _pick_depiction_svg(s, depiction)
            png_bytes = b""
            if svg_markup:
                png_bytes = await asyncio.to_thread(_rasterize_svg_sync, svg_markup)
            if not png_bytes:
                png_bytes = await run_in_jvm_thread(
                    _generate_png_sync, s.get("smiles", "")
                )
            if png_bytes:
                png_entries.append((_single_filename(s, "png"), png_bytes))
        if len(png_entries) == 1:
            return png_entries[0][1], "image/png", png_entries[0][0]
        return _build_zip(png_entries), "application/zip", multi_name

    if fmt == "v3000":
        v3000_entries: list[tuple[str, bytes]] = []
        for s in substances:
            mol_bytes = await run_in_jvm_thread(
                _generate_v3000_sync, s.get("smiles", "")
            )
            if mol_bytes:
                v3000_entries.append((_single_filename(s, "v3000"), mol_bytes))
        if len(v3000_entries) == 1:
            return v3000_entries[0][1], "chemical/x-mdl-molfile", v3000_entries[0][0]
        return _build_zip(v3000_entries), "application/zip", multi_name

    # Plan 10 EXPO-08: "rxn" is handled by generate_reactions_export. The
    # router intercepts rxn before generate_export is called; reaching here
    # with fmt=="rxn" is a contract violation handled via the 422 path.
    raise HTTPException(status_code=422, detail=f"Unknown export format: {fmt}")


async def generate_reactions_export(
    reactions: list[dict], fmt: str
) -> tuple[bytes, str, str]:
    """Generate export content for reaction formats (Plan 10 EXPO-08).

    Sibling to ``generate_export`` (which handles substance formats only).
    The router dispatches to one or the other based on ``payload.format``;
    the two functions have disjoint format sets and never share inputs.

    Currently only 'rxn' is supported for reactions. When ``reactions`` has
    a single eligible entry, the filename is ``reaction.rxn`` and the media
    type is ``chemical/x-mdl-rxnfile``; multiple reactions produce
    ``reactions.rdf`` with ``chemical/x-mdl-rdfile`` (the CDK-native multi
    -record container -- MDLRDFWriter is absent from the bundled JAR per
    D-22 amended). Empty or entirely-unparseable reaction lists fall back
    to ``_generate_rxn_stub`` so clients always get a valid RDfile header.
    """
    if fmt == "rxn":
        content = await run_in_jvm_thread(_generate_rxn_sync, reactions)
        if not content:
            # Fallback: zero eligible reactions -> original stub header
            content = _generate_rxn_stub()
        if len(reactions) <= 1:
            return content, "chemical/x-mdl-rxnfile", "reaction.rxn"
        return content, "chemical/x-mdl-rdfile", "reactions.rdf"
    raise ValueError(f"Unsupported reaction export format: {fmt}")
