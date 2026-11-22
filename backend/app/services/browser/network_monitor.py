"""Browser-side observers for JavaScript errors, console output and network
failures. Nothing sensitive (cookies, auth headers, request bodies) is stored.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from playwright.async_api import Page, Request, Response

IGNORED_URL_PREFIXES = ("data:", "blob:", "chrome-extension:", "devtools:")


def _now() -> str:
    return datetime.now(UTC).isoformat()


@dataclass
class ConsoleEntry:
    level: str
    message: str
    url: str | None = None
    line: int | None = None
    column: int | None = None
    timestamp: str = field(default_factory=_now)

    def as_dict(self) -> dict[str, Any]:
        return {
            "level": self.level,
            "message": self.message,
            "source_url": self.url,
            "line": self.line,
            "column": self.column,
            "timestamp": self.timestamp,
        }


@dataclass
class NetworkFailure:
    url: str
    method: str
    resource_type: str
    failure: str
    status: int | None = None
    timestamp: str = field(default_factory=_now)

    def as_dict(self) -> dict[str, Any]:
        return {
            "url": self.url,
            "method": self.method,
            "resource_type": self.resource_type,
            "failure": self.failure,
            "status": self.status,
            "timestamp": self.timestamp,
        }


class PageMonitor:
    """Collects console errors, page errors and failed network requests."""

    def __init__(self) -> None:
        self.console_entries: list[ConsoleEntry] = []
        self.page_errors: list[ConsoleEntry] = []
        self.network_failures: list[NetworkFailure] = []
        self.responses: list[dict[str, Any]] = []
        self._seen_requests: set[tuple[str, str]] = set()

    async def attach(self, page: Page) -> None:
        page.on("console", self._on_console)
        page.on("pageerror", self._on_page_error)
        page.on("requestfailed", self._on_request_failed)
        page.on("response", self._on_response)

    # -- handlers ---------------------------------------------------------
    def _on_console(self, message: Any) -> None:
        try:
            level = message.type
            text = message.text
            location = message.location or {}
        except Exception:  # pragma: no cover - defensive
            return
        if level not in {"error", "warning"}:
            return
        self.console_entries.append(
            ConsoleEntry(
                level=level,
                message=text[:2000],
                url=location.get("url"),
                line=location.get("lineNumber"),
                column=location.get("columnNumber"),
            )
        )

    def _on_page_error(self, error: Any) -> None:
        self.page_errors.append(ConsoleEntry(level="error", message=str(error)[:2000]))

    def _on_request_failed(self, request: Request) -> None:
        url = request.url
        if url.startswith(IGNORED_URL_PREFIXES):
            return
        key = (request.method, url)
        if key in self._seen_requests:
            return
        self._seen_requests.add(key)
        failure = request.failure or "unknown failure"
        self.network_failures.append(
            NetworkFailure(
                url=url[:2048],
                method=request.method,
                resource_type=request.resource_type,
                failure=str(failure)[:500],
            )
        )

    def _on_response(self, response: Response) -> None:
        try:
            url = response.url
            if url.startswith(IGNORED_URL_PREFIXES):
                return
            status = response.status
            if status < 400:
                return
            key = (response.request.method, url)
            if key in self._seen_requests and status >= 500:
                return
            self._seen_requests.add(key)
            self.network_failures.append(
                NetworkFailure(
                    url=url[:2048],
                    method=response.request.method,
                    resource_type=response.request.resource_type,
                    failure=f"HTTP {status}",
                    status=status,
                )
            )
            self.responses.append({"url": url[:2048], "status": status})
        except Exception:  # pragma: no cover - response may be gone
            return

    # -- reporting --------------------------------------------------------
    @property
    def errors(self) -> list[ConsoleEntry]:
        return [
            *(entry for entry in self.console_entries if entry.level == "error"),
            *self.page_errors,
        ]

    @property
    def warnings(self) -> list[ConsoleEntry]:
        return [entry for entry in self.console_entries if entry.level == "warning"]

    def reset(self) -> None:
        self.console_entries.clear()
        self.page_errors.clear()
        self.network_failures.clear()
        self.responses.clear()
        self._seen_requests.clear()

    def snapshot(self) -> dict[str, Any]:
        return {
            "errors": [entry.as_dict() for entry in self.errors],
            "warnings": [entry.as_dict() for entry in self.warnings],
            "network_failures": [failure.as_dict() for failure in self.network_failures],
        }
