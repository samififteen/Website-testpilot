"""Link collection and verification tests (against the local fixture)."""

from __future__ import annotations

import pytest
from app.services.browser.link_checker import (
    LinkCheck,
    check_links,
    classify,
    collect_links,
)


def test_collect_links_deduplicates_and_skips_non_http():
    links = [
        {"href": "https://example.com/a", "resolved": "https://example.com/a", "text": "A"},
        {
            "href": "https://example.com/a#frag",
            "resolved": "https://example.com/a",
            "text": "A dup",
        },
        {"href": "mailto:hi@example.com", "resolved": None, "text": "Mail"},
        {"href": "#top", "resolved": None, "text": "Top"},
        {"href": "", "resolved": None, "text": "No href"},
        {"href": "/relative", "resolved": None, "text": "Relative"},
    ]
    valid, missing = collect_links(links, "https://example.com/")
    urls = [item["url"] for item in valid]
    assert urls == ["https://example.com/a", "https://example.com/relative"]
    assert valid[0]["link_type"] == "internal"
    assert len(missing) == 1
    assert missing[0]["reason"] == "missing href attribute"


def test_external_links_are_classified():
    valid, _ = collect_links(
        [{"href": "https://other.test/x", "resolved": "https://other.test/x", "text": "Ext"}],
        "https://example.com/",
    )
    assert valid[0]["link_type"] == "external"


@pytest.mark.parametrize(
    ("code", "expected"),
    [
        (200, "ok"),
        (204, "ok"),
        (301, "ok"),
        (404, "broken"),
        (500, "broken"),
        (403, "inconclusive"),
        (429, "inconclusive"),
        (None, "inconclusive"),
    ],
)
def test_classification(code, expected):
    check = classify("ok" if code else "inconclusive", code, "https://x.test/", "")
    assert check.status == expected


def test_redirect_is_not_counted_as_broken():
    check = classify("ok", 301, "https://x.test/", "Redirects")
    assert check.status == "ok"


@pytest.mark.asyncio
async def test_check_links_against_fixture(fixture_server):
    links = [
        {"url": fixture_server + "about.html", "text": "About", "link_type": "internal"},
        {"url": fixture_server + "missing-page.html", "text": "Missing", "link_type": "internal"},
        {"url": fixture_server + "error", "text": "Error", "link_type": "internal"},
    ]
    result = await check_links(
        links, base_url=fixture_server, max_links=10, timeout_seconds=5, allow_private=True
    )
    assert result.checked_count == 3
    assert len(result.broken) == 2
    statuses = {check.url.rsplit("/", 1)[-1]: check.status for check in result.checks}
    assert statuses["about.html"] == "ok"
    assert statuses["missing-page.html"] == "broken"
    assert statuses["error"] == "broken"


@pytest.mark.asyncio
async def test_link_check_respects_max_links(fixture_server):
    links = [
        {"url": fixture_server + "about.html", "text": "About", "link_type": "internal"},
        {"url": fixture_server + "form.html", "text": "Form", "link_type": "internal"},
    ]
    result = await check_links(
        links, base_url=fixture_server, max_links=1, timeout_seconds=5, allow_private=True
    )
    assert result.checked_count == 1
    assert len(result.checks) == 1


@pytest.mark.asyncio
async def test_blocked_targets_are_inconclusive_not_broken():
    result = await check_links(
        [
            {
                "url": "http://169.254.169.254/latest/meta-data/",
                "text": "meta",
                "link_type": "external",
            }
        ],
        base_url="https://example.com/",
        max_links=1,
        timeout_seconds=2,
        allow_private=False,
    )
    assert result.broken == []
    assert len(result.inconclusive) == 1


def test_link_check_shape():
    check = LinkCheck(url="https://x.test/", status="ok", status_code=200)
    assert check.as_dict()["status_code"] == 200
