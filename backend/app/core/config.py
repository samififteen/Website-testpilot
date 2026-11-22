"""Application configuration loaded from environment variables.

Every setting can be overridden with a ``TESTPILOT_``-prefixed environment
variable (see ``.env.example``). Nothing secret is ever returned by the API.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(BACKEND_DIR / ".env", BACKEND_DIR.parent / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        env_prefix="TESTPILOT_",
    )

    app_name: str = "TestPilot AI"
    version: str = "1.0.0"
    api_prefix: str = "/api"

    database_url: str = f"sqlite:///{(BACKEND_DIR / 'data' / 'testpilot.db').as_posix()}"
    screenshot_dir: Path = BACKEND_DIR / "screenshots"
    report_dir: Path = BACKEND_DIR / "reports"

    allowed_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
    ]

    # Defaults for new test executions (also editable from the Settings UI).
    default_timeout_seconds: int = 60
    default_max_pages: int = 5
    default_max_links: int = 25
    default_max_depth: int = 1
    default_browser: str = "chromium"

    # Execution safety limits.
    max_concurrency: int = 2
    max_links_hard_limit: int = 100
    max_pages_hard_limit: int = 25
    min_timeout_seconds: int = 10
    max_timeout_seconds: int = 300
    outbound_redirect_limit: int = 3

    # Allow localhost / private targets (only for the local fixture site and
    # integration tests). Never enable this on a public deployment.
    allow_local_targets: bool = False

    # AI analysis (optional). Falls back to the rule-based engine when absent.
    ai_enabled: bool = True
    ai_provider: str = "openai"
    ai_api_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices("TESTPILOT_AI_API_KEY", "AI_API_KEY", "OPENAI_API_KEY"),
    )
    ai_base_url: str = "https://api.openai.com/v1"
    ai_model: str = "gpt-4o-mini"
    ai_timeout_seconds: float = 30.0

    def ensure_directories(self) -> None:
        for path in (self.screenshot_dir, self.report_dir, BACKEND_DIR / "data"):
            path.mkdir(parents=True, exist_ok=True)

    def public_summary(self) -> dict[str, object]:
        """Non-secret configuration that is safe to send to the browser."""
        return {
            "app_name": self.app_name,
            "version": self.version,
            "ai_provider": self.ai_provider,
            "ai_model": self.ai_model,
            "ai_configured": bool(self.ai_api_key),
            "default_timeout_seconds": self.default_timeout_seconds,
            "default_max_pages": self.default_max_pages,
            "default_max_links": self.default_max_links,
            "default_max_depth": self.default_max_depth,
            "max_concurrency": self.max_concurrency,
            "allow_local_targets": self.allow_local_targets,
        }


@lru_cache
def get_settings() -> Settings:
    return Settings()
