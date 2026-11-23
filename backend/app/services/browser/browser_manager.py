"""Playwright browser lifecycle management.

A single browser instance per browser type is kept warm and reused; every test
execution gets its own isolated ``BrowserContext`` so cookies, storage and
network state never leak between runs.
"""

from __future__ import annotations

import asyncio
import contextlib
from typing import Any

from playwright.async_api import Browser, BrowserContext, Playwright, async_playwright

from app.core.config import get_settings

SUPPORTED_BROWSERS = ("chromium", "firefox", "webkit")


class BrowserUnavailableError(RuntimeError):
    """Raised when the requested browser engine cannot be launched."""


class BrowserManager:
    def __init__(self, browser_type: str = "chromium") -> None:
        if browser_type not in SUPPORTED_BROWSERS:
            raise BrowserUnavailableError(f"Unsupported browser engine '{browser_type}'.")
        self.browser_type = browser_type
        self._playwright: Playwright | None = None
        self._browser: Browser | None = None
        self._lock = asyncio.Lock()
        self._loop: asyncio.AbstractEventLoop | None = None
        self.version: str | None = None

    async def start(self) -> Browser:
        loop = asyncio.get_running_loop()
        async with self._lock:
            if self._browser is not None and self._loop is not loop:
                # A browser handle is bound to the loop that created it; drop a
                # stale one instead of reusing it from a different loop.
                self._browser = None
                self._playwright = None
                self._loop = None
            if self._browser is not None and self._browser.is_connected():
                return self._browser
            self._loop = loop
            if self._playwright is None:
                self._playwright = await async_playwright().start()
            launcher = getattr(self._playwright, self.browser_type)
            self._browser = await launcher.launch(
                headless=True,
                args=["--disable-dev-shm-usage", "--no-sandbox"]
                if self.browser_type == "chromium"
                else None,
            )
            self.version = self._browser.version
            return self._browser

    async def new_context(self, *, base_url: str | None = None) -> BrowserContext:
        browser = await self.start()
        settings = get_settings()
        context = await browser.new_context(
            viewport={"width": 1366, "height": 900},
            base_url=base_url,
            ignore_https_errors=True,
            user_agent=(
                "Mozilla/5.0 (compatible; TestPilotAI/1.0; +https://github.com/) Automated QA scan"
            ),
            locale="en-US",
            java_script_enabled=True,
            extra_http_headers={"DNT": "1"},
        )
        context.set_default_timeout(settings.default_timeout_seconds * 1000)
        return context

    async def close(self) -> None:
        """Close the browser and driver without ever blocking on a stale loop.

        A browser handle is bound to the event loop that created it. When
        shutdown happens on another loop (pytest-asyncio gives each test its own
        loop, and Starlette's TestClient runs the lifespan on a portal thread),
        awaiting that handle can never complete because its reader task lives on
        a loop that is already gone. In that case the references are dropped
        instead of awaited; closes on the owning loop are time-boxed anyway.
        """
        loop = asyncio.get_running_loop()
        if self._loop is not None and self._loop is not loop:
            self._browser = None
            self._playwright = None
            self._loop = None
            return
        async with self._lock:
            browser, playwright = self._browser, self._playwright
            self._browser = None
            self._playwright = None
            self._loop = None
            for handle, method in ((browser, "close"), (playwright, "stop")):
                if handle is None:
                    continue
                with contextlib.suppress(Exception, asyncio.CancelledError):
                    await asyncio.wait_for(getattr(handle, method)(), timeout=10)


_managers: dict[str, BrowserManager] = {}
_managers_lock = asyncio.Lock()


async def get_browser_manager(browser_type: str = "chromium") -> BrowserManager:
    async with _managers_lock:
        manager = _managers.get(browser_type)
        if manager is None:
            manager = BrowserManager(browser_type)
            _managers[browser_type] = manager
        return manager


async def shutdown_browsers() -> None:
    for manager in list(_managers.values()):
        await manager.close()
    _managers.clear()


async def browser_health(browser_type: str = "chromium") -> dict[str, Any]:
    """Report whether the engine can actually launch (verified, not assumed)."""
    try:
        manager = await get_browser_manager(browser_type)
        browser = await manager.start()
        return {
            "installed": True,
            "engine": browser_type,
            "version": browser.version,
            "connected": browser.is_connected(),
        }
    except Exception as exc:  # pragma: no cover - depends on host install
        return {
            "installed": False,
            "engine": browser_type,
            "version": None,
            "error": f"{type(exc).__name__}: {exc}",
        }
