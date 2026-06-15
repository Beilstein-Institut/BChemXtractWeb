"""CDK SMILES canonicalization helpers.

Normalizes SMILES strings so ``c1ccccc1`` and ``C1=CC=CC=C1`` collapse to the
same canonical form. Preserves stereochemistry
(``SmiFlavor.Canonical | SmiFlavor.Isomeric | SmiFlavor.UseAromaticSymbols``)
— NOT ``SmiFlavor.Unique`` which drops stereo.

Three entry points:

- :func:`_canonicalize_smiles_sync` — JClass loads + parse + generate. Must
  run on a JVM-attached thread. Returns ``""`` on any failure (skip
  semantics).
- :func:`canonicalize_smiles` (async) — wraps ``_sync`` via
  :func:`app.services.jvm_bridge.run_in_jvm_thread` for FastAPI handlers and
  services.
- :func:`canonicalize_smiles_blocking` (sync) — attaches the calling thread
  to the JVM, runs ``_sync``, then detaches. Used by Alembic migrations,
  which run outside the FastAPI thread pool, so the thread must be attached
  and detached explicitly.
"""

from __future__ import annotations

import contextlib
import logging

import jpype

from app.services.jvm_bridge import run_in_jvm_thread

logger = logging.getLogger(__name__)

# Hard upper bound on input length for canonicalization. Drug-like
# molecules sit well under 200 chars; multi-residue peptides and macrocycles
# typically <800 chars. ChemDraw extractions occasionally produce 1500+ char
# polymeric/dendrimer SMILES; CDK's SMILES parser + Daylight aromaticity
# perception can block indefinitely (10+ minutes, ignoring SIGALRM because
# the JVM blocks signal delivery during native graph operations) on those
# very large inputs. A 1500-char threshold covers all real chemistry while
# stopping the deadlock — skip semantics: oversize → empty → row stays
# literal SQL NULL.
MAX_CANONICALIZE_LEN = 1500


def _canonicalize_smiles_sync(smiles: str) -> str:
    """Return the canonical SMILES for ``smiles``, or ``""`` on failure.

    Must be called inside a JVM-attached thread (either the FastAPI thread
    pool via :func:`run_in_jvm_thread`, or via explicit
    ``jpype.attachThreadToJVM`` as done in
    :func:`canonicalize_smiles_blocking`).

    Any parse failure returns ``""`` — the caller decides whether
    to skip the row, log, or warn. Never raises.

    Args:
        smiles: Raw SMILES string (may be empty; may be unparsable).

    Returns:
        CDK canonical SMILES with stereo + aromatic symbols preserved, or
        ``""`` when the input is empty or unparsable.
    """
    if not smiles:
        return ""
    if len(smiles) > MAX_CANONICALIZE_LEN:
        # Real production data contains polymeric
        # SMILES strings (>4000 chars) that block CDK's parser indefinitely.
        # Skip with empty-string output so the row stays NULL in the DB.
        logger.warning(
            "Skipping canonicalization of oversized SMILES (len=%d, max=%d)",
            len(smiles),
            MAX_CANONICALIZE_LEN,
        )
        return ""
    try:
        SilentChemObjectBuilder = jpype.JClass(  # noqa: N806
            "org.openscience.cdk.silent.SilentChemObjectBuilder"
        )
        SmilesParser = jpype.JClass(  # noqa: N806
            "org.openscience.cdk.smiles.SmilesParser"
        )
        SmilesGenerator = jpype.JClass(  # noqa: N806
            "org.openscience.cdk.smiles.SmilesGenerator"
        )
        SmiFlavor = jpype.JClass("org.openscience.cdk.smiles.SmiFlavor")  # noqa: N806
        Aromaticity = jpype.JClass(  # noqa: N806
            "org.openscience.cdk.aromaticity.Aromaticity"
        )
        ElectronDonation = jpype.JClass(  # noqa: N806
            "org.openscience.cdk.aromaticity.ElectronDonation"
        )
        Cycles = jpype.JClass("org.openscience.cdk.graph.Cycles")  # noqa: N806
        AtomContainerManipulator = jpype.JClass(  # noqa: N806
            "org.openscience.cdk.tools.manipulator.AtomContainerManipulator"
        )

        mol = SmilesParser(SilentChemObjectBuilder.getInstance()).parseSmiles(smiles)

        # CDK SmilesParser does NOT auto-perceive aromaticity. Without the
        # explicit Daylight aromaticity pass below, Kekulé input
        # (`C1=CC=CC=C1`) stays Kekulé in the output and fails to collapse
        # with `c1ccccc1`.
        # jpype renames `or` -> `or_` (Python keyword collision).
        AtomContainerManipulator.percieveAtomTypesAndConfigureAtoms(mol)
        Aromaticity(
            ElectronDonation.daylight(),
            Cycles.or_(Cycles.all(), Cycles.cdkAromaticSet()),
        ).apply(mol)

        # canonical + preserve stereo + aromatic lowercase so
        # `c1ccccc1` and `C1=CC=CC=C1` collide on the same canonical form.
        flavor = (
            int(SmiFlavor.Canonical)
            | int(SmiFlavor.Isomeric)
            | int(SmiFlavor.UseAromaticSymbols)
        )
        return str(SmilesGenerator(flavor).create(mol))
    except Exception as exc:  # noqa: BLE001 — never raise on parse failure
        logger.warning("Canonicalization failed for SMILES %r: %s", smiles[:120], exc)
        return ""


async def canonicalize_smiles(smiles: str) -> str:
    """Async wrapper: run :func:`_canonicalize_smiles_sync` in the JVM pool.

    Use from FastAPI handlers and services. Returns ``""`` on any failure
    (skip semantics).

    Args:
        smiles: Raw SMILES string (may be empty; may be unparsable).

    Returns:
        Canonical SMILES, or ``""`` on empty / unparsable input.
    """
    if not smiles:
        return ""
    return await run_in_jvm_thread(_canonicalize_smiles_sync, smiles)


def canonicalize_smiles_blocking(smiles: str) -> str:
    """Sync helper for Alembic migrations (non-FastAPI context).

    Unlike :func:`canonicalize_smiles`, this function attaches the calling
    thread to the JVM and detaches in ``finally`` — because Alembic
    migrations run outside the thread pool where attach happens implicitly.
    Follows the pattern in :mod:`app.services.extractor` (attach guard +
    ``finally`` detach). The detach must run in ``finally`` or JPype leaks
    the JVM thread attachment.

    Args:
        smiles: Raw SMILES string (may be empty; may be unparsable).

    Returns:
        Canonical SMILES, or ``""`` on empty / unparsable input.
    """
    if not smiles:
        return ""
    attached_here = False
    if not jpype.isThreadAttachedToJVM():
        jpype.attachThreadToJVM()
        attached_here = True
    try:
        return _canonicalize_smiles_sync(smiles)
    finally:
        if attached_here:
            with contextlib.suppress(Exception):
                jpype.java.lang.Thread.detach()
