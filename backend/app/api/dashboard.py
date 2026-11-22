"""Health, dashboard and system endpoints."""

from __future__ import annotations

import time
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.api.serializers import count_runs, execution_out
from app.core.config import get_settings
from app.database.db import get_db
from app.models import Screenshot, TestExecution
from app.schemas import (
    ActivityPoint,
    DashboardResponse,
    DashboardStats,
    HealthSummary,
    SystemInfo,
)
from app.services.browser.browser_manager import browser_health
from app.services.reporting.report_builder import health_from_summary

router = APIRouter(tags=["dashboard"])
STARTED_AT = time.time()
_browser_cache: dict[str, object] = {"checked": 0.0, "payload": None}


@router.get("/health")
def health(db: Session = Depends(get_db)) -> dict[str, object]:
    database_ok = True
    try:
        db.execute(text("SELECT 1"))
    except Exception:  # pragma: no cover - only on broken database
        database_ok = False
    return {
        "status": "ok" if database_ok else "degraded",
        "version": get_settings().version,
        "database": "ok" if database_ok else "error",
        "timestamp": datetime.now(UTC).isoformat(),
    }


def _stats(db: Session) -> DashboardStats:
    rows = db.query(TestExecution).all()
    total = len(rows)
    passed = sum(1 for row in rows if row.status == "passed")
    failed = sum(1 for row in rows if row.status in {"failed", "error"})
    warnings = sum(1 for row in rows if row.status == "warnings")
    running = sum(1 for row in rows if row.status in {"queued", "running", "pending"})
    finished = [row for row in rows if row.duration_ms is not None]
    scored = [row for row in rows if row.health_score is not None]
    completed = passed + failed + warnings
    return DashboardStats(
        total_tests=total,
        passed_tests=passed,
        failed_tests=failed,
        warning_tests=warnings,
        running_tests=running,
        success_rate=round((passed / completed) * 100, 1) if completed else 0.0,
        average_duration_ms=round(sum(row.duration_ms or 0 for row in finished) / len(finished), 0)
        if finished
        else 0.0,
        average_health_score=round(sum(row.health_score or 0 for row in scored) / len(scored), 1)
        if scored
        else None,
        last_run_at=max((row.created_at for row in rows), default=None),
    )


def _activity(db: Session, days: int) -> list[ActivityPoint]:
    days = max(1, min(days, 90))
    since = datetime.now(UTC) - timedelta(days=days - 1)
    rows = (
        db.query(
            func.date(TestExecution.created_at).label("day"),
            TestExecution.status,
            func.count(TestExecution.id),
        )
        .filter(TestExecution.created_at >= since)
        .group_by("day", TestExecution.status)
        .all()
    )
    buckets: dict[str, dict[str, int]] = {}
    for offset in range(days):
        key = (since + timedelta(days=offset)).strftime("%Y-%m-%d")
        buckets[key] = {"total": 0, "passed": 0, "failed": 0, "warnings": 0}
    for day, status, amount in rows:
        key = str(day)
        if key not in buckets:
            buckets[key] = {"total": 0, "passed": 0, "failed": 0, "warnings": 0}
        buckets[key]["total"] += amount
        if status == "passed":
            buckets[key]["passed"] += amount
        elif status in {"failed", "error"}:
            buckets[key]["failed"] += amount
        elif status == "warnings":
            buckets[key]["warnings"] += amount
    return [ActivityPoint(date=day, **counts) for day, counts in sorted(buckets.items())]


def _latest_health(db: Session) -> HealthSummary:
    latest = (
        db.query(TestExecution)
        .filter(TestExecution.summary.isnot(None))
        .order_by(TestExecution.created_at.desc())
        .first()
    )
    if latest is None or not latest.summary:
        return HealthSummary(
            health_score=None,
            broken_links=0,
            javascript_errors=0,
            failed_requests=0,
            form_validation_status="not tested",
            explanation=(
                "No completed test run yet. Run a test to compute a health score "
                "from real findings."
            ),
            has_data=False,
        )
    data = health_from_summary(latest)
    return HealthSummary(**data)


@router.get("/dashboard", response_model=DashboardResponse)
def dashboard(
    db: Session = Depends(get_db), days: int = Query(default=14, ge=1, le=90)
) -> DashboardResponse:
    recent_rows = db.query(TestExecution).order_by(TestExecution.created_at.desc()).limit(6).all()
    counts = count_runs(db, [row.id for row in recent_rows])
    return DashboardResponse(
        stats=_stats(db),
        recent=[execution_out(row, counts.get(row.id)) for row in recent_rows],
        activity=_activity(db, days),
        health=_latest_health(db),
    )


@router.get("/dashboard/stats", response_model=DashboardStats)
def dashboard_stats(db: Session = Depends(get_db)) -> DashboardStats:
    return _stats(db)


@router.get("/dashboard/activity", response_model=list[ActivityPoint])
def dashboard_activity(
    db: Session = Depends(get_db), days: int = Query(default=14, ge=1, le=90)
) -> list[ActivityPoint]:
    return _activity(db, days)


@router.get("/system/info", response_model=SystemInfo)
async def system_info(db: Session = Depends(get_db)) -> SystemInfo:
    settings = get_settings()
    now = time.time()
    if now - float(_browser_cache["checked"]) > 60 or _browser_cache["payload"] is None:
        _browser_cache["payload"] = await browser_health(settings.default_browser)
        _browser_cache["checked"] = now
    browser = _browser_cache["payload"] or {}
    database_ok = True
    try:
        db.execute(text("SELECT 1"))
    except Exception:  # pragma: no cover
        database_ok = False
    return SystemInfo(
        version=settings.version,
        backend_status="ok",
        database_status="ok" if database_ok else "error",
        database_url_scheme=settings.database_url.split(":", 1)[0],
        browser_engine=str(browser.get("engine", settings.default_browser)),
        browser_version=browser.get("version") if browser.get("installed") else None,
        browser_installed=bool(browser.get("installed")),
        executions_stored=db.scalar(select(func.count(TestExecution.id))) or 0,
        screenshots_stored=db.scalar(select(func.count(Screenshot.id))) or 0,
        ai_provider=settings.ai_provider,
        ai_configured=bool(settings.ai_api_key),
        ai_mode="ai" if settings.ai_api_key and settings.ai_enabled else "rule-based",
        uptime_seconds=round(time.time() - STARTED_AT, 1),
        allow_local_targets=settings.allow_local_targets,
        max_concurrency=settings.max_concurrency,
    )
