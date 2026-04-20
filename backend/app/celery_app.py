"""Celery application factory for BChemXtract batch processing.

Uses solo pool (--pool=solo) to prevent JPype JVM fork safety issues.
worker_process_init signal initializes the JVM once per worker process.

SEC H-03: extraction tasks use ``asyncio.run()`` inside the worker
process. That only works on the **solo** pool; prefork / threaded pools
deadlock or raise. The pool type is asserted at ``worker_process_init``
so a misconfigured ``--pool=prefork`` refuses to start rather than
silently running broken tasks.
"""
from __future__ import annotations

import logging
import os
import sys

from celery import Celery
from celery.signals import worker_process_init

from app.config import settings

logger = logging.getLogger(__name__)

celery_app = Celery(
    "bchemxtract",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_track_started=True,
    task_acks_late=True,
    worker_concurrency=1,
    result_expires=3600,
    task_soft_time_limit=120,   # SoftTimeLimitExceeded after 120s — task can clean up
    task_time_limit=150,        # hard kill after 150s — prevents indefinite hang
    include=["app.tasks.extraction"],
    # SEC H-03: mandatory solo pool. worker_pool honoured unless the CLI
    # overrides it; the assertion below catches the CLI case.
    worker_pool="solo",
)


def _parse_pool_flag(argv: list[str]) -> str | None:
    """Return the value of ``--pool=<x>`` / ``--pool <x>`` from ``argv``.

    Returns ``None`` when no ``--pool`` flag is present.
    """
    for i, arg in enumerate(argv):
        if arg.startswith("--pool="):
            return arg.split("=", 1)[1].strip().lower()
        if arg == "--pool" and i + 1 < len(argv):
            return argv[i + 1].strip().lower()
    return None


def _assert_solo_pool() -> None:
    """Refuse to start the worker if --pool is anything other than solo.

    CLI ``--pool=<value>`` overrides ``worker_pool`` in config, so a
    future operator could type ``--pool=prefork`` and silently break
    the deployment. We re-read argv and refuse any non-solo setting.
    """
    chosen = _parse_pool_flag(list(sys.argv))
    if chosen is not None and chosen != "solo":
        raise RuntimeError(
            f"Celery worker started with --pool={chosen}, but this "
            "service requires --pool=solo. JVM/JPype is not fork-safe "
            "and extraction tasks use asyncio.run() which deadlocks "
            "on prefork/threads. Refusing to start."
        )


@worker_process_init.connect
def init_jvm_for_worker(**kwargs: object) -> None:
    """Initialize JVM in Celery worker via the solo-pool init signal."""
    _assert_solo_pool()
    from app.services.jvm_bridge import initialize_jvm  # noqa: PLC0415
    initialize_jvm(settings)
    logger.info(
        "Celery worker ready (pool=solo, concurrency=%d, pid=%d)",
        celery_app.conf.worker_concurrency,
        os.getpid(),
    )
