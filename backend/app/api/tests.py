"""Test execution, report, screenshot and export endpoints."""

from __future__ import annotations

import asyncio
import json
import shutil
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, StreamingResponse
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.api.serializers import (
    count_runs,
    execution_out,
    result_out,
    results_and_screenshots,
    screenshot_out,
)
from app.core.config import get_settings
from app.core.security import UnsafeTargetError, assert_safe_url
from app.database.db import SessionLocal, get_db
from app.models import Screenshot, TestExecution, TestResult
from app.schemas import (
    PaginatedExecutions,
    ReportResponse,
    ScreenshotOut,
    TestCreate,
    TestExecutionDetail,
    TestExecutionOut,
    TestResultOut,
)
from app.services.ai.analyzer import rule_based_only
from app.services.browser.screenshot_service import resolve_screenshot_path
from app.services.browser.test_runner import PROGRESS, runner
from app.services.reporting.report_builder import (
    build_export_html,
    build_export_json,
    health_from_summary,
    to_json_text,
)

router = APIRouter(tags=["tests"])
TERMINAL_STATUSES = {"passed", "failed", "warnings", "cancelled", "error"}

SortField = Literal["created_at", "health_score", "duration_ms", "status", "url"]


def _get_execution(db: Session, test_id: str) -> TestExecution:
    execution = db.get(TestExecution, test_id)
    if execution is None:
        raise HTTPException(status_code=404, detail="Test execution not found")
    return execution


def _analysis(db: Session, execution: TestExecution) -> dict[str, Any]:
    """Stored analysis, or a rule-based one computed on demand for old runs."""
    if execution.ai_analysis:
        return execution.ai_analysis
    results, _, _ = results_and_screenshots(db, execution.id)
    payload_results = [
        {
            "test_name": r.test_name,
            "category": r.category,
            "status": r.status,
            "severity": r.severity,
            "description": r.description,
            "error_details": r.error_details,
            "url": r.url,
        }
        for r in results
    ]
    analysis = rule_based_only(
        {
            "url": execution.url,
            "status": execution.status,
            "health_score": execution.health_score,
            "summary": execution.summary,
        },
        payload_results,
    )
    data = {**analysis.as_dict(), "generated_at": datetime.now(UTC).isoformat()}
    execution.ai_analysis = data
    db.commit()
    return data


@router.post("/tests", response_model=TestExecutionOut, status_code=status.HTTP_201_CREATED)
async def create_test(payload: TestCreate, db: Session = Depends(get_db)) -> Any:
    settings = get_settings()
    if not payload.authorized:
        raise HTTPException(
            status_code=400,
            detail=(
                "You must confirm that you own this website or have explicit permission to test it."
            ),
        )
    try:
        url = await assert_safe_url(payload.url)
    except UnsafeTargetError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    # Saved workspace defaults apply first; explicitly sent fields win.
    from app.api.settings import effective_settings

    prefs = effective_settings(db)
    config: dict[str, Any] = {
        "browser": prefs.default_browser,
        "max_depth": prefs.default_max_depth,
        "max_pages": prefs.default_max_pages,
        "max_links": prefs.default_max_links,
        "timeout_seconds": prefs.default_timeout_seconds,
        "check_links": True,
        "test_interactions": True,
        "test_forms": True,
        "capture_screenshots": prefs.capture_screenshots,
        "ai_analysis": prefs.ai_enabled,
    }
    config.update(payload.config.model_dump(exclude_unset=True))
    if config["max_links"] > settings.max_links_hard_limit:
        config["max_links"] = settings.max_links_hard_limit
    if config["max_pages"] > settings.max_pages_hard_limit:
        config["max_pages"] = settings.max_pages_hard_limit

    duplicate = (
        db.query(TestExecution)
        .filter(
            TestExecution.url == url,
            TestExecution.status.in_(["queued", "running", "pending"]),
        )
        .first()
    )
    if duplicate is not None:
        raise HTTPException(
            status_code=409,
            detail=(
                f"An identical test for this URL is already {duplicate.status} "
                f"(id {duplicate.id}). Wait for it to finish or cancel it."
            ),
        )

    execution = TestExecution(
        url=url,
        name=payload.name or "",
        status="queued",
        config=config,
        summary={},
        ai_analysis={},
    )
    db.add(execution)
    db.commit()
    db.refresh(execution)
    await runner.submit(execution.id)
    return execution_out(execution, include_progress=True)


@router.get("/tests", response_model=PaginatedExecutions)
def list_tests(
    db: Session = Depends(get_db),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
    status_filter: str | None = Query(default=None, alias="status"),
    search: str | None = Query(default=None, max_length=200),
    sort: SortField = Query(default="created_at"),
    order: Literal["asc", "desc"] = Query(default="desc"),
) -> PaginatedExecutions:
    query = db.query(TestExecution)
    if status_filter and status_filter != "all":
        statuses = [s.strip() for s in status_filter.split(",") if s.strip()]
        query = query.filter(TestExecution.status.in_(statuses))
    if search:
        pattern = f"%{search.strip()}%"
        query = query.filter(
            or_(
                TestExecution.url.ilike(pattern),
                TestExecution.name.ilike(pattern),
                TestExecution.page_title.ilike(pattern),
            )
        )
    total = query.with_entities(func.count(TestExecution.id)).scalar() or 0
    column = getattr(TestExecution, sort)
    query = query.order_by(column.asc() if order == "asc" else column.desc())
    rows = query.offset((page - 1) * page_size).limit(page_size).all()

    counts = count_runs(db, [row.id for row in rows])
    pages = max(1, (total + page_size - 1) // page_size)
    return PaginatedExecutions(
        items=[execution_out(row, counts.get(row.id)) for row in rows],
        total=total,
        page=page,
        page_size=page_size,
        pages=pages,
    )


@router.get("/tests/{test_id}", response_model=TestExecutionDetail)
def get_test(test_id: str, db: Session = Depends(get_db)) -> Any:
    execution = _get_execution(db, test_id)
    results, screenshots, mapping = results_and_screenshots(db, execution.id)
    counts = count_runs(db, [execution.id]).get(execution.id)
    payload = execution_out(execution, counts, include_progress=True)
    return {
        **payload,
        "results": [result_out(r, mapping.get(r.id)) for r in results],
        "screenshots": [screenshot_out(s) for s in screenshots],
        "ai_analysis": execution.ai_analysis or {},
    }


@router.post("/tests/{test_id}/rerun", response_model=TestExecutionOut, status_code=201)
async def rerun_test(test_id: str, db: Session = Depends(get_db)) -> Any:
    original = _get_execution(db, test_id)
    try:
        url = await assert_safe_url(original.url)
    except UnsafeTargetError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    duplicate = (
        db.query(TestExecution)
        .filter(
            TestExecution.url == url,
            TestExecution.status.in_(["queued", "running", "pending"]),
        )
        .first()
    )
    if duplicate is not None:
        raise HTTPException(
            status_code=409, detail=f"This URL is already being tested (id {duplicate.id})."
        )
    execution = TestExecution(
        url=url,
        name=original.name,
        status="queued",
        config=original.config or {},
        summary={"rerun_of": original.id},
        ai_analysis={},
    )
    db.add(execution)
    db.commit()
    db.refresh(execution)
    await runner.submit(execution.id)
    return execution_out(execution, include_progress=True)


@router.post("/tests/{test_id}/cancel", response_model=TestExecutionOut)
def cancel_test(test_id: str, db: Session = Depends(get_db)) -> Any:
    execution = _get_execution(db, test_id)
    if execution.status in TERMINAL_STATUSES:
        raise HTTPException(
            status_code=409, detail=f"The run already finished with status '{execution.status}'."
        )
    cancelled = runner.mark_cancel_requested(test_id)
    if not cancelled:
        raise HTTPException(status_code=409, detail="The run could not be cancelled.")
    db.expire_all()
    execution = _get_execution(db, test_id)
    counts = count_runs(db, [execution.id]).get(execution.id)
    return execution_out(execution, counts, include_progress=True)


@router.delete("/tests/{test_id}", status_code=204)
def delete_test(test_id: str, db: Session = Depends(get_db)) -> None:
    execution = _get_execution(db, test_id)
    if execution.status in {"queued", "running"}:
        raise HTTPException(
            status_code=409,
            detail="Cancel this running test before deleting it.",
        )
    screenshots_dir = Path(get_settings().screenshot_dir) / execution.id
    db.delete(execution)
    db.commit()
    if screenshots_dir.exists():
        shutil.rmtree(screenshots_dir, ignore_errors=True)
    return None


@router.get("/tests/{test_id}/results", response_model=list[TestResultOut])
def get_results(test_id: str, db: Session = Depends(get_db)) -> Any:
    execution = _get_execution(db, test_id)
    results, _, mapping = results_and_screenshots(db, execution.id)
    return [result_out(r, mapping.get(r.id)) for r in results]


@router.get("/tests/{test_id}/screenshots", response_model=list[ScreenshotOut])
def get_screenshots(test_id: str, db: Session = Depends(get_db)) -> Any:
    execution = _get_execution(db, test_id)
    rows = (
        db.query(Screenshot)
        .filter(Screenshot.execution_id == execution.id)
        .order_by(Screenshot.created_at)
        .all()
    )
    return [screenshot_out(row) for row in rows]


@router.get("/tests/{test_id}/screenshots/{screenshot_id}/file")
def download_screenshot(
    test_id: str,
    screenshot_id: str,
    download: int = Query(default=0),
    db: Session = Depends(get_db),
) -> FileResponse:
    execution = _get_execution(db, test_id)
    shot = db.get(Screenshot, screenshot_id)
    if shot is None or shot.execution_id != execution.id:
        raise HTTPException(status_code=404, detail="Screenshot not found")
    try:
        path = resolve_screenshot_path(shot.file_path)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Screenshot file is missing on disk")
    headers = {"Cache-Control": "private, max-age=3600"}
    if download:
        headers["Content-Disposition"] = f'attachment; filename="{path.name}"'
    return FileResponse(path, media_type="image/png", headers=headers)


@router.get("/tests/{test_id}/report", response_model=ReportResponse)
def get_report(test_id: str, db: Session = Depends(get_db)) -> Any:
    execution = _get_execution(db, test_id)
    results, screenshots, mapping = results_and_screenshots(db, execution.id)
    counts = count_runs(db, [execution.id]).get(execution.id)
    analysis = _analysis(db, execution)
    return {
        "execution": execution_out(execution, counts, include_progress=True),
        "results": [result_out(r, mapping.get(r.id)) for r in results],
        "screenshots": [screenshot_out(s) for s in screenshots],
        "analysis": analysis,
        "health": health_from_summary(execution),
        "generated_at": datetime.now(UTC),
    }


def _export_payload(db: Session, execution: TestExecution) -> tuple[dict, Any, Any, Any]:
    results, screenshots, _ = results_and_screenshots(db, execution.id)
    analysis = _analysis(db, execution)
    for shot in screenshots:
        try:
            shot.absolute_path = str(resolve_screenshot_path(shot.file_path))  # type: ignore[attr-defined]
        except ValueError:
            shot.absolute_path = ""  # type: ignore[attr-defined]
    return analysis, results, screenshots, execution


@router.get("/tests/{test_id}/export/json")
def export_json(test_id: str, db: Session = Depends(get_db)) -> JSONResponse:
    execution = _get_execution(db, test_id)
    analysis, results, screenshots, _ = _export_payload(db, execution)
    payload = build_export_json(execution, results, screenshots, analysis)
    return JSONResponse(
        content=json.loads(to_json_text(payload)),
        headers={"Content-Disposition": f'attachment; filename="testpilot-{execution.id}.json"'},
    )


@router.get("/tests/{test_id}/export/html")
def export_html(test_id: str, db: Session = Depends(get_db)) -> HTMLResponse:
    execution = _get_execution(db, test_id)
    analysis, results, screenshots, _ = _export_payload(db, execution)
    html_document = build_export_html(execution, results, screenshots, analysis)
    return HTMLResponse(
        content=html_document,
        headers={"Content-Disposition": f'attachment; filename="testpilot-{execution.id}.html"'},
    )


def _sse(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, default=str)}\n\n"


@router.get("/tests/{test_id}/events")
async def stream_events(
    test_id: str, request: Request, db: Session = Depends(get_db)
) -> StreamingResponse:
    _get_execution(db, test_id)

    async def generator() -> AsyncIterator[str]:
        last_signature: str | None = None
        while True:
            if await request.is_disconnected():
                break
            with SessionLocal() as session:
                execution = session.get(TestExecution, test_id)
                if execution is None:
                    yield _sse("error", {"detail": "Execution deleted"})
                    break
                results = (
                    session.query(TestResult)
                    .filter(TestResult.execution_id == test_id)
                    .order_by(TestResult.created_at)
                    .all()
                )
                snapshot = {
                    "status": execution.status,
                    "duration_ms": execution.duration_ms,
                    "health_score": execution.health_score,
                    "progress": PROGRESS.get(test_id),
                    "counts": count_runs(session, [test_id]).get(
                        test_id,
                        {
                            "total": 0,
                            "passed": 0,
                            "failed": 0,
                            "warnings": 0,
                            "skipped": 0,
                            "info": 0,
                        },
                    ),
                    "results": [
                        {
                            "id": r.id,
                            "test_name": r.test_name,
                            "category": r.category,
                            "status": r.status,
                            "severity": r.severity,
                            "description": r.description,
                            "error_details": r.error_details,
                            "url": r.url,
                            "duration_ms": r.duration_ms,
                        }
                        for r in results
                    ],
                    "terminal": execution.status in TERMINAL_STATUSES,
                }
            signature = json.dumps(snapshot, sort_keys=True, default=str)
            if signature != last_signature:
                yield _sse("update", snapshot)
                last_signature = signature
            else:
                yield ": keep-alive\n\n"
            if snapshot["terminal"]:
                yield _sse("done", {"status": snapshot["status"]})
                break
            await asyncio.sleep(0.8)

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/tests/{test_id}/export/json/meta")
def export_meta(test_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    execution = _get_execution(db, test_id)
    return {
        "execution_id": execution.id,
        "json": f"/api/tests/{execution.id}/export/json",
        "html": f"/api/tests/{execution.id}/export/html",
    }
