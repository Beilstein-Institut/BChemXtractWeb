"""Orphan sweep for the globally-deduplicated chemistry pools.

``substances`` and ``reactions`` are global dedup pools shared by every
caller — they carry no owner columns and no RLS policy. Only the join
tables (``extraction_substances`` / ``extraction_reactions``) are
RLS-scoped. That combination makes the obvious sweep unsafe:

    DELETE FROM substances
     WHERE id NOT IN (SELECT substance_id FROM extraction_substances)

Run by the NOBYPASSRLS runtime role, the subquery only sees the *caller's*
join rows, so the statement deletes every substance the caller does not
reference — including rows other callers still point at. The join rows
then vanish through the FK, and those extractions survive with a stored
``structure_count`` and nothing to show. When the caller's scope is empty
the subquery is empty and the statement truncates the entire pool.

The reference test therefore has to run without row security. It lives in
a ``SECURITY DEFINER`` function owned by ``bchemxtract_sweeper`` — a
NOLOGIN BYPASSRLS role that exists only to own this function and holds no
privilege beyond SELECT on the two join tables plus DELETE on the two
pools. The runtime role gets EXECUTE and nothing more, so the widest
possible misuse is deleting rows that are already unreferenced.

The DDL lives here rather than inline in the migration because the unit
test schema is built by ``Base.metadata.create_all`` (see
``tests/conftest.py``), which knows nothing about migrations. Both
appliers use these statements so the suite exercises the same function
production runs. Every statement is idempotent — re-applying is a no-op.
"""

from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

SWEEPER_ROLE = "bchemxtract_sweeper"
SWEEP_FUNCTION = "sweep_orphan_chem_rows"

# Attributes are identical on the CREATE and ALTER paths so a pre-existing
# role converges to the same shape. NOLOGIN: nothing ever connects as this
# role — it exists solely to own the function. BYPASSRLS is the whole
# point; granting it requires superuser, which the migrate service has.
_ROLE_ATTRS = (
    "NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT BYPASSRLS"
)

SWEEP_DDL: tuple[str, ...] = (
    # Roles are cluster-wide, so guard on existence rather than assuming a
    # fresh cluster (mirrors the bchemxtract_app role migration).
    f"""
    DO $$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '{SWEEPER_ROLE}') THEN
            CREATE ROLE {SWEEPER_ROLE} WITH {_ROLE_ATTRS};
        ELSE
            ALTER ROLE {SWEEPER_ROLE} WITH {_ROLE_ATTRS};
        END IF;
    END $$;
    """,
    f"GRANT USAGE ON SCHEMA public TO {SWEEPER_ROLE}",
    f"GRANT SELECT ON TABLE public.extraction_substances TO {SWEEPER_ROLE}",
    f"GRANT SELECT ON TABLE public.extraction_reactions TO {SWEEPER_ROLE}",
    f"GRANT SELECT, DELETE ON TABLE public.substances TO {SWEEPER_ROLE}",
    f"GRANT SELECT, DELETE ON TABLE public.reactions TO {SWEEPER_ROLE}",
    # NOT EXISTS (not NOT IN): correct on a NULL-free column either way, but
    # it is the form that stays correct if the column ever becomes nullable,
    # and it lets the planner use the join-table index.
    f"""
    CREATE OR REPLACE FUNCTION public.{SWEEP_FUNCTION}() RETURNS void
    LANGUAGE sql
    SECURITY DEFINER
    SET search_path = pg_catalog, public
    AS $$
        DELETE FROM public.substances s
         WHERE NOT EXISTS (
             SELECT 1 FROM public.extraction_substances x
              WHERE x.substance_id = s.id
         );
        DELETE FROM public.reactions r
         WHERE NOT EXISTS (
             SELECT 1 FROM public.extraction_reactions x
              WHERE x.reaction_id = r.id
         );
    $$;
    """,
    # OWNER TO is what makes SECURITY DEFINER run with BYPASSRLS.
    f"ALTER FUNCTION public.{SWEEP_FUNCTION}() OWNER TO {SWEEPER_ROLE}",
    # A SECURITY DEFINER function is EXECUTE-to-PUBLIC by default. Revoke
    # first, then grant only the runtime role.
    f"REVOKE ALL ON FUNCTION public.{SWEEP_FUNCTION}() FROM PUBLIC",
    # bchemxtract_app is absent from the create_all test schema, so the
    # grant is conditional rather than unconditional.
    f"""
    DO $$
    BEGIN
        IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'bchemxtract_app') THEN
            EXECUTE 'GRANT EXECUTE ON FUNCTION public.{SWEEP_FUNCTION}() '
                    'TO bchemxtract_app';
        END IF;
    END $$;
    """,
)

_SWEEP_CALL = text(f"SELECT public.{SWEEP_FUNCTION}()")


async def sweep_orphan_chem_rows(db: AsyncSession) -> None:
    """Delete substances and reactions no extraction references any more.

    Participates in the caller's transaction — callers that need the sweep
    to be atomic with an audit insert simply do not commit in between.

    Args:
        db: AsyncSession. Its RLS context is irrelevant: the reference test
            happens inside a SECURITY DEFINER function that bypasses row
            security, which is exactly why this is not inline SQL.
    """
    await db.execute(_SWEEP_CALL)
