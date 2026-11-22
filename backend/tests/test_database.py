"""Database layer tests."""

from __future__ import annotations

from datetime import UTC, datetime

from app.models import TestExecution, TestResult


def test_execution_roundtrip_and_utc_datetimes(db):
    execution = TestExecution(
        url="https://example.com/",
        name="Round trip",
        status="queued",
        config={"max_pages": 3},
        started_at=datetime(2026, 1, 2, 3, 4, 5, tzinfo=UTC),
    )
    db.add(execution)
    db.commit()
    db.refresh(execution)

    stored = db.get(TestExecution, execution.id)
    assert stored is not None
    assert stored.config == {"max_pages": 3}
    assert stored.started_at is not None
    assert stored.started_at.tzinfo is UTC
    assert stored.started_at.year == 2026


def test_results_cascade_with_execution(db, make_execution, make_result):
    execution_id = make_execution()
    make_result(execution_id, status="failed", severity="high")
    make_result(execution_id, status="warning", severity="low", test_name="Links resolve")

    assert db.query(TestResult).filter_by(execution_id=execution_id).count() == 2
    db.delete(db.get(TestExecution, execution_id))
    db.commit()
    assert db.query(TestResult).filter_by(execution_id=execution_id).count() == 0


def test_result_defaults(db, make_execution):
    execution_id = make_execution()
    result = TestResult(
        execution_id=execution_id,
        test_name="Custom",
        category="forms",
        status="skipped",
    )
    db.add(result)
    db.commit()
    db.refresh(result)
    assert result.id and len(result.id) == 32
    assert result.severity == "low"
    assert result.created_at is not None


def test_settings_singleton_is_seeded(client):
    response = client.get("/api/settings")
    assert response.status_code == 200
    assert response.json()["settings"]["default_timeout_seconds"] >= 10
