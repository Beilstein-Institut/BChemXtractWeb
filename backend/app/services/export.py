"""Export format generators for POST /api/export.

All seven export formats are implemented here:
  - SDF: CDK SDFWriter (JVM thread required)
  - JSON: pure Python dict serialization
  - CSV: pure Python csv stdlib
  - PNG: CDK DepictionGenerator.toImg() + ImageIO (JVM thread required)
  - SVG: served from stored `svg` field (pure Python)
  - CML: lxml CML 2.4 XML (pure Python — CMLWriter is absent from JAR)
  - V3000: CDK MDLV3000Writer (JVM thread required)
  - RXN: empty RDF stub (D-11, Phase 10 will populate)

Per D-08: single unified generate_export() function dispatches to per-format helpers.
Per D-09: CDK/Java handles SDF, V3000, PNG. Python handles JSON, CSV, SVG, CML.
Per D-10: PNG uses CDK DepictionGenerator (same CDK pipeline as stored svg field).

Security:
  T-08-03: CDK SmilesParser exceptions caught per-molecule — never crash full export.
  T-08-04: ZIP entry filenames sanitized in _build_zip() against path traversal.
  T-08-05: PNG export hard-limited to 200 structures.
"""

import csv
import io
import json
import logging
import zipfile
from datetime import date

from fastapi import HTTPException
from lxml import etree

from app.services.jvm_bridge import run_in_jvm_thread

_logger = logging.getLogger(__name__)

_PNG_LIMIT = 200

CML_NS = "http://www.xml-cml.org/schema"

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
        "cml": "cml",
        "v3000": "mol",
        "rxn": "rxn",
    }
    return f"{prefix}_{fmt}.{exts.get(fmt, 'dat')}"


def _zip_filename(fmt: str) -> str:
    """Multi-structure ZIP filename: bchemxtract_export_{fmt}_{YYYYMMDD}.zip"""
    return f"bchemxtract_export_{fmt}_{date.today().strftime('%Y%m%d')}.zip"


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
    from app.services.filenames import (  # local import avoids cycle
        safe_filename,
    )

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

    SDFWriter = jpype.JClass("org.openscience.cdk.io.SDFWriter")
    StringWriter = jpype.JClass("java.io.StringWriter")
    SmilesParser = jpype.JClass("org.openscience.cdk.smiles.SmilesParser")
    SilentChemObjectBuilder = jpype.JClass(
        "org.openscience.cdk.silent.SilentChemObjectBuilder"
    )
    StructureDiagramGenerator = jpype.JClass(
        "org.openscience.cdk.layout.StructureDiagramGenerator"
    )

    builder = SilentChemObjectBuilder.getInstance()
    parser = SmilesParser(builder)
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
            except Exception:
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


def _generate_png_sync(smiles: str, width: int = 450, height: int = 450) -> bytes:
    """Generate PNG bytes for one molecule via CDK DepictionGenerator.

    Must run inside run_in_jvm_thread. Returns b'' on failure.

    D-10 compliance: uses CDK DepictionGenerator (same pipeline as stored `svg`
    field), not cairosvg or svglib (not in conda env). Consistent visual output.

    Args:
        smiles: SMILES string for the molecule.
        width: Image width in pixels (default 450).
        height: Image height in pixels (default 450).

    Returns:
        PNG bytes or b'' if SMILES is empty or parsing fails.
    """
    if not smiles:
        return b""

    import jpype

    try:
        SmilesParser = jpype.JClass("org.openscience.cdk.smiles.SmilesParser")
        SilentChemObjectBuilder = jpype.JClass(
            "org.openscience.cdk.silent.SilentChemObjectBuilder"
        )
        DepictionGenerator = jpype.JClass("org.openscience.cdk.depict.DepictionGenerator")
        StandardGenerator = jpype.JClass(
            "org.openscience.cdk.renderer.generators.standard.StandardGenerator"
        )
        SymbolVisibility = jpype.JClass(
            "org.openscience.cdk.renderer.SymbolVisibility"
        )
        StructureDiagramGenerator = jpype.JClass(
            "org.openscience.cdk.layout.StructureDiagramGenerator"
        )
        ByteArrayOutputStream = jpype.JClass("java.io.ByteArrayOutputStream")
        ImageIO = jpype.JClass("javax.imageio.ImageIO")

        builder = SilentChemObjectBuilder.getInstance()
        mol = SmilesParser(builder).parseSmiles(smiles)
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
        img = dg.depict(sdg.getMolecule()).toImg()
        baos = ByteArrayOutputStream()
        ImageIO.write(img, "PNG", baos)
        return bytes(baos.toByteArray())
    except Exception:
        _logger.debug(
            "PNG generation failed for SMILES %r — returning empty bytes", smiles[:40]
        )
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
        SmilesParser = jpype.JClass("org.openscience.cdk.smiles.SmilesParser")
        SilentChemObjectBuilder = jpype.JClass(
            "org.openscience.cdk.silent.SilentChemObjectBuilder"
        )
        StructureDiagramGenerator = jpype.JClass(
            "org.openscience.cdk.layout.StructureDiagramGenerator"
        )
        MDLV3000Writer = jpype.JClass("org.openscience.cdk.io.MDLV3000Writer")
        StringWriter = jpype.JClass("java.io.StringWriter")

        builder = SilentChemObjectBuilder.getInstance()
        mol = SmilesParser(builder).parseSmiles(smiles)
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
    except Exception:
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
        except Exception:  # pragma: no cover - depends on CDK variant
            ReactionSet = jpype.JClass(  # noqa: N806
                "org.openscience.cdk.ReactionSet"
            )
        StructureDiagramGenerator = jpype.JClass(  # noqa: N806
            "org.openscience.cdk.layout.StructureDiagramGenerator"
        )
        MDLRXNWriter = jpype.JClass(  # noqa: N806
            "org.openscience.cdk.io.MDLRXNWriter"
        )
        StringWriter = jpype.JClass("java.io.StringWriter")  # noqa: N806

        builder = SilentChemObjectBuilder.getInstance()
        parser = SmilesParser(builder)
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
                        try:
                            sdg.setMolecule(mol)
                            sdg.generateCoordinates()
                        except Exception:
                            # Per-component layout failure -- MDLRXNWriter
                            # will still write what it has.
                            pass
                rxn_set.addReaction(reaction)
            except Exception:
                _logger.debug(
                    "Skipping reaction during RXN export: unparseable smiles %r",
                    r.get("reaction_smiles", "")[:80],
                )
                continue

        if rxn_set.getReactionCount() == 0:
            return b""

        sw = StringWriter()
        writer = MDLRXNWriter(sw)
        try:
            writer.write(rxn_set)
        finally:
            writer.close()
        return str(sw.toString()).encode("utf-8")
    except Exception as exc:
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


def _generate_svg_zip(substances: list[dict]) -> bytes:
    """ZIP of CDK SVGs from stored `svg` field. Pure Python.

    Filename construction uses inchi_key prefix + sequential index directly
    to ensure unique ZIP entry names (avoids silent overwrites from identical
    InChI key prefixes).

    Args:
        substances: List of substance dicts with ``svg`` and ``inchi_key`` fields.

    Returns:
        ZIP bytes containing one .svg file per substance that has SVG content.
    """
    entries = []
    for i, s in enumerate(substances):
        svg_content = s.get("svg", "")
        if not svg_content:
            continue
        inchi_key = s.get("inchi_key", "")
        prefix = inchi_key[:8] if inchi_key else f"substance_{s.get('id', 0):04d}"
        filename = f"{prefix}_{i:04d}.svg"
        entries.append((filename, svg_content.encode("utf-8")))
    return _build_zip(entries)


def _generate_cml_single(substance: dict) -> bytes:
    """CML 2.4 document for one substance. Pure Python — no JVM needed.

    CMLWriter is absent from the BChemXtract fat JAR (cdk-libiocml module
    excluded). Uses lxml to build valid CML 2.4 XML instead (Pitfall 1).

    Args:
        substance: Substance dict with id, molecular_formula, smiles, inchi.

    Returns:
        UTF-8 encoded CML XML bytes with XML declaration.
    """
    root = etree.Element(f"{{{CML_NS}}}cml", nsmap={"cml": CML_NS})
    mol = etree.SubElement(
        root, f"{{{CML_NS}}}molecule", id=f"m_{substance.get('id', 0)}"
    )
    if substance.get("molecular_formula"):
        etree.SubElement(
            mol, f"{{{CML_NS}}}formula", concise=substance["molecular_formula"]
        )
    if substance.get("smiles"):
        ident = etree.SubElement(mol, f"{{{CML_NS}}}identifier")
        ident.set("convention", "daylight:smiles")
        ident.set("value", substance["smiles"])
    if substance.get("inchi"):
        ident2 = etree.SubElement(mol, f"{{{CML_NS}}}identifier")
        ident2.set("convention", "iupac:inchi")
        ident2.set("value", substance["inchi"])
    return etree.tostring(
        root, pretty_print=True, xml_declaration=True, encoding="UTF-8"
    )


def _generate_rxn_stub() -> bytes:
    """RXN/RDfile stub. Returns minimal valid RDF header with current date.

    Reaction data will be populated in Phase 10 (D-11). Returns only the
    RDfile header so the response has valid Content-Type: chemical/x-mdl-rdfile.

    IN-01: $DATM is generated at call time so exported files are stamped with
    the actual download date rather than the hardcoded development date.

    Returns:
        Minimal RDF header bytes.
    """
    datm = date.today().strftime("%Y/%m/%d")
    return f"$RDFILE 1\n$DATM    {datm}\n".encode()


# ---------------------------------------------------------------------------
# Top-level dispatcher
# ---------------------------------------------------------------------------


async def generate_export(
    substances: list[dict],
    fmt: str,
) -> tuple[bytes, str, str]:
    """Generate export bytes for the given format.

    Dispatches to the appropriate format generator. JVM-dependent formats
    (sdf, png, v3000) are dispatched via run_in_jvm_thread. Pure Python
    formats (json, csv, svg, cml, rxn) run directly.

    Args:
        substances: List of substance dicts from the ORM layer.
        fmt: Export format string (validated upstream by Pydantic ExportRequest).

    Returns:
        Tuple of (content_bytes, media_type, filename).

    Raises:
        HTTPException 400: PNG export exceeds _PNG_LIMIT substances.
        HTTPException 422: Unknown format (Pydantic should catch this upstream).
    """
    multi_name = _zip_filename(fmt)

    if fmt == "sdf":
        content = await run_in_jvm_thread(_generate_sdf_sync, substances)
        if len(substances) == 1:
            filename = _single_filename(substances[0], "sdf")
        else:
            filename = multi_name.replace(".zip", ".sdf")
        return content, "chemical/x-mdl-sdfile", filename

    elif fmt == "json":
        content = _generate_json(substances)
        return content, "application/json", multi_name.replace(".zip", ".json")

    elif fmt == "csv":
        content = _generate_csv(substances)
        return content, "text/csv", multi_name.replace(".zip", ".csv")

    elif fmt == "svg":
        content = _generate_svg_zip(substances)
        return content, "application/zip", multi_name

    elif fmt == "cml":
        entries = [
            (_single_filename(s, "cml"), _generate_cml_single(s))
            for s in substances
            if s.get("smiles") or s.get("inchi")
        ]
        content = _build_zip(entries)
        return content, "application/zip", multi_name

    elif fmt == "png":
        if len(substances) > _PNG_LIMIT:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"PNG export is limited to {_PNG_LIMIT} structures at a time. "
                    "Select fewer structures or use SDF/SVG for bulk export."
                ),
            )
        entries = []
        for s in substances:
            png_bytes = await run_in_jvm_thread(
                _generate_png_sync, s.get("smiles", "")
            )
            if png_bytes:
                entries.append((_single_filename(s, "png"), png_bytes))
        if len(entries) == 1:
            return entries[0][1], "image/png", entries[0][0]
        content = _build_zip(entries)
        return content, "application/zip", multi_name

    elif fmt == "v3000":
        entries = []
        for s in substances:
            mol_bytes = await run_in_jvm_thread(
                _generate_v3000_sync, s.get("smiles", "")
            )
            if mol_bytes:
                entries.append((_single_filename(s, "v3000"), mol_bytes))
        if len(entries) == 1:
            return entries[0][1], "chemical/x-mdl-molfile", entries[0][0]
        content = _build_zip(entries)
        return content, "application/zip", multi_name

    else:
        # Plan 10 EXPO-08: "rxn" is handled by generate_reactions_export.
        # The router intercepts rxn before generate_export is called. If a
        # caller reaches here with fmt=="rxn", that is a contract violation
        # and the 422 path is the correct failure mode.
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
