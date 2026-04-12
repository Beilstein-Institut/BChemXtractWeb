"""Tests for CDX/CDXML file format detection.

Pure Python tests -- no JVM needed.
"""

import pytest
from app.errors import FormatDetectionError
from app.services.format_detector import detect_format


class TestDetectFormat:
    """Tests for the detect_format function."""

    def test_detects_cdx_binary(self):
        """CDX files start with VjCD magic bytes."""
        assert detect_format(b"VjCD" + b"\x00" * 100) == "cdx"

    def test_detects_cdxml_with_xml_declaration(self):
        """CDXML with standard <?xml ...> declaration."""
        assert detect_format(b'<?xml version="1.0"?><CDXML>') == "cdxml"

    def test_detects_cdxml_without_declaration(self):
        """CDXML starting directly with <CDXML> tag (no XML prolog)."""
        assert detect_format(b"<CDXML>...</CDXML>") == "cdxml"

    def test_detects_cdxml_with_bom(self):
        """CDXML with UTF-8 BOM prefix."""
        assert detect_format(b"\xef\xbb\xbf<?xml version='1.0'?>") == "cdxml"

    def test_rejects_unknown_format(self):
        """Non-CDX/CDXML content raises FormatDetectionError."""
        with pytest.raises(FormatDetectionError):
            detect_format(b"not a valid file format at all")

    def test_rejects_empty_file(self):
        """Empty bytes raise FormatDetectionError."""
        with pytest.raises(FormatDetectionError):
            detect_format(b"")

    def test_rejects_too_small_file(self):
        """Files smaller than 4 bytes raise FormatDetectionError with 'too small'."""
        with pytest.raises(FormatDetectionError, match="too small"):
            detect_format(b"ab")

    def test_cdx_magic_exact_boundary(self):
        """Exactly 4 bytes matching VjCD is valid CDX."""
        assert detect_format(b"VjCD") == "cdx"


class TestSubstanceResponse:
    """Tests for SubstanceResponse Pydantic model."""

    def test_has_all_fields_with_defaults(self):
        """SubstanceResponse has 9 fields, all with non-null defaults."""
        from app.models.chemistry import SubstanceResponse

        s = SubstanceResponse()
        assert s.inchi == ""
        assert s.inchi_key == ""
        assert s.smiles == ""
        assert s.extended_smiles == ""
        assert s.iupac_name == ""
        assert s.molecular_formula == ""
        assert s.aux_info == ""
        assert s.mdlv3000 == ""
        assert s.abbreviations == {}


class TestReactionResponse:
    """Tests for ReactionResponse Pydantic model."""

    def test_has_all_fields_with_defaults(self):
        """ReactionResponse has 10 fields, all with non-null defaults."""
        from app.models.chemistry import ReactionResponse

        r = ReactionResponse()
        assert r.rinchi == ""
        assert r.rinchi_key == ""
        assert r.short_rinchi_key == ""
        assert r.long_rinchi_key == ""
        assert r.web_rinchi_key == ""
        assert r.reaction_smiles == ""
        assert r.aux_info == ""
        assert r.reactants == []
        assert r.products == []
        assert r.agents == []


class TestReactionComponentResponse:
    """Tests for ReactionComponentResponse Pydantic model."""

    def test_has_all_fields(self):
        """ReactionComponentResponse has 2 str and 4 float fields."""
        from app.models.chemistry import ReactionComponentResponse

        c = ReactionComponentResponse()
        assert c.inchi == ""
        assert c.inchi_key == ""
        assert c.cdx_top == 0.0
        assert c.cdx_left == 0.0
        assert c.cdx_bottom == 0.0
        assert c.cdx_right == 0.0


class TestSubstanceInfoResponse:
    """Tests for SubstanceInfoResponse Pydantic model."""

    def test_has_three_int_fields_defaulting_to_zero(self):
        """SubstanceInfoResponse has 3 int fields defaulting to 0."""
        from app.models.chemistry import SubstanceInfoResponse

        info = SubstanceInfoResponse()
        assert info.no_fragments == 0
        assert info.no_inchis == 0
        assert info.no_substances == 0


class TestHealthResponse:
    """Tests for HealthResponse Pydantic model."""

    def test_has_status_field(self):
        """HealthResponse has a status string field."""
        from app.models.health import HealthResponse

        h = HealthResponse(status="ok")
        assert h.status == "ok"


class TestHealthDetailResponse:
    """Tests for HealthDetailResponse Pydantic model."""

    def test_has_all_fields(self):
        """HealthDetailResponse has all 10 fields."""
        from app.models.health import HealthDetailResponse

        h = HealthDetailResponse(status="ok", jvm_running=True)
        assert h.status == "ok"
        assert h.jvm_running is True
        assert h.jvm_version is None
        assert h.jar_version == ""
        assert h.heap_max_mb == 0
        assert h.heap_used_mb == 0
        assert h.heap_free_mb == 0
        assert h.available_processors == 0
        assert h.thread_pool_workers == 0
        assert h.thread_pool_active == 0
