"""Offline, deterministic analysis engine.

Produces the same structure as the LLM providers so the report page and
exports do not care which engine ran. It only reasons about recorded facts.
"""

from __future__ import annotations

from typing import Any

from app.services.ai.base import AnalysisResult

SEVERITY_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}

FIXES = {
    "page_load": "Check the page's availability and server logs; the URL did not load correctly for an automated visitor.",
    "javascript": "Open the browser console, reproduce the error and fix the throwing script. Add error boundaries so one failure does not break the page.",
    "network": "Verify the failing request URL, the server response and any auth requirements. Missing assets should be restored or removed from the markup.",
    "links": "Update or remove the broken link, or add a redirect to the current page.",
    "navigation": "Repair the destination page so internal navigation never lands on an error page.",
    "buttons": "Attach an event handler or correct the button markup so it performs the action its label promises.",
    "forms": "Add labels for every input and rely on required/type validation so invalid data is rejected before submission.",
    "accessibility": "Add descriptive alt text to meaningful images and keep a single, descriptive H1 per page.",
    "performance": "Reduce render-blocking resources and payload size; measure with Lighthouse before and after changes.",
}

RECOMMENDATIONS = {
    "javascript": "Run a smoke test on every deploy that fails the build on uncaught exceptions.",
    "network": "Add monitoring for 4xx/5xx responses and missing static assets.",
    "links": "Add a scheduled link check to CI so broken links are caught before release.",
    "forms": "Add automated tests for required-field and input-type validation.",
    "accessibility": "Add automated accessibility checks (axe) to your test pipeline.",
    "performance": "Track page load time as a budget and alert when it regresses.",
    "navigation": "Keep a crawlable sitemap and test primary journeys after each deploy.",
}


def _status_of(result: dict[str, Any]) -> str:
    return str(result.get("status", "")).lower()


def _is_problem(result: dict[str, Any]) -> bool:
    return _status_of(result) in {"failed", "warning"}


def build_findings(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    for result in results:
        if not _is_problem(result):
            continue
        details = (result.get("error_details") or "").strip()
        description = (result.get("description") or "").strip()
        findings.append(
            {
                "title": result.get("test_name", "Test finding"),
                "severity": result.get("severity", "medium"),
                "category": result.get("category", "general"),
                "description": description or details or "The test did not pass.",
                "evidence": (details or description)[:1200],
                "url": result.get("url") or "",
                "suggested_fix": FIXES.get(
                    result.get("category", ""),
                    "Review the failing check and correct the underlying page behaviour.",
                ),
                "status": _status_of(result),
            }
        )
    findings.sort(key=lambda f: SEVERITY_ORDER.get(f["severity"], 4))
    return findings


def build_rule_based_analysis(
    execution: dict[str, Any], results: list[dict[str, Any]]
) -> AnalysisResult:
    total = len(results)
    failed = [r for r in results if _status_of(r) == "failed"]
    warnings = [r for r in results if _status_of(r) == "warning"]
    skipped = [r for r in results if _status_of(r) == "skipped"]
    passed = [r for r in results if _status_of(r) == "passed"]
    findings = build_findings(results)

    url = execution.get("url", "the target site")
    status = execution.get("status", "unknown")
    score = execution.get("health_score")
    critical = [f for f in findings if f["severity"] == "critical"]
    high = [f for f in findings if f["severity"] == "high"]

    if total == 0:
        summary = (
            f"No checks were recorded for {url}. The run did not produce results, "
            "so the site's health cannot be assessed from this report."
        )
    elif not failed and not warnings:
        summary = (
            f"{url} passed all {total} automated checks. The page loaded cleanly, "
            "no JavaScript errors or failed requests were captured, and every "
            "inspected interactive element behaved as expected."
        )
    else:
        summary = (
            f"{url} finished with status '{status}'. Of {total} checks, "
            f"{len(passed)} passed, {len(failed)} failed and {len(warnings)} raised warnings "
            f"({len(skipped)} skipped). The measured health score is "
            f"{score if score is not None else 'not available'}/100. "
            f"The most important issues are: " + ", ".join(f["title"] for f in findings[:3]) + "."
        )

    recommendations: list[str] = []
    seen: set[str] = set()
    for finding in findings:
        advice = RECOMMENDATIONS.get(finding["category"])
        if advice and advice not in seen:
            recommendations.append(advice)
            seen.add(advice)
    if findings:
        recommendations.append(
            "Re-run this test after fixes to confirm the score improves and no new issues appear."
        )
    else:
        recommendations.append(
            "Keep this suite in CI so regressions in load, links, forms and console errors are caught early."
        )

    if critical:
        risk = (
            f"High risk: {len(critical)} critical finding(s) mean core functionality or page "
            "loading is impaired for real visitors."
        )
    elif high:
        risk = (
            f"Moderate risk: {len(high)} high-severity finding(s) affect user-facing behaviour "
            "and should be fixed before the next release."
        )
    elif findings:
        risk = (
            "Low risk: no blocking issues were detected, but the warnings listed above can "
            "degrade usability or accessibility."
        )
    else:
        risk = "Low risk: no issues were detected by the checks that were run."

    explanations = [
        {
            "issue": finding["title"],
            "explanation": finding["description"]
            + (" Evidence: " + finding["evidence"] if finding["evidence"] else ""),
        }
        for finding in findings[:8]
    ]

    return AnalysisResult(
        mode="rule-based",
        provider="local-rules",
        model=None,
        executive_summary=summary,
        findings=findings,
        recommendations=recommendations,
        risk_assessment=risk,
        developer_explanations=explanations,
    )
