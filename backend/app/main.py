"""FastAPI app: JSON API under /api, plus the built React app when it is present."""

import logging
from collections import Counter
from contextlib import asynccontextmanager
from datetime import date, timedelta
from functools import lru_cache

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import analysis, config, elexon

logging.basicConfig(level=logging.INFO)


@lru_cache(maxsize=1)
def get_data() -> analysis.WindData:
    return analysis.WindData(elexon.load_raw())


@asynccontextmanager
async def lifespan(_: FastAPI):
    get_data()  # load once at startup so the first request is fast
    yield


app = FastAPI(title="Wind Forecast Desk API", version="1.0.0", lifespan=lifespan)
app.add_middleware(GZipMiddleware, minimum_size=1000)


DecisionHour = Query(config.DEFAULT_DECISION_HOUR, ge=0, le=23, description="UK local hour on D-1")
Lookback = Query(config.DEFAULT_LOOKBACK_DAYS, ge=1, le=config.MAX_LOOKBACK_DAYS)


def _check_delivery_day(day: date) -> None:
    if not config.DELIVERY_FIRST <= day <= config.DELIVERY_LAST:
        raise HTTPException(
            422,
            f"delivery_day must be between {config.DELIVERY_FIRST} and {config.DELIVERY_LAST}",
        )


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/meta")
def meta() -> dict:
    data = get_data()
    publish_hours = [t.strftime("%H:%M") for t in data.publish_times]
    return {
        "decisionFirst": config.DECISION_FIRST.isoformat(),
        "decisionLast": config.DECISION_LAST.isoformat(),
        "deliveryFirst": config.DELIVERY_FIRST.isoformat(),
        "deliveryLast": config.DELIVERY_LAST.isoformat(),
        "defaultDecisionHour": config.DEFAULT_DECISION_HOUR,
        "defaultLookbackDays": config.DEFAULT_LOOKBACK_DAYS,
        "maxLookbackDays": config.MAX_LOOKBACK_DAYS,
        # Regular schedule only; the odd ad-hoc republication is left out.
        "publishHoursUtc": sorted(h for h, n in Counter(publish_hours).items() if n >= 5),
        "fetchedAt": data.fetched_at,
        "source": "Elexon BMRS: FUELHH (fuelType=WIND) and WINDFOR",
    }


@app.get("/api/day-ahead")
def day_ahead(
    delivery_day: date = Query(..., description="Delivery day D (UK local)"),
    decision_hour: int = DecisionHour,
    lookback_days: int = Lookback,
) -> dict:
    _check_delivery_day(delivery_day)
    return analysis.day_ahead_view(get_data(), delivery_day, decision_hour, lookback_days)


@app.get("/api/accuracy")
def accuracy(decision_hour: int = DecisionHour, lookback_days: int = Lookback) -> dict:
    return _accuracy_cached(decision_hour, lookback_days)


@lru_cache(maxsize=64)
def _accuracy_cached(decision_hour: int, lookback_days: int) -> dict:
    return analysis.accuracy_report(get_data(), decision_hour, lookback_days)


@app.get("/api/explorer")
def explorer(
    start: date = Query(..., description="First UK day (inclusive)"),
    end: date = Query(..., description="Last UK day (inclusive)"),
    horizon_h: float = Query(4, ge=0, le=48, description="Minimum forecast lead time in hours"),
) -> dict:
    if end < start:
        raise HTTPException(422, "end must not be before start")
    if (end - start).days > 31:
        raise HTTPException(422, "range is limited to 32 days")
    first = config.DELIVERY_FIRST - timedelta(days=1)
    if start < first or end > config.DELIVERY_LAST:
        raise HTTPException(422, f"dates must be between {first} and {config.DELIVERY_LAST}")
    window_start, _ = analysis.delivery_window(start)
    _, window_end = analysis.delivery_window(end)
    return analysis.explorer_view(get_data(), window_start, window_end, horizon_h)


# --- Frontend ---------------------------------------------------------------

if config.STATIC_DIR.is_dir():
    app.mount("/assets", StaticFiles(directory=config.STATIC_DIR / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str) -> FileResponse:
        if path.startswith("api/"):
            raise HTTPException(404)
        candidate = (config.STATIC_DIR / path).resolve()
        if path and candidate.is_file() and config.STATIC_DIR.resolve() in candidate.parents:
            return FileResponse(candidate)
        return FileResponse(config.STATIC_DIR / "index.html")
