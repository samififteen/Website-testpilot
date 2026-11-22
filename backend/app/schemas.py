"""Pydantic request/response schemas for the TestPilot AI API."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

StatusLiteral = Literal[
    "pending", "queued", "running", "passed", "failed", "warnings", "cancelled", "error"
]
ResultStatusLiteral = Literal["passed", "failed", "warning", "skipped", "info"]
SeverityLiteral = Literal["critical", "high", "medium", "low", "info"]


class TestConfig(BaseModel):
    browser: Literal["chromium", "firefox", "webkit"] = "chromium"
    max_depth: int = Field(default=1, ge=0, le=3)
    max_pages: int = Field(default=5, ge=1, le=25)
    max_links: int = Field(default=25, ge=0, le=100)
    timeout_seconds: int = Field(default=60, ge=10, le=300)
    check_links: bool = True
    test_interactions: bool = True
    test_forms: bool = True
    capture_screenshots: bool = True
    ai_analysis: bool = True


class TestCreate(BaseModel):
    url: str = Field(min_length=4, max_length=2048)
    name: str | None = Field(default=None, max_length=200)
    config: TestConfig = Field(default_factory=TestConfig)
    authorized: bool = False

    @field_validator("url")
    @classmethod
    def _strip_url(cls, value: str) -> str:
        return value.strip()

    @field_validator("name")
    @classmethod
    def _strip_name(cls, value: str | None) -> str | None:
        return value.strip() if value and value.strip() else None


class ScreenshotOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    execution_id: str
    test_result_id: str | None = None
    screenshot_type: str
    page_url: str | None = None
    size_bytes: int
    created_at: datetime
    view_url: str | None = None
    download_url: str | None = None


class TestResultOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    execution_id: str
    test_name: str
    category: str
    status: str
    severity: str
    description: str
    url: str | None = None
    error_details: str | None = None
    duration_ms: int
    started_at: datetime | None = None
    finished_at: datetime | None = None
    created_at: datetime
    screenshot_ids: list[str] = Field(default_factory=list)


class ExecutionCounts(BaseModel):
    total: int = 0
    passed: int = 0
    failed: int = 0
    warnings: int = 0
    skipped: int = 0
    info: int = 0


class TestExecutionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    url: str
    name: str
    status: str
    config: dict[str, Any] = Field(default_factory=dict)
    started_at: datetime | None = None
    finished_at: datetime | None = None
    duration_ms: int | None = None
    health_score: int | None = None
    page_title: str | None = None
    summary: dict[str, Any] = Field(default_factory=dict)
    error_message: str | None = None
    created_at: datetime
    counts: ExecutionCounts = Field(default_factory=ExecutionCounts)


class TestExecutionDetail(TestExecutionOut):
    results: list[TestResultOut] = Field(default_factory=list)
    screenshots: list[ScreenshotOut] = Field(default_factory=list)
    ai_analysis: dict[str, Any] = Field(default_factory=dict)
    progress: dict[str, Any] | None = None


class PaginatedExecutions(BaseModel):
    items: list[TestExecutionOut]
    total: int
    page: int
    page_size: int
    pages: int


class DashboardStats(BaseModel):
    total_tests: int
    passed_tests: int
    failed_tests: int
    warning_tests: int
    running_tests: int
    success_rate: float
    average_duration_ms: float
    average_health_score: float | None
    last_run_at: datetime | None = None


class ActivityPoint(BaseModel):
    date: str
    total: int
    passed: int
    failed: int
    warnings: int


class HealthSummary(BaseModel):
    health_score: int | None
    broken_links: int
    javascript_errors: int
    failed_requests: int
    form_validation_status: str
    explanation: str
    has_data: bool


class DashboardResponse(BaseModel):
    stats: DashboardStats
    recent: list[TestExecutionOut]
    activity: list[ActivityPoint]
    health: HealthSummary


class SettingsPayload(BaseModel):
    default_timeout_seconds: int = Field(default=60, ge=10, le=300)
    default_max_pages: int = Field(default=5, ge=1, le=25)
    default_max_links: int = Field(default=25, ge=0, le=100)
    default_max_depth: int = Field(default=1, ge=0, le=3)
    max_concurrency: int = Field(default=2, ge=1, le=8)
    default_browser: Literal["chromium", "firefox", "webkit"] = "chromium"
    ai_enabled: bool = True
    ai_provider: str = Field(default="openai", max_length=50)
    ai_model: str = Field(default="gpt-4o-mini", max_length=100)
    capture_screenshots: bool = True
    screenshot_storage: str = Field(default="local", max_length=50)


class SettingsResponse(BaseModel):
    settings: SettingsPayload
    ai_configured: bool
    ai_key_source: str
    read_only_config: list[str] = Field(default_factory=list)


class SystemInfo(BaseModel):
    version: str
    backend_status: str
    database_status: str
    database_url_scheme: str
    browser_engine: str
    browser_version: str | None
    browser_installed: bool
    executions_stored: int
    screenshots_stored: int
    ai_provider: str
    ai_configured: bool
    ai_mode: str
    uptime_seconds: float
    allow_local_targets: bool
    max_concurrency: int


class AiAnalysisOut(BaseModel):
    mode: str
    provider: str
    model: str | None = None
    generated_at: datetime | None = None
    executive_summary: str = ""
    findings: list[dict[str, Any]] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)
    risk_assessment: str = ""
    developer_explanations: list[dict[str, Any]] = Field(default_factory=list)
    error: str | None = None


class ReportResponse(BaseModel):
    execution: TestExecutionOut
    results: list[TestResultOut]
    screenshots: list[ScreenshotOut]
    analysis: AiAnalysisOut
    health: HealthSummary
    generated_at: datetime
