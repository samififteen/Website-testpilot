"""TestPilot AI — FastAPI application entrypoint."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api import dashboard, tests
from app.api import settings as settings_api
from app.core.config import get_settings
from app.core.security import UnsafeTargetError
from app.database.db import init_db
from app.services.browser.browser_manager import shutdown_browsers

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("testpilot")
settings = get_settings()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    settings.ensure_directories()
    init_db()
    logger.info(
        "TestPilot AI %s ready (AI: %s)",
        settings.version,
        "enabled" if settings.ai_api_key else "rule-based",
    )
    yield
    await shutdown_browsers()


app = FastAPI(
    title="TestPilot AI",
    description=(
        "Automated website testing agent: Playwright browser checks, link and form "
        "validation, screenshots, streaming progress and optional AI analysis."
    ),
    version=settings.version,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Accept"],
)


@app.exception_handler(UnsafeTargetError)
async def unsafe_target_handler(_request: Request, exc: UnsafeTargetError) -> JSONResponse:
    return JSONResponse(status_code=400, content={"detail": str(exc)})


app.include_router(dashboard.router, prefix="/api")
app.include_router(tests.router, prefix="/api")
app.include_router(settings_api.router, prefix="/api")


@app.get("/api", include_in_schema=False)
def api_root() -> dict[str, str]:
    return {
        "name": settings.app_name,
        "version": settings.version,
        "docs": "/api/docs",
    }


# Serve a production frontend build when it is present (single-container mode).
_frontend_dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if _frontend_dist.is_dir():
    app.mount("/", StaticFiles(directory=str(_frontend_dist), html=True), name="frontend")
