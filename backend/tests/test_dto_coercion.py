"""Tests for DTO null-coercion functions in the extractor service.

Uses mock Java objects to verify that all nullable fields are coerced
to type-appropriate defaults before Pydantic model construction.
No JVM needed -- pure Python unit tests.
"""

from unittest.mock import MagicMock

from app.services import extractor
from app.services.extractor import (
    _coerce_reaction,
    _coerce_reaction_component,
    _coerce_role,
    _coerce_substance,
    _coerce_substance_info,
    _reaction_smiles_roles,
)


def _make_mock_substance(**overrides) -> MagicMock:
    """Create a mock BCXSubstance with configurable getter returns.

    By default, all nullable String getters return None and
    getAbbreviations returns an empty dict-like mock.

    Args:
        **overrides: Keys are getter method names (without 'get' prefix,
            in camelCase), values are the return values.

    Returns:
        MagicMock mimicking a BCXSubstance Java object.
    """
    mock = MagicMock()
    mock.getInchi.return_value = overrides.get("inchi")
    mock.getInchiKey.return_value = overrides.get("inchiKey")
    mock.getSmiles.return_value = overrides.get("smiles")
    mock.getExtendedSmiles.return_value = overrides.get("extendedSmiles")
    mock.getIupacName.return_value = overrides.get("iupacName")
    mock.getMolecularFormula.return_value = overrides.get("molecularFormula")
    mock.getAuxInfo.return_value = overrides.get("auxInfo")
    mock.getMdlv3000.return_value = overrides.get("mdlv3000")
    mock.getAbbreviations.return_value = overrides.get("abbreviations", {})
    return mock


def _make_mock_reaction_component(**overrides) -> MagicMock:
    """Create a mock BCXReactionComponent.

    Args:
        **overrides: Getter return value overrides.

    Returns:
        MagicMock mimicking a BCXReactionComponent Java object.
    """
    mock = MagicMock()
    mock.getInchi.return_value = overrides.get("inchi")
    mock.getInchiKey.return_value = overrides.get("inchiKey")
    mock.getCdxTop.return_value = overrides.get("cdxTop", 0.0)
    mock.getCdxLeft.return_value = overrides.get("cdxLeft", 0.0)
    mock.getCdxBottom.return_value = overrides.get("cdxBottom", 0.0)
    mock.getCdxRight.return_value = overrides.get("cdxRight", 0.0)
    return mock


def _make_mock_reaction(**overrides) -> MagicMock:
    """Create a mock BCXReaction.

    Args:
        **overrides: Getter return value overrides.

    Returns:
        MagicMock mimicking a BCXReaction Java object.
    """
    mock = MagicMock()
    mock.getRinchi.return_value = overrides.get("rinchi")
    mock.getRinchiKey.return_value = overrides.get("rinchiKey")
    mock.getShortRinchiKey.return_value = overrides.get("shortRinchiKey")
    mock.getLongRinchiKey.return_value = overrides.get("longRinchiKey")
    mock.getWebRinchiKey.return_value = overrides.get("webRinchiKey")
    mock.getReactionSmiles.return_value = overrides.get("reactionSmiles")
    mock.getAuxInfo.return_value = overrides.get("auxInfo")
    mock.getReactants.return_value = overrides.get("reactants", [])
    mock.getProducts.return_value = overrides.get("products", [])
    mock.getAgents.return_value = overrides.get("agents", [])
    return mock


def _make_mock_substance_info(**overrides) -> MagicMock:
    """Create a mock BCXSubstanceInfo.

    Args:
        **overrides: Getter return value overrides.

    Returns:
        MagicMock mimicking a BCXSubstanceInfo Java object.
    """
    mock = MagicMock()
    mock.getNoFragments.return_value = overrides.get("noFragments", 0)
    mock.getNoInchis.return_value = overrides.get("noInchis", 0)
    mock.getNoSubstances.return_value = overrides.get("noSubstances", 0)
    return mock


class TestCoerceSubstance:
    """Tests for _coerce_substance null-coercion."""

    def test_coerce_substance_all_nulls(self):
        """All nullable fields return None from Java -> all empty strings."""
        mock = _make_mock_substance()
        result = _coerce_substance(mock)

        assert result["inchi"] == ""
        assert result["inchi_key"] == ""
        assert result["smiles"] == ""
        assert result["extended_smiles"] == ""
        assert result["iupac_name"] == ""
        assert result["molecular_formula"] == ""
        assert result["aux_info"] == ""
        assert result["mdlv3000"] == ""
        assert result["abbreviations"] == {}

    def test_coerce_substance_with_values(self):
        """Fields with real Java values pass through correctly."""
        mock = _make_mock_substance(
            inchi="InChI=1S/CH4/h1H4",
            inchiKey="VNWKTOKETHGBQD-UHFFFAOYSA-N",
            smiles="C",
            extendedSmiles="[CH4]",
            iupacName="methane",
            molecularFormula="CH4",
            auxInfo="AuxInfo/1/0/",
            mdlv3000="V3000 block",
            abbreviations={"Me": "methyl"},
        )
        result = _coerce_substance(mock)

        assert result["inchi"] == "InChI=1S/CH4/h1H4"
        assert result["inchi_key"] == "VNWKTOKETHGBQD-UHFFFAOYSA-N"
        assert result["smiles"] == "C"
        assert result["extended_smiles"] == "[CH4]"
        assert result["iupac_name"] == "methane"
        assert result["molecular_formula"] == "CH4"
        assert result["aux_info"] == "AuxInfo/1/0/"
        assert result["mdlv3000"] == ""  # BCXSubstance has no getMdlv3000()
        assert result["abbreviations"] == {"Me": "methyl"}

    def test_coerce_substance_mixed_nulls(self):
        """Some fields null, some populated -> correct mix."""
        mock = _make_mock_substance(
            inchi="InChI=1S/C2H6O/c1-2-3/h3H,2H2,1H3",
            smiles="CCO",
            molecularFormula="C2H6O",
        )
        result = _coerce_substance(mock)

        assert result["inchi"] == "InChI=1S/C2H6O/c1-2-3/h3H,2H2,1H3"
        assert result["inchi_key"] == ""  # null -> empty
        assert result["smiles"] == "CCO"
        assert result["extended_smiles"] == ""  # null -> empty
        assert result["molecular_formula"] == "C2H6O"
        assert result["mdlv3000"] == ""  # null -> empty


def test_coerce_substance_reads_occurrences():
    """_coerce_substance surfaces each BCXSubstanceOccurrence as an l/t/r/b dict."""
    from app.services.extractor import _coerce_substance

    # Method/param names mirror the CDK/BChemXtract Java API these fakes stand
    # in for, so they keep Java camelCase (noqa: N802) and the l/t/r/b wire
    # contract (noqa: E741) rather than PEP8 snake_case.
    class _Occ:
        def __init__(self, l, t, r, b):  # noqa: E741
            self._v = (l, t, r, b)

        def getCdxLeft(self):  # noqa: N802
            return self._v[0]

        def getCdxTop(self):  # noqa: N802
            return self._v[1]

        def getCdxRight(self):  # noqa: N802
            return self._v[2]

        def getCdxBottom(self):  # noqa: N802
            return self._v[3]

    class _Sub:
        def getAbbreviations(self):  # noqa: N802
            return {}

        def getInchi(self):  # noqa: N802
            return "InChI=1S/CH4/h1H4"

        def getInchiKey(self):  # noqa: N802
            return "VNWKTOKETHGBQD-UHFFFAOYSA-N"

        def getSmiles(self):  # noqa: N802
            return "C"

        def getExtendedSmiles(self):  # noqa: N802
            return "C"

        def getIupacName(self):  # noqa: N802
            return "methane"

        def getMolecularFormula(self):  # noqa: N802
            return "CH4"

        def getAuxInfo(self):  # noqa: N802
            return ""

        def getOccurrences(self):  # noqa: N802
            return [_Occ(1.0, 2.0, 3.0, 4.0)]

    d = _coerce_substance(_Sub())
    assert d["occurrences"] == [{"l": 1.0, "t": 2.0, "r": 3.0, "b": 4.0}]


class TestCoerceReaction:
    """Tests for _coerce_reaction null-coercion."""

    def test_coerce_reaction_all_nulls(self):
        """All nullable reaction fields -> empty strings, empty lists."""
        mock = _make_mock_reaction()
        result = _coerce_reaction(mock)

        assert result["rinchi"] == ""
        assert result["rinchi_key"] == ""
        assert result["short_rinchi_key"] == ""
        assert result["long_rinchi_key"] == ""
        assert result["web_rinchi_key"] == ""
        assert result["reaction_smiles"] == ""
        assert result["aux_info"] == ""
        assert result["reactants"] == []
        assert result["products"] == []
        assert result["agents"] == []

    def test_coerce_reaction_with_components(self):
        """Reaction with populated component lists coerces correctly."""
        comp_mock = _make_mock_reaction_component(
            inchi="InChI=1S/CH4/h1H4",
            cdxTop=10.5,
            cdxLeft=20.0,
        )
        mock = _make_mock_reaction(
            rinchi="RInChI=1.00.1S/",
            reactants=[comp_mock],
        )
        result = _coerce_reaction(mock)

        assert result["rinchi"] == "RInChI=1.00.1S/"
        assert len(result["reactants"]) == 1
        assert result["reactants"][0]["inchi"] == "InChI=1S/CH4/h1H4"
        assert result["reactants"][0]["cdx_top"] == 10.5
        assert result["reactants"][0]["cdx_left"] == 20.0


class TestCoerceReactionComponent:
    """Tests for _coerce_reaction_component null-coercion."""

    def test_coerce_reaction_component_all_nulls(self):
        """inchi and inchiKey null -> empty strings, floats default to 0.0."""
        mock = _make_mock_reaction_component()
        result = _coerce_reaction_component(mock)

        assert result["inchi"] == ""
        assert result["inchi_key"] == ""
        assert result["cdx_top"] == 0.0
        assert result["cdx_left"] == 0.0
        assert result["cdx_bottom"] == 0.0
        assert result["cdx_right"] == 0.0

    def test_coerce_reaction_component_with_values(self):
        """All fields populated pass through correctly."""
        mock = _make_mock_reaction_component(
            inchi="InChI=1S/H2O/h1H2",
            inchiKey="XLYOFNOQVPJJNP-UHFFFAOYSA-N",
            cdxTop=1.5,
            cdxLeft=2.5,
            cdxBottom=3.5,
            cdxRight=4.5,
        )
        result = _coerce_reaction_component(mock)

        assert result["inchi"] == "InChI=1S/H2O/h1H2"
        assert result["inchi_key"] == "XLYOFNOQVPJJNP-UHFFFAOYSA-N"
        assert result["cdx_top"] == 1.5
        assert result["cdx_left"] == 2.5
        assert result["cdx_bottom"] == 3.5
        assert result["cdx_right"] == 4.5


class TestCoerceSubstanceInfo:
    """Tests for _coerce_substance_info."""

    def test_coerce_substance_info_values(self):
        """Primitive int fields pass through correctly."""
        mock = _make_mock_substance_info(
            noFragments=5,
            noInchis=3,
            noSubstances=7,
        )
        result = _coerce_substance_info(mock)

        assert result["no_fragments"] == 5
        assert result["no_inchis"] == 3
        assert result["no_substances"] == 7

    def test_coerce_substance_info_zeros(self):
        """Default zero values pass through."""
        mock = _make_mock_substance_info()
        result = _coerce_substance_info(mock)

        assert result["no_fragments"] == 0
        assert result["no_inchis"] == 0
        assert result["no_substances"] == 0


# ---------------------------------------------------------------------------
# Dropped-null component recovery (BChemXtract leaves a `null` in a role's
# component list even though the reaction SMILES contains that component).
# Fakes stand in for CDK so these run without a JVM.
# ---------------------------------------------------------------------------


# Method names mirror the CDK Java API the extractor calls, so they keep the
# Java camelCase (noqa: N802) rather than PEP8 snake_case.
class _FakeGen:
    def __init__(self, inchi, key):
        self._inchi, self._key = inchi, key

    def getInchi(self):  # noqa: N802
        return self._inchi

    def getInchiKey(self):  # noqa: N802
        return self._key


class _FakeIGF:
    """Maps a SMILES fragment to (inchi, inchi_key); KeyError == unparseable."""

    def __init__(self, mapping):
        self._mapping = mapping

    def getInChIGenerator(self, mol):  # noqa: N802
        return _FakeGen(*self._mapping[mol])


class _FakeParser:
    def parseSmiles(self, smiles):  # noqa: N802
        return smiles  # identity: the "mol" is the SMILES string itself


def _fake_cdk(mapping):
    return _FakeParser(), _FakeIGF(mapping)


class TestReactionSmilesRoles:
    """_reaction_smiles_roles — split a reaction SMILES into role fragments."""

    def test_three_roles_with_multiple_fragments(self):
        roles = _reaction_smiles_roles("A.B>C>D.E")
        assert roles == {
            "reactants": ["A", "B"],
            "agents": ["C"],
            "products": ["D", "E"],
        }

    def test_empty_agents(self):
        roles = _reaction_smiles_roles("A>>B")
        assert roles == {"reactants": ["A"], "agents": [], "products": ["B"]}

    def test_malformed_returns_none(self):
        assert _reaction_smiles_roles("A>B") is None
        assert _reaction_smiles_roles("") is None


class TestCoerceRoleRecovery:
    """_coerce_role — recover dropped-null components from the reaction SMILES."""

    def test_recovers_dropped_agent(self):
        """The fragment whose key isn't already populated becomes a component."""
        benzene = _make_mock_reaction_component(
            inchi="InChI=benzene", inchiKey="BENZENE-KEY", cdxTop=78.6
        )
        # Java list mirrors the bug: one populated, one dropped null.
        java_list = [None, benzene]
        cdk = _fake_cdk(
            {
                "c1ccccc1": ("InChI=benzene", "BENZENE-KEY"),
                "C1CCOC1": ("InChI=thf", "THF-KEY"),
            }
        )
        result = _coerce_role(java_list, ["c1ccccc1", "C1CCOC1"], cdk)

        assert len(result) == 2
        keys = {c["inchi_key"] for c in result}
        assert keys == {"BENZENE-KEY", "THF-KEY"}
        thf = next(c for c in result if c["inchi_key"] == "THF-KEY")
        assert thf["inchi"] == "InChI=thf"
        assert thf["cdx_top"] == 0.0  # recovered components have no coordinates

    def test_no_null_path_is_untouched(self):
        """A null-free role never invokes recovery and returns as-is."""
        comp = _make_mock_reaction_component(inchiKey="X", cdxTop=5.0)
        result = _coerce_role([comp], ["whatever"], _fake_cdk({}))
        assert len(result) == 1
        assert result[0]["inchi_key"] == "X"

    def test_cdk_unavailable_preserves_count_with_empty_placeholder(self):
        """cdk=None (no JVM) can't enrich the null, but the count is preserved:
        the dropped molecule becomes an empty placeholder, not a vanished row."""
        comp = _make_mock_reaction_component(inchiKey="X")
        result = _coerce_role([comp, None], ["a", "b"], None)
        assert len(result) == 2  # count preserved (populated + placeholder)
        assert {c["inchi_key"] for c in result} == {"X", ""}

    def test_unresolvable_fragment_preserves_count(self):
        """If any fragment can't be keyed we can't map it, but we still keep the
        count: the null becomes an empty placeholder."""
        comp = _make_mock_reaction_component(inchiKey="BENZENE-KEY")
        cdk = _fake_cdk(
            {"c1ccccc1": ("InChI=benzene", "BENZENE-KEY")}
        )  # 2nd frag missing
        result = _coerce_role([None, comp], ["c1ccccc1", "??bad??"], cdk)
        assert len(result) == 2
        assert {c["inchi_key"] for c in result} == {"BENZENE-KEY", ""}

    def test_salt_count_mismatch_preserves_count_with_placeholders(self):
        """A salt writes its ions as separate `.`-fragments, so fragment count
        exceeds molecule count and clean recovery is impossible. The role's
        molecule count must still be preserved via empty placeholders — this is
        the reagent-salt agent case that regressed to '1 agent'."""
        # 1 populated + 3 nulls (as BChemXtract returns for a 4-agent role where
        # 3 InChI builds failed), and the SMILES splits into 6 salt fragments.
        comp = _make_mock_reaction_component(inchiKey="DBU-KEY")
        cdk = _fake_cdk(
            {
                "C1CCC2=NCCCN2CC1": ("i", "DBU-KEY"),
                "C=CS(=O)(=O)C": ("i", "MVS-KEY"),
                "BrBr": ("i", "BR2-KEY"),
                "[K+]": ("i", "K-KEY"),
                "O=S(=O)([O-])OOS(=O)(=O)[O-]": ("i", "PS-KEY"),
            }
        )
        frags = [
            "C1CCC2=NCCCN2CC1",
            "C=CS(=O)(=O)C",
            "BrBr",
            "[K+]",
            "[K+]",
            "O=S(=O)([O-])OOS(=O)(=O)[O-]",
        ]
        result = _coerce_role([comp, None, None, None], frags, cdk)
        assert len(result) == 4  # molecule count preserved (was 1 before the fix)
        assert sum(1 for c in result if c["inchi_key"]) == 1  # only the populated one
        assert sum(1 for c in result if not c["inchi_key"]) == 3  # empty placeholders

    def test_empty_smiles_section_adds_no_placeholders(self):
        """A degenerate reaction whose SMILES section has NO fragments must not
        sprout phantom components from null slots — a role can't hold more
        molecules than its SMILES has fragments. (Regression: '>>' surfaced as
        '2 reactants · 1 products'.)"""
        result = _coerce_role([None, None], [], None)
        assert result == []  # no fragments -> nothing to count, nulls dropped

    def test_recovery_bails_when_populated_key_absent_from_fragments(self):
        """If a populated component's key isn't among the SMILES fragments the
        fragment→molecule mapping is unsound: recovery must NOT fabricate
        components from the unmatched fragments or overshoot the fragment count.
        It falls back to a budget-capped empty placeholder instead."""
        comp = _make_mock_reaction_component(inchiKey="AAAA")  # not in fragments
        cdk = _fake_cdk({"X": ("iX", "XXXX"), "Y": ("iY", "YYYY")})
        # raw java [comp, None, None] -> null_count 2; only 2 fragments (X, Y).
        result = _coerce_role([comp, None, None], ["X", "Y"], cdk)
        assert len(result) == 2  # capped at fragment count, NOT 3
        # No fabricated chemistry: the extra slot is an empty placeholder.
        assert {c["inchi_key"] for c in result} == {"AAAA", ""}

    def test_no_smiles_fragments_counts_only_populated(self):
        """With no reaction-SMILES fragments to corroborate the role (malformed
        or missing reaction SMILES -> role_frags is None), we can't tell real
        molecules from spurious null slots, so we count only the populated
        components. Padding here would risk the phantom-count bug degenerate
        reactions exhibit."""
        comp = _make_mock_reaction_component(inchiKey="X")
        result = _coerce_role([comp, None, None], None, None)
        assert len(result) == 1
        assert result[0]["inchi_key"] == "X"


class TestCoerceReactionRecovery:
    """End-to-end _coerce_reaction with a dropped agent, CDK faked out."""

    def test_dropped_agent_recovered(self, monkeypatch):
        monkeypatch.setattr(
            extractor,
            "_cdk_inchi_tools",
            lambda: _fake_cdk(
                {
                    "c1ccccc1": ("InChI=benzene", "BENZENE-KEY"),
                    "C1CCOC1": ("InChI=thf", "THF-KEY"),
                }
            ),
        )
        benzene = _make_mock_reaction_component(inchiKey="BENZENE-KEY", cdxTop=78.6)
        mock = _make_mock_reaction(
            reactionSmiles="CC>c1ccccc1.C1CCOC1>CCO",
            agents=[None, benzene],
        )
        result = _coerce_reaction(mock)

        assert len(result["agents"]) == 2
        assert {c["inchi_key"] for c in result["agents"]} == {"BENZENE-KEY", "THF-KEY"}

    def test_empty_reaction_smiles_yields_no_components(self):
        """The m30520404 regression: a degenerate reaction with an empty SMILES
        ('>>') but null-filled Java role lists must coerce to empty roles, not
        phantom reactants/products. Exercises the real _coerce_reaction wiring
        (has_null / _cdk_inchi_tools / _reaction_smiles_roles), not just
        _coerce_role."""
        mock = _make_mock_reaction(
            reactionSmiles=">>",
            reactants=[None, None],
            products=[None],
            agents=[],
        )
        result = _coerce_reaction(mock)
        assert result["reactants"] == []
        assert result["products"] == []
        assert result["agents"] == []

    def test_salt_agents_preserve_count_end_to_end(self, monkeypatch):
        """End-to-end through _coerce_reaction: a 4-agent reagent list (1
        populated + 3 nulls) whose agent SMILES is a 6-fragment salt keeps its
        count of 4 — the potassium-persulfate case, driven through the full
        has_null/_reaction_smiles_roles path rather than _coerce_role alone."""
        monkeypatch.setattr(
            extractor,
            "_cdk_inchi_tools",
            lambda: _fake_cdk(
                {
                    "C1CCC2=NCCCN2CC1": ("i", "DBU-KEY"),
                    "C=CS(=O)(=O)C": ("i", "MVS-KEY"),
                    "BrBr": ("i", "BR2-KEY"),
                    "[K+]": ("i", "K-KEY"),
                    "O=S(=O)([O-])OOS(=O)(=O)[O-]": ("i", "PS-KEY"),
                }
            ),
        )
        agents_smiles = (
            "C1CCC2=NCCCN2CC1.C=CS(=O)(=O)C.BrBr.[K+].[K+].O=S(=O)([O-])OOS(=O)(=O)[O-]"
        )
        dbu = _make_mock_reaction_component(inchiKey="DBU-KEY")
        mock = _make_mock_reaction(
            reactionSmiles=f"CCO>{agents_smiles}>CCO",
            reactants=[_make_mock_reaction_component(inchiKey="R-KEY")],
            products=[_make_mock_reaction_component(inchiKey="P-KEY")],
            agents=[dbu, None, None, None],
        )
        result = _coerce_reaction(mock)
        assert len(result["reactants"]) == 1
        assert len(result["products"]) == 1
        assert len(result["agents"]) == 4  # count preserved (was 1 before the fix)
        assert sum(1 for c in result["agents"] if c["inchi_key"]) == 1
