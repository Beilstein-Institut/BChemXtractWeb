#!/usr/bin/env python
"""CLI wrapper around :mod:`app.services.canonicalize_backfill` (SEC M-09).

Extracted from the ``c3d4e5f6a7b8`` alembic migration so the schema
migration can complete without waiting on a JVM-backed data migration.
Run explicitly after ``alembic upgrade head`` on new deployments::

    python -m scripts.backfill_canonical_smiles --batch-size 1000

Exits with a non-zero status on any unhandled exception so CI / deploy
pipelines notice failures.
"""

from __future__ import annotations

import argparse
import logging
import sys

from sqlalchemy import create_engine

from app.config import settings
from app.services.canonicalize_backfill import backfill_canonical_smiles


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="backfill_canonical_smiles",
        description=(
            "Populate substances.canonical_smiles for every row where it "
            "is currently NULL. Idempotent: re-running is a no-op."
        ),
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=500,
        help="Rows fetched per iteration (default: 500).",
    )
    parser.add_argument(
        "--database-url",
        default=None,
        help=(
            "Override DATABASE_URL from the environment for this run. "
            "Useful for re-backfilling a read replica."
        ),
    )
    parser.add_argument(
        "-v",
        "--verbose",
        action="store_true",
        help="Enable DEBUG logging.",
    )
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    # psycopg3 supports both sync and async under the same driver suffix,
    # so we pass DATABASE_URL straight through. autocommit per statement so
    # a crash mid-backfill doesn't roll back completed rows (every UPDATE
    # is idempotent — re-running picks up where we left off).
    db_url = args.database_url or settings.database_url
    engine = create_engine(db_url, isolation_level="AUTOCOMMIT")

    with engine.connect() as conn:
        def _print_progress(scanned: int, updated: int) -> None:
            print(
                f"  scanned={scanned} updated={updated}",
                flush=True,
            )

        result = backfill_canonical_smiles(
            conn,
            batch_size=args.batch_size,
            progress_cb=_print_progress,
        )

    print(
        f"Done. scanned={result.scanned} "
        f"updated={result.updated} unparseable={result.unparseable}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
