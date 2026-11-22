"""End-to-end browser automation tests against the local fixture website.

No external websites are contacted.
"""

from __future__ import annotations

import pytest
from app.database.db import SessionLocal, init_db
from app.models import Screenshot, TestExecution, TestResult
from app.services.browser.test_runner import runner


async def _run(url: str, config: dict) -> str:
    init_db()
    with SessionLocal() as session:
        execution = TestExecution(
            url=url,
            name="Fixture scan",
            status="queued",
            config=config,
            summary={},
            ai_analysis={},
        )
        session.add(execution)
        session.commit()
        execution_id = execution.id
    await runner.submit(execution_id)
    for _ in range(600):
        await __import__("asyncio").sleep(0.1)
        with SessionLocal() as session:
            current = session.get(TestExecution, execution_id)
            if current is not None and current.status in {
                "passed",
                "failed",
                "warnings",
                "cancelled",
                "error",
            }:
                return execution_id
    raise AssertionError("Test execution did not finish in time")


async def _cancel_and_wait(execution_id: str) -> None:
    import asyncio

    runner.mark_cancel_requested(execution_id)
    for _ in range(100):
        await asyncio.sleep(0.1)
        with SessionLocal() as session:
            current = session.get(TestExecution, execution_id)
            if current is not None and current.status == "cancelled":
                return
    raise AssertionError("Execution was not cancelled")


@pytest.mark.asyncio
async def test_full_scan_detects_fixture_problems(fixture_server):
    execution_id = await _run(
        fixture_server + "index.html",
        {
            "browser": "chromium",
            "max_depth": 1,
            "max_pages": 3,
            "max_links": 8,
            "timeout_seconds": 25,
            "check_links": True,
            "test_interactions": True,
            "test_forms": True,
            "capture_screenshots": True,
            "ai_analysis": False,
        },
    )

    with SessionLocal() as session:
        execution = session.get(TestExecution, execution_id)
        assert execution is not None
        assert execution.status == "failed", execution.summary
        assert execution.health_score is not None and execution.health_score < 100
        assert execution.page_title == "Fixture Site — Home"
        assert execution.duration_ms and execution.duration_ms > 0

        facts = execution.summary["facts"]
        assert facts["javascript_errors"] >= 1, "uncaught fixture error must be detected"
        assert facts["failed_requests"] >= 1, "missing image must be detected"
        assert facts["broken_links"] >= 1, "404 link must be detected"
        assert facts["pages_inspected"] >= 2, "internal navigation should be crawled"

        results = session.query(TestResult).filter_by(execution_id=execution_id).all()
        by_category = {result.category: result for result in results}
        assert by_category["page_load"].status == "passed"
        assert by_category["javascript"].status == "failed"
        assert by_category["links"].status == "failed"
        assert by_category["network"].status == "failed"
        assert by_category["buttons"].status in {"passed", "skipped"}
        assert "HTTP 404" in (by_category["links"].error_details or "")

        screenshots = session.query(Screenshot).filter_by(execution_id=execution_id).all()
        assert len(screenshots) >= 2

        for shot in screenshots:
            from app.services.browser.screenshot_service import resolve_screenshot_path

            path = resolve_screenshot_path(shot.file_path)
            assert path.is_file(), f"missing screenshot file {path}"
            assert path.stat().st_size > 0

        # AI was disabled for the run: a rule-based report must still exist.
        assert execution.ai_analysis["mode"] == "rule-based"
        assert execution.ai_analysis["executive_summary"]
        assert execution.ai_analysis["findings"]


@pytest.mark.asyncio
async def test_form_validation_is_verified_without_submitting(fixture_server):
    execution_id = await _run(
        fixture_server + "form.html",
        {
            "browser": "chromium",
            "max_depth": 0,
            "max_pages": 1,
            "max_links": 3,
            "timeout_seconds": 25,
            "check_links": True,
            "test_interactions": False,
            "test_forms": True,
            "capture_screenshots": False,
            "ai_analysis": False,
        },
    )
    with SessionLocal() as session:
        results = session.query(TestResult).filter_by(execution_id=execution_id).all()
        form_result = next(r for r in results if r.category == "forms")
        assert form_result.status == "passed", form_result.error_details
        assert "required fields" in form_result.description


@pytest.mark.asyncio
async def test_http_error_page_is_reported(fixture_server):
    execution_id = await _run(
        fixture_server + "error",
        {
            "browser": "chromium",
            "max_depth": 0,
            "max_pages": 1,
            "max_links": 0,
            "timeout_seconds": 20,
            "check_links": False,
            "test_interactions": False,
            "test_forms": False,
            "capture_screenshots": True,
            "ai_analysis": False,
        },
    )
    with SessionLocal() as session:
        execution = session.get(TestExecution, execution_id)
        assert execution is not None
        assert execution.status == "failed"
        results = session.query(TestResult).filter_by(execution_id=execution_id).all()
        load = next(r for r in results if r.test_name == "Page loads successfully")
        assert load.status == "failed"
        assert "500" in (load.error_details or "")


@pytest.mark.asyncio
async def test_export_endpoints_include_captured_screenshots(fixture_server, client):
    execution_id = await _run(
        fixture_server + "index.html",
        {
            "browser": "chromium",
            "max_depth": 0,
            "max_pages": 1,
            "max_links": 3,
            "timeout_seconds": 20,
            "check_links": True,
            "test_interactions": False,
            "test_forms": False,
            "capture_screenshots": True,
            "ai_analysis": False,
        },
    )
    report = client.get(f"/api/tests/{execution_id}/report").json()
    assert report["screenshots"]
    first = report["screenshots"][0]
    image = client.get(first["view_url"])
    assert image.status_code == 200
    assert image.headers["content-type"] == "image/png"
    assert len(image.content) > 100

    html_export = client.get(f"/api/tests/{execution_id}/export/html")
    assert "data:image/png;base64," in html_export.text

    json_export = client.get(f"/api/tests/{execution_id}/export/json").json()
    assert json_export["results"]
    assert json_export["analysis"]["findings"]
