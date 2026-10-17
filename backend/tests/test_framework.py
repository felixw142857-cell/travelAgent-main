"""验证启动、公开接口和前端跨域访问约定。"""

from concurrent.futures import ThreadPoolExecutor

from fastapi import FastAPI
from fastapi.testclient import TestClient

from src import create_app
from src.log.context import request_id_var
from src.settings.config import Settings


def test_lifespan_controls_readiness(app: FastAPI) -> None:
    assert app.state.ready is False
    with TestClient(app) as client:
        response = client.get("/api/v1/base/health")
        assert response.status_code == 200
        data = response.json()["data"]
        assert data["status"] == "healthy"
        assert data["environment"] == "testing"
        assert data["uptime_seconds"] >= 0
        assert data["timestamp"].endswith("Z")
    assert app.state.ready is False


def test_health_before_startup_returns_503(app: FastAPI) -> None:
    client = TestClient(app)
    response = client.get("/api/v1/base/health")
    assert response.status_code == 503
    assert response.json()["code"] == 503


def test_entry_and_version(client: TestClient) -> None:
    entry = client.get("/").json()
    assert entry["data"]["health"] == "/api/v1/base/health"
    assert entry["data"]["docs"] == "/docs"
    response = client.get("/api/v1/base/version")
    assert response.status_code == 200
    assert response.json()["data"]["api_version"] == "v1"
    assert response.json()["data"]["version"] == "0.1.0"


def test_documentation_matches_registered_routes(client: TestClient) -> None:
    assert client.get("/docs").status_code == 200
    assert client.get("/redoc").status_code == 200
    schema = client.get("/openapi.json").json()
    operation = schema["paths"]["/api/v1/base/health"]["get"]
    assert "200" in operation["responses"]
    assert "503" in operation["responses"]


def test_documentation_can_be_disabled() -> None:
    app = create_app(Settings(_env_file=None, DOCS_ENABLED=False, LOG_LEVEL="ERROR"))
    with TestClient(app) as client:
        for path in ("/docs", "/redoc", "/openapi.json"):
            assert client.get(path).status_code == 404
        assert client.get("/").json()["data"]["docs"] is None


def test_frontend_origin_and_preflight(client: TestClient) -> None:
    origin = "http://localhost:5173"
    response = client.options(
        "/api/v1/base/health",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type,x-request-id",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == origin

    response = client.get("/api/v1/base/health", headers={"Origin": origin})
    assert response.headers["access-control-allow-origin"] == origin
    assert "X-Request-ID" in response.headers["access-control-expose-headers"]


def test_unconfigured_origin_is_not_allowed(client: TestClient) -> None:
    response = client.get(
        "/api/v1/base/health", headers={"Origin": "https://unconfigured.example"}
    )
    assert "access-control-allow-origin" not in response.headers


def test_concurrent_requests_keep_separate_ids(client: TestClient) -> None:
    def fetch(index: int):
        request_id = f"request-{index}"
        response = client.get(
            "/api/v1/base/health", headers={"X-Request-ID": request_id}
        )
        assert response.headers["X-Request-ID"] == request_id
        assert response.json()["request_id"] == request_id
        assert float(response.headers["X-Process-Time-Ms"]) >= 0

    with ThreadPoolExecutor(max_workers=4) as executor:
        list(executor.map(fetch, range(8)))
    assert request_id_var.get() == "-"
