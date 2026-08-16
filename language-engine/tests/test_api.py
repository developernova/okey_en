from fastapi.testclient import TestClient

from app.main import app


def test_health_is_public() -> None:
    response = TestClient(app).get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_analysis_requires_service_token(monkeypatch) -> None:
    monkeypatch.setenv("LANGUAGE_ENGINE_TOKEN", "a-secure-token-at-least-16")
    response = TestClient(app).post(
        "/v1/analyze/video",
        json={
            "learner_level": "B1",
            "known_lemmas": [],
            "segments": [
                {"text": "A short test.", "offset_ms": 0, "duration_ms": 1000}
            ],
        },
    )
    assert response.status_code == 401


def test_analysis_accepts_service_token(monkeypatch) -> None:
    token = "a-secure-token-at-least-16"
    monkeypatch.setenv("LANGUAGE_ENGINE_TOKEN", token)
    response = TestClient(app).post(
        "/v1/analyze/video",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "learner_level": "B1",
            "known_lemmas": ["short", "test"],
            "segments": [
                {"text": "A short test.", "offset_ms": 0, "duration_ms": 1000}
            ],
        },
    )
    assert response.status_code == 200
    assert response.json()["analysis_version"] == "language-fit-v1"
