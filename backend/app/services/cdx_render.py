"""Faithful ChemDraw (.cdx/.cdxml) -> SVG via the cdx-render jar (JPype).

Calls org.beilstein.chemxtract.render.CdxSvgRenderer.toSvg on an abandonable
JVM thread so a pathological document cannot pin a worker. The returned SVG is
sanitized here (like every other SVG-producing service in this backend), so
callers get render-safe markup without having to remember to sanitize.

sanitize_svg is called with strip_backdrop=False: unlike CDK's depiction
output, this Batik-backed faithful render can legitimately contain white,
unstroked <rect/> elements used as occlusion masks in the original ChemDraw
drawing -- stripping them (as the default CDK-oriented behavior does) would
corrupt the faithful layout. The XSS-focused strips still always run.

The returned SVG also carries its own fonts (embed_subset_fonts): the viewer
shows it as an <img> blob, where page CSS and @font-face never apply, and
users separately download both the .svg and a canvas-rasterized .png -- in
every one of those paths a client-side font substitution would drift text
runs from the positions the JVM measured them at.
"""

from __future__ import annotations

import jpype

from app.config import settings
from app.services.depiction import sanitize_svg
from app.services.jvm_bridge import run_in_jvm_thread_abandonable
from app.services.svg_fonts import embed_subset_fonts


def _render_sync(cdx_bytes: bytes, scale: float) -> str:
    renderer = jpype.JClass("org.beilstein.chemxtract.render.CdxSvgRenderer")
    jbytes = jpype.JArray(jpype.JByte)(cdx_bytes)
    svg_bytes = renderer.toSvg(jbytes, scale)
    return bytes(svg_bytes).decode("utf-8")


async def render_cdx_svg(cdx_bytes: bytes, scale: float = 3.0) -> str:
    """Render raw CDX/CDXML bytes to a sanitized SVG string."""
    svg = await run_in_jvm_thread_abandonable(
        _render_sync,
        cdx_bytes,
        scale,
        label="cdx-render",
        timeout=settings.cdx_render_timeout_secs,
    )
    # ponytail: subsetting runs inline on the event loop — it is memoized and
    # costs single-digit ms on a warm cache. Move to run_in_executor if it ever
    # shows up in render latency.
    return sanitize_svg(embed_subset_fonts(svg), strip_backdrop=False)
