"""REST API tests (validation, history, reports, exports, settings)."""

from __future__ import annotations

import pytest
from app.api import tests as tests_api
from app.core.config import get_settings


@pytest.fixture()
def no_browser(monkeypatch):
    """Prevent API tests from launching a real browser."""

    async def _noop(_execution_id: str) -> None:
        return None

    monkeypatch.setattr(tests_api.runner, "submit", _noop)


def _payload(**overrides):
    payload = {
        "url": "https://93.184.216.34/",
        "name": "API test",
        "authorized": True,
        "config": {
            "max_depth": 1,
            "max_pages": 3,
            "max_links": 5,
            "timeout_seconds": 30,
            "browser": "chromium",
        },
    }
    payload.update(overrides)
    return payload


def test_health_endpoint(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["database"] == "ok"


def test_create_requires_authorization(client, no_browser):
    response = client.post("/api/tests", json=_payload(authorized=False))
    assert response.status_code == 400
    assert "permission" in response.json()["detail"].lower()


def test_create_rejects_unsafe_scheme(client, no_browser):
    response = client.post("/api/tests", json=_payload(url="file:///etc/passwd"))
    assert response.status_code == 400


def test_create_rejects_private_target(client, no_browser, monkeypatch):
    monkeypatch.setattr(get_settings(), "allow_local_targets", False)
    response = client.post("/api/tests", json=_payload(url="http://127.0.0.1:8000/"))
    assert response.status_code == 400
    assert "blocked" in response.json()["detail"]


def test_create_rejects_invalid_config(client, no_browser):
    response = client.post(
        "/api/tests", json=_payload(config={"max_pages": 500, "timeout_seconds": 5})
    )
    assert response.status_code == 422


def test_create_and_duplicate(client, no_browser):
    first = client.post("/api/tests", json=_payload())
    assert first.status_code == 201
    body = first.json()
    assert body["status"] == "queued"
    assert body["config"]["max_pages"] == 3
    assert body["counts"]["total"] == 0

    duplicate = client.post("/api/tests", json=_payload())
    assert duplicate.status_code == 409


def test_history_pagination_filter_and_search(client, make_execution):
    make_execution(url="https://alpha.test/", name="Alpha", status="passed")
    make_execution(url="https://beta.test/", name="Beta", status="failed")
    make_execution(url="https://gamma.test/", name="Gamma", status="warnings")

    page = client.get("/api/tests", params={"page": 1, "page_size": 2}).json()
    assert page["total"] == 3
    assert page["pages"] == 2
    assert len(page["items"]) == 2

    failed = client.get("/api/tests", params={"status": "failed"}).json()
    assert failed["total"] == 1
    assert failed["items"][0]["url"] == "https://beta.test/"

    searched = client.get("/api/tests", params={"search": "Gamma"}).json()
    assert searched["total"] == 1

    sorted_items = client.get("/api/tests", params={"sort": "url", "order": "asc"}).json()["items"]
    assert [item["url"] for item in sorted_items] == [
        "https://alpha.test/",
        "https://beta.test/",
        "https://gamma.test/",
    ]


def test_get_missing_execution(client):
    assert client.get("/api/tests/does-not-exist").status_code == 404


def test_get_execution_detail(client, make_execution, make_result):
    execution_id = make_execution()
    make_result(execution_id, status="failed", severity="high")
    response = client.get(f"/api/tests/{execution_id}")
    assert response.status_code == 200
    body = response.json()
    assert len(body["results"]) == 1
    assert body["counts"]["failed"] == 1
    assert body["progress"] is None


def test_cancel_queued_execution(client, make_execution):
    execution_id = make_execution(status="queued")
    response = client.post(f"/api/tests/{execution_id}/cancel")
    assert response.status_code == 200
    assert response.json()["status"] == "cancelled"


def test_cancel_finished_execution_conflicts(client, make_execution):
    execution_id = make_execution(status="passed")
    assert client.post(f"/api/tests/{execution_id}/cancel").status_code == 409


def test_delete_execution(client, make_execution):
    execution_id = make_execution()
    assert client.delete(f"/api/tests/{execution_id}").status_code == 204
    assert client.get(f"/api/tests/{execution_id}").status_code == 404


def test_delete_running_execution_conflicts(client, make_execution):
    execution_id = make_execution(status="running")
    assert client.delete(f"/api/tests/{execution_id}").status_code == 409


def test_settings_roundtrip(client):
    current = client.get("/api/settings").json()
    assert "ai_configured" in current
    assert "api_key" not in str(current).lower().replace("ai_api_key", "")

    payload = {
        **current["settings"],
        "default_timeout_seconds": 45,
        "default_max_pages": 7,
        "ai_enabled": False,
    }
    updated = client.put("/api/settings", json=payload)
    assert updated.status_code == 200
    assert updated.json()["settings"]["default_timeout_seconds"] == 45

    reread = client.get("/api/settings").json()
    assert reread["settings"]["default_max_pages"] == 7


def test_dashboard_stats_and_activity(client, make_execution, make_result):
    passed_id = make_execution(status="passed", health_score=95, duration_ms=1000)
    make_result(passed_id, status="passed")
    failed_id = make_execution(status="failed", health_score=40, duration_ms=3000)
    make_result(failed_id, status="failed", severity="high")
    make_execution(status="queued")

    stats = client.get("/api/dashboard/stats").json()
    assert stats["total_tests"] == 3
    assert stats["passed_tests"] == 1
    assert stats["failed_tests"] == 1
    assert stats["running_tests"] == 1
    assert stats["success_rate"] == 50.0
    assert stats["average_duration_ms"] == 2000

    activity = client.get("/api/dashboard/activity", params={"days": 7}).json()
    assert len(activity) == 7
    assert sum(point["total"] for point in activity) == 3

    dashboard = client.get("/api/dashboard").json()
    assert len(dashboard["recent"]) == 3
    assert dashboard["health"] == {
        "health_score": None,
        "broken_links": 0,
        "javascript_errors": 0,
        "failed_requests": 0,
        "form_validation_status": "not tested",
        "explanation": dashboard["health"]["explanation"],
        "has_data": False,
    }


def test_dashboard_health_uses_stored_facts(client, make_execution):
    make_execution(
        status="failed",
        health_score=55,
        summary={
            "counts": {"total": 3, "failed": 2, "passed": 1},
            "facts": {
                "broken_links": 2,
                "javascript_errors": 1,
                "failed_requests": 3,
                "form_validation": "failed",
            },
            "health_explanation": "Two high severity issues.",
        },
    )
    health = client.get("/api/dashboard").json()["health"]
    assert health["health_score"] == 55
    assert health["broken_links"] == 2
    assert health["javascript_errors"] == 1
    assert health["failed_requests"] == 3
    assert health["form_validation_status"] == "failed"
    assert health["has_data"] is True


def test_report_and_exports(client, make_execution, make_result):
    execution_id = make_execution(status="failed", health_score=70)
    make_result(execution_id, status="failed", severity="high", error_details="HTTP 404")

    report = client.get(f"/api/tests/{execution_id}/report")
    assert report.status_code == 200
    body = report.json()
    assert body["execution"]["id"] == execution_id
    assert body["analysis"]["mode"] == "rule-based"
    assert len(body["analysis"]["findings"]) == 1
    assert body["health"]["health_score"] == 70

    json_export = client.get(f"/api/tests/{execution_id}/export/json")
    assert json_export.status_code == 200
    assert "attachment" in json_export.headers["content-disposition"]
    assert json_export.json()["report"]["execution_id"] == execution_id

    html_export = client.get(f"/api/tests/{execution_id}/export/html")
    assert html_export.status_code == 200
    assert html_export.headers["content-type"].startswith("text/html")
    assert execution_id in html_export.text
    assert "HTTP 404" in html_export.text


def test_results_and_screenshots_endpoints(client, make_execution, make_result):
    execution_id = make_execution()
    make_result(execution_id)
    assert len(client.get(f"/api/tests/{execution_id}/results").json()) == 1
    assert client.get(f"/api/tests/{execution_id}/screenshots").json() == []
    assert client.get(f"/api/tests/{execution_id}/screenshots/nope/file").status_code == 404


def test_stream_events_for_finished_run(client, make_execution, make_result):
    execution_id = make_execution(status="passed")
    make_result(execution_id)
    with client.stream("GET", f"/api/tests/{execution_id}/events") as response:
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/event-stream")
        body = "".join(response.iter_text())
    assert "event: update" in body
    assert "event: done" in body


def test_system_info(client):
    body = client.get("/api/system/info").json()
    assert body["backend_status"] == "ok"
    assert body["database_status"] == "ok"
    assert body["browser_engine"] == "chromium"
    assert body["version"] == get_settings().version
    assert "api_key" not in str(body).lower()
