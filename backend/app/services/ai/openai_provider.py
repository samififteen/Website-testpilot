"""OpenAI-compatible chat-completions provider.

Works with the OpenAI API and any compatible gateway; configure the base URL
with ``TESTPILOT_AI_BASE_URL``. The key is read from the environment only.
"""

from __future__ import annotations

import json
import re
from typing import Any

import httpx

from app.core.config import get_settings
from app.services.ai.base import ProviderError

SYSTEM_PROMPT = """You are a senior QA engineer writing a test report.
Use ONLY the supplied test facts. Never invent tests, URLs or errors.
If a category produced no findings, say so instead of guessing.
Return ONLY a JSON object with this shape:
{
  "executive_summary": "2-4 sentences about the website's health",
  "findings": [{"title": "...", "severity": "critical|high|medium|low|info",
                "category": "...", "description": "...", "evidence": "...",
                "url": "...", "suggested_fix": "..."}],
  "recommendations": ["..."],
  "risk_assessment": "1-3 sentences",
  "developer_explanations": [{"issue": "...", "explanation": "plain-language cause"}
  ]
}
Severity values must be one of the five listed. Keep findings grounded in the
evidence. Do not output markdown fences."""

JSON_BLOCK = re.compile(r"\{.*\}", re.DOTALL)


class OpenAICompatibleProvider:
    name = "openai"

    def __init__(self, api_key: str, base_url: str, model: str, timeout: float = 30.0) -> None:
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout = timeout

    @classmethod
    def from_settings(cls) -> OpenAICompatibleProvider:
        settings = get_settings()
        if not settings.ai_api_key:
            raise ProviderError("No AI API key configured.")
        return cls(
            api_key=settings.ai_api_key,
            base_url=settings.ai_base_url,
            model=settings.ai_model,
            timeout=settings.ai_timeout_seconds,
        )

    async def analyze(self, payload: dict[str, Any]) -> dict[str, Any]:
        body = {
            "model": self.model,
            "temperature": 0.2,
            "max_tokens": 1600,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": "Test facts (JSON):\n"
                    + json.dumps(payload, indent=2, default=str)[:24000],
                },
            ],
        }
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(
                f"{self.base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json=body,
            )
        if response.status_code >= 400:
            raise ProviderError(
                f"AI provider returned HTTP {response.status_code}: {response.text[:300]}"
            )
        try:
            data = response.json()
            content = data["choices"][0]["message"]["content"]
        except (KeyError, IndexError, ValueError) as exc:
            raise ProviderError(f"Unexpected AI response shape: {exc}") from exc
        return self._parse(content)

    @staticmethod
    def _parse(content: str) -> dict[str, Any]:
        text = content.strip()
        if text.startswith("```"):
            text = re.sub(r"^```[a-zA-Z]*\n?|```$", "", text).strip()
        match = JSON_BLOCK.search(text)
        if not match:
            raise ProviderError("AI response did not contain JSON.")
        try:
            parsed = json.loads(match.group(0))
        except json.JSONDecodeError as exc:
            raise ProviderError(f"AI response was not valid JSON: {exc}") from exc
        if not isinstance(parsed, dict):
            raise ProviderError("AI response JSON was not an object.")
        return parsed
