from collections.abc import Iterator

import pytest
from app.main import app
from fastapi.testclient import TestClient


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client


def test_health(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/json")
    assert response.json() == {"status": "ok"}


def test_health_rejects_other_methods(client: TestClient) -> None:
    response = client.post("/health")
    assert response.status_code == 405


def test_unknown_path(client: TestClient) -> None:
    response = client.get("/rpc/login")
    assert response.status_code == 404
    assert response.json() == {"detail": "Not Found"}


def test_openapi_names_the_service(client: TestClient) -> None:
    response = client.get("/openapi.json")
    assert response.status_code == 200
    document = response.json()
    assert document["info"]["title"] == "RE-Booking"
    assert list(document["paths"]) == ["/health"]
    assert list(document["paths"]["/health"]) == ["get"]
