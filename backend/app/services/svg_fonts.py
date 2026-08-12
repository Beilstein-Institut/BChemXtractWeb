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

import logging
from dataclasses import dataclass

from lxml import etree

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
