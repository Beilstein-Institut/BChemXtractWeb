"""CDK-based substructure matching service.

Pure CDK matching logic — parse queries, enumerate mappings, collect
matched atoms and bonds. No FastAPI, no DB, no request/response knowledge.

All functions that call into CDK MUST be invoked inside
:func:`app.services.jvm_bridge.run_in_jvm_thread`. The stereo helper
below is pure Python and thread-agnostic.

Replaces the inline ``_substructure_sync`` implementation in
``app/services/search.py`` — see the Plan 2026-04-24 design doc for
bug root-causes (``uniqueAtoms()`` drop + atom-union bond inference).
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Literal

import jpype

from app.errors import InvalidQueryError, QueryTooLargeError

QueryLanguage = Literal["smiles", "smarts"]


# Safety ceilings — see design spec §"Safety guard". 10k mappings per
# molecule absorbs naphthalene-in-coronene and similar legitimate
# high-multiplicity cases while stopping pathological `*`-only SMARTS
# from OOMing the JVM. 200-atom query cap rejects queries far larger
# than any real chemist pattern (benzene = 6, steroid scaffold ~ 30).
MAX_MAPPINGS_PER_MOL = 10_000
MAX_QUERY_ATOMS = 200


@dataclass
class ParsedQuery:
    """A parsed query ready for matching.

    Carries the raw CDK pattern AND the query IAtomContainer. The
    container is needed later for per-mapping target-bond reconstruction
    (walking the query's bond topology). Both fields are Java refs — do
    not escape the JVM-attached thread.
    """
    pattern: Any                 # CDK Pattern (from findSubstructure)
    query_container: Any         # CDK IAtomContainer or QueryAtomContainer
    query_bond_endpoints: list[tuple[int, int]]  # (q_atom_a, q_atom_b) per bond
    language: QueryLanguage
    atom_count: int
    stereo_enabled: bool


@dataclass(frozen=True)
class QueryValidation:
    """Parse-only check result — safe to serialize to JSON."""
    valid: bool
    language: QueryLanguage | None
    atom_count: int
    error: str | None


@dataclass(frozen=True)
class MatchResult:
    """Per-target match outcome."""
    matched: bool
    atom_indices: list[int]
    bond_indices: list[int]
    mapping_count: int
    partial_match: bool


# Pure-Python stereo-token stripping for the "ignore stereo" default mode.
# Used on the raw query string BEFORE handing to CDK so the parsed query
# carries no stereo features — which (per CDK 2.12 deprecation note on
# Mappings.stereochemistry()) is the documented way to disable stereo
# filtering during matching.
#
# Safe because @, /, \ appear exclusively as stereo markers in valid
# SMILES/SMARTS grammar (@ only inside atom brackets, / and \ only as
# bond stereo indicators). Removing them preserves topology.

_STEREO_STRIP_TABLE = str.maketrans("", "", "/\\")


def strip_stereo_tokens(raw: str) -> str:
    """Remove SMILES/SMARTS stereo markers from a raw query string.

    Removes (in order):
      - ``@@``   (R chirality) -> ``""``
      - ``@``    (S chirality) -> ``""``
      - ``/``    (bond E/Z up) -> ``""``
      - ``\\``   (bond E/Z down) -> ``""``

    Returns the stripped string. Leaves all other characters — including
    atom brackets ``[...]``, bond symbols ``-``, ``=``, ``#``, ``:``,
    and ring numbers — untouched.
    """
    return raw.replace("@@", "").replace("@", "").translate(_STEREO_STRIP_TABLE)


# ---------------------------------------------------------------------------
# Query parsing — SMILES-first dual path
# ---------------------------------------------------------------------------


# SMARTS-only tokens that CDK's SmilesParser would silently mis-parse
# (e.g. ``[CX3]`` turns atom[0] into a pseudo-atom ``R`` instead of
# carbon-with-degree-3). Detecting any of these in the raw query forces
# the SMARTS path before SMILES gets a chance to swallow the input.
#
# Patterns, evaluated inside ``[...]`` brackets unless noted:
#   - ``X<digit>`` — connectivity / degree query
#   - ``D<digit>`` — total-bond count
#   - ``#<digit>`` — atomic-number match
#   - ``&`` / ``;`` / ``!`` — logical operators
#   - ``$(...)`` — recursive SMARTS
# Outside brackets the wildcard atom ``*`` remains SMARTS-only.
_SMARTS_ONLY_BRACKET_PATTERN = re.compile(
    r"\[[^\]]*("
    r"[XDdR]\d"  # degree/ring queries — X3, D2, R1
    r"|#\d"  # atomic-number primitive inside brackets
    r"|[&;!]"  # logical operators
    r"|\$\("  # recursive SMARTS
    r")"
)
# Wildcard atom outside brackets — SMARTS-only.
_SMARTS_ONLY_BARE_PATTERN = re.compile(r"(^|[^\[])\*")


def _looks_like_smarts(raw: str) -> bool:
    """Return True if ``raw`` contains SMARTS-only syntax CDK's SmilesParser
    would silently mis-parse.

    This is a conservative detector: any match short-circuits SMILES-first
    parsing and forces the SMARTS path. False negatives (e.g. ``[n&r6]``
    with non-ASCII whitespace) gracefully fall through to the SMILES
    attempt, so the worst-case is the same lenient behaviour we already
    had before adding this guard.
    """
    if _SMARTS_ONLY_BRACKET_PATTERN.search(raw):
        return True
    return bool(_SMARTS_ONLY_BARE_PATTERN.search(raw))


def _build_daylight_aromaticity():
    """Construct the Daylight aromaticity detector shared with canonicalize."""
    Aromaticity = jpype.JClass("org.openscience.cdk.aromaticity.Aromaticity")  # noqa: N806
    ElectronDonation = jpype.JClass(  # noqa: N806
        "org.openscience.cdk.aromaticity.ElectronDonation"
    )
    Cycles = jpype.JClass("org.openscience.cdk.graph.Cycles")  # noqa: N806
    return Aromaticity(
        ElectronDonation.daylight(),
        Cycles.or_(Cycles.all(), Cycles.cdkAromaticSet()),
    )


def _collect_query_bond_endpoints(container: Any) -> list[tuple[int, int]]:
    """Walk a query IAtomContainer's bonds, returning (atom_idx_a, atom_idx_b)
    pairs.

    Used by enumerate_matches to reconstruct target bonds per mapping by
    following the query's bond topology. Running this once at parse time
    avoids re-computing per-target.
    """
    pairs: list[tuple[int, int]] = []
    bond_count = int(container.getBondCount())
    for b_idx in range(bond_count):
        bond = container.getBond(b_idx)
        a0 = int(container.indexOf(bond.getBegin()))
        a1 = int(container.indexOf(bond.getEnd()))
        pairs.append((a0, a1))
    return pairs


def parse_query(raw: str, *, match_stereo: bool) -> ParsedQuery:
    """Parse a raw query string into a reusable matcher.

    Dual-path, SMILES-first:
      1. Try SmilesParser.parseSmiles. On success, perceive atom types
         + apply Daylight aromaticity on the query container. If
         match_stereo=False, clear the query's stereo elements
         (CDK 2.12's documented way to disable stereo matching).
      2. On SmilesParser failure, fall back to Smarts.parseToResult.
         For match_stereo=False, strip stereo tokens from the raw
         string BEFORE parsing (SMARTS AST doesn't expose a post-parse
         stereo-clearer as cleanly).

    Both paths produce a ParsedQuery carrying the CDK Pattern, the
    query IAtomContainer (for bond-topology walking), and the
    pre-collected bond endpoint pairs.

    Must be called inside run_in_jvm_thread.

    Raises:
        InvalidQueryError: both parsers reject the string.
        QueryTooLargeError: parsed query has > MAX_QUERY_ATOMS atoms.
    """
    if not raw:
        raise InvalidQueryError("Query is empty.")

    SilentChemObjectBuilder = jpype.JClass(  # noqa: N806
        "org.openscience.cdk.silent.SilentChemObjectBuilder"
    )
    SmilesParser = jpype.JClass("org.openscience.cdk.smiles.SmilesParser")  # noqa: N806
    Pattern = jpype.JClass("org.openscience.cdk.isomorphism.Pattern")  # noqa: N806
    AtomContainerManipulator = jpype.JClass(  # noqa: N806
        "org.openscience.cdk.tools.manipulator.AtomContainerManipulator"
    )
    Collections = jpype.JClass("java.util.Collections")  # noqa: N806

    builder = SilentChemObjectBuilder.getInstance()

    # ---- Path 1: SMILES ----
    # Skip the SMILES parser if the input carries SMARTS-only tokens —
    # CDK's SmilesParser happily accepts strings like ``[CX3]=O`` by
    # reinterpreting ``X3`` as a pseudo-atom label, which would silently
    # break substructure matching. ``_looks_like_smarts`` is conservative
    # (false negatives fall through harmlessly), so we only short-circuit
    # on clear-cut SMARTS syntax.
    smiles_query_container = None
    if not _looks_like_smarts(raw):
        try:
            smiles_query_container = SmilesParser(builder).parseSmiles(raw)
        except (jpype.JException, RuntimeError):
            smiles_query_container = None

    if smiles_query_container is not None:
        try:
            AtomContainerManipulator.percieveAtomTypesAndConfigureAtoms(
                smiles_query_container
            )
            _build_daylight_aromaticity().apply(smiles_query_container)
        except Exception as exc:  # noqa: BLE001 — CDK can throw non-JException here
            raise InvalidQueryError(
                f"Could not perceive aromaticity on query: {str(exc)[:200]}"
            ) from exc

        if not match_stereo:
            smiles_query_container.setStereoElements(Collections.emptyList())

        atom_count = int(smiles_query_container.getAtomCount())
        if atom_count > MAX_QUERY_ATOMS:
            raise QueryTooLargeError(
                f"Query has {atom_count} atoms (max {MAX_QUERY_ATOMS})."
            )

        pattern = Pattern.findSubstructure(smiles_query_container)
        bond_endpoints = _collect_query_bond_endpoints(smiles_query_container)

        return ParsedQuery(
            pattern=pattern,
            query_container=smiles_query_container,
            query_bond_endpoints=bond_endpoints,
            language="smiles",
            atom_count=atom_count,
            stereo_enabled=match_stereo,
        )

    # ---- Path 2: SMARTS fallback ----
    Smarts = jpype.JClass("org.openscience.cdk.smarts.Smarts")  # noqa: N806
    QueryAtomContainer = jpype.JClass(  # noqa: N806
        "org.openscience.cdk.isomorphism.matchers.QueryAtomContainer"
    )

    smarts_input = raw if match_stereo else strip_stereo_tokens(raw)
    qc = QueryAtomContainer(builder)
    try:
        result = Smarts.parseToResult(qc, smarts_input)
    except (jpype.JException, RuntimeError) as exc:
        raise InvalidQueryError(
            f"Could not parse as SMILES or SMARTS: {str(exc)[:200]}"
        ) from exc

    if not result.ok():
        msg = (
            str(result.getMessage())
            if hasattr(result, "getMessage")
            else "parse failed"
        )
        raise InvalidQueryError(
            f"Could not parse as SMILES or SMARTS: {msg[:200]}"
        )

    atom_count = int(qc.getAtomCount())
    if atom_count > MAX_QUERY_ATOMS:
        raise QueryTooLargeError(
            f"Query has {atom_count} atoms (max {MAX_QUERY_ATOMS})."
        )

    pattern = Pattern.findSubstructure(qc)
    bond_endpoints = _collect_query_bond_endpoints(qc)

    return ParsedQuery(
        pattern=pattern,
        query_container=qc,
        query_bond_endpoints=bond_endpoints,
        language="smarts",
        atom_count=atom_count,
        stereo_enabled=match_stereo,
    )


def validate_query(raw: str, *, match_stereo: bool) -> QueryValidation:
    """Parse-only check — never raises. Safe to call from the /validate
    endpoint on every keystroke.

    Must be called inside run_in_jvm_thread.
    """
    try:
        parsed = parse_query(raw, match_stereo=match_stereo)
    except (InvalidQueryError, QueryTooLargeError) as exc:
        return QueryValidation(
            valid=False,
            language=None,
            atom_count=0,
            error=str(exc)[:200],
        )
    return QueryValidation(
        valid=True,
        language=parsed.language,
        atom_count=parsed.atom_count,
        error=None,
    )
