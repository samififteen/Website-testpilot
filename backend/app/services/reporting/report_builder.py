"""Health scoring, summaries and report export (JSON / HTML)."""

from __future__ import annotations

import base64
import html
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

SEVERITY_PENALTY = {"critical": 25, "high": 15, "medium": 8, "low": 3, "info": 1}
SEVERITY_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}
PROBLEM_STATUSES = {"failed", "warning"}

HEALTH_RULE = (
    "The health score starts at 100 and subtracts 25 per critical, 15 per high, "
    "8 per medium, 3 per low and 1 per informational issue found in the executed "
    "checks. The score is floored at 0 and is only computed from checks that "
    "actually ran."
)


def summarize_results(results: list[dict[str, Any]]) -> dict[str, int]:
    counts = {"total": 0, "passed": 0, "failed": 0, "warnings": 0, "skipped": 0, "info": 0}
    for result in results:
        counts["total"] += 1
        status = str(result.get("status", "")).lower()
        if status == "passed":
            counts["passed"] += 1
        elif status == "failed":
            counts["failed"] += 1
        elif status == "warning":
            counts["warnings"] += 1
        elif status == "skipped":
            counts["skipped"] += 1
        else:
            counts["info"] += 1
    return counts


def build_health(
    results: list[dict[str, Any]], facts: dict[str, Any] | None = None
) -> dict[str, Any]:
    """Compute the weighted health score with an auditable breakdown."""
    deductions: dict[str, int] = {}
    counts: dict[str, int] = {}
    for result in results:
        if str(result.get("status", "")).lower() not in PROBLEM_STATUSES:
            continue
        severity = str(result.get("severity", "medium")).lower()
        if severity not in SEVERITY_PENALTY:
            severity = "medium"
        counts[severity] = counts.get(severity, 0) + 1
        deductions[severity] = deductions.get(severity, 0) + SEVERITY_PENALTY[severity]

    deduction = sum(deductions.values())
    score = max(0, 100 - deduction)
    breakdown = {
        "rule": HEALTH_RULE,
        "issue_counts": counts,
        "deductions": deductions,
        "total_deduction": deduction,
        "facts": facts or {},
    }
    if counts:
        detail = ", ".join(
            f"{count} × {severity} (−{deductions[severity]})"
            for severity, count in sorted(
                counts.items(), key=lambda item: SEVERITY_ORDER.get(item[0], 9)
            )
        )
        explanation = f"{HEALTH_RULE} This run deducted {deduction} points: {detail}."
    else:
        explanation = f"{HEALTH_RULE} This run found no issue to deduct for."
    return {"score": score, "explanation": explanation, "breakdown": breakdown}


def health_from_summary(execution: Any) -> dict[str, Any]:
    summary = getattr(execution, "summary", None) or {}
    facts = summary.get("facts") or {}
    return {
        "health_score": getattr(execution, "health_score", None),
        "broken_links": int(facts.get("broken_links", 0)),
        "javascript_errors": int(facts.get("javascript_errors", 0)),
        "failed_requests": int(facts.get("failed_requests", 0)),
        "form_validation_status": str(facts.get("form_validation", "not tested")),
        "explanation": str(summary.get("health_explanation") or HEALTH_RULE),
        "has_data": bool(summary),
    }


def build_status(results: list[dict[str, Any]]) -> str:
    """A run never passes when a critical or high severity check failed."""
    blocking = [
        r
        for r in results
        if str(r.get("status", "")).lower() == "failed"
        and str(r.get("severity", "")).lower() in {"critical", "high"}
    ]
    if blocking:
        return "failed"
    problems = [r for r in results if str(r.get("status", "")).lower() in PROBLEM_STATUSES]
    if problems:
        return "warnings"
    return "passed"


def _iso(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=UTC)
        return value.astimezone(UTC).isoformat()
    return str(value)


def build_export_json(
    execution: Any,
    results: list[Any],
    screenshots: list[Any],
    analysis: dict[str, Any],
) -> dict[str, Any]:
    return {
        "report": {
            "execution_id": execution.id,
            "url": execution.url,
            "name": execution.name,
            "status": execution.status,
            "page_title": execution.page_title,
            "health_score": execution.health_score,
            "started_at": _iso(execution.started_at),
            "finished_at": _iso(execution.finished_at),
            "duration_ms": execution.duration_ms,
            "created_at": _iso(execution.created_at),
            "summary": execution.summary,
            "config": execution.config,
        },
        "results": [
            {
                "id": r.id,
                "test_name": r.test_name,
                "category": r.category,
                "status": r.status,
                "severity": r.severity,
                "description": r.description,
                "url": r.url,
                "error_details": r.error_details,
                "duration_ms": r.duration_ms,
                "started_at": _iso(r.started_at),
                "finished_at": _iso(r.finished_at),
            }
            for r in results
        ],
        "screenshots": [
            {
                "id": s.id,
                "type": s.screenshot_type,
                "page_url": s.page_url,
                "size_bytes": s.size_bytes,
                "test_result_id": s.test_result_id,
            }
            for s in screenshots
        ],
        "analysis": analysis,
        "exported_at": datetime.now(UTC).isoformat(),
        "generator": "TestPilot AI",
    }


STATUS_COLOURS = {
    "passed": "#16a34a",
    "failed": "#dc2626",
    "warnings": "#d97706",
    "warning": "#d97706",
    "passed_with_warnings": "#d97706",
    "skipped": "#6b7280",
    "running": "#2563eb",
    "queued": "#6b7280",
    "cancelled": "#6b7280",
    "error": "#dc2626",
    "info": "#2563eb",
}


def _badge(status: str) -> str:
    colour = STATUS_COLOURS.get(status.lower(), "#6b7280")
    return (
        f'<span class="badge" style="background:{colour}1f;color:{colour};'
        f'border:1px solid {colour}55">{html.escape(status)}</span>'
    )


def _screenshot_data_uri(path: str) -> str | None:
    try:
        file_path = Path(path)
        if not file_path.is_file() or file_path.stat().st_size > 4_000_000:
            return None
        payload = base64.b64encode(file_path.read_bytes()).decode("ascii")
        return f"data:image/png;base64,{payload}"
    except OSError:
        return None


def build_export_html(
    execution: Any,
    results: list[Any],
    screenshots: list[Any],
    analysis: dict[str, Any],
) -> str:
    esc = html.escape
    summary = execution.summary or {}
    counts = summary.get("counts") or summarize_results([{"status": r.status} for r in results])
    findings_rows = (
        "".join(
            f"<tr><td>{esc(str(f.get('title', '')))}</td>"
            f"<td>{_badge(str(f.get('severity', 'info')))}</td>"
            f"<td>{esc(str(f.get('category', '')))}</td>"
            f"<td>{esc(str(f.get('description', '')))}</td>"
            f"<td>{esc(str(f.get('suggested_fix', '')))}</td></tr>"
            for f in analysis.get("findings", [])
        )
        or "<tr><td colspan='5'>No issues were detected by the executed checks.</td></tr>"
    )

    result_rows = "".join(
        f"<tr><td>{esc(r.test_name)}</td><td>{esc(r.category)}</td>"
        f"<td>{_badge(r.status)}</td><td>{esc(r.severity)}</td>"
        f"<td>{r.duration_ms} ms</td>"
        f"<td><details><summary>Details</summary><pre>{esc(r.description or '')}"
        f"{esc(chr(10) + r.error_details if r.error_details else '')}</pre></details></td></tr>"
        for r in results
    )

    gallery_items = []
    for shot in screenshots:
        data_uri = _screenshot_data_uri(getattr(shot, "absolute_path", ""))
        if not data_uri:
            gallery_items.append(
                f"<figure><figcaption>{esc(shot.screenshot_type)} — image not embedded</figcaption></figure>"
            )
            continue
        gallery_items.append(
            f"<figure><img alt='{esc(shot.screenshot_type)} screenshot' src='{data_uri}'>"
            f"<figcaption>{esc(shot.screenshot_type)} — {esc(shot.page_url or '')}</figcaption></figure>"
        )

    recommendations = (
        "".join(f"<li>{esc(str(item))}</li>" for item in analysis.get("recommendations", []))
        or "<li>No recommendations were produced.</li>"
    )
    explanations = (
        "".join(
            f"<li><strong>{esc(str(item.get('issue', '')))}</strong>: "
            f"{esc(str(item.get('explanation', '')))}</li>"
            for item in analysis.get("developer_explanations", [])
        )
        or "<li>No additional explanations.</li>"
    )

    generated = datetime.now(UTC).strftime("%Y-%m-%d %H:%M UTC")
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>TestPilot AI report — {esc(execution.url)}</title>
<style>
:root {{ color-scheme: dark; }}
* {{ box-sizing: border-box; }}
body {{ margin:0; background:#0b0b10; color:#e7e7ef; font:15px/1.6 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif; }}
main {{ max-width:1080px; margin:0 auto; padding:40px 24px 80px; }}
h1 {{ font-size:26px; margin:0 0 6px; }}
h2 {{ font-size:17px; margin:36px 0 12px; color:#c9c9dd; text-transform:uppercase; letter-spacing:.08em; font-size:12px; }}
a {{ color:#8b9dff; }}
.muted {{ color:#8b8ba3; font-size:13px; }}
.cards {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:12px; margin-top:20px; }}
.card {{ background:#14141d; border:1px solid #26263a; border-radius:12px; padding:14px 16px; }}
.card b {{ display:block; font-size:22px; margin-top:4px; }}
table {{ width:100%; border-collapse:collapse; background:#14141d; border:1px solid #26263a; border-radius:12px; overflow:hidden; font-size:13px; }}
th,td {{ text-align:left; padding:10px 12px; border-bottom:1px solid #222234; vertical-align:top; }}
th {{ color:#9a9ab5; font-weight:500; background:#171722; }}
.badge {{ display:inline-block; padding:1px 8px; border-radius:999px; font-size:11px; text-transform:uppercase; letter-spacing:.04em; }}
pre {{ white-space:pre-wrap; margin:6px 0 0; font-size:12px; color:#b9b9cd; max-width:520px; }}
.summary {{ background:#14141d; border:1px solid #26263a; border-radius:12px; padding:16px 18px; margin-top:16px; }}
.analysis {{ border-left:2px solid #6d5cff; padding-left:16px; }}
figure {{ margin:0; }} img {{ width:100%; border:1px solid #26263a; border-radius:10px; }}
.gallery {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:16px; }}
figcaption {{ color:#8b8ba3; font-size:12px; margin-top:6px; }}
footer {{ margin-top:48px; color:#6f6f88; font-size:12px; }}
</style></head>
<body><main>
<p class="muted">TestPilot AI · Automated test report</p>
<h1>{esc(execution.name or execution.url)}</h1>
<p class="muted">{esc(execution.url)} · execution <code>{esc(execution.id)}</code>
 · status {_badge(execution.status)}</p>
<div class="cards">
  <div class="card">Health score<b>{execution.health_score if execution.health_score is not None else "—"}</b></div>
  <div class="card">Passed<b>{counts.get("passed", 0)}</b></div>
  <div class="card">Failed<b>{counts.get("failed", 0)}</b></div>
  <div class="card">Warnings<b>{counts.get("warnings", 0)}</b></div>
  <div class="card">Skipped<b>{counts.get("skipped", 0)}</b></div>
  <div class="card">Duration<b>{execution.duration_ms or 0} ms</b></div>
</div>
<h2>Analysis ({esc(analysis.get("mode", "rule-based"))})</h2>
<div class="summary analysis">
  <p>{esc(analysis.get("executive_summary", ""))}</p>
  <p class="muted"><strong>Risk:</strong> {esc(analysis.get("risk_assessment", ""))}</p>
</div>
<h2>Findings</h2>
<table><thead><tr><th>Issue</th><th>Severity</th><th>Category</th><th>Description</th><th>Suggested fix</th></tr></thead>
<tbody>{findings_rows}</tbody></table>
<h2>Executed checks</h2>
<table><thead><tr><th>Test</th><th>Category</th><th>Status</th><th>Severity</th><th>Duration</th><th>Details</th></tr></thead>
<tbody>{result_rows}</tbody></table>
<h2>Recommendations</h2><ul>{recommendations}</ul>
<h2>Developer explanations</h2><ul>{explanations}</ul>
<h2>Screenshots</h2><div class="gallery">{"".join(gallery_items) or "<p class='muted'>No screenshots were captured.</p>"}</div>
<footer>Generated by TestPilot AI on {generated}. Facts come from the recorded test results;
AI-generated suggestions are labelled separately.</footer>
</main></body></html>"""


def to_json_text(payload: dict[str, Any]) -> str:
    return json.dumps(payload, indent=2, default=str)
