#!/usr/bin/env python
"""Repair extractions whose substances were destroyed by the old orphan sweep.

The pre-fix sweep (see ``app.services.orphan_sweep``) could delete pool rows
another caller still referenced, taking their join rows through the FK
cascade. Those extractions survive with a stored ``structure_count`` and no
structures: History lists them, opening one shows nothing.

For every such extraction this script either

  * re-extracts from the original bytes in ``extraction_files`` and re-links
    the substances to the SAME extraction row (id, created_at, and owner
    columns all preserved, so History entries and links keep working), or
  * deletes the row when its bytes were never stored (nothing to rebuild
    from — leaving it would keep History advertising structures that cannot
    be shown).

Reactions are not rebuilt. The Reactions tab re-extracts from the stored
bytes on demand, and rows whose bytes are gone are deleted anyway.

Dry-run by default; ``--apply`` writes. Idempotent — a repaired extraction
is no longer hollow, so a second run skips it.

Needs the JVM (it re-runs extraction) and a DB role that can see every
caller's rows — the runtime role cannot, RLS hides other sessions. Run it in
the ``migrate`` service, the only one whose DATABASE_URL is the bootstrap
superuser; JAR_PATH and JAVA_HOME come from the image::

    docker compose run --rm --no-deps migrate \\
      python -m scripts.repair_hollow_extractions --apply
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys

from sqlalchemy import text

from app.config import settings
from app.services.db import AsyncSessionLocal
from app.services.extractor import extract_substances_with_svg
from app.services.format_detector import detect_format
from app.services.jvm_bridge import initialize_jvm
from app.services.persistence import upsert_and_link_substances

logger = logging.getLogger("repair_hollow_extractions")

# Hollow = extraction row with zero surviving substance join rows. LEFT JOIN
# on extraction_files tells us whether a rebuild is even possible.
_HOLLOW_QUERY = text("""
    SELECT e.id, e.filename, e.structure_count, e.session_id, e.api_key_hash,
           f.content
      FROM extractions e
      LEFT JOIN extraction_files f ON f.extraction_id = e.id
     WHERE NOT EXISTS (
         SELECT 1 FROM extraction_substances x WHERE x.extraction_id = e.id
     )
     ORDER BY e.id
""")


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="repair_hollow_extractions",
        description=(
            "Re-extract structures for extractions whose join rows were "
            "deleted by the pre-fix orphan sweep. Dry-run unless --apply."
        ),
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write changes. Without it the script only reports.",
    )
    parser.add_argument(
        "--keep-unrecoverable",
        action="store_true",
        help=(
            "Do not delete hollow extractions whose original bytes are "
            "missing. They stay in History reporting structures that "
            "cannot be displayed."
        ),
    )
    return parser.parse_args()


async def _repair_one(row, *, apply: bool) -> str:
    """Rebuild or delete one hollow extraction. Returns the outcome label."""
    if not row.content:
        if not apply:
            return "would-delete"
        async with AsyncSessionLocal() as db:
            await db.execute(
                text("DELETE FROM extractions WHERE id = :eid"), {"eid": row.id}
            )
            await db.commit()
        return "deleted"

    if not apply:
        return "would-rebuild"

    substances, _info, _warnings = await extract_substances_with_svg(
        row.content, detect_format(row.content)
    )
    if not substances:
        # Bytes are present but yield nothing — re-extraction cannot help,
        # and deleting on a possibly-transient extractor failure would
        # destroy the row. Report and leave it for a human.
        return "rebuild-empty"

    async with AsyncSessionLocal() as db:
        # Same owner columns as the surviving extraction row, so the rebuilt
        # join rows stay visible to exactly the caller who owns the file.
        await upsert_and_link_substances(
            db, row.id, substances, (row.session_id, row.api_key_hash)
        )
        # structure_count was written by the original extraction; make it
        # agree with what actually got re-linked instead of leaving History
        # quoting a number nothing backs up.
        await db.execute(
            text("UPDATE extractions SET structure_count = :n WHERE id = :eid"),
            {"n": len(substances), "eid": row.id},
        )
        await db.commit()
    return "rebuilt"


async def main() -> int:
    args = _parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    initialize_jvm(settings)

    async with AsyncSessionLocal() as db:
        rows = (await db.execute(_HOLLOW_QUERY)).all()

    if not rows:
        logger.info("No hollow extractions found — nothing to repair.")
        return 0

    recoverable = sum(1 for r in rows if r.content)
    logger.info(
        "%d hollow extraction(s): %d with stored bytes, %d without.%s",
        len(rows),
        recoverable,
        len(rows) - recoverable,
        "" if args.apply else " Dry run — pass --apply to write.",
    )

    counts: dict[str, int] = {}
    for row in rows:
        if not row.content and args.keep_unrecoverable:
            outcome = "kept-unrecoverable"
        else:
            try:
                outcome = await _repair_one(row, apply=args.apply)
            except Exception:
                logger.exception("Repair failed for extraction %s", row.id)
                outcome = "failed"
        counts[outcome] = counts.get(outcome, 0) + 1
        logger.info(
            "extraction %s (%s, structure_count=%s): %s",
            row.id,
            row.filename,
            row.structure_count,
            outcome,
        )

    logger.info("Done: %s", ", ".join(f"{k}={v}" for k, v in sorted(counts.items())))
    return 1 if counts.get("failed") else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
