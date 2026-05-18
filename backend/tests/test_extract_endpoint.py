"""Integration tests for POST /api/extract endpoint.

Per D-11: these tests run against the real JVM with BChemXtract JAR.
The started_app fixture (conftest.py) triggers JVM startup via lifespan.
"""

from httpx import AsyncClient


class TestUploadCDX:
    """Tests for CDX binary file upload (UPLD-01, UPLD-03, DISP-01, DISP-02)."""

    async def test_upload_cdx(
        self, client_csrf: AsyncClient, cdx_file_bytes: bytes
    ) -> None:
        """Upload a CDX file and verify extraction returns substances.

        UPLD-01: User can upload a CDX file.
        """
        response = await client_csrf.post(
            "/api/extract",
            files={
                "file": (
                    "L-lactic-acid.cdx",
                    cdx_file_bytes,
                    "chemical/x-cdx",
                )
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert "substances" in data
        assert len(data["substances"]) > 0

    async def test_response_has_format_and_count(
        self, client_csrf: AsyncClient, cdx_file_bytes: bytes
    ) -> None:
        """Response includes format type and structure count (UPLD-03)."""
        response = await client_csrf.post(
            "/api/extract",
            files={
                "file": (
                    "L-lactic-acid.cdx",
                    cdx_file_bytes,
                    "chemical/x-cdx",
                )
            },
        )
        data = response.json()
        assert data["format"] == "cdx"
        assert data["structure_count"] >= 1
        assert data["structure_count"] == len(data["substances"])

    async def test_response_has_timing(
        self, client_csrf: AsyncClient, cdx_file_bytes: bytes
    ) -> None:
        """Response includes extraction_time_ms (UPLD-02/D-04)."""
        response = await client_csrf.post(
            "/api/extract",
            files={
                "file": (
                    "L-lactic-acid.cdx",
                    cdx_file_bytes,
                    "chemical/x-cdx",
                )
            },
        )
        data = response.json()
        assert "extraction_time_ms" in data
        assert isinstance(data["extraction_time_ms"], (int, float))
        assert data["extraction_time_ms"] > 0

    async def test_response_has_file_metadata(
        self, client_csrf: AsyncClient, cdx_file_bytes: bytes
    ) -> None:
        """Response includes filename and file_size (D-09)."""
        response = await client_csrf.post(
            "/api/extract",
            files={
                "file": (
                    "L-lactic-acid.cdx",
                    cdx_file_bytes,
                    "chemical/x-cdx",
                )
            },
        )
        data = response.json()
        assert data["filename"] == "L-lactic-acid.cdx"
        assert data["file_size"] == len(cdx_file_bytes)

    async def test_substances_have_metadata(
        self, client_csrf: AsyncClient, cdx_file_bytes: bytes
    ) -> None:
        """Each substance has SMILES, InChI, InChI key, formula (DISP-02)."""
        response = await client_csrf.post(
            "/api/extract",
            files={
                "file": (
                    "L-lactic-acid.cdx",
                    cdx_file_bytes,
                    "chemical/x-cdx",
                )
            },
        )
        data = response.json()
        for substance in data["substances"]:
            # All fields must be present (may be empty string for edge cases)
            assert "smiles" in substance
            assert "inchi" in substance
            assert "inchi_key" in substance
            assert "molecular_formula" in substance
            # L-lactic-acid should have real values
            assert substance["smiles"] != ""
            assert substance["inchi"] != ""
            assert substance["inchi_key"] != ""
            assert substance["molecular_formula"] != ""
            # PRIV-13 / D-22: first_seen_at must not leak into the response
            # — the column stays in the DB but the API hides it to avoid
            # leaking cross-session dedup-presence information.
            assert "first_seen_at" not in substance, (
                f"first_seen_at leaked into API response: {substance}"
            )

    async def test_substances_have_svg(
        self, client_csrf: AsyncClient, cdx_file_bytes: bytes
    ) -> None:
        """Each substance has an SVG depiction string (DISP-01)."""
        response = await client_csrf.post(
            "/api/extract",
            files={
                "file": (
                    "L-lactic-acid.cdx",
                    cdx_file_bytes,
                    "chemical/x-cdx",
                )
            },
        )
        data = response.json()
        for substance in data["substances"]:
            assert "svg" in substance
            # SVG should contain valid SVG markup (non-empty for real
            # substances)
            svg = substance["svg"]
            # D-03: may be empty if CDK fails, but for L-lactic-acid
            # it should work
            if svg:
                assert "<svg" in svg
                assert "</svg>" in svg

    async def test_response_has_info(
        self, client_csrf: AsyncClient, cdx_file_bytes: bytes
    ) -> None:
        """Response includes SubstanceInfoResponse statistics."""
        response = await client_csrf.post(
            "/api/extract",
            files={
                "file": (
                    "L-lactic-acid.cdx",
                    cdx_file_bytes,
                    "chemical/x-cdx",
                )
            },
        )
        data = response.json()
        info = data["info"]
        assert "no_fragments" in info
        assert "no_inchis" in info
        assert "no_substances" in info


class TestUploadCDXML:
    """Tests for CDXML file upload."""

    async def test_upload_cdxml(
        self, client_csrf: AsyncClient, cdxml_file_bytes: bytes
    ) -> None:
        """Upload a CDXML file and verify extraction returns substances."""
        response = await client_csrf.post(
            "/api/extract",
            files={
                "file": (
                    "test_fixture.cdxml",
                    cdxml_file_bytes,
                    "chemical/x-cdxml",
                )
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["format"] == "cdxml"
        assert len(data["substances"]) > 0

    async def test_cdxml_substances_have_svg(
        self, client_csrf: AsyncClient, cdxml_file_bytes: bytes
    ) -> None:
        """CDXML substances also get SVG depictions."""
        response = await client_csrf.post(
            "/api/extract",
            files={
                "file": (
                    "test_fixture.cdxml",
                    cdxml_file_bytes,
                    "chemical/x-cdxml",
                )
            },
        )
        data = response.json()
        # At least some substances should have SVGs
        svgs = [s["svg"] for s in data["substances"] if s["svg"]]
        assert len(svgs) > 0, "No substances had SVG depictions"


class TestFileSizeValidation:
    """Tests for file size limit (UPLD-04, D-05)."""

    async def test_oversize_file_rejected(
        self,
        client_csrf: AsyncClient,
    ) -> None:
        """File exceeding 50 MB is rejected with HTTP 413 (UPLD-04)."""
        # Create a file just over the limit (50 MB + 1 byte)
        oversized = b"VjCD" + b"\x00" * (50 * 1024 * 1024 - 3)
        response = await client_csrf.post(
            "/api/extract",
            files={
                "file": (
                    "huge.cdx",
                    oversized,
                    "chemical/x-cdx",
                )
            },
        )
        assert response.status_code == 413
        data = response.json()
        # D-17: unified ErrorResponse shape — ``detail`` + ``code``.
        assert "detail" in data
        assert data.get("code") == "FILE_TOO_LARGE"
        assert "50 MB" in data["detail"] or "size limit" in data["detail"].lower()


class TestFormatRejection:
    """Tests for unsupported format detection."""

    async def test_unsupported_format_rejected(
        self,
        client_csrf: AsyncClient,
    ) -> None:
        """Non-CDX/CDXML file returns HTTP 415."""
        response = await client_csrf.post(
            "/api/extract",
            files={
                "file": (
                    "test.pdf",
                    b"%PDF-1.4 fake pdf content here",
                    "application/pdf",
                )
            },
        )
        assert response.status_code == 415
        data = response.json()
        # D-17: unified ErrorResponse shape — ``detail`` + ``code``.
        assert "detail" in data
        assert data.get("code") == "UNSUPPORTED_FORMAT"


class TestExtensionMismatch:
    """Tests for extension mismatch warnings (D-07)."""

    async def test_extension_mismatch_warning(
        self, client_csrf: AsyncClient, cdxml_file_bytes: bytes
    ) -> None:
        """File named .cdx but detected as CDXML produces a warning."""
        response = await client_csrf.post(
            "/api/extract",
            files={
                "file": (
                    "misnamed.cdx",
                    cdxml_file_bytes,
                    "chemical/x-cdxml",
                )
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["warnings"]) > 0
        assert any("CDX binary" in w or "CDXML" in w for w in data["warnings"])

    async def test_matching_extension_no_warning(
        self, client_csrf: AsyncClient, cdx_file_bytes: bytes
    ) -> None:
        """Correctly named .cdx file produces no warnings."""
        response = await client_csrf.post(
            "/api/extract",
            files={
                "file": (
                    "correct.cdx",
                    cdx_file_bytes,
                    "chemical/x-cdx",
                )
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["warnings"]) == 0


class TestResponseShape:
    """Tests for the D-10 response shape contract."""

    async def test_full_response_shape(
        self, client_csrf: AsyncClient, cdx_file_bytes: bytes
    ) -> None:
        """Response matches the D-10 shape exactly."""
        response = await client_csrf.post(
            "/api/extract",
            files={
                "file": (
                    "L-lactic-acid.cdx",
                    cdx_file_bytes,
                    "chemical/x-cdx",
                )
            },
        )
        data = response.json()
        # Top-level required fields
        required_fields = [
            "substances",
            "info",
            "format",
            "filename",
            "file_size",
            "structure_count",
            "extraction_time_ms",
            "warnings",
        ]
        for field in required_fields:
            assert field in data, f"Missing required field: {field}"

        # Substance fields
        if data["substances"]:
            substance = data["substances"][0]
            substance_fields = [
                "inchi",
                "inchi_key",
                "smiles",
                "extended_smiles",
                "iupac_name",
                "molecular_formula",
                "aux_info",
                "mdlv3000",
                "abbreviations",
                "svg",
            ]
            for field in substance_fields:
                assert field in substance, f"Missing substance field: {field}"

        # Info fields
        info_fields = [
            "no_fragments",
            "no_inchis",
            "no_substances",
        ]
        for field in info_fields:
            assert field in data["info"], f"Missing info field: {field}"
