"""Elexon BMRS client and snapshot I/O.

Only two datasets are used, as per the brief:
  * FUELHH  - half-hourly outturn generation by fuel type (we keep fuelType == WIND)
  * WINDFOR - wind generation forecasts, hourly targets, published ~8 times a day
"""

import gzip
import json
import logging
from datetime import date, datetime, timedelta
from pathlib import Path

import httpx

from . import config

log = logging.getLogger(__name__)

# The stream endpoints accept long ranges, but chunking keeps each response small
# and makes a transient failure cheap to retry.
CHUNK_DAYS = 7


def _get(client: httpx.Client, path: str, params: dict) -> list[dict]:
    for attempt in range(3):
        try:
            resp = client.get(f"{config.ELEXON_BASE_URL}/{path}", params=params)
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPError:
            if attempt == 2:
                raise
            log.warning("Elexon request failed, retrying: %s %s", path, params)
    return []


def fetch_actuals(client: httpx.Client, first: date, last: date) -> list[dict]:
    """Wind outturn for settlement dates first..last (inclusive)."""
    rows: list[dict] = []
    day = first
    while day <= last:
        chunk_last = min(day + timedelta(days=CHUNK_DAYS - 1), last)
        rows += _get(
            client,
            "FUELHH/stream",
            {
                "settlementDateFrom": day.isoformat(),
                "settlementDateTo": chunk_last.isoformat(),
                "fuelType": "WIND",
            },
        )
        day = chunk_last + timedelta(days=1)
    return [
        {"startTime": r["startTime"], "generation": r["generation"]}
        for r in rows
        if r.get("fuelType") == "WIND"
    ]


def fetch_forecasts(client: httpx.Client, start: datetime, end: datetime) -> list[dict]:
    """All WINDFOR forecasts published in [start, end)."""
    rows: list[dict] = []
    t = start
    while t < end:
        chunk_end = min(t + timedelta(days=CHUNK_DAYS), end)
        rows += _get(
            client,
            "WINDFOR/stream",
            {
                "publishDateTimeFrom": t.strftime("%Y-%m-%dT%H:%M:%SZ"),
                # The API treats publishDateTimeTo as inclusive; step back a second.
                "publishDateTimeTo": (chunk_end - timedelta(seconds=1)).strftime(
                    "%Y-%m-%dT%H:%M:%SZ"
                ),
            },
        )
        t = chunk_end
    return [
        {
            "publishTime": r["publishTime"],
            "startTime": r["startTime"],
            "generation": r["generation"],
        }
        for r in rows
    ]


def fetch_all() -> dict:
    with httpx.Client(timeout=60) as client:
        actuals = fetch_actuals(client, config.ACTUALS_FROM, config.ACTUALS_TO)
        forecasts = fetch_forecasts(
            client, config.FORECAST_PUBLISHED_FROM, config.FORECAST_PUBLISHED_TO
        )
    return {
        "source": config.ELEXON_BASE_URL,
        "fetchedAt": datetime.now(config.UTC).isoformat(timespec="seconds"),
        "actuals": actuals,
        "forecasts": forecasts,
    }


def write_snapshot(raw: dict, path: Path = config.SNAPSHOT_PATH) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(path, "wt", encoding="utf-8") as f:
        json.dump(raw, f, separators=(",", ":"))


def read_snapshot(path: Path = config.SNAPSHOT_PATH) -> dict:
    with gzip.open(path, "rt", encoding="utf-8") as f:
        return json.load(f)


def load_raw() -> dict:
    if config.DATA_SOURCE == "snapshot" and config.SNAPSHOT_PATH.exists():
        log.info("Loading Elexon data from snapshot %s", config.SNAPSHOT_PATH)
        return read_snapshot()
    log.info("Fetching Elexon data from the live API")
    return fetch_all()
