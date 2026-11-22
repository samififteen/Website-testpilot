"""Page inspection: loading, title, content, and structural extraction."""

from __future__ import annotations

import contextlib
import time
from dataclasses import dataclass, field
from typing import Any

from playwright.async_api import Page
from playwright.async_api import TimeoutError as PlaywrightTimeoutError

EXTRACT_SCRIPT = """
() => {
  const clean = (value) => (value || '').replace(/\\s+/g, ' ').trim().slice(0, 300);
  const visible = (el) => {
    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' &&
      Number(style.opacity || 1) > 0 && rect.width > 0 && rect.height > 0;
  };
  const absolute = (href) => {
    try { return new URL(href, document.baseURI).href; } catch (e) { return null; }
  };
  const links = Array.from(document.querySelectorAll('a')).slice(0, 400).map((a) => ({
    href: a.getAttribute('href'),
    resolved: a.getAttribute('href') ? absolute(a.getAttribute('href')) : null,
    text: clean(a.innerText || a.getAttribute('aria-label') || a.title),
    visible: visible(a),
    target: a.getAttribute('target'),
    rel: a.getAttribute('rel'),
  }));
  const buttons = Array.from(document.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"]')).slice(0, 100).map((b, index) => ({
    index,
    tag: b.tagName.toLowerCase(),
    text: clean(b.innerText || b.value || b.getAttribute('aria-label') || b.title),
    type: b.getAttribute('type') || '',
    disabled: !!b.disabled || b.getAttribute('aria-disabled') === 'true',
    visible: visible(b),
    name: b.getAttribute('name') || '',
  }));
  const forms = Array.from(document.querySelectorAll('form')).slice(0, 20).map((form, index) => {
    const fields = Array.from(form.querySelectorAll('input, textarea, select')).slice(0, 40).map((input) => {
      let label = '';
      if (input.id) {
        const el = document.querySelector('label[for="' + CSS.escape(input.id) + '"]');
        if (el) label = el.innerText;
      }
      if (!label) {
        const parent = input.closest('label');
        if (parent) label = parent.innerText;
      }
      return {
        tag: input.tagName.toLowerCase(),
        type: (input.getAttribute('type') || (input.tagName === 'TEXTAREA' ? 'textarea' : 'text')).toLowerCase(),
        name: input.getAttribute('name') || '',
        id: input.getAttribute('id') || '',
        label: clean(label || input.getAttribute('aria-label') || input.getAttribute('placeholder')),
        placeholder: input.getAttribute('placeholder') || '',
        required: !!input.required || input.getAttribute('aria-required') === 'true',
        disabled: !!input.disabled,
        aria_label: input.getAttribute('aria-label') || '',
      };
    });
    const submit = form.querySelector('button[type="submit"], input[type="submit"], button:not([type])');
    return {
      index,
      action: form.getAttribute('action') || '',
      resolved_action: form.getAttribute('action') ? absolute(form.getAttribute('action')) : document.baseURI,
      method: (form.getAttribute('method') || 'get').toLowerCase(),
      fields,
      submit_text: submit ? clean(submit.innerText || submit.value) : '',
      has_password: form.querySelector('input[type="password"]') !== null,
      has_payment: form.querySelector('input[autocomplete*="cc-"], input[name*="card"]') !== null,
    };
  });
  const images = Array.from(document.images).slice(0, 150).map((img) => ({
    src: img.currentSrc || img.src,
    alt: img.getAttribute('alt') || '',
    naturalWidth: img.naturalWidth,
    visible: visible(img),
  }));
  const headings = Array.from(document.querySelectorAll('h1, h2, h3')).slice(0, 60).map((h) => ({
    level: h.tagName.toLowerCase(),
    text: clean(h.innerText),
  }));
  const navLinks = Array.from(document.querySelectorAll('nav a, header a, [role="navigation"] a')).slice(0, 60)
    .map((a) => ({ href: absolute(a.getAttribute('href') || ''), text: clean(a.innerText) }));
  return {
    title: document.title || '',
    lang: document.documentElement.lang || '',
    textLength: (document.body ? document.body.innerText : '').trim().length,
    textSample: (document.body ? document.body.innerText : '').replace(/\\s+/g, ' ').trim().slice(0, 400),
    linkCount: document.querySelectorAll('a').length,
    links,
    buttons,
    forms,
    images,
    headings,
    navLinks,
    hasMain: !!document.querySelector('main, [role="main"]'),
    hasH1: document.querySelectorAll('h1').length > 0,
    imagesMissingAlt: images.filter((img) => img.visible && !img.alt).length,
  };
}
"""


@dataclass
class PageSnapshot:
    url: str
    final_url: str
    status_code: int | None
    title: str
    text_length: int
    text_sample: str
    load_ms: int
    links: list[dict[str, Any]] = field(default_factory=list)
    buttons: list[dict[str, Any]] = field(default_factory=list)
    forms: list[dict[str, Any]] = field(default_factory=list)
    images: list[dict[str, Any]] = field(default_factory=list)
    headings: list[dict[str, Any]] = field(default_factory=list)
    nav_links: list[dict[str, Any]] = field(default_factory=list)
    has_main: bool = False
    has_h1: bool = False
    images_missing_alt: int = 0
    lang: str = ""
    load_error: str | None = None
    timed_out: bool = False

    @property
    def is_blank(self) -> bool:
        return self.text_length < 20

    def as_dict(self) -> dict[str, Any]:
        return {
            "url": self.url,
            "final_url": self.final_url,
            "status_code": self.status_code,
            "title": self.title,
            "text_length": self.text_length,
            "load_ms": self.load_ms,
            "has_main": self.has_main,
            "has_h1": self.has_h1,
            "images_missing_alt": self.images_missing_alt,
            "link_count": len(self.links),
            "button_count": len(self.buttons),
            "form_count": len(self.forms),
        }


async def load_page(page: Page, url: str, *, timeout_ms: int) -> PageSnapshot:
    """Navigate to ``url`` and extract structure. Never raises for HTTP errors."""
    started = time.perf_counter()
    status_code: int | None = None
    error: str | None = None
    timed_out = False
    try:
        response = await page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
        status_code = response.status if response else None
        with contextlib.suppress(PlaywrightTimeoutError):
            await page.wait_for_load_state("networkidle", timeout=min(5000, timeout_ms))
    except PlaywrightTimeoutError as exc:
        error = f"Navigation timed out after {timeout_ms} ms: {exc}".strip()
        timed_out = True
    except Exception as exc:  # network errors, invalid certs, crashes
        error = f"{type(exc).__name__}: {exc}"
        timed_out = "Timeout" in type(exc).__name__

    load_ms = int((time.perf_counter() - started) * 1000)
    data: dict[str, Any] = {}
    if not error or not timed_out:
        try:
            data = await page.evaluate(EXTRACT_SCRIPT)
        except Exception as exc:  # pragma: no cover - page may be closed
            error = error or f"Could not inspect page: {type(exc).__name__}: {exc}"

    snapshot = PageSnapshot(
        url=url,
        final_url=page.url if page.url else url,
        status_code=status_code,
        title=str(data.get("title", "") or "")[:500],
        text_length=int(data.get("textLength", 0) or 0),
        text_sample=str(data.get("textSample", "") or ""),
        load_ms=load_ms,
        links=list(data.get("links", []) or []),
        buttons=list(data.get("buttons", []) or []),
        forms=list(data.get("forms", []) or []),
        images=list(data.get("images", []) or []),
        headings=list(data.get("headings", []) or []),
        nav_links=list(data.get("navLinks", []) or []),
        has_main=bool(data.get("hasMain")),
        has_h1=bool(data.get("hasH1")),
        images_missing_alt=int(data.get("imagesMissingAlt", 0) or 0),
        lang=str(data.get("lang", "") or ""),
        load_error=error,
        timed_out=timed_out,
    )
    return snapshot
