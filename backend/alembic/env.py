"""Alembic async migration environment (Phase 5).

Converted from sync engine_from_config to async_engine_from_config per
the official Alembic async template. Required because the app uses
create_async_engine with psycopg3 async driver.

IMPORTANT: ORM models must be imported BEFORE target_metadata is set —
otherwise autogenerate sees an empty schema.
"""

import asyncio
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context
from app.config import settings

# CRITICAL: import all ORM modules before accessing Base.metadata
# Without this import, autogenerate sees zero tables.
from app.models.orm import Base  # noqa: F401

config = context.config
config.set_main_option("sqlalchemy.url", settings.database_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def do_run_migrations(connection):
    """Synchronous migration runner — called inside run_sync() bridge."""
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Async migration runner using psycopg3 async driver."""
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_offline() -> None:
    """Offline mode: generate SQL DDL without connecting."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Online mode: connect and apply migrations via asyncio.run() bridge."""
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
