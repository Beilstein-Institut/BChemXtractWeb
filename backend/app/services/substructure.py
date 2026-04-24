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
