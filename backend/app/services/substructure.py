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

from dataclasses import dataclass, field
from typing import Any, Literal


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
