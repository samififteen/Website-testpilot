"""Test execution orchestration.

Each execution runs in its own isolated browser context. Results are persisted
as soon as each check finishes so the API and the SSE stream can show live
progress, and a run is never marked passed when a critical check failed.
"""

from __future__ import annotations

import asyncio
import logging
import time
from datetime import UTC, datetime
from typing import Any
from urllib.parse import urlsplit

import httpx

from app.core.config import get_settings
from app.core.security import UnsafeTargetError, assert_safe_url
from app.database.db import SessionLocal
from app.models import Screenshot, TestExecution, TestResult
from app.services.ai.analyzer import analyze, rule_based_only
from app.services.browser.browser_manager import get_browser_manager
from app.services.browser.form_tester import test_forms
from app.services.browser.interaction_tester import crawl_navigation, test_buttons
from app.services.browser.link_checker import check_links, collect_links
from app.services.browser.network_monitor import PageMonitor
from app.services.browser.page_inspector import load_page
from app.services.browser.screenshot_service import ScreenshotService
from app.services.reporting.report_builder import build_health, build_status, summarize_results

logger = logging.getLogger(__name__)

#: Live progress per execution, read by the SSE endpoint.
PROGRESS: dict[str, dict[str, Any]] = {}


def utcnow() -> datetime:
    return datetime.now(UTC)


class TestCancelled(Exception):
    """Raised internally when the user cancels a run."""

    __test__ = False


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _update_progress(
    execution_id: str,
    stage: str,
    message: str,
    *,
    current: int | None = None,
    total: int | None = None,
) -> None:
    PROGRESS[execution_id] = {
        "stage": stage,
        "message": message,
        "current": current,
        "total": total,
        "updated_at": utcnow().isoformat(),
    }


class TestRunner:
    """Queue and execute browser test runs with bounded concurrency."""

    __test__ = False  # not a pytest class

    def __init__(self) -> None:
        self._semaphore: asyncio.Semaphore | None = None
        self._tasks: dict[str, asyncio.Task[None]] = {}

    def _sem(self) -> asyncio.Semaphore:
        if self._semaphore is None:
            self._semaphore = asyncio.Semaphore(get_settings().max_concurrency)
        return self._semaphore

    # -- public API -------------------------------------------------------
    async def submit(self, execution_id: str) -> None:
        task = self._tasks.get(execution_id)
        if task is not None and not task.done():
            return
        task = asyncio.create_task(self._run(execution_id), name=f"testpilot-{execution_id}")
        self._tasks[execution_id] = task
        task.add_done_callback(lambda _t, key=execution_id: self._tasks.pop(key, None))

    def is_running(self, execution_id: str) -> bool:
        task = self._tasks.get(execution_id)
        return task is not None and not task.done()

    def mark_cancel_requested(self, execution_id: str) -> bool:
        with SessionLocal() as db:
            execution = db.get(TestExecution, execution_id)
            if execution is None:
                return False
            if execution.status in {"passed", "failed", "warnings", "cancelled", "error"}:
                return False
            execution.cancel_requested = True
            if execution.status in {"queued", "pending"}:
                execution.status = "cancelled"
                execution.finished_at = utcnow()
                execution.summary = {"cancelled_before_start": True}
            db.commit()
        task = self._tasks.get(execution_id)
        if task is not None and not task.done():
            task.cancel()
        return True

    # -- lifecycle --------------------------------------------------------
    async def _run(self, execution_id: str) -> None:
        try:
            async with self._sem():
                await self._execute(execution_id)
        except asyncio.CancelledError:
            self._finalize_cancelled(execution_id)
            PROGRESS.pop(execution_id, None)
        except Exception as exc:
            logger.exception("Test execution %s crashed", execution_id)
            self._finalize_error(execution_id, f"{type(exc).__name__}: {exc}")
            PROGRESS.pop(execution_id, None)

    def _finalize_cancelled(self, execution_id: str) -> None:
        with SessionLocal() as db:
            execution = db.get(TestExecution, execution_id)
            if execution is None:
                return
            if execution.status == "cancelled" and execution.summary.get("cancelled_before_start"):
                return
            execution.status = "cancelled"
            execution.finished_at = utcnow()
            if execution.started_at:
                execution.duration_ms = int(
                    execution.summary.get("elapsed_ms", 0)
                    or (utcnow() - execution.started_at).total_seconds() * 1000
                )
            execution.summary = {
                **(execution.summary or {}),
                "cancelled": True,
                "health_explanation": "The run was cancelled, so no health score was computed.",
            }
            db.commit()

    def _finalize_error(self, execution_id: str, message: str) -> None:
        with SessionLocal() as db:
            execution = db.get(TestExecution, execution_id)
            if execution is None:
                return
            execution.status = "error"
            execution.error_message = message[:2000]
            execution.finished_at = utcnow()
            if execution.started_at:
                execution.duration_ms = int(
                    (execution.finished_at - execution.started_at).total_seconds() * 1000
                )
            db.commit()

    @staticmethod
    def _check_cancel(execution_id: str) -> None:
        with SessionLocal() as db:
            execution = db.get(TestExecution, execution_id)
            if execution is not None and execution.cancel_requested:
                raise TestCancelled()

    # -- persistence helpers ---------------------------------------------
    @staticmethod
    def _record(
        execution_id: str,
        *,
        name: str,
        category: str,
        status: str,
        severity: str,
        description: str,
        url: str | None,
        error_details: str | None,
        duration_ms: int,
        started_at: datetime,
    ) -> dict[str, Any]:
        result = TestResult(
            execution_id=execution_id,
            test_name=name,
            category=category,
            status=status,
            severity=severity,
            description=description[:4000],
            url=url,
            error_details=(error_details or "")[:8000],
            duration_ms=duration_ms,
            started_at=started_at,
            finished_at=utcnow(),
        )
        with SessionLocal() as db:
            db.add(result)
            db.commit()
            db.refresh(result)
            result_id = result.id
        return {
            "id": result_id,
            "test_name": name,
            "category": category,
            "status": status,
            "severity": severity,
            "description": description[:4000],
            "error_details": (error_details or "")[:8000],
            "url": url,
            "duration_ms": duration_ms,
            "started_at": started_at,
            "finished_at": utcnow(),
        }

    @staticmethod
    def _add_screenshot(
        execution_id: str,
        record: dict[str, Any],
        *,
        test_result_id: str | None = None,
    ) -> str:
        screenshot = Screenshot(
            execution_id=execution_id,
            test_result_id=test_result_id,
            file_path=record["file_path"],
            screenshot_type=record["screenshot_type"],
            page_url=record.get("page_url"),
            size_bytes=int(record.get("size_bytes", 0)),
        )
        with SessionLocal() as db:
            db.add(screenshot)
            db.commit()
            db.refresh(screenshot)
            return screenshot.id

    # -- main flow --------------------------------------------------------
    async def _execute(self, execution_id: str) -> None:
        settings = get_settings()
        started_wall = utcnow()
        with SessionLocal() as db:
            execution = db.get(TestExecution, execution_id)
            if execution is None:
                return
            if execution.status not in {"queued", "pending"}:
                return
            execution.status = "running"
            execution.started_at = started_wall
            url = execution.url
            config = {
                "browser": settings.default_browser,
                "max_depth": settings.default_max_depth,
                "max_pages": settings.default_max_pages,
                "max_links": settings.default_max_links,
                "timeout_seconds": settings.default_timeout_seconds,
                "check_links": True,
                "test_interactions": True,
                "test_forms": True,
                "capture_screenshots": True,
                "ai_analysis": True,
                **(execution.config or {}),
            }
            db.commit()

        _update_progress(execution_id, "starting", "Launching browser", current=0, total=8)
        results: list[dict[str, Any]] = []
        facts: dict[str, Any] = {
            "pages_inspected": 1,
            "links_checked": 0,
            "broken_links": 0,
            "javascript_errors": 0,
            "failed_requests": 0,
            "form_validation": "skipped",
        }
        screenshot_service = ScreenshotService(execution_id)
        context = None
        page = None
        try:
            manager = await get_browser_manager(config["browser"])
            try:
                context = await manager.new_context()
                page = await context.new_page()
            except Exception as exc:
                raise RuntimeError(
                    f"Could not launch the {config['browser']} browser engine. "
                    f"Run 'playwright install chromium'. ({type(exc).__name__}: {exc})"
                ) from exc

            page.set_default_timeout(min(config["timeout_seconds"] * 1000, 30000))
            monitor = PageMonitor()
            await monitor.attach(page)
            page.on("dialog", lambda dialog: asyncio.ensure_future(dialog.dismiss()))

            # --- A. page load -------------------------------------------
            _update_progress(execution_id, "loading", f"Loading {url}", current=1, total=8)
            self._check_cancel(execution_id)
            t0 = utcnow()
            clock = time.perf_counter()
            try:
                snapshot = await load_page(page, url, timeout_ms=config["timeout_seconds"] * 1000)
            except Exception as exc:
                snapshot = None
                load_error = f"{type(exc).__name__}: {exc}"
            else:
                load_error = snapshot.load_error

            load_duration = int((time.perf_counter() - clock) * 1000)
            if snapshot is None:
                results.append(
                    self._record(
                        execution_id,
                        name="Page loads successfully",
                        category="page_load",
                        status="failed",
                        severity="critical",
                        description="The page could not be opened in the browser.",
                        url=url,
                        error_details=load_error,
                        duration_ms=load_duration,
                        started_at=t0,
                    )
                )
                raise RuntimeError(load_error or "Page failed to load")

            hard_failure = bool(snapshot.status_code and snapshot.status_code >= 400)
            if snapshot.load_error or hard_failure:
                detail = snapshot.load_error or f"HTTP {snapshot.status_code}"
                results.append(
                    self._record(
                        execution_id,
                        name="Page loads successfully",
                        category="page_load",
                        status="failed",
                        severity="critical" if hard_failure else "high",
                        description=(
                            f"The page returned HTTP {snapshot.status_code}."
                            if hard_failure
                            else "Navigation did not complete cleanly."
                        ),
                        url=url,
                        error_details=detail,
                        duration_ms=load_duration,
                        started_at=t0,
                    )
                )
            else:
                results.append(
                    self._record(
                        execution_id,
                        name="Page loads successfully",
                        category="page_load",
                        status="passed",
                        severity="critical",
                        description=(
                            f"HTTP {snapshot.status_code or 'no response'} in {load_duration} ms "
                            f"— final URL {snapshot.final_url}"
                        ),
                        url=url,
                        error_details=None,
                        duration_ms=load_duration,
                        started_at=t0,
                    )
                )

            # --- B. title / content / structure --------------------------
            results.append(
                self._record(
                    execution_id,
                    name="Page has a title",
                    category="page_load",
                    status="passed" if snapshot.title.strip() else "failed",
                    severity="medium",
                    description=(
                        f'Title: "{snapshot.title}"'
                        if snapshot.title.strip()
                        else "The document has no <title>, which hurts tab clarity and SEO."
                    ),
                    url=url,
                    error_details=None if snapshot.title.strip() else "document.title is empty",
                    duration_ms=2,
                    started_at=utcnow(),
                )
            )

            results.append(
                self._record(
                    execution_id,
                    name="Main content is visible",
                    category="page_load",
                    status="failed" if snapshot.is_blank else "passed",
                    severity="high",
                    description=(
                        f"{snapshot.text_length} characters of visible text detected."
                        if not snapshot.is_blank
                        else "The page rendered almost no visible text."
                    ),
                    url=url,
                    error_details=None
                    if not snapshot.is_blank
                    else "Visible text under 20 characters",
                    duration_ms=2,
                    started_at=utcnow(),
                )
            )

            accessibility_issues: list[str] = []
            if not snapshot.has_h1:
                accessibility_issues.append("No <h1> heading was found.")
            if snapshot.images_missing_alt:
                accessibility_issues.append(
                    f"{snapshot.images_missing_alt} visible image(s) have no alt text."
                )
            if not snapshot.lang:
                accessibility_issues.append("The <html> element has no lang attribute.")
            results.append(
                self._record(
                    execution_id,
                    name="Basic accessibility structure",
                    category="accessibility",
                    status="warning" if accessibility_issues else "passed",
                    severity="low",
                    description=(
                        "Headings and image alternatives are present."
                        if not accessibility_issues
                        else " ".join(accessibility_issues)
                    ),
                    url=url,
                    error_details="\n".join(accessibility_issues) or None,
                    duration_ms=1,
                    started_at=utcnow(),
                )
            )

            if load_duration > 3000:
                results.append(
                    self._record(
                        execution_id,
                        name="Page responds quickly",
                        category="performance",
                        status="warning",
                        severity="low",
                        description=f"Initial load took {load_duration} ms (target under 3000 ms).",
                        url=url,
                        error_details=None,
                        duration_ms=1,
                        started_at=utcnow(),
                    )
                )

            # --- C. screenshots -----------------------------------------
            if config["capture_screenshots"]:
                _update_progress(
                    execution_id, "screenshots", "Capturing page screenshots", current=2, total=8
                )
                record = await screenshot_service.capture(page, label="page", full_page=True)
                if record:
                    self._add_screenshot(execution_id, record)
                record = await screenshot_service.capture(page, label="viewport")
                if record:
                    self._add_screenshot(execution_id, record)

            # --- D. JavaScript errors -----------------------------------
            _update_progress(
                execution_id, "javascript", "Collecting browser errors", current=3, total=8
            )
            self._check_cancel(execution_id)
            errors = monitor.errors
            warnings = monitor.warnings
            facts["javascript_errors"] = len(errors)
            error_text = "\n".join(
                f"[{entry.level}] {entry.message}"
                + (f" ({entry.url}:{entry.line})" if entry.url else "")
                for entry in errors[:20]
            )
            if errors:
                js_status, js_severity = "failed", "high"
                js_description = (
                    f"{len(errors)} JavaScript error(s) were raised while loading the page."
                )
            elif warnings:
                js_status, js_severity = "warning", "low"
                js_description = f"{len(warnings)} console warning(s) were logged."
            else:
                js_status, js_severity = "passed", "low"
                js_description = "No console errors or uncaught exceptions were recorded."
            js_result = self._record(
                execution_id,
                name="No JavaScript errors",
                category="javascript",
                status=js_status,
                severity=js_severity,
                description=js_description,
                url=url,
                error_details=error_text or None,
                duration_ms=5,
                started_at=utcnow(),
            )
            results.append(js_result)

            # --- E. network failures ------------------------------------
            _update_progress(
                execution_id, "network", "Inspecting network requests", current=4, total=8
            )
            failures = monitor.network_failures
            facts["failed_requests"] = len(failures)
            network_text = "\n".join(
                f"{failure.method} {failure.url} → {failure.failure} ({failure.resource_type})"
                for failure in failures[:20]
            )
            results.append(
                self._record(
                    execution_id,
                    name="Network requests succeed",
                    category="network",
                    status="failed" if failures else "passed",
                    severity="high",
                    description=(
                        f"{len(failures)} request(s) failed or returned an error status."
                        if failures
                        else "All recorded requests completed successfully."
                    ),
                    url=url,
                    error_details=network_text or None,
                    duration_ms=5,
                    started_at=utcnow(),
                )
            )

            if snapshot.status_code and snapshot.status_code >= 400:
                record = await screenshot_service.capture(page, label="page-load-failure")
                if record:
                    self._add_screenshot(execution_id, record, test_result_id=js_result["id"])

            # --- F. links ------------------------------------------------
            valid_links, missing_href = collect_links(snapshot.links, snapshot.final_url)
            if missing_href:
                results.append(
                    self._record(
                        execution_id,
                        name="Links have destinations",
                        category="links",
                        status="warning",
                        severity="low",
                        description=f"{len(missing_href)} anchor(s) have no usable href.",
                        url=url,
                        error_details="\n".join(
                            f'"{item["text"]}" ({item["reason"]})' for item in missing_href[:20]
                        ),
                        duration_ms=2,
                        started_at=utcnow(),
                    )
                )

            run_link_check = config.get("check_links", True) and config["max_links"] > 0
            if run_link_check:
                _update_progress(
                    execution_id,
                    "links",
                    f"Checking up to {config['max_links']} links",
                    current=5,
                    total=8,
                )
                self._check_cancel(execution_id)
                link_clock = time.perf_counter()
                try:
                    link_result = await asyncio.wait_for(
                        check_links(
                            valid_links,
                            base_url=snapshot.final_url,
                            max_links=config["max_links"],
                            timeout_seconds=min(15, max(5, config["timeout_seconds"] / 4)),
                        ),
                        timeout=max(20, config["timeout_seconds"]),
                    )
                except TimeoutError:
                    link_result = None
                duration = int((time.perf_counter() - link_clock) * 1000)
                facts["links_checked"] = len(valid_links[: config["max_links"]])
                if link_result is None:
                    results.append(
                        self._record(
                            execution_id,
                            name="Links resolve",
                            category="links",
                            status="skipped",
                            severity="info",
                            description="Link checking did not finish within the time budget.",
                            url=url,
                            error_details=None,
                            duration_ms=duration,
                            started_at=utcnow(),
                        )
                    )
                else:
                    facts["broken_links"] = len(link_result.broken)
                    details = "\n".join(
                        f"{check.url} → HTTP {check.status_code}"
                        for check in link_result.broken[:25]
                    )
                    inconclusive = "\n".join(
                        f"{check.url} → {check.reason}" for check in link_result.inconclusive[:10]
                    )
                    if link_result.broken:
                        link_status, link_severity = "failed", "high"
                        link_description = (
                            f"{len(link_result.broken)} of {link_result.checked_count} checked "
                            "link(s) returned an error response."
                        )
                    elif link_result.checked_count == 0:
                        link_status, link_severity = "skipped", "info"
                        link_description = "No checkable links were found on the page."
                    else:
                        link_status, link_severity = "passed", "medium"
                        link_description = (
                            f"All {link_result.checked_count - len(link_result.inconclusive)} "
                            "resolved link(s) responded successfully."
                        )
                    results.append(
                        self._record(
                            execution_id,
                            name="Links resolve",
                            category="links",
                            status=link_status,
                            severity=link_severity,
                            description=link_description,
                            url=url,
                            error_details=(
                                "\n".join(
                                    filter(
                                        None,
                                        [
                                            details,
                                            f"Inconclusive:\n{inconclusive}"
                                            if inconclusive
                                            else "",
                                        ],
                                    )
                                )
                                or None
                            ),
                            duration_ms=duration,
                            started_at=utcnow(),
                        )
                    )

            # --- G. navigation crawl ------------------------------------
            nav_checks: list[dict[str, Any]] = []
            if config["max_pages"] > 1 and config["max_depth"] >= 1:
                _update_progress(
                    execution_id,
                    "navigation",
                    "Crawling internal pages",
                    current=6,
                    total=8,
                )
                self._check_cancel(execution_id)
                try:
                    allowed = await self._robots_allows(snapshot.final_url)
                except Exception:
                    allowed = True
                if not allowed:
                    results.append(
                        self._record(
                            execution_id,
                            name="Internal navigation",
                            category="navigation",
                            status="skipped",
                            severity="info",
                            description=(
                                "robots.txt disallows crawling, so navigation testing was skipped."
                            ),
                            url=url,
                            error_details=None,
                            duration_ms=1,
                            started_at=utcnow(),
                        )
                    )
                else:
                    nav_clock = time.perf_counter()
                    nav_checks = [
                        check.as_dict()
                        for check in await crawl_navigation(
                            context,
                            snapshot.final_url,
                            valid_links,
                            max_pages=config["max_pages"] - 1,
                            max_depth=config["max_depth"],
                            timeout_ms=min(config["timeout_seconds"] * 1000, 30000),
                            on_screenshot=None,
                        )
                    ]
                    facts["pages_inspected"] = 1 + len(nav_checks)
                    nav_failures = [c for c in nav_checks if c["status"] == "failed"]
                    nav_warnings = [c for c in nav_checks if c["status"] in {"warning", "skipped"}]
                    results.append(
                        self._record(
                            execution_id,
                            name="Internal navigation reachable",
                            category="navigation",
                            status=(
                                "failed"
                                if nav_failures
                                else "warning"
                                if nav_warnings
                                else "skipped"
                                if not nav_checks
                                else "passed"
                            ),
                            severity="high" if nav_failures else "low",
                            description=(
                                f"{len(nav_checks)} internal page(s) visited."
                                if nav_checks
                                else "No additional internal pages were available to crawl."
                            ),
                            url=url,
                            error_details=(
                                "\n".join(
                                    f"{c['url']} → {c.get('status_code') or c.get('error')}"
                                    for c in nav_checks
                                    if c["status"] != "passed"
                                )
                                or None
                            ),
                            duration_ms=int((time.perf_counter() - nav_clock) * 1000),
                            started_at=utcnow(),
                        )
                    )

            # --- H. buttons ---------------------------------------------
            if config.get("test_interactions", True):
                _update_progress(
                    execution_id, "interactions", "Exercising safe controls", current=7, total=8
                )
                self._check_cancel(execution_id)
                clock = time.perf_counter()
                try:
                    button_report = await test_buttons(page, snapshot.buttons, monitor)
                    details = "\n".join(
                        f"{o.text or '(no label)'} — {o.classification}"
                        + (f": {o.reason}" if o.reason else "")
                        for o in button_report.outcomes[:20]
                    )
                    if button_report.failed:
                        status, severity = "failed", "medium"
                    elif button_report.tested:
                        status, severity = "passed", "low"
                    else:
                        status, severity = "skipped", "info"
                    results.append(
                        self._record(
                            execution_id,
                            name="Controls respond to interaction",
                            category="buttons",
                            status=status,
                            severity=severity,
                            description=(
                                f"{button_report.tested} safe control(s) clicked, "
                                f"{button_report.passed} reacted as expected, "
                                f"{button_report.failed} did not; "
                                f"{button_report.skipped} skipped for safety."
                            ),
                            url=url,
                            error_details=details or None,
                            duration_ms=int((time.perf_counter() - clock) * 1000),
                            started_at=utcnow(),
                        )
                    )
                except TestCancelled:
                    raise
                except Exception as exc:
                    results.append(
                        self._record(
                            execution_id,
                            name="Controls respond to interaction",
                            category="buttons",
                            status="skipped",
                            severity="info",
                            description="Interaction testing could not be completed.",
                            url=url,
                            error_details=f"{type(exc).__name__}: {exc}",
                            duration_ms=0,
                            started_at=utcnow(),
                        )
                    )

            # --- I. forms ------------------------------------------------
            if config.get("test_forms", True):
                clock = time.perf_counter()
                try:
                    form_findings = await test_forms(page, snapshot.forms)
                    problems = [p for f in form_findings for p in f.problems]
                    if not form_findings:
                        form_status, form_severity = "skipped", "info"
                        facts["form_validation"] = "no forms found"
                        description = "No forms were found on the page."
                    elif problems:
                        form_status, form_severity = "failed", "high"
                        facts["form_validation"] = "failed"
                        description = (
                            f"{len(problems)} validation issue(s) found across "
                            f"{len(form_findings)} form(s)."
                        )
                    else:
                        form_status, form_severity = "passed", "medium"
                        facts["form_validation"] = "passed"
                        description = (
                            f"{len(form_findings)} form(s) inspected; required fields and "
                            "input types behave correctly. Nothing was submitted."
                        )
                    results.append(
                        self._record(
                            execution_id,
                            name="Form validation behaves correctly",
                            category="forms",
                            status=form_status,
                            severity=form_severity,
                            description=description,
                            url=url,
                            error_details="\n".join(problems[:20]) or None,
                            duration_ms=int((time.perf_counter() - clock) * 1000),
                            started_at=utcnow(),
                        )
                    )
                except TestCancelled:
                    raise
                except Exception as exc:
                    results.append(
                        self._record(
                            execution_id,
                            name="Form validation behaves correctly",
                            category="forms",
                            status="skipped",
                            severity="info",
                            description="Form validation could not be completed.",
                            url=url,
                            error_details=f"{type(exc).__name__}: {exc}",
                            duration_ms=0,
                            started_at=utcnow(),
                        )
                    )

            # --- J. finish ----------------------------------------------
            _update_progress(execution_id, "finalizing", "Saving report", current=8, total=8)
            counts = summarize_results(results)
            health = build_health(results, facts)
            status = build_status(results)
            finished = utcnow()
            duration_ms = int((finished - started_wall).total_seconds() * 1000)

            with SessionLocal() as db:
                execution = db.get(TestExecution, execution_id)
                if execution is None:
                    return
                execution.status = status
                execution.finished_at = finished
                execution.duration_ms = duration_ms
                execution.health_score = health["score"]
                execution.page_title = snapshot.title
                execution.summary = {
                    "counts": counts,
                    "facts": facts,
                    "health_explanation": health["explanation"],
                    "health_breakdown": health["breakdown"],
                    "navigation": nav_checks,
                    "links_checked": facts["links_checked"],
                    "elapsed_ms": duration_ms,
                    "screenshot_ids": [
                        s.id
                        for s in db.query(Screenshot).filter_by(execution_id=execution_id).all()
                    ],
                }
                db.commit()

            # --- K. analysis --------------------------------------------
            _update_progress(execution_id, "analysis", "Analysing results", current=8, total=8)
            with SessionLocal() as db:
                execution = db.get(TestExecution, execution_id)
                if execution is None:
                    return
                execution_payload = {
                    "url": execution.url,
                    "status": execution.status,
                    "health_score": execution.health_score,
                    "duration_ms": execution.duration_ms,
                    "page_title": execution.page_title,
                    "summary": execution.summary,
                }
                shots = [
                    {"screenshot_type": s.screenshot_type, "page_url": s.page_url}
                    for s in db.query(Screenshot).filter_by(execution_id=execution_id).all()
                ]
            if config.get("ai_analysis", True):
                analysis = await analyze(execution_payload, results, shots)
            else:
                analysis = rule_based_only(execution_payload, results)
                analysis.error = "AI analysis was disabled for this run; rule-based analysis used."
            analysis_payload = {
                **analysis.as_dict(),
                "generated_at": utcnow().isoformat(),
            }
            with SessionLocal() as db:
                execution = db.get(TestExecution, execution_id)
                if execution is not None:
                    execution.ai_analysis = analysis_payload
                    db.commit()
            PROGRESS[execution_id] = {
                "stage": "complete",
                "message": "Report ready",
                "current": 8,
                "total": 8,
                "updated_at": utcnow().isoformat(),
            }
        except TestCancelled:
            self._finalize_cancelled(execution_id)
            PROGRESS.pop(execution_id, None)
        except Exception as exc:
            logger.exception("Execution %s failed", execution_id)
            self._record(
                execution_id,
                name="Test execution completed",
                category="system",
                status="failed",
                severity="critical",
                description="The test run stopped because of an unexpected error.",
                url=url,
                error_details=f"{type(exc).__name__}: {exc}"[:2000],
                duration_ms=0,
                started_at=utcnow(),
            )
            self._finalize_error(execution_id, f"{type(exc).__name__}: {exc}")
            PROGRESS.pop(execution_id, None)
        finally:
            try:
                if page is not None:
                    await page.close()
                if context is not None:
                    await context.close()
            except Exception:  # pragma: no cover - best effort
                pass

    @staticmethod
    async def _robots_allows(url: str) -> bool:
        """Very small robots.txt check for the crawl path only."""
        parts = urlsplit(url)
        robots_url = f"{parts.scheme}://{parts.netloc}/robots.txt"
        try:
            await assert_safe_url(robots_url)
            async with httpx.AsyncClient(timeout=5.0, verify=False) as client:
                response = await client.get(robots_url)
            if response.status_code >= 400:
                return True
        except (UnsafeTargetError, httpx.HTTPError):
            return True
        in_star = False
        for line in response.text.splitlines():
            line = line.split("#", 1)[0].strip()
            if not line or ":" not in line:
                continue
            key, _, value = line.partition(":")
            key = key.strip().lower()
            value = value.strip()
            if key == "user-agent":
                in_star = value == "*"
            elif key == "disallow" and in_star and value in ("/", "*"):
                return False
        return True


runner = TestRunner()
