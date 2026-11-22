"""Settings endpoints. Server-side secrets are never returned."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.database.db import get_db
from app.models import AppSetting
from app.schemas import SettingsPayload, SettingsResponse

router = APIRouter(tags=["settings"])

EDITABLE_KEYS = set(SettingsPayload.model_fields.keys())


def _stored(db: Session) -> dict:
    row = db.query(AppSetting).first()
    if row is None:
        row = AppSetting(id=1, data={})
        db.add(row)
        db.commit()
        db.refresh(row)
    return dict(row.data or {})


def effective_settings(db: Session) -> SettingsPayload:
    settings = get_settings()
    defaults = {
        "default_timeout_seconds": settings.default_timeout_seconds,
        "default_max_pages": settings.default_max_pages,
        "default_max_links": settings.default_max_links,
        "default_max_depth": settings.default_max_depth,
        "max_concurrency": settings.max_concurrency,
        "default_browser": settings.default_browser,
        "ai_enabled": settings.ai_enabled,
        "ai_provider": settings.ai_provider,
        "ai_model": settings.ai_model,
        "capture_screenshots": True,
        "screenshot_storage": "local",
    }
    merged = {**defaults, **{k: v for k, v in _stored(db).items() if k in EDITABLE_KEYS}}
    return SettingsPayload(**merged)


@router.get("/settings", response_model=SettingsResponse)
def read_settings(db: Session = Depends(get_db)) -> SettingsResponse:
    settings = get_settings()
    return SettingsResponse(
        settings=effective_settings(db),
        ai_configured=bool(settings.ai_api_key),
        ai_key_source=(
            "environment variable (AI_API_KEY / OPENAI_API_KEY)"
            if settings.ai_api_key
            else "not configured"
        ),
        read_only_config=[
            "AI API keys are read from server environment variables only.",
            "Browser engine availability is verified in System information.",
            "allow_local_targets is controlled by TESTPILOT_ALLOW_LOCAL_TARGETS on the server.",
        ],
    )


@router.put("/settings", response_model=SettingsResponse)
def update_settings(payload: SettingsPayload, db: Session = Depends(get_db)) -> SettingsResponse:
    row = db.query(AppSetting).first()
    if row is None:
        row = AppSetting(id=1, data={})
        db.add(row)
    row.data = payload.model_dump()
    db.commit()
    settings = get_settings()
    return SettingsResponse(
        settings=effective_settings(db),
        ai_configured=bool(settings.ai_api_key),
        ai_key_source=(
            "environment variable (AI_API_KEY / OPENAI_API_KEY)"
            if settings.ai_api_key
            else "not configured"
        ),
        read_only_config=[
            "AI API keys are read from server environment variables only.",
            "Browser engine availability is verified in System information.",
            "allow_local_targets is controlled by TESTPILOT_ALLOW_LOCAL_TARGETS on the server.",
        ],
    )
