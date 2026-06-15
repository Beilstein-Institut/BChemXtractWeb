"""One-shot backfill for ``Substance.canonical_smiles``.

Populates the ``canonical_smiles`` column for every row where it is
currently ``NULL`` and the original ``smiles`` is parseable by CDK.

Extracted from the ``c3d4e5f6a7b8`` Alembic migration so schema and data
migrations stay disjoint. Called by:

  * :mod:`scripts.backfill_canonical_smiles` — operational CLI run
    after ``alembic upgrade head`` on a new deployment, or manually to
    re-backfill rows that arrived via a route that can't canonicalise
    (e.g. ingestion from an external dataset).
  * Tests in :mod:`tests.test_canonicalize_backfill`.

Idempotent: every row gated by ``WHERE canonical_smiles IS NULL``. Rows
whose ``smiles`` cannot be parsed by CDK stay literal SQL NULL (the
``if canon:`` guard below).
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from dataclasses import dataclass

import jpype
from sqlalchemy import text
from sqlalchemy.engine import Connection

from app.config import settings
from app.services.canonicalize import canonicalize_smiles_blocking
from app.services.jvm_bridge import initialize_jvm

logger = logging.getLogger(__name__)

_DEFAULT_BATCH = 500


@dataclass
class BackfillResult:
    """Outcome of a backfill run."""

    scanned: int
    updated: int
    unparseable: int


def backfill_canonical_smiles(
    connection: Connection,
    *,
    batch_size: int = _DEFAULT_BATCH,
    progress_cb: Callable[[int, int], None] | None = None,
) -> BackfillResult:
    """Backfill ``canonical_smiles`` for every row where it's NULL.

    Runs against ``connection``; the caller owns transaction scoping. For
    a long backfill we recommend autocommit mode so each UPDATE commits
    independently — the CLI wrapper configures this.

    Args:
        connection: SQLAlchemy ``Connection`` bound to the target DB.
        batch_size: Rows fetched per iteration (default 500).
        progress_cb: Optional callback invoked as ``(scanned, updated)``
            after every batch. Lets the CLI emit live progress.

    Returns:
        :class:`BackfillResult` with counts for visibility.
    """
    if not jpype.isJVMStarted():
        initialize_jvm(settings)

    scanned = 0
    updated = 0
    unparseable = 0
    offset = 0

    while True:
        rows = connection.execute(
            text(
                "SELECT id, smiles FROM substances "
                "WHERE canonical_smiles IS NULL AND smiles != '' "
                "ORDER BY id LIMIT :batch OFFSET :offset"
            ),
            {"batch": batch_size, "offset": offset},
        ).fetchall()
        if not rows:
            break
        for row_id, smi in rows:
            scanned += 1
            canon = canonicalize_smiles_blocking(smi)
            if canon:
                connection.execute(
                    text(
                        "UPDATE substances SET canonical_smiles = :c "
                        "WHERE id = :id AND canonical_smiles IS NULL"
                    ),
                    {"c": canon, "id": row_id},
                )
                updated += 1
            else:
                unparseable += 1
        offset += batch_size
        if progress_cb is not None:
            progress_cb(scanned, updated)
        logger.info(
            "canonical_smiles backfill progress: scanned=%d updated=%d",
            scanned,
            updated,
        )

    return BackfillResult(scanned=scanned, updated=updated, unparseable=unparseable)
