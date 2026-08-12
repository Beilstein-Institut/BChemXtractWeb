"""Embed WOFF2 subsets of the renderer's fonts into the faithful CDX SVG.

The cdx-render jar draws text with fonts registered only inside the JVM
(Liberation Sans/Serif/Mono), and Batik emits absolutely-positioned <text>
runs whose x-coordinates were measured with those exact faces. A browser that
lacks them substitutes a local font whose advance widths differ, so runs drift
and subscripts detach from the atom they belong to.

The viewer shows the SVG as an <img> blob, where page CSS and @font-face never
apply, so the face has to travel inside the SVG as a data: URI. Fonts are read
back out of the jar rather than duplicated into the Python tree, which
guarantees the embedded bytes are the same face the JVM measured with.
"""

from __future__ import annotations

import base64
import io
import logging
import re
import zipfile
from dataclasses import dataclass
from functools import lru_cache

from fontTools.subset import Options, Subsetter
from fontTools.ttLib import TTFont
from lxml import etree

from app.services.jvm_bridge import get_cdx_render_jar_path

logger = logging.getLogger(__name__)

_SVG_NS = "http://www.w3.org/2000/svg"

# Our own renderer's output, but parse it defensively anyway: no DTD loading,
# no entity resolution, no network. Batik emits an SVG 1.0 DOCTYPE that would
# otherwise invite an external fetch.
_PARSER = etree.XMLParser(
    resolve_entities=False, load_dtd=False, no_network=True, huge_tree=False
)


@dataclass(frozen=True)
class FaceKey:
    """One concrete font face: family plus the two axes Batik varies."""

    family: str
    bold: bool
    italic: bool


def _inherited(element, attribute: str) -> str | None:
    """Nearest value of ``attribute`` on the element or any ancestor."""
    node = element
    while node is not None:
        value = node.get(attribute)
        if value:
            return value
        node = node.getparent()
    return None


def _is_bold(value: str | None) -> bool:
    if not value:
        return False
    value = value.strip()
    if value in ("bold", "bolder"):
        return True
    return value.isdigit() and int(value) >= 600


def scan_faces(svg: str) -> dict[FaceKey, set[str]]:
    """Map every face used by a <text> element to the characters drawn in it.

    Faces reachable only through inherited attributes on ancestor <g> elements
    are resolved; a family declared on the root but never used by any text (as
    Batik does with 'Dialog') is not reported.
    """
    root = etree.fromstring(svg.encode("utf-8"), parser=_PARSER)
    faces: dict[FaceKey, set[str]] = {}
    for element in root.iter(f"{{{_SVG_NS}}}text"):
        text = "".join(element.itertext())
        if not text:
            continue
        family = _inherited(element, "font-family")
        if not family:
            continue
        key = FaceKey(
            family=family.strip().strip("'\""),
            bold=_is_bold(_inherited(element, "font-weight")),
            italic=(_inherited(element, "font-style") or "").strip()
            in ("italic", "oblique"),
        )
        faces.setdefault(key, set()).update(text)
    return faces


_JAR_FONT_DIR = "org/beilstein/chemxtract/render/fonts/"

# (family, bold, italic) -> the TTF inside the jar. Mirrors FontCreator's
# mapping on the Java side; the two must move together.
_FACE_FILES = {
    ("Liberation Sans", False, False): "LiberationSans-Regular.ttf",
    ("Liberation Sans", True, False): "LiberationSans-Bold.ttf",
    ("Liberation Sans", False, True): "LiberationSans-Italic.ttf",
    ("Liberation Sans", True, True): "LiberationSans-BoldItalic.ttf",
    ("Liberation Serif", False, False): "LiberationSerif-Regular.ttf",
    ("Liberation Serif", True, False): "LiberationSerif-Bold.ttf",
    ("Liberation Serif", False, True): "LiberationSerif-Italic.ttf",
    ("Liberation Serif", True, True): "LiberationSerif-BoldItalic.ttf",
    ("Liberation Mono", False, False): "LiberationMono-Regular.ttf",
    ("Liberation Mono", True, False): "LiberationMono-Bold.ttf",
    ("Liberation Mono", False, True): "LiberationMono-Italic.ttf",
    ("Liberation Mono", True, True): "LiberationMono-BoldItalic.ttf",
}

_SVG_OPEN_RE = re.compile(r"<svg\b[^>]*>")

# fontTools.subset logs one WARNING per table it doesn't know how to subset,
# right before dropping it (see fontTools/subset/__init__.py _subset_glyphs).
# FFTM is FontForge's private build-timestamp table -- present because the
# Liberation masters were built with FontForge -- and it carries no rendering
# information, so dropping it from every embedded face is intentional, not a
# bug to "fix" by keeping it (options.passthrough_tables stays False). This
# feature is a silent best-effort layer, so that expected, harmless drop
# should not log a warning on every single render. The filter matches the
# exact message and the exact table name, so fontTools.subset stays audible
# for anything else it can't subset.
_FFTM_DROPPED_MSG = "%s NOT subset; don't know how to subset; dropped"


class _SuppressFFTMDropWarning(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        return not (record.msg == _FFTM_DROPPED_MSG and record.args == ("FFTM",))


logging.getLogger("fontTools.subset").addFilter(_SuppressFFTMDropWarning())


@lru_cache(maxsize=16)
def _read_face_bytes(filename: str) -> bytes:
    """Read one TTF out of the cdx-render jar (a zip)."""
    jar = get_cdx_render_jar_path()
    if jar is None:
        raise RuntimeError("cdx-render jar not on the classpath")
    with zipfile.ZipFile(jar) as archive:
        return archive.read(_JAR_FONT_DIR + filename)


@lru_cache(maxsize=64)
def _subset_woff2(filename: str, chars: frozenset[str]) -> bytes:
    """Subset one face to `chars` and return it WOFF2-compressed.

    Layout features are dropped deliberately: Java2D measured the text without
    kerning or ligatures (FontCreator never sets TextAttribute.KERNING), so a
    browser applying GPOS kerning would reintroduce exactly the intra-run drift
    this whole change exists to remove.
    """
    font = TTFont(io.BytesIO(_read_face_bytes(filename)))
    options = Options()
    options.layout_features = []
    options.hinting = False
    options.desubroutinize = False
    options.notdef_outline = False
    # Keep the name table: it carries the OFL copyright and license notice,
    # which must travel with the (subsetted) font.
    options.name_IDs = ["*"]
    options.name_legacy = True
    subsetter = Subsetter(options=options)
    subsetter.populate(text="".join(sorted(chars)))
    subsetter.subset(font)
    font.flavor = "woff2"
    buffer = io.BytesIO()
    font.save(buffer)
    return buffer.getvalue()


def _style_block(faces: dict[FaceKey, set[str]]) -> str:
    rules = []
    for key in sorted(faces, key=lambda k: (k.family, k.bold, k.italic)):
        filename = _FACE_FILES.get((key.family, key.bold, key.italic))
        if filename is None:
            logger.warning("no embeddable face for %s; browser will substitute", key)
            continue
        woff2 = _subset_woff2(filename, frozenset(faces[key]))
        encoded = base64.b64encode(woff2).decode("ascii")
        rules.append(
            f"@font-face{{font-family:'{key.family}';"
            f"font-weight:{'bold' if key.bold else 'normal'};"
            f"font-style:{'italic' if key.italic else 'normal'};"
            f"src:url(data:font/woff2;base64,{encoded}) format('woff2')}}"
        )
    if not rules:
        return ""
    # Match Java2D's measurement, which applies neither kerning nor ligatures.
    rules.append("text{font-kerning:none;font-variant-ligatures:none}")
    return '<style type="text/css">' + "".join(rules) + "</style>"


def embed_subset_fonts(svg: str) -> str:
    """Splice WOFF2 subsets of every used face into the SVG.

    Returns the input unchanged on any failure — a font problem must never
    turn a working render into an error response.
    """
    try:
        faces = scan_faces(svg)
        if not faces:
            return svg
        block = _style_block(faces)
        if not block:
            return svg
        match = _SVG_OPEN_RE.search(svg)
        if match is None:
            logger.warning("no <svg> open tag found; skipping font embedding")
            return svg
        # Spliced as text rather than re-serialised through lxml so Batik's
        # DOCTYPE, the data-cdx-* transform attributes, and the integer
        # zero-origin viewBox the frontend highlight parser depends on all
        # survive byte-identical.
        return svg[: match.end()] + block + svg[match.end() :]
    except Exception as exc:  # noqa: BLE001 -- embedding is best-effort
        logger.warning("font embedding skipped: %s", exc, exc_info=True)
        return svg
