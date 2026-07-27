"""fix the orphan sweep so it cannot delete other callers' chemistry rows

Revision ID: c9d0e1f2a3b4
Revises: f6fa34aa00f0
Create Date: 2026-07-27 00:00:00.000000+00:00

The inline orphan sweep (``DELETE FROM substances WHERE id NOT IN (SELECT
substance_id FROM extraction_substances)``) ran as the NOBYPASSRLS runtime
role, so its subquery saw only the caller's own join rows. Any delete
therefore removed substances that other callers still referenced, and
``extraction_substances.substance_id ON DELETE CASCADE`` then took their
join rows with it — leaving extractions that list a structure_count and
open empty. With an empty scope the subquery is empty and the statement
truncates the whole pool.

Two changes:

1. ``public.sweep_orphan_chem_rows()`` — a SECURITY DEFINER function owned
   by the new NOLOGIN BYPASSRLS ``bchemxtract_sweeper`` role, so the
   reference test runs without row security. DDL text lives in
   ``app.services.orphan_sweep`` because the unit-test schema
   (``Base.metadata.create_all``) has to apply the same definition.

2. The two pool FKs go from ON DELETE CASCADE to ON DELETE RESTRICT. The
   fixed sweep never deletes a referenced row, so RESTRICT is a guardrail:
   a future regression raises a foreign-key violation instead of silently
   shredding join rows. The ``extraction_id`` FKs stay CASCADE — deleting
   an extraction must still take its own join rows.

Reversible. Note that downgrade restores CASCADE, i.e. it restores the
data-loss exposure; it does not restore rows already lost.
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op
from app.services.orphan_sweep import SWEEP_DDL, SWEEP_FUNCTION, SWEEPER_ROLE

# revision identifiers, used by Alembic.
revision: str = "c9d0e1f2a3b4"
down_revision: str | None = "f6fa34aa00f0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# (table, column, referenced table) for the two pool FKs. Both were created
# unnamed, so the live constraint name is whatever Postgres generated;
# look it up in pg_constraint instead of hardcoding a guess.
_POOL_FKS = (
    ("extraction_substances", "substance_id", "substances"),
    ("extraction_reactions", "reaction_id", "reactions"),
)


def _set_pool_fk_action(action: str) -> None:
    """Recreate both pool FKs with ``ON DELETE <action>``."""
    for table, column, target in _POOL_FKS:
        op.execute(f"""
            DO $$
            DECLARE existing text;
            BEGIN
                SELECT conname INTO existing
                  FROM pg_constraint
                 WHERE conrelid = 'public.{table}'::regclass
                   AND confrelid = 'public.{target}'::regclass
                   AND contype = 'f'
                   AND conkey = ARRAY[
                       (SELECT attnum FROM pg_attribute
                         WHERE attrelid = 'public.{table}'::regclass
                           AND attname = '{column}')
                   ]::smallint[];
                IF existing IS NOT NULL THEN
                    EXECUTE format(
                        'ALTER TABLE public.{table} DROP CONSTRAINT %I', existing
                    );
                END IF;
                ALTER TABLE public.{table}
                  ADD CONSTRAINT {table}_{column}_fkey
                  FOREIGN KEY ({column}) REFERENCES public.{target}(id)
                  ON DELETE {action};
            END $$;
        """)


def upgrade() -> None:
    for statement in SWEEP_DDL:
        op.execute(statement)
    _set_pool_fk_action("RESTRICT")


def downgrade() -> None:
    _set_pool_fk_action("CASCADE")
    op.execute(f"DROP FUNCTION IF EXISTS public.{SWEEP_FUNCTION}()")
    op.execute(f"REVOKE ALL ON TABLE public.reactions FROM {SWEEPER_ROLE}")
    op.execute(f"REVOKE ALL ON TABLE public.substances FROM {SWEEPER_ROLE}")
    op.execute(f"REVOKE ALL ON TABLE public.extraction_reactions FROM {SWEEPER_ROLE}")
    op.execute(f"REVOKE ALL ON TABLE public.extraction_substances FROM {SWEEPER_ROLE}")
    op.execute(f"REVOKE USAGE ON SCHEMA public FROM {SWEEPER_ROLE}")
    # Roles are cluster-wide. Another database in the same cluster (the
    # alembic-chain test DB, a second deployment) may still own a copy of
    # the function, and DROP ROLE then raises dependent_objects_still_exist
    # — which must not fail an otherwise complete downgrade. Leaving a
    # NOLOGIN role behind grants nothing: this migration already revoked
    # its every privilege in this database.
    op.execute(f"""
        DO $$
        BEGIN
            DROP ROLE IF EXISTS {SWEEPER_ROLE};
        EXCEPTION WHEN dependent_objects_still_exist THEN
            RAISE NOTICE
                'role {SWEEPER_ROLE} kept: objects in another database in '
                'this cluster still depend on it';
        END $$;
    """)
