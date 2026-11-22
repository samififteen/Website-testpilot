"""Health scoring, status policy, report exports and AI fallback tests."""

from __future__ import annotations

import asyncio
import json
from typing import ClassVar

from app.services.ai.analyzer import analyze
from app.services.ai.rule_based import build_rule_based_analysis
from app.services.reporting.report_builder import (
    build_export_html,
    build_export_json,
    build_health,
    build_status,
    health_from_summary,
    summarize_results,
)

RESULTS = [
    {
        "test_name": "Page loads",
        "category": "page_load",
        "status": "passed",
        "severity": "critical",
    },
    {
        "test_name": "Links resolve",
        "category": "links",
        "status": "failed",
        "severity": "high",
        "description": "2 broken",
        "error_details": "https://x.test/404 → HTTP 404",
        "url": "https://x.test/",
    },
    {
        "test_name": "No JS errors",
        "category": "javascript",
        "status": "failed",
        "severity": "high",
        "description": "1 error",
        "error_details": "Error: boom",
    },
    {
        "test_name": "Accessibility",
        "category": "accessibility",
        "status": "warning",
        "severity": "low",
        "description": "Missing alt",
    },
]


def test_counts():
    counts = summarize_results(RESULTS)
    assert counts == {"total": 4, "passed": 1, "failed": 2, "warnings": 1, "skipped": 0, "info": 0}


def test_health_score_math():
    health = build_health(RESULTS, {"broken_links": 2})
    # 100 - (15 + 15) - 3 = 67
    assert health["score"] == 67
    assert health["breakdown"]["deductions"] == {"high": 30, "low": 3}
    assert "deducted 33 points" in health["explanation"]


def test_health_score_floors_at_zero():
    many = [{"status": "failed", "severity": "critical"} for _ in range(6)]
    assert build_health(many)["score"] == 0


def test_status_policy():
    assert build_status(RESULTS) == "failed"
    assert build_status([{"status": "warning", "severity": "low"}]) == "warnings"
    assert build_status([{"status": "passed", "severity": "critical"}]) == "passed"
    assert build_status([{"status": "failed", "severity": "low"}]) == "warnings", (
        "low-severity failures must not fail the whole run"
    )


def test_health_from_summary_without_data():
    class Exec:
        summary: ClassVar[dict] = {}
        health_score = None

    data = health_from_summary(Exec())
    assert data["has_data"] is False
    assert data["health_score"] is None


def test_rule_based_analysis_is_grounded():
    execution = {"url": "https://x.test/", "status": "failed", "health_score": 67}
    analysis = build_rule_based_analysis(execution, RESULTS)
    assert analysis.mode == "rule-based"
    assert "https://x.test/" in analysis.executive_summary
    assert len(analysis.findings) == 3
    assert analysis.findings[0]["severity"] == "high"
    assert analysis.findings[0]["suggested_fix"]
    assert analysis.recommendations
    assert "risk" in analysis.risk_assessment.lower()
    assert analysis.developer_explanations


def test_rule_based_analysis_with_no_results():
    analysis = build_rule_based_analysis({"url": "https://x.test/", "status": "passed"}, [])
    assert "No checks were recorded" in analysis.executive_summary
    assert analysis.findings == []


def test_ai_falls_back_to_rules_without_a_key():
    settings_key = (
        __import__("app.core.config", fromlist=["get_settings"]).get_settings().ai_api_key
    )
    assert settings_key in (None, ""), "tests must run without an AI key"
    analysis = asyncio.run(analyze({"url": "https://x.test/", "status": "failed"}, RESULTS))
    assert analysis.mode == "rule-based"
    assert analysis.provider == "local-rules"


def test_export_json_contains_real_data(make_execution, make_result, db):
    from app.models import TestExecution

    execution_id = make_execution(status="failed", health_score=55)
    make_result(execution_id, status="failed", severity="high", error_details="HTTP 404")
    execution = db.get(TestExecution, execution_id)
    from app.models import TestResult

    rows = db.query(TestResult).filter_by(execution_id=execution_id).all()
    payload = build_export_json(
        execution, rows, [], build_rule_based_analysis({"url": execution.url}, []).as_dict()
    )
    assert payload["report"]["execution_id"] == execution_id
    assert payload["report"]["health_score"] == 55
    assert payload["results"][0]["error_details"] == "HTTP 404"
    json.dumps(payload)  # serializable


def test_export_html_escapes_and_labels_analysis(make_execution, make_result, db):
    from app.models import TestExecution, TestResult

    execution_id = make_execution(url="https://x.test/", status="warnings")
    make_result(execution_id, description="<script>alert(1)</script>")
    execution = db.get(TestExecution, execution_id)
    rows = db.query(TestResult).filter_by(execution_id=execution_id).all()
    analysis = build_rule_based_analysis(
        {"url": execution.url, "status": execution.status, "health_score": None},
        [
            {
                "status": r.status,
                "severity": r.severity,
                "test_name": r.test_name,
                "category": r.category,
                "description": r.description,
            }
            for r in rows
        ],
    ).as_dict()
    document = build_export_html(execution, rows, [], analysis)
    assert "<script>alert(1)</script>" not in document
    assert "&lt;script&gt;" in document
    assert "rule-based" in document
    assert execution_id in document
