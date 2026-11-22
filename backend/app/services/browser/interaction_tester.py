"""Safe interaction testing: buttons, navigation crawl and action safety rules."""

from __future__ import annotations

import asyncio
import contextlib
import time
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urldefrag, urlsplit

from playwright.async_api import BrowserContext, Page

from app.core.security import UnsafeTargetError, assert_safe_url
from app.services.browser.network_monitor import PageMonitor
from app.services.browser.page_inspector import load_page

BUTTON_SELECTOR = 'button, [role="button"], input[type="submit"], input[type="button"]'

#: Never click these — they are destructive, financial, or externally visible.
DESTRUCTIVE_KEYWORDS = (
    "delete",
    "remove",
    "destroy",
    "drop",
    "purchase",
    "buy",
    "pay",
    "checkout",
    "place order",
    "order now",
    "book",
    "reserve",
    "subscribe",
    "unsubscribe",
    "send",
    "submit",
    "confirm",
    "transfer",
    "withdraw",
    "donate",
    "logout",
    "log out",
    "sign out",
    "sign up",
    "sign in",
    "log in",
    "login",
    "register",
    "reset password",
    "change password",
    "delete account",
    "cancel subscription",
    "upgrade",
    "downgrade",
    "publish",
    "post",
    "share",
    "follow",
    "save",
    "update",
    "apply",
    "download",
)

#: Buttons that only change local UI state and are safe to exercise.
SAFE_KEYWORDS = (
    "show",
    "hide",
    "more",
    "less",
    "expand",
    "collapse",
    "toggle",
    "next",
    "previous",
    "prev",
    "open",
    "close",
    "menu",
    "filter",
    "tab",
    "sort",
    "search",
    "view",
    "details",
    "read",
    "see",
    "learn",
    "help",
    "back",
    "top",
    "theme",
    "dark",
    "light",
)

DESTRUCTIVE_URL_PATTERNS = (
    "logout",
    "signout",
    "sign-out",
    "delete",
    "remove",
    "unsubscribe",
    "checkout",
    "payment",
    "admin",
    "account/delete",
)


@dataclass
class NavPageCheck:
    url: str
    depth: int
    status: str
    status_code: int | None = None
    title: str = ""
    load_ms: int = 0
    error: str | None = None
    is_internal: bool = True

    def as_dict(self) -> dict[str, Any]:
        return {
            "url": self.url,
            "depth": self.depth,
            "status": self.status,
            "status_code": self.status_code,
            "title": self.title,
            "load_ms": self.load_ms,
            "error": self.error,
        }


@dataclass
class ButtonOutcome:
    text: str
    classification: str
    reason: str
    clicked: bool = False
    changed: bool = False
    error: str | None = None
    console_errors: int = 0

    def as_dict(self) -> dict[str, Any]:
        return {
            "text": self.text,
            "classification": self.classification,
            "reason": self.reason,
            "clicked": self.clicked,
            "changed": self.changed,
            "error": self.error,
            "console_errors": self.console_errors,
        }


@dataclass
class ButtonTestReport:
    outcomes: list[ButtonOutcome] = field(default_factory=list)
    tested: int = 0
    passed: int = 0
    failed: int = 0
    skipped: int = 0

    @property
    def summary(self) -> dict[str, Any]:
        return {
            "tested": self.tested,
            "passed": self.passed,
            "failed": self.failed,
            "skipped": self.skipped,
            "outcomes": [outcome.as_dict() for outcome in self.outcomes],
        }


def classify_action(text: str, button_type: str = "") -> tuple[str, str]:
    """Decide whether a button is safe to click. Returns (class, reason)."""
    label = (text or "").strip().lower()
    if button_type and button_type.lower() == "submit":
        return (
            "destructive",
            "Submit buttons change server state and are checked by the form tests instead.",
        )
    if not label:
        return "ambiguous", "Button has no accessible text, so its effect cannot be predicted."
    if any(keyword in label for keyword in DESTRUCTIVE_KEYWORDS):
        return (
            "destructive",
            f"'{text[:60]}' may change data or trigger an external action; not clicked.",
        )
    if any(keyword in label for keyword in SAFE_KEYWORDS):
        return "safe", ""
    return "ambiguous", "The button's effect is unclear, so it was not clicked."


async def test_buttons(
    page: Page,
    buttons: list[dict[str, Any]],
    monitor: PageMonitor,
    *,
    max_buttons: int = 3,
    url_before: str | None = None,
) -> ButtonTestReport:
    """Click a small number of *safe* buttons and observe UI changes."""
    report = ButtonTestReport()
    candidates = [b for b in buttons if b.get("visible") and not b.get("disabled")][:20]
    for button in candidates:
        if report.tested >= max_buttons:
            break
        classification, reason = classify_action(button.get("text", ""), button.get("type", ""))
        outcome = ButtonOutcome(
            text=(button.get("text") or "")[:120],
            classification=classification,
            reason=reason,
        )
        if classification != "safe":
            report.skipped += 1
            report.outcomes.append(outcome)
            continue

        index = button.get("index")
        before_url = page.url
        before_errors = len(monitor.errors)
        try:
            before_text = await page.evaluate(
                "() => (document.body ? document.body.innerText.length : 0)"
            )
        except Exception:
            before_text = 0
        try:
            await page.evaluate(
                """
                (index) => {
                  const elements = Array.from(document.querySelectorAll(
                    'button, [role="button"], input[type="submit"], input[type="button"]'
                  ));
                  const el = elements[index];
                  if (!el) { throw new Error('button no longer present'); }
                  el.click();
                }
                """,
                index,
            )
            outcome.clicked = True
            await asyncio.sleep(0.6)
            after_url = page.url
            try:
                after_text = await page.evaluate(
                    "() => (document.body ? document.body.innerText.length : 0)"
                )
            except Exception:
                after_text = before_text
            outcome.changed = after_url != before_url or abs(after_text - before_text) > 5
            if after_url != before_url and not after_url.startswith(url_before or before_url):
                outcome.changed = True
        except Exception as exc:
            outcome.error = f"{type(exc).__name__}: {exc}"[:500]

        outcome.console_errors = max(0, len(monitor.errors) - before_errors)
        report.tested += 1
        if outcome.error or outcome.console_errors > 0:
            report.failed += 1
        elif outcome.changed:
            report.passed += 1
        else:
            # A control that does nothing is a finding, but a low-severity one.
            report.failed += 1
            outcome.reason = outcome.reason or "Click produced no observable change."
        report.outcomes.append(outcome)
    return report


def _safe_url_shape(url: str) -> bool:
    lowered = url.lower()
    return not any(pattern in lowered for pattern in DESTRUCTIVE_URL_PATTERNS)


async def crawl_navigation(
    context: BrowserContext,
    start_url: str,
    links: list[dict[str, Any]],
    *,
    max_pages: int,
    max_depth: int,
    timeout_ms: int,
    allow_private: bool | None = None,
    on_screenshot: Any | None = None,
) -> list[NavPageCheck]:
    """Visit internal links up to a bounded depth/page count."""
    base_host = (urlsplit(start_url).hostname or "").lower()
    visited: set[str] = {urldefrag(start_url)[0]}
    checks: list[NavPageCheck] = []
    queue: list[tuple[str, int]] = []

    for link in links:
        resolved = link.get("url") or link.get("resolved")
        if not resolved:
            continue
        clean, _ = urldefrag(resolved)
        if clean in visited:
            continue
        if (urlsplit(clean).hostname or "").lower() != base_host:
            continue
        if not _safe_url_shape(clean):
            continue
        visited.add(clean)
        queue.append((clean, 1))

    pages_seen = 0
    while queue and pages_seen < max_pages:
        url, depth = queue.pop(0)
        if depth > max_depth + 1:
            continue
        pages_seen += 1
        try:
            await assert_safe_url(url, allow_private=allow_private)
        except UnsafeTargetError as exc:
            checks.append(NavPageCheck(url=url, depth=depth, status="skipped", error=str(exc)))
            continue

        page = await context.new_page()
        monitor = PageMonitor()
        await monitor.attach(page)
        started = time.perf_counter()
        try:
            snapshot = await load_page(page, url, timeout_ms=timeout_ms)
            error = snapshot.load_error
            if snapshot.status_code is not None and snapshot.status_code >= 400:
                status = "failed"
                error = error or f"HTTP {snapshot.status_code}"
            elif error:
                status = "warning"
            else:
                status = "passed"
            check = NavPageCheck(
                url=url,
                depth=depth,
                status=status,
                status_code=snapshot.status_code,
                title=snapshot.title,
                load_ms=int((time.perf_counter() - started) * 1000),
                error=error,
            )
            if status == "failed" and on_screenshot is not None:
                await on_screenshot(page, f"nav-failure-{depth}-{pages_seen}")
            if depth <= max_depth:
                for link in snapshot.links:
                    resolved = link.get("resolved")
                    if not resolved:
                        continue
                    clean, _ = urldefrag(resolved)
                    if clean in visited or not _safe_url_shape(clean):
                        continue
                    if (urlsplit(clean).hostname or "").lower() != base_host:
                        continue
                    visited.add(clean)
                    queue.append((clean, depth + 1))
        except Exception as exc:  # pragma: no cover - defensive
            check = NavPageCheck(
                url=url,
                depth=depth,
                status="warning",
                error=f"{type(exc).__name__}: {exc}"[:500],
            )
        finally:
            with contextlib.suppress(Exception):
                await page.close()
        checks.append(check)
    return checks
