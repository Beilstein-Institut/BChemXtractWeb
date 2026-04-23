"""Lazy backfill of missing substance SVGs from stored MDL V3000."""

from dataclasses import dataclass

import pytest

from app.services.svg_backfill import (
    BackfilledSvgs,
    render_svgs_from_mdlv3000,
)


@dataclass
class _Sub:
    svg: str
    svg_cdx: str
    mdlv3000: str


@pytest.mark.asyncio
async def test_backfill_renders_both_when_both_missing(started_app, simple_v3000_block):
    sub = _Sub(svg="", svg_cdx="", mdlv3000=simple_v3000_block)
    result = await render_svgs_from_mdlv3000(sub)
    assert isinstance(result, BackfilledSvgs)
    assert result.changed is True
    assert result.svg and result.svg.startswith(("<?xml", "<svg"))
    assert result.svg_cdx and result.svg_cdx.startswith(("<?xml", "<svg"))


@pytest.mark.asyncio
async def test_backfill_leaves_populated_field_alone(started_app, simple_v3000_block):
    sub = _Sub(svg="<svg>already</svg>", svg_cdx="", mdlv3000=simple_v3000_block)
    result = await render_svgs_from_mdlv3000(sub)
    assert result.changed is True
    assert result.svg == "<svg>already</svg>"  # untouched
    assert result.svg_cdx  # rendered


@pytest.mark.asyncio
async def test_backfill_no_change_when_both_populated():
    sub = _Sub(svg="<svg>a</svg>", svg_cdx="<svg>b</svg>", mdlv3000="whatever")
    result = await render_svgs_from_mdlv3000(sub)
    assert result.changed is False
    assert result.svg == "<svg>a</svg>"
    assert result.svg_cdx == "<svg>b</svg>"


@pytest.mark.asyncio
async def test_backfill_no_molblock_returns_unchanged():
    sub = _Sub(svg="", svg_cdx="", mdlv3000="")
    result = await render_svgs_from_mdlv3000(sub)
    assert result.changed is False
    assert result.svg == ""
    assert result.svg_cdx == ""


@pytest.mark.asyncio
async def test_backfill_malformed_molblock_returns_originals(started_app):
    """Parse failure must return the original values with changed=False —
    the 'never raises' contract demands graceful degradation."""
    sub = _Sub(svg="", svg_cdx="", mdlv3000="NOT A VALID MOLBLOCK")
    result = await render_svgs_from_mdlv3000(sub)
    assert result.changed is False
    assert result.svg == ""
    assert result.svg_cdx == ""
