"""Shared pytest fixtures.

Environment variables are configured *before* the application is imported so
the database, screenshot directory and SSRF policy are isolated per test run.
"""

from __future__ import annotations

import importlib.util
import os
import sys
import tempfile
import threading
from collections.abc import Iterator
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_DIR.parent
FIXTURE_DIR = REPO_ROOT / "test-sites" / "fixtures" / "local_test_site"

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

_TMP = Path(tempfile.mkdtemp(prefix="testpilot-tests-"))

os.environ["TESTPILOT_DATABASE_URL"] = f"sqlite:///{(_TMP / 'test.db').as_posix()}"
os.environ["TESTPILOT_SCREENSHOT_DIR"] = str(_TMP / "screenshots")
os.environ["TESTPILOT_REPORT_DIR"] = str(_TMP / "reports")
os.environ["TESTPILOT_ALLOW_LOCAL_TARGETS"] = "1"
os.environ["TESTPILOT_AI_ENABLED"] = "0"
os.environ["TESTPILOT_AI_API_KEY"] = ""
os.environ["TESTPILOT_DEFAULT_TIMEOUT_SECONDS"] = "30"
os.environ["TESTPILOT_MAX_CONCURRENCY"] = "1"
os.environ["TESTPILOT_ALLOWED_ORIGINS"] = '["http://localhost:5173"]'

from app.database.db import SessionLocal, init_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models import (  # noqa: E402
    AppSetting,
    RunMetric,
    Screenshot,
    TestConfigTemplate,
    TestExecution,
    TestResult,
)
from fastapi.testclient import TestClient  # noqa: E402


@pytest.fixture(autouse=True)
def _database() -> Iterator[None]:
    init_db()
    from app.services.browser.test_runner import PROGRESS

    PROGRESS.clear()
    yield
    with SessionLocal() as session:
        session.query(Screenshot).delete()
        session.query(TestResult).delete()
        session.query(RunMetric).delete()
        session.query(TestExecution).delete()
        session.query(TestConfigTemplate).delete()
        session.query(AppSetting).delete()
        session.commit()
    PROGRESS.clear()


@pytest.fixture()
def db():
    init_db()
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def client() -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture()
def make_execution(db):
    def _make(**overrides) -> str:
        payload = {
            "url": "https://example.com/",
            "name": "Seeded run",
            "status": "passed",
            "config": {},
            "summary": {},
            "ai_analysis": {},
        }
        payload.update(overrides)
        execution = TestExecution(**payload)
        db.add(execution)
        db.commit()
        db.refresh(execution)
        return execution.id

    return _make


@pytest.fixture()
def make_result(db):
    def _make(execution_id: str, **overrides):
        payload = {
            "execution_id": execution_id,
            "test_name": "Page loads successfully",
            "category": "page_load",
            "status": "passed",
            "severity": "critical",
            "description": "Loaded fine",
            "duration_ms": 12,
        }
        payload.update(overrides)
        result = TestResult(**payload)
        db.add(result)
        db.commit()
        db.refresh(result)
        return result

    return _make


@pytest.fixture(scope="session")
def fixture_server() -> Iterator[str]:
    """Run the local fixture website in a thread and yield its base URL."""
    spec = importlib.util.spec_from_file_location(
        "testpilot_fixture_server", FIXTURE_DIR / "server.py"
    )
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    server = module.create_server(0)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base_url = f"http://127.0.0.1:{server.server_port}/"
    try:
        yield base_url
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)
