"""测试真实的异常处理边界；仅在测试应用上注册故障路由。"""

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from pydantic import BaseModel, Field

from src.core.exceptions import BusinessError


class ExampleInput(BaseModel):
    duration: int = Field(ge=1, le=30)


def test_not_found_and_method_not_allowed(client: TestClient) -> None:
    for response in (
        client.get("/missing"),
        client.post("/api/v1/base/health"),
    ):
        body = response.json()
        assert response.status_code in {404, 405}
        assert body["code"] == response.status_code
        assert body["data"] is None
        assert body["request_id"] == response.headers["X-Request-ID"]


def test_validation_failure_has_uniform_response(app: FastAPI) -> None:
    @app.post("/test-validation")
    async def validate(payload: ExampleInput):
        return payload

    with TestClient(app) as client:
        response = client.post("/test-validation", json={"duration": 0})
    assert response.status_code == 422
    body = response.json()
    assert body["code"] == 422
    assert body["data"]["errors"][0]["location"] == ["body", "duration"]
    assert "input" not in body["data"]["errors"][0]


def test_business_error_preserves_explanation(app: FastAPI) -> None:
    @app.get("/test-business-error")
    async def fail():
        raise BusinessError("天气查询超时", status_code=504)

    with TestClient(app) as client:
        response = client.get("/test-business-error")
    assert response.status_code == 504
    assert response.json()["msg"] == "天气查询超时"


def test_http_auth_error_preserves_required_headers(app: FastAPI) -> None:
    @app.get("/test-auth-error")
    async def fail():
        raise HTTPException(401, "需要认证", headers={"WWW-Authenticate": "Bearer"})

    with TestClient(app) as client:
        response = client.get("/test-auth-error")
    assert response.status_code == 401
    assert response.headers["WWW-Authenticate"] == "Bearer"
    assert response.json()["code"] == 401


def test_unhandled_error_has_request_id_and_cors(app: FastAPI) -> None:
    @app.get("/test-unhandled-error")
    async def fail():
        raise RuntimeError("private debug detail")

    with TestClient(app) as client:
        response = client.get(
            "/test-unhandled-error",
            headers={"Origin": "http://localhost:5173", "X-Request-ID": "failure-1"},
        )
        # 一次失败不应影响下一次请求。
        assert client.get("/api/v1/base/health").status_code == 200
    assert response.status_code == 500
    assert response.json()["request_id"] == "failure-1"
    assert response.headers["X-Request-ID"] == "failure-1"
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert "private debug detail" not in response.text
