"""FastAPI app: JSON API under /api, plus the built React app when it is present."""

import logging
from collections import Counter
from contextlib import asynccontextmanager
from datetime import date, timedelta
from functools import lru_cache

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse

from . import analysis, config, elexon, schemas

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def get_data() -> analysis.WindData:
    return analysis.WindData(elexon.load_raw())


@asynccontextmanager
async def lifespan(_: FastAPI):
    data = get_data()  # load once at startup so the first request is fast
    log.info(
        "Loaded %d actual periods and %d forecast publications",
        len(data.actuals),
        len(data.publish_times),
    )
    yield


app = FastAPI(
    title="Wind Forecast Desk API",
    version=config.APP_VERSION,
    summary="GB wind forecast vs outturn for day-ahead power procurement (January 2026).",
    description=(
        "Error convention: **error = forecast − actual** (MW). Positive values mean wind was "
        "over-forecast. Times are ISO-8601 UTC; delivery days and decision hours are UK local."
    ),
    lifespan=lifespan,
)
app.add_middleware(GZipMiddleware, minimum_size=1000)
if config.ALLOWED_ORIGINS:
    app.add_middleware(CORSMiddleware, allow_origins=config.ALLOWED_ORIGINS, allow_methods=["GET"])


@app.middleware("http")
async def cache_headers(request: Request, call_next):
    """The data is a fixed historical snapshot, so responses can be cached."""
    response = await call_next(request)
    path = request.url.path
    if response.status_code == 200:
        if path.startswith("/assets/"):
            # Vite fingerprints asset filenames, so they never change.
            response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        elif path.startswith("/api/") and path != "/api/health":
            response.headers["Cache-Control"] = "public, max-age=300"
    return response


DecisionHour = Query(config.DEFAULT_DECISION_HOUR, ge=0, le=23, description="UK local hour on D-1")
Lookback = Query(
    config.DEFAULT_LOOKBACK_DAYS,
    ge=1,
    le=config.MAX_LOOKBACK_DAYS,
    description="Settled delivery days used to learn forecast bias and error spread",
)


def _check_delivery_day(day: date) -> None:
    if not config.DELIVERY_FIRST <= day <= config.DELIVERY_LAST:
        raise HTTPException(
            422,
            f"delivery_day must be between {config.DELIVERY_FIRST} and {config.DELIVERY_LAST}",
        )


@app.get("/api/health", response_model=schemas.Health, tags=["system"])
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/meta", response_model=schemas.Meta, tags=["system"], summary="Scope and defaults")
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


@app.get(
    "/api/day-ahead",
    response_model=schemas.DayAhead,
    tags=["analysis"],
    summary="One delivery day as seen at the purchase decision",
)
def day_ahead(
    delivery_day: date = Query(..., description="Delivery day D (UK local)"),
    decision_hour: int = DecisionHour,
    lookback_days: int = Lookback,
) -> dict:
    _check_delivery_day(delivery_day)
    return analysis.day_ahead_view(get_data(), delivery_day, decision_hour, lookback_days)


@app.get(
    "/api/accuracy",
    response_model=schemas.Accuracy,
    tags=["analysis"],
    summary="Accuracy of decision-time forecasts across all January decisions",
)
def accuracy(decision_hour: int = DecisionHour, lookback_days: int = Lookback) -> dict:
    return _accuracy_cached(decision_hour, lookback_days)


@lru_cache(maxsize=64)
def _accuracy_cached(decision_hour: int, lookback_days: int) -> dict:
    return analysis.accuracy_report(get_data(), decision_hour, lookback_days)


@app.get(
    "/api/explorer",
    response_model=schemas.Explorer,
    tags=["analysis"],
    summary="Actual vs latest forecast published at least N hours ahead",
)
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
    static_root = config.STATIC_DIR.resolve()

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str) -> FileResponse:
        if path.startswith("api/"):
            raise HTTPException(404)
        candidate = (static_root / path).resolve()
        if path and candidate.is_file() and static_root in candidate.parents:
            return FileResponse(candidate)
        return FileResponse(static_root / "index.html")
