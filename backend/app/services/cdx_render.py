"""Faithful ChemDraw (.cdx/.cdxml) -> SVG via the cdx-render jar (JPype).

Calls org.beilstein.chemxtract.render.CdxSvgRenderer.toSvg on an abandonable
JVM thread so a pathological document cannot pin a worker. The returned SVG is
sanitized here (like every other SVG-producing service in this backend), so
callers get render-safe markup without having to remember to sanitize.
"""

from __future__ import annotations

import jpype

from app.config import settings
from app.services.depiction import sanitize_svg
from app.services.jvm_bridge import run_in_jvm_thread_abandonable


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
    return sanitize_svg(svg)
