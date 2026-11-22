"""Provider-agnostic AI analysis interface."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol


@dataclass
class AnalysisResult:
    mode: str  # "ai" | "rule-based"
    provider: str
    model: str | None = None
    executive_summary: str = ""
    findings: list[dict[str, Any]] = field(default_factory=list)
    recommendations: list[str] = field(default_factory=list)
    risk_assessment: str = ""
    developer_explanations: list[dict[str, Any]] = field(default_factory=list)
    error: str | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "mode": self.mode,
            "provider": self.provider,
            "model": self.model,
            "executive_summary": self.executive_summary,
            "findings": self.findings,
            "recommendations": self.recommendations,
            "risk_assessment": self.risk_assessment,
            "developer_explanations": self.developer_explanations,
            "error": self.error,
        }


class AIProvider(Protocol):
    """Any LLM backend that can turn test facts into a structured analysis."""

    name: str
    model: str

    async def analyze(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Return executive_summary/findings/recommendations/risk_assessment."""


class ProviderError(RuntimeError):
    """Raised when a provider is misconfigured or unavailable."""
