"""End-to-end API checks against the committed January 2026 snapshot."""

import pytest
from fastapi.testclient import TestClient

from app import config
from app.main import app

pytestmark = pytest.mark.skipif(
    not config.SNAPSHOT_PATH.exists(), reason="data snapshot not present"
)


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_meta(client):
    body = client.get("/api/meta").json()
    assert body["deliveryFirst"] == "2026-01-02"
    assert body["deliveryLast"] == "2026-02-01"
    assert "09:30" in body["publishHoursUtc"]


def test_day_ahead_uses_0930_forecast_for_1100_decision(client):
    body = client.get("/api/day-ahead", params={"delivery_day": "2026-01-15"}).json()
    assert body["decisionTime"] == "2026-01-14T11:00:00Z"
    assert body["forecastPublishTimes"] == ["2026-01-14T09:30:00Z"]
    assert len(body["points"]) == 48
    assert body["stats"]["n"] == 24
    assert body["energy"]["actualMwh"] > 0


def test_day_ahead_rejects_out_of_scope_day(client):
    assert client.get("/api/day-ahead", params={"delivery_day": "2026-03-01"}).status_code == 422


def test_accuracy_report_shape(client):
    body = client.get("/api/accuracy").json()
    assert body["raw"]["n"] == 31 * 24
    assert len(body["daily"]) == 31
    assert len(body["byHourOfDay"]) == 24
    assert body["byHorizon"][0]["horizonH"] == 0
    assert body["horizonRangeH"] == [14.5, 37.5]
    # The trailing-bias correction should beat the raw forecast on this data.
    assert body["corrected"]["mae"] < body["raw"]["mae"]


def test_explorer(client):
    body = client.get(
        "/api/explorer", params={"start": "2026-01-10", "end": "2026-01-11", "horizon_h": 4}
    ).json()
    assert body["stats"]["n"] == 48
    assert all(p["horizonH"] >= 4 for p in body["points"] if p.get("horizonH") is not None)


def test_explorer_validates_range(client):
    r = client.get("/api/explorer", params={"start": "2026-01-11", "end": "2026-01-10"})
    assert r.status_code == 422


def test_api_responses_are_cacheable(client):
    r = client.get("/api/meta")
    assert r.headers["cache-control"] == "public, max-age=300"
    assert "cache-control" not in client.get("/api/health").headers


def test_openapi_documents_response_fields(client):
    spec = client.get("/openapi.json").json()
    stats = spec["components"]["schemas"]["Stats"]["properties"]
    assert {"mae", "rmse", "bias", "nmaePct", "within1GwPct"} <= stats.keys()
