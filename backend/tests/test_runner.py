"""Test execution state machine, cancellation and duplication guards."""

from __future__ import annotations

import asyncio
from datetime import UTC

import pytest
from app.database.db import SessionLocal
from app.models import TestExecution
from app.services.browser.test_runner import TestCancelled, TestRunner


def test_mark_cancel_requested_cancels_queued_run(db, make_execution):
    execution_id = make_execution(status="queued")
    runner = TestRunner()
    assert runner.mark_cancel_requested(execution_id) is True
    db.expire_all()
    execution = db.get(TestExecution, execution_id)
    assert execution.status == "cancelled"
    assert execution.cancel_requested is True


def test_cannot_cancel_finalised_run(make_execution, make_result):
    execution_id = make_execution(status="passed")
    assert TestRunner().mark_cancel_requested(execution_id) is False


def test_check_cancel_raises_after_flag(make_execution):
    execution_id = make_execution(status="running", cancel_requested=True)
    with pytest.raises(TestCancelled):
        TestRunner._check_cancel(execution_id)


def test_check_cancel_is_silent_without_flag(make_execution):
    execution_id = make_execution(status="running")
    TestRunner._check_cancel(execution_id)  # does not raise


def test_finalize_error_records_state(make_execution, db):
    from datetime import datetime

    execution_id = make_execution(status="running", started_at=datetime.now(UTC))
    TestRunner()._finalize_error(execution_id, "Browser crashed")
    db.expire_all()
    execution = db.get(TestExecution, execution_id)
    assert execution.status == "error"
    assert execution.error_message == "Browser crashed"
    assert execution.duration_ms is not None


def test_record_persists_result(make_execution):
    from datetime import datetime

    execution_id = make_execution(status="running")
    runner = TestRunner()
    record = runner._record(
        execution_id,
        name="No JavaScript errors",
        category="javascript",
        status="passed",
        severity="low",
        description="Clean console",
        url="https://x.test/",
        error_details=None,
        duration_ms=5,
        started_at=datetime.now(UTC),
    )
    assert record["id"]
    with SessionLocal() as session:
        from app.models import TestResult

        stored = session.get(TestResult, record["id"])
        assert stored is not None
        assert stored.test_name == "No JavaScript errors"


@pytest.mark.asyncio
async def test_submit_does_not_duplicate_tasks(monkeypatch):
    runner = TestRunner()
    release = asyncio.Event()

    async def fake_execute(_execution_id: str) -> None:
        await release.wait()

    monkeypatch.setattr(runner, "_execute", fake_execute)
    await runner.submit("abc")
    await runner.submit("abc")
    assert len(runner._tasks) == 1
    assert runner.is_running("abc") is True
    release.set()
    await asyncio.sleep(0.05)
    assert runner.is_running("abc") is False


@pytest.mark.asyncio
async def test_runner_skips_non_queued_executions(make_execution, db):
    execution_id = make_execution(status="passed")
    await TestRunner()._execute(execution_id)
    db.expire_all()
    assert db.get(TestExecution, execution_id).status == "passed"
