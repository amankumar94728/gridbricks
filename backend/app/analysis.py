"""Forecast-vs-actual analysis.

Conventions used everywhere:
  * error = forecast - actual (MW). Positive error = wind over-forecast, i.e. the
    buyer would be short and need to procure more power than planned.
  * A forecast is "available" at time t only if publishTime <= t. We never use
    information published after the decision, so every number here is something
    the trading desk could actually have seen.
  * Forecasts target the hour (hh:00); actuals are half-hourly settlement periods.
    Pairs are matched on the hourly start times.
"""

import math
from bisect import bisect_right
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta

from . import config


def parse_ts(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def iso(ts: datetime) -> str:
    return ts.astimezone(config.UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


@dataclass(frozen=True)
class Forecast:
    publish: datetime
    mw: float


class WindData:
    """In-memory index of actuals and forecasts, keyed by target time (UTC)."""

    def __init__(self, raw: dict):
        self.fetched_at: str | None = raw.get("fetchedAt")
        self.actuals: dict[datetime, float] = {
            parse_ts(r["startTime"]): float(r["generation"]) for r in raw["actuals"]
        }
        by_target: dict[datetime, dict[datetime, float]] = defaultdict(dict)
        for r in raw["forecasts"]:
            target, publish = parse_ts(r["startTime"]), parse_ts(r["publishTime"])
            # WINDFOR also contains rows for hours already past at publish time;
            # those are not forecasts, so drop them.
            if publish <= target:
                by_target[target][publish] = float(r["generation"])
        self._forecasts: dict[datetime, list[Forecast]] = {
            t: [Forecast(p, mw) for p, mw in sorted(pubs.items())] for t, pubs in by_target.items()
        }
        self._publish_index = {t: [f.publish for f in fs] for t, fs in self._forecasts.items()}
        self.publish_times: list[datetime] = sorted(
            {f.publish for fs in self._forecasts.values() for f in fs}
        )

    def latest_forecast(self, target: datetime, cutoff: datetime) -> Forecast | None:
        """Most recent forecast for `target` published at or before `cutoff`."""
        publishes = self._publish_index.get(target)
        if not publishes:
            return None
        i = bisect_right(publishes, cutoff)
        return self._forecasts[target][i - 1] if i else None

    def actuals_between(self, start: datetime, end: datetime) -> list[tuple[datetime, float]]:
        return sorted((t, mw) for t, mw in self.actuals.items() if start <= t < end)


# --- Market calendar ---------------------------------------------------------


def delivery_window(day: date) -> tuple[datetime, datetime]:
    """UTC bounds of a UK delivery day (23/25 hours on clock-change days)."""
    start = datetime.combine(day, time(0), tzinfo=config.UK)
    end = datetime.combine(day + timedelta(days=1), time(0), tzinfo=config.UK)
    return start.astimezone(config.UTC), end.astimezone(config.UTC)


def hourly_targets(start: datetime, end: datetime) -> list[datetime]:
    out, t = [], start
    while t < end:
        out.append(t)
        t += timedelta(hours=1)
    return out


def decision_time(delivery_day: date, hour: int) -> datetime:
    """When the day-ahead purchase for `delivery_day` is made (UK local `hour` on D-1)."""
    local = datetime.combine(delivery_day - timedelta(days=1), time(hour), tzinfo=config.UK)
    return local.astimezone(config.UTC)


def delivery_days() -> list[date]:
    n = (config.DELIVERY_LAST - config.DELIVERY_FIRST).days + 1
    return [config.DELIVERY_FIRST + timedelta(days=i) for i in range(n)]


# --- Pairs and statistics ----------------------------------------------------


@dataclass(frozen=True)
class Pair:
    target: datetime
    actual: float | None
    forecast: Forecast | None

    @property
    def error(self) -> float | None:
        if self.actual is None or self.forecast is None:
            return None
        return self.forecast.mw - self.actual

    @property
    def horizon_h(self) -> float | None:
        if self.forecast is None:
            return None
        return (self.target - self.forecast.publish).total_seconds() / 3600


def day_ahead_pairs(data: WindData, day: date, hour: int) -> list[Pair]:
    cutoff = decision_time(day, hour)
    return [
        Pair(t, data.actuals.get(t), data.latest_forecast(t, cutoff))
        for t in hourly_targets(*delivery_window(day))
    ]


def horizon_pairs(data: WindData, targets: list[datetime], horizon_h: float) -> list[Pair]:
    lead = timedelta(hours=horizon_h)
    return [Pair(t, data.actuals.get(t), data.latest_forecast(t, t - lead)) for t in targets]


def quantile(sorted_values: list[float], q: float) -> float:
    """Linear-interpolated quantile (same as numpy's default)."""
    if not sorted_values:
        raise ValueError("quantile of empty list")
    pos = (len(sorted_values) - 1) * q
    lo, hi = math.floor(pos), math.ceil(pos)
    return sorted_values[lo] + (sorted_values[hi] - sorted_values[lo]) * (pos - lo)


def error_stats(errors: list[float], actuals: list[float]) -> dict | None:
    if not errors:
        return None
    n = len(errors)
    s = sorted(errors)
    mae = sum(abs(e) for e in errors) / n
    mean_actual = sum(actuals) / len(actuals)
    return {
        "n": n,
        "mae": mae,
        "rmse": math.sqrt(sum(e * e for e in errors) / n),
        "bias": sum(errors) / n,
        "nmaePct": 100 * mae / mean_actual if mean_actual else None,
        "p10": quantile(s, 0.10),
        "p50": quantile(s, 0.50),
        "p90": quantile(s, 0.90),
        "maxOver": s[-1],
        "maxUnder": s[0],
        "within1GwPct": 100 * sum(abs(e) <= 1000 for e in errors) / n,
        "meanActual": mean_actual,
    }


def stats_for(pairs: list[Pair]) -> dict | None:
    matched = [p for p in pairs if p.error is not None]
    return error_stats([p.error for p in matched], [p.actual for p in matched])


# --- Learning from recent errors (no look-ahead) ----------------------------


@dataclass(frozen=True)
class ErrorProfile:
    """Error spread of decision-time forecasts over days fully settled before a decision."""

    bias: float
    p10: float
    p90: float
    n: int
    first_day: date
    last_day: date

    def to_dict(self) -> dict:
        return {
            "bias": self.bias,
            "p10": self.p10,
            "p90": self.p90,
            "n": self.n,
            "firstDay": self.first_day.isoformat(),
            "lastDay": self.last_day.isoformat(),
        }


def trailing_profile(
    data: WindData, day: date, hour: int, lookback_days: int
) -> ErrorProfile | None:
    # At the decision on D-1, delivery day D-2 is the latest day whose actuals are complete.
    last = day - timedelta(days=2)
    first = last - timedelta(days=lookback_days - 1)
    errors = [
        p.error
        for i in range(lookback_days)
        for p in day_ahead_pairs(data, first + timedelta(days=i), hour)
        if p.error is not None
    ]
    if not errors:
        return None
    s = sorted(errors)
    return ErrorProfile(
        bias=sum(errors) / len(errors),
        p10=quantile(s, 0.10),
        p90=quantile(s, 0.90),
        n=len(errors),
        first_day=first,
        last_day=last,
    )


# --- Views served by the API -------------------------------------------------


def _series(
    data: WindData, start: datetime, end: datetime, pairs: list[Pair], profile: ErrorProfile | None
) -> list[dict]:
    """Half-hourly actuals merged with hourly forecast points, for charting."""
    rows: dict[datetime, dict] = {
        t: {"time": iso(t), "actual": mw} for t, mw in data.actuals_between(start, end)
    }
    for p in pairs:
        row = rows.setdefault(p.target, {"time": iso(p.target), "actual": None})
        if p.forecast is None:
            continue
        f = p.forecast.mw
        row.update(
            forecast=f,
            publishTime=iso(p.forecast.publish),
            horizonH=p.horizon_h,
            error=p.error,
        )
        if profile:
            row.update(
                corrected=f - profile.bias,
                # Subtracting a high error quantile gives a level wind beats ~90% of the time.
                firm=max(f - profile.p90, 0.0),
                upside=max(f - profile.p10, 0.0),
            )
    return [rows[t] for t in sorted(rows)]


def _energy_mwh(data: WindData, start: datetime, end: datetime, pairs: list[Pair]) -> dict:
    actual = data.actuals_between(start, end)
    expected_periods = int((end - start).total_seconds() // 1800)
    forecasts = [p.forecast.mw for p in pairs if p.forecast]
    return {
        "actualMwh": sum(mw for _, mw in actual) * 0.5 if len(actual) == expected_periods else None,
        "forecastMwh": sum(forecasts) if len(forecasts) == len(pairs) else None,
    }


def day_ahead_view(data: WindData, day: date, hour: int, lookback_days: int) -> dict:
    start, end = delivery_window(day)
    pairs = day_ahead_pairs(data, day, hour)
    profile = trailing_profile(data, day, hour, lookback_days)
    publishes = sorted({p.forecast.publish for p in pairs if p.forecast})
    corrected = [
        (p.error - profile.bias, p.actual) for p in pairs if profile and p.error is not None
    ]
    return {
        "deliveryDay": day.isoformat(),
        "decisionTime": iso(decision_time(day, hour)),
        "forecastPublishTimes": [iso(t) for t in publishes],
        "profile": profile.to_dict() if profile else None,
        "energy": _energy_mwh(data, start, end, pairs),
        "stats": stats_for(pairs),
        "correctedStats": error_stats([e for e, _ in corrected], [a for _, a in corrected]),
        "points": _series(data, start, end, pairs, profile),
    }


def _histogram(errors: list[float], width: float = 500) -> list[dict]:
    if not errors:
        return []
    lo = math.floor(min(errors) / width) * width
    hi = math.floor(max(errors) / width) * width
    counts = defaultdict(int)
    for e in errors:
        counts[math.floor(e / width) * width] += 1
    n, out, b = len(errors), [], lo
    while b <= hi:
        out.append({"from": b, "to": b + width, "count": counts[b], "pct": 100 * counts[b] / n})
        b += width
    return out


def horizon_profile(data: WindData, targets: list[datetime], horizons: list[int]) -> list[dict]:
    out = []
    for h in horizons:
        stats = stats_for(horizon_pairs(data, targets, h))
        if stats:
            out.append(
                {"horizonH": h, **{k: stats[k] for k in ("n", "mae", "rmse", "bias", "p10", "p90")}}
            )
    return out


def accuracy_report(data: WindData, hour: int, lookback_days: int) -> dict:
    raw_errors, corr_errors, actuals = [], [], []
    in_band = below_firm = 0
    by_hour: dict[int, list[tuple[float, float]]] = defaultdict(list)
    daily, horizons = [], []

    for day in delivery_days():
        start, end = delivery_window(day)
        pairs = day_ahead_pairs(data, day, hour)
        profile = trailing_profile(data, day, hour, lookback_days)
        matched = [p for p in pairs if p.error is not None]
        if not matched:
            continue
        day_corr = []
        for p in matched:
            raw_errors.append(p.error)
            actuals.append(p.actual)
            horizons.append(p.horizon_h)
            corr = p.error - profile.bias if profile else p.error
            day_corr.append(corr)
            by_hour[p.target.astimezone(config.UK).hour].append((p.error, corr))
            if profile:
                firm = max(p.forecast.mw - profile.p90, 0.0)
                upside = max(p.forecast.mw - profile.p10, 0.0)
                in_band += firm <= p.actual <= upside
                below_firm += p.actual < firm
        corr_errors += day_corr
        day_stats = stats_for(matched)
        daily.append(
            {
                "day": day.isoformat(),
                **_energy_mwh(data, start, end, pairs),
                "mae": day_stats["mae"],
                "bias": day_stats["bias"],
                "correctedMae": sum(abs(e) for e in day_corr) / len(day_corr),
            }
        )

    targets = [t for day in delivery_days() for t in hourly_targets(*delivery_window(day))]
    n = len(raw_errors)
    return {
        "decisionHour": hour,
        "lookbackDays": lookback_days,
        "deliveryFirst": config.DELIVERY_FIRST.isoformat(),
        "deliveryLast": config.DELIVERY_LAST.isoformat(),
        "horizonRangeH": [min(horizons), max(horizons)] if horizons else None,
        "raw": error_stats(raw_errors, actuals),
        "corrected": error_stats(corr_errors, actuals),
        "bandCoveragePct": 100 * in_band / n if n else None,
        "belowFirmPct": 100 * below_firm / n if n else None,
        "byHourOfDay": [
            {
                "hour": h,
                "mae": sum(abs(r) for r, _ in v) / len(v),
                "bias": sum(r for r, _ in v) / len(v),
                "correctedMae": sum(abs(c) for _, c in v) / len(v),
            }
            for h, v in sorted(by_hour.items())
        ],
        "daily": daily,
        "histogram": _histogram(raw_errors),
        "byHorizon": horizon_profile(data, targets, list(range(0, 49))),
    }


def explorer_view(data: WindData, start: datetime, end: datetime, horizon_h: float) -> dict:
    pairs = horizon_pairs(data, hourly_targets(start, end), horizon_h)
    return {
        "start": iso(start),
        "end": iso(end),
        "horizonH": horizon_h,
        "stats": stats_for(pairs),
        "points": _series(data, start, end, pairs, None),
    }
