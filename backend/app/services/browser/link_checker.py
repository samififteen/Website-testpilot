"""HTTP link verification with SSRF-safe redirect handling."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from urllib.parse import urldefrag, urljoin, urlsplit

import httpx

from app.core.config import get_settings
from app.core.security import UnsafeTargetError, assert_safe_url

DEFAULT_HEADERS = {
    "User-Agent": "TestPilotAI/1.0 (automated link check)",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}
SKIP_SCHEMES = ("mailto:", "tel:", "javascript:", "data:", "sms:", "ftp:", "#")


@dataclass
class LinkCheck:
    url: str
    status: str  # ok | broken | redirect | inconclusive | skipped
    status_code: int | None = None
    final_url: str | None = None
    reason: str = ""
    text: str = ""
    link_type: str = "internal"

    def as_dict(self) -> dict:
        return {
            "url": self.url,
            "status": self.status,
            "status_code": self.status_code,
            "final_url": self.final_url,
            "reason": self.reason,
            "text": self.text,
            "link_type": self.link_type,
        }


@dataclass
class LinkCheckerResult:
    checks: list[LinkCheck] = field(default_factory=list)
    broken: list[LinkCheck] = field(default_factory=list)
    inconclusive: list[LinkCheck] = field(default_factory=list)
    missing_href: list[dict] = field(default_factory=list)
    checked_count: int = 0

    @property
    def broken_count(self) -> int:
        return len(self.broken)


def _same_site(base: str, candidate: str) -> bool:
    try:
        return urlsplit(base).hostname == urlsplit(candidate).hostname
    except ValueError:
        return False


def collect_links(snapshot_links: list[dict], base_url: str) -> tuple[list[dict], list[dict]]:
    """Deduplicate links and pull out anchors without a usable href."""
    valid: list[dict] = []
    missing: list[dict] = []
    seen: set[str] = set()
    for link in snapshot_links:
        raw_href = link.get("href")
        text = (link.get("text") or "").strip()
        if not raw_href or not str(raw_href).strip():
            missing.append({"text": text, "reason": "missing href attribute"})
            continue
        href = str(raw_href).strip()
        if href.startswith("#") or href.lower().startswith(SKIP_SCHEMES):
            continue
        resolved = link.get("resolved")
        if not resolved:
            resolved = urljoin(base_url, href)
        resolved, _ = urldefrag(resolved)
        if urlsplit(resolved).scheme not in ("http", "https"):
            continue
        if resolved in seen:
            continue
        seen.add(resolved)
        valid.append(
            {
                "url": resolved,
                "text": text,
                "link_type": "internal" if _same_site(base_url, resolved) else "external",
            }
        )
    return valid, missing


async def _fetch(
    client: httpx.AsyncClient, url: str, *, allow_private: bool
) -> tuple[str, int | None, str | None, str]:
    """Request ``url`` following redirects manually, re-validating each hop."""
    settings = get_settings()
    current = url
    for _hop in range(settings.outbound_redirect_limit + 1):
        if not allow_private:
            await assert_safe_url(current)
        try:
            response = await client.get(current, follow_redirects=False)
        except httpx.TimeoutException:
            return "inconclusive", None, current, "Request timed out"
        except httpx.HTTPError as exc:
            return "inconclusive", None, current, f"Request failed: {type(exc).__name__}"
        if response.status_code in (301, 302, 303, 307, 308):
            location = response.headers.get("location")
            if not location:
                return "inconclusive", response.status_code, current, "Redirect without location"
            target = urljoin(current, location)
            if not allow_private:
                try:
                    await assert_safe_url(target)
                except UnsafeTargetError:
                    return (
                        "inconclusive",
                        response.status_code,
                        current,
                        "Redirect to a blocked address",
                    )
            current = target
            continue
        return "ok", response.status_code, current, ""
    return "inconclusive", None, current, "Too many redirects"


def classify(status: str, code: int | None, url: str, reason: str) -> LinkCheck:
    if status == "inconclusive":
        return LinkCheck(url=url, status="inconclusive", status_code=code, reason=reason)
    if code is None:
        return LinkCheck(url=url, status="inconclusive", reason="No response")
    if code < 400:
        return LinkCheck(url=url, status="ok", status_code=code, reason="")
    if code in (401, 403, 405, 429):
        return LinkCheck(
            url=url,
            status="inconclusive",
            status_code=code,
            reason=f"Blocked or rate limited (HTTP {code}) — not counted as broken",
        )
    return LinkCheck(url=url, status="broken", status_code=code, reason=f"HTTP {code}")


async def check_links(
    links: list[dict],
    *,
    base_url: str,
    max_links: int,
    timeout_seconds: float = 10.0,
    allow_private: bool | None = None,
) -> LinkCheckerResult:
    """Check a bounded, de-duplicated set of links politely."""
    settings = get_settings()
    allow = settings.allow_local_targets if allow_private is None else allow_private
    result = LinkCheckerResult()
    selected = links[: max(0, max_links)]
    result.checked_count = len(selected)
    if not selected:
        return result

    checked: set[str] = set()
    semaphore = asyncio.Semaphore(5)
    limits = httpx.Limits(max_connections=8, max_keepalive_connections=4)

    async with httpx.AsyncClient(
        timeout=httpx.Timeout(timeout_seconds),
        headers=DEFAULT_HEADERS,
        limits=limits,
        verify=False,
    ) as client:

        async def run(link: dict) -> None:
            url = link["url"]
            if url in checked:
                return
            checked.add(url)
            async with semaphore:
                status, code, final_url, reason = await _fetch(client, url, allow_private=allow)
                check = classify(status, code, url, reason)
                check.text = link.get("text", "")[:200]
                check.link_type = link.get("link_type", "internal")
                check.final_url = final_url if final_url and final_url != url else None
                if check.final_url:
                    check.reason = check.reason or "Redirects"
                result.checks.append(check)
                if check.status == "broken":
                    result.broken.append(check)
                elif check.status == "inconclusive":
                    result.inconclusive.append(check)
                await asyncio.sleep(0.05)  # be gentle with the target site

        await asyncio.gather(*(run(link) for link in selected))

    return result
