"""Regression test for the Celery pool assertion.

Ensures that a worker started with anything other than ``--pool=solo``
refuses to initialise. Mutates ``sys.argv`` to simulate the operator
typing the forbidden flag.
"""

from __future__ import annotations

import pytest

from app.celery_app import _assert_solo_pool


def test_no_pool_flag_passes(monkeypatch) -> None:
    monkeypatch.setattr("sys.argv", ["celery", "worker"])
    _assert_solo_pool()  # should not raise


def test_explicit_solo_pool_passes(monkeypatch) -> None:
    monkeypatch.setattr("sys.argv", ["celery", "worker", "--pool=solo"])
    _assert_solo_pool()


def test_solo_space_form_passes(monkeypatch) -> None:
    monkeypatch.setattr("sys.argv", ["celery", "worker", "--pool", "solo"])
    _assert_solo_pool()


def test_prefork_pool_rejected(monkeypatch) -> None:
    monkeypatch.setattr("sys.argv", ["celery", "worker", "--pool=prefork"])
    with pytest.raises(RuntimeError) as exc_info:
        _assert_solo_pool()
    assert "prefork" in str(exc_info.value)
    assert "asyncio.run" in str(exc_info.value)


def test_threads_pool_rejected(monkeypatch) -> None:
    monkeypatch.setattr("sys.argv", ["celery", "worker", "--pool=threads"])
    with pytest.raises(RuntimeError):
        _assert_solo_pool()


def test_gevent_pool_rejected(monkeypatch) -> None:
    monkeypatch.setattr("sys.argv", ["celery", "worker", "--pool=gevent"])
    with pytest.raises(RuntimeError):
        _assert_solo_pool()


def test_case_insensitive_solo(monkeypatch) -> None:
    """Values are normalised to lowercase before comparison."""
    monkeypatch.setattr("sys.argv", ["celery", "worker", "--pool=SOLO"])
    _assert_solo_pool()
