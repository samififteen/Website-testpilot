"""Serialization helpers shared by the API routers."""

from __future__ import annotations

from collections import defaultdict
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Screenshot, TestExecution, TestResult
from app.services.browser.test_runner import PROGRESS

RESULT_STATUS_MAP = {
    "passed": "passed",
    "failed": "failed",
    "warning": "warnings",
    "skipped": "skipped",
    "info": "info",
}


def screenshot_out(shot: Screenshot) -> dict[str, Any]:
    return {
        "id": shot.id,
        "execution_id": shot.execution_id,
        "test_result_id": shot.test_result_id,
        "screenshot_type": shot.screenshot_type,
        "page_url": shot.page_url,
        "size_bytes": shot.size_bytes,
        "created_at": shot.created_at,
        "view_url": f"/api/tests/{shot.execution_id}/screenshots/{shot.id}/file",
        "download_url": f"/api/tests/{shot.execution_id}/screenshots/{shot.id}/file?download=1",
    }


def result_out(result: TestResult, screenshot_ids: list[str] | None = None) -> dict[str, Any]:
    return {
        "id": result.id,
        "execution_id": result.execution_id,
        "test_name": result.test_name,
        "category": result.category,
        "status": result.status,
        "severity": result.severity,
        "description": result.description,
        "url": result.url,
        "error_details": result.error_details,
        "duration_ms": result.duration_ms,
        "started_at": result.started_at,
        "finished_at": result.finished_at,
        "created_at": result.created_at,
        "screenshot_ids": screenshot_ids or [],
    }


def count_runs(db: Session, execution_ids: list[str]) -> dict[str, dict[str, int]]:
    counts: dict[str, dict[str, int]] = defaultdict(
        lambda: {"total": 0, "passed": 0, "failed": 0, "warnings": 0, "skipped": 0, "info": 0}
    )
    if not execution_ids:
        return {}
    rows = db.execute(
        select(TestResult.execution_id, TestResult.status, func.count(TestResult.id))
        .where(TestResult.execution_id.in_(execution_ids))
        .group_by(TestResult.execution_id, TestResult.status)
    ).all()
    for execution_id, status, amount in rows:
        bucket = RESULT_STATUS_MAP.get(status, "info")
        counts[execution_id][bucket] += amount
        counts[execution_id]["total"] += amount
    return dict(counts)


def execution_out(
    execution: TestExecution,
    counts: dict[str, int] | None = None,
    *,
    include_progress: bool = False,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "id": execution.id,
        "url": execution.url,
        "name": execution.name,
        "status": execution.status,
        "config": execution.config or {},
        "started_at": execution.started_at,
        "finished_at": execution.finished_at,
        "duration_ms": execution.duration_ms,
        "health_score": execution.health_score,
        "page_title": execution.page_title,
        "summary": execution.summary or {},
        "error_message": execution.error_message,
        "created_at": execution.created_at,
        "counts": counts
        or {"total": 0, "passed": 0, "failed": 0, "warnings": 0, "skipped": 0, "info": 0},
    }
    if include_progress:
        payload["progress"] = PROGRESS.get(execution.id)
    return payload


def results_and_screenshots(
    db: Session, execution_id: str
) -> tuple[list[TestResult], list[Screenshot], dict[str, list[str]]]:
    results = (
        db.query(TestResult)
        .filter(TestResult.execution_id == execution_id)
        .order_by(TestResult.created_at)
        .all()
    )
    screenshots = (
        db.query(Screenshot)
        .filter(Screenshot.execution_id == execution_id)
        .order_by(Screenshot.created_at)
        .all()
    )
    mapping: dict[str, list[str]] = defaultdict(list)
    for shot in screenshots:
        if shot.test_result_id:
            mapping[shot.test_result_id].append(shot.id)
    return results, screenshots, dict(mapping)
