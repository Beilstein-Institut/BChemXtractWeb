"""CDK SMILES canonicalization helpers (D-04/D-05).

Normalizes SMILES strings so ``c1ccccc1`` and ``C1=CC=CC=C1`` collapse to the
same canonical form. Preserves stereochemistry
(``SmiFlavor.Canonical | SmiFlavor.Isomeric | SmiFlavor.UseAromaticSymbols``)
per CONTEXT D-04 and RESEARCH §Pattern 2 — NOT ``SmiFlavor.Unique`` which
drops stereo.

Three entry points:

- :func:`_canonicalize_smiles_sync` — JClass loads + parse + generate. Must
  run on a JVM-attached thread. Returns ``""`` on any failure (D-09 skip
  semantics).
- :func:`canonicalize_smiles` (async) — wraps ``_sync`` via
  :func:`app.services.jvm_bridge.run_in_jvm_thread` for FastAPI handlers and
  services.
- :func:`canonicalize_smiles_blocking` (sync) — attaches the calling thread
  to the JVM, runs ``_sync``, then detaches. Used by Alembic migrations,
  which run outside the FastAPI thread pool (RESEARCH Pitfall 3).
"""

from __future__ import annotations

import contextlib
import logging

import jpype

from app.services.jvm_bridge import run_in_jvm_thread

logger = logging.getLogger(__name__)


def _canonicalize_smiles_sync(smiles: str) -> str:
    """Return the canonical SMILES for ``smiles``, or ``""`` on failure.

    Must be called inside a JVM-attached thread (either the FastAPI thread
    pool via :func:`run_in_jvm_thread`, or via explicit
    ``jpype.attachThreadToJVM`` as done in
    :func:`canonicalize_smiles_blocking`).

    Per D-09: any parse failure returns ``""`` — the caller decides whether
    to skip the row, log, or warn. Never raises.

    Args:
        smiles: Raw SMILES string (may be empty; may be unparsable).

    Returns:
        CDK canonical SMILES with stereo + aromatic symbols preserved, or
        ``""`` when the input is empty or unparsable.
    """
    if not smiles:
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
        SmiFlavor = jpype.JClass(  # noqa: N806
            "org.openscience.cdk.smiles.SmiFlavor"
        )
        Aromaticity = jpype.JClass(  # noqa: N806
            "org.openscience.cdk.aromaticity.Aromaticity"
        )
        ElectronDonation = jpype.JClass(  # noqa: N806
            "org.openscience.cdk.aromaticity.ElectronDonation"
        )
        Cycles = jpype.JClass(  # noqa: N806
            "org.openscience.cdk.graph.Cycles"
        )
        AtomContainerManipulator = jpype.JClass(  # noqa: N806
            "org.openscience.cdk.tools.manipulator.AtomContainerManipulator"
        )

        builder = SilentChemObjectBuilder.getInstance()
        parser = SmilesParser(builder)
        mol = parser.parseSmiles(smiles)

        # CDK SmilesParser does NOT auto-perceive aromaticity. Without the
        # explicit Daylight aromaticity pass below, Kekulé input
        # (`C1=CC=CC=C1`) stays Kekulé in the output and fails to collapse
        # with `c1ccccc1`. See RESEARCH Pattern 2 Edge Cases.
        AtomContainerManipulator.percieveAtomTypesAndConfigureAtoms(mol)
        aromaticity = Aromaticity(
            ElectronDonation.daylight(),
            # noqa: jpype renames `or` → `or_` (Python keyword collision)
            Cycles.or_(Cycles.all(), Cycles.cdkAromaticSet()),
        )
        aromaticity.apply(mol)

        # D-04: canonical + preserve stereo + aromatic lowercase so
        # `c1ccccc1` and `C1=CC=CC=C1` collide on the same canonical form.
        flavor = (
            int(SmiFlavor.Canonical)
            | int(SmiFlavor.Isomeric)
            | int(SmiFlavor.UseAromaticSymbols)
        )
        sg = SmilesGenerator(flavor)
        return str(sg.create(mol))
    except jpype.JException as exc:
        logger.warning(
            "Canonicalization failed for SMILES %r: %s", smiles[:120], exc
        )
        return ""
    except Exception as exc:
        logger.warning(
            "Unexpected canonicalization error for SMILES %r: %s",
            smiles[:120],
            exc,
        )
        return ""


async def canonicalize_smiles(smiles: str) -> str:
    """Async wrapper: run :func:`_canonicalize_smiles_sync` in the JVM pool.

    Use from FastAPI handlers and services. Returns ``""`` on any failure
    (D-09 skip semantics).

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
    ``finally`` detach). See RESEARCH Pitfall 3.

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
