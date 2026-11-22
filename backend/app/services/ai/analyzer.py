"""AI analysis orchestration with graceful rule-based fallback."""

from __future__ import annotations

import logging
from typing import Any

from app.core.config import get_settings
from app.services.ai.base import AnalysisResult, ProviderError
from app.services.ai.openai_provider import OpenAICompatibleProvider
from app.services.ai.rule_based import build_rule_based_analysis

logger = logging.getLogger(__name__)

SEVERITIES = {"critical", "high", "medium", "low", "info"}
MAX_FINDINGS = 30


def build_payload(
    execution: dict[str, Any],
    results: list[dict[str, Any]],
    screenshots: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Facts handed to the model. Tests that were not run are absent, so the
    model cannot describe them."""
    return {
        "url": execution.get("url"),
        "page_title": execution.get("page_title"),
        "status": execution.get("status"),
        "health_score": execution.get("health_score"),
        "duration_ms": execution.get("duration_ms"),
        "summary": execution.get("summary", {}),
        "results": [
            {
                "test": r.get("test_name"),
                "category": r.get("category"),
                "status": r.get("status"),
                "severity": r.get("severity"),
                "description": (r.get("description") or "")[:600],
                "error_details": (r.get("error_details") or "")[:600],
                "url": r.get("url"),
                "duration_ms": r.get("duration_ms"),
            }
            for r in results
        ],
        "screenshots": [
            {"type": s.get("screenshot_type"), "page_url": s.get("page_url")}
            for s in (screenshots or [])
        ],
    }


def _sanitize(data: dict[str, Any], provider_name: str, model: str | None) -> AnalysisResult:
    findings: list[dict[str, Any]] = []
    for item in (data.get("findings") or [])[:MAX_FINDINGS]:
        if not isinstance(item, dict):
            continue
        severity = str(item.get("severity", "medium")).lower()
        findings.append(
            {
                "title": str(item.get("title", "Finding"))[:200],
                "severity": severity if severity in SEVERITIES else "medium",
                "category": str(item.get("category", "general"))[:50],
                "description": str(item.get("description", ""))[:2000],
                "evidence": str(item.get("evidence", ""))[:2000],
                "url": str(item.get("url", ""))[:2048],
                "suggested_fix": str(item.get("suggested_fix", ""))[:1000],
            }
        )
    recommendations = [str(r)[:500] for r in (data.get("recommendations") or [])[:12]]
    explanations = []
    for item in (data.get("developer_explanations") or [])[:12]:
        if isinstance(item, dict):
            explanations.append(
                {
                    "issue": str(item.get("issue", ""))[:200],
                    "explanation": str(item.get("explanation", ""))[:1500],
                }
            )
    return AnalysisResult(
        mode="ai",
        provider=provider_name,
        model=model,
        executive_summary=str(data.get("executive_summary", ""))[:4000],
        findings=findings,
        recommendations=recommendations,
        risk_assessment=str(data.get("risk_assessment", ""))[:2000],
        developer_explanations=explanations,
    )


async def analyze(
    execution: dict[str, Any],
    results: list[dict[str, Any]],
    screenshots: list[dict[str, Any]] | None = None,
) -> AnalysisResult:
    """Use the configured LLM when possible, otherwise the local engine."""
    settings = get_settings()
    if not settings.ai_enabled or not settings.ai_api_key:
        return build_rule_based_analysis(execution, results)

    payload = build_payload(execution, results, screenshots)
    try:
        provider = OpenAICompatibleProvider.from_settings()
        data = await provider.analyze(payload)
        analysis = _sanitize(data, provider.name, provider.model)
        if not analysis.executive_summary:
            raise ProviderError("AI returned an empty executive summary.")
        return analysis
    except (ProviderError, Exception) as exc:
        logger.warning("AI analysis fell back to rules: %s", exc)
        fallback = build_rule_based_analysis(execution, results)
        fallback.error = (
            f"AI analysis unavailable ({type(exc).__name__}); rule-based analysis used."
        )
        return fallback


def rule_based_only(execution: dict[str, Any], results: list[dict[str, Any]]) -> AnalysisResult:
    return build_rule_based_analysis(execution, results)
