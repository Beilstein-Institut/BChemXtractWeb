"""Celery application factory for BChemXtract batch processing.

Uses solo pool (--pool=solo) to prevent JPype JVM fork safety issues.
worker_process_init signal initializes the JVM once per worker process.
"""
from celery import Celery
from celery.signals import worker_process_init

from app.config import settings

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
)


@worker_process_init.connect
def init_jvm_for_worker(**kwargs: object) -> None:
    """Initialize JVM in Celery worker process via solo pool worker_process_init signal."""
    from app.services.jvm_bridge import initialize_jvm
    initialize_jvm(settings)
