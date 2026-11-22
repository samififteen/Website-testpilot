"""Screenshot capture and storage for test executions."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from playwright.async_api import Page

from app.core.config import get_settings

SAFE_NAME = re.compile(r"[^a-zA-Z0-9_-]+")


class ScreenshotService:
    def __init__(self, execution_id: str) -> None:
        self.execution_id = execution_id
        settings = get_settings()
        self.directory = Path(settings.screenshot_dir) / execution_id
        self.directory.mkdir(parents=True, exist_ok=True)

    def _path(self, label: str, suffix: str = "png") -> Path:
        safe = SAFE_NAME.sub("-", label).strip("-")[:60] or "shot"
        return self.directory / f"{safe}-{suffix}.png"

    async def capture(
        self, page: Page, *, label: str, full_page: bool = False
    ) -> dict[str, Any] | None:
        """Save a screenshot; returns a record ready for the database."""
        path = self._path(label, "full" if full_page else "viewport")
        try:
            await page.screenshot(path=str(path), full_page=full_page, animations="disabled")
        except Exception:
            return None
        if not path.exists():
            return None
        return {
            "file_path": str(path.relative_to(Path(settings_dir()))).replace("\\", "/"),
            "screenshot_type": "full_page" if full_page else "viewport",
            "page_url": page.url,
            "size_bytes": path.stat().st_size,
        }

    async def capture_with_path(
        self, page: Page, *, label: str, full_page: bool = False
    ) -> dict[str, Any] | None:
        return await self.capture(page, label=label, full_page=full_page)


def settings_dir() -> str:
    return str(Path(get_settings().screenshot_dir).parent)


def resolve_screenshot_path(relative: str) -> Path:
    """Resolve a stored screenshot path inside the screenshot root only."""
    root = Path(get_settings().screenshot_dir).resolve()
    candidate = (Path(settings_dir()) / relative).resolve()
    if root not in candidate.parents and candidate != root:
        raise ValueError("Screenshot path escapes the storage directory")
    return candidate
