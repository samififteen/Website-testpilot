"""Console/network monitor tests using lightweight Playwright stand-ins."""

from __future__ import annotations

from types import SimpleNamespace

from app.services.browser.network_monitor import NetworkFailure, PageMonitor


def _console_message(level: str, text: str, url: str = "https://x.test/app.js"):
    return SimpleNamespace(
        type=level,
        text=text,
        location={"url": url, "lineNumber": 12, "columnNumber": 4},
    )


def _failed_request(method: str, url: str, failure: str = "net::ERR_FAILED"):
    return SimpleNamespace(url=url, method=method, resource_type="script", failure=failure)


def _response(url: str, status: int, method: str = "GET"):
    request = SimpleNamespace(url=url, method=method, resource_type="document")
    return SimpleNamespace(url=url, status=status, request=request)


def test_console_errors_and_warnings_are_separated():
    monitor = PageMonitor()
    monitor._on_console(_console_message("error", "Uncaught TypeError"))
    monitor._on_console(_console_message("warning", "Deprecated API"))
    monitor._on_console(_console_message("log", "hello"))
    monitor._on_page_error(ValueError("boom"))

    assert len(monitor.errors) == 2
    assert monitor.errors[0].line == 12
    assert len(monitor.warnings) == 1
    assert monitor.errors[1].message.endswith("boom")


def test_request_failures_are_deduplicated():
    monitor = PageMonitor()
    monitor._on_request_failed(_failed_request("GET", "https://x.test/missing.js"))
    monitor._on_request_failed(_failed_request("GET", "https://x.test/missing.js"))
    monitor._on_request_failed(_failed_request("GET", "https://x.test/missing.css"))
    assert len(monitor.network_failures) == 2


def test_error_responses_are_recorded():
    monitor = PageMonitor()
    monitor._on_response(_response("https://x.test/api/data", 503))
    monitor._on_response(_response("https://x.test/ok", 200))
    assert len(monitor.network_failures) == 1
    assert monitor.network_failures[0].status == 503
    assert monitor.network_failures[0].failure == "HTTP 503"


def test_no_sensitive_headers_are_stored():
    monitor = PageMonitor()
    monitor._on_request_failed(_failed_request("POST", "https://x.test/api"))
    payload = monitor.snapshot()
    assert "authorization" not in str(payload).lower()
    assert "cookie" not in str(payload).lower()


def test_snapshot_and_reset():
    monitor = PageMonitor()
    monitor.network_failures.append(
        NetworkFailure(
            url="https://x.test/", method="GET", resource_type="image", failure="net::ERR"
        )
    )
    assert monitor.snapshot()["network_failures"]
    monitor.reset()
    assert monitor.snapshot() == {"errors": [], "warnings": [], "network_failures": []}
