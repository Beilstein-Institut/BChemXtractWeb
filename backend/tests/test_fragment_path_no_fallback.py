"""Fragment path must NOT cross-fallback svg -> svg_cdx when CDK layout fails.

Unit-level test that exercises ``_extract_fragments_from_document`` directly
so we do NOT wait on the ~60 s ``xtractUnique`` timeout or pay for a
giant-dendrimer re-render. Any parseable CDX produces at least one fragment,
which is enough to lock in the no-cross-fallback contract at line 693 of
``extractor.py``.
"""

from unittest.mock import patch

import pytest

from app.services import extractor
from app.services.jvm_bridge import run_in_jvm_thread


@pytest.mark.asyncio
async def test_fragment_path_empty_svg_when_cdk_layout_fails(
    started_app,
    cdx_file_bytes,
):
    """With the CDK re-layout helper mocked to always fail (return ``""``),
    the fragment path must leave ``svg`` empty — NOT fall back to ``svg_cdx``.

    The pre-Task-4 line was ``svg = _render_with_cdk_layout(component)
    or svg_cdx`` which silently re-labels the ChemDraw-original render as a
    CDK layout, corrupting the toggle semantics the frontend relies on.
    """

    def _run() -> list[dict]:
        document = extractor._read_document(cdx_file_bytes, "cdx")
        with patch.object(
            extractor, "_render_with_cdk_layout", return_value=""
        ):
            results, _info = extractor._extract_fragments_from_document(document)
        return results

    results = await run_in_jvm_thread(_run)

    assert results, "fragment path should produce at least one substance"
    for d in results:
        # svg_cdx should still be populated from _render_atom_container_svg
        # (the original-coords render is independent of the CDK-layout one).
        assert d["svg_cdx"], "ChemDraw original coords should still render"
        # svg must stay empty — NOT falling back to svg_cdx.
        assert d["svg"] == "", (
            "svg must stay empty when CDK layout fails; cross-fallback "
            "would corrupt the CDK/ChemDraw semantics"
        )
