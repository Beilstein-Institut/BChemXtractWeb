"""Lazy on-view backfill for missing substance SVG layouts.

Old extractions (pre-fast-path-dual-render) have ``svg_cdx = ""`` even
when their MDL V3000 molblock is present. Rather than a big one-shot
migration, we render the missing layouts on the first history view and
persist them — self-healing, eventually consistent, and every
subsequent view is fast.

Contract: :func:`render_svgs_from_mdlv3000` never raises. Render
failures leave the corresponding field empty so the frontend disables
the appropriate layout button with a clear tooltip.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Protocol

import jpype

from app.services.depiction import (
    render_substance_svg,
    render_substance_svg_cdk_layout,
)
from app.services.jvm_bridge import run_in_jvm_thread_abandonable

logger = logging.getLogger(__name__)


class _SubstanceLike(Protocol):
    svg: str
    svg_cdx: str
    mdlv3000: str


@dataclass
class BackfilledSvgs:
    """Result of a backfill attempt."""

    svg: str
    svg_cdx: str
    changed: bool


def _parse_mdlv3000_to_container(molblock: str):
    """Parse an MDL V3000 molblock into a CDK IAtomContainer.

    Must run inside a JVM-attached thread.
    """
    MDLV3000Reader = jpype.JClass(  # noqa: N806
        "org.openscience.cdk.io.MDLV3000Reader"
    )
    AtomContainer = jpype.JClass(  # noqa: N806
        "org.openscience.cdk.silent.AtomContainer"
    )

    reader = MDLV3000Reader(jpype.java.io.StringReader(molblock))
    try:
        container = AtomContainer()
        return reader.read(container)
    finally:
        reader.close()


class _ContainerHolder:
    """Wraps a plain IAtomContainer with a ``getAtomContainer()`` method so
    the same depiction helpers (which expect a BCXSubstance-shaped object)
    can be reused without branching."""

    def __init__(self, container):
        self._c = container

    def getAtomContainer(self):  # noqa: N802 — Java-style name for duck typing
        return self._c


async def render_svgs_from_mdlv3000(sub: _SubstanceLike) -> BackfilledSvgs:
    """Render missing ``svg`` / ``svg_cdx`` for ``sub`` from its molblock.

    Populated fields are passed through untouched. Parse or render
    failures leave the field empty. Never raises.
    """
    # Nothing to do when both fields are already populated.
    if sub.svg and sub.svg_cdx:
        return BackfilledSvgs(svg=sub.svg, svg_cdx=sub.svg_cdx, changed=False)

    # Nothing we can do without a molblock.
    if not sub.mdlv3000:
        return BackfilledSvgs(svg=sub.svg, svg_cdx=sub.svg_cdx, changed=False)

    def _do_render() -> tuple[str, str]:
        try:
            container = _parse_mdlv3000_to_container(sub.mdlv3000)
        except Exception as exc:  # noqa: BLE001
            logger.warning("MDL V3000 parse failed during backfill: %s", exc)
            return sub.svg, sub.svg_cdx

        holder = _ContainerHolder(container)
        new_svg = sub.svg or render_substance_svg_cdk_layout(holder)
        new_svg_cdx = sub.svg_cdx or render_substance_svg(holder)
        return new_svg, new_svg_cdx

    try:
        new_svg, new_svg_cdx = await run_in_jvm_thread_abandonable(
            _do_render, label="svg-backfill"
        )
    except Exception as exc:  # noqa: BLE001 — contract: never raise
        logger.warning("SVG backfill failed for substance: %s", exc)
        return BackfilledSvgs(svg=sub.svg, svg_cdx=sub.svg_cdx, changed=False)

    changed = new_svg != sub.svg or new_svg_cdx != sub.svg_cdx
    return BackfilledSvgs(svg=new_svg, svg_cdx=new_svg_cdx, changed=changed)
