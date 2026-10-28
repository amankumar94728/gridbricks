from datetime import date, datetime, timedelta

import pytest

from app import analysis, config


def ts(s: str) -> datetime:
    return analysis.parse_ts(s)


def make_raw(actuals: dict[str, float], forecasts: list[tuple[str, str, float]]) -> dict:
    return {
        "actuals": [{"startTime": t, "generation": g} for t, g in actuals.items()],
        "forecasts": [{"publishTime": p, "startTime": t, "generation": g} for p, t, g in forecasts],
    }


def test_quantile_matches_linear_interpolation():
    values = [0.0, 10.0, 20.0, 30.0, 40.0]
    assert analysis.quantile(values, 0.0) == 0
    assert analysis.quantile(values, 0.5) == 20
    assert analysis.quantile(values, 0.9) == pytest.approx(36)


def test_error_stats_sign_convention_and_values():
    # forecast - actual: +100 is an over-forecast, -300 an under-forecast
    stats = analysis.error_stats([100.0, -300.0], [1000.0, 1000.0])
    assert stats["bias"] == -100
    assert stats["mae"] == 200
    assert stats["rmse"] == pytest.approx((100**2 / 2 + 300**2 / 2) ** 0.5)
    assert stats["nmaePct"] == 20
    assert stats["maxOver"] == 100 and stats["maxUnder"] == -300


def test_error_stats_empty_is_none():
    assert analysis.error_stats([], []) is None


def test_latest_forecast_ignores_forecasts_published_after_cutoff():
    data = analysis.WindData(
        make_raw(
            {},
            [
                ("2026-01-14T07:30:00Z", "2026-01-15T00:00:00Z", 100),
                ("2026-01-14T09:30:00Z", "2026-01-15T00:00:00Z", 200),
                ("2026-01-14T11:30:00Z", "2026-01-15T00:00:00Z", 300),
            ],
        )
    )
    target = ts("2026-01-15T00:00:00Z")
    assert data.latest_forecast(target, ts("2026-01-14T11:00:00Z")).mw == 200
    assert data.latest_forecast(target, ts("2026-01-14T09:30:00Z")).mw == 200
    assert data.latest_forecast(target, ts("2026-01-14T07:00:00Z")) is None


def test_rows_published_after_their_target_are_not_forecasts():
    data = analysis.WindData(make_raw({}, [("2026-01-15T04:30:00Z", "2026-01-15T00:00:00Z", 999)]))
    assert data.latest_forecast(ts("2026-01-15T00:00:00Z"), ts("2026-01-16T00:00:00Z")) is None


def test_decision_time_is_uk_local_on_previous_day():
    # Winter: UK local == UTC
    assert analysis.decision_time(date(2026, 1, 15), 11) == ts("2026-01-14T11:00:00Z")
    # Summer: 11:00 BST == 10:00 UTC
    assert analysis.decision_time(date(2026, 7, 15), 11) == ts("2026-07-14T10:00:00Z")


def test_delivery_window_handles_clock_changes():
    start, end = analysis.delivery_window(date(2026, 3, 29))  # clocks go forward
    assert end - start == timedelta(hours=23)
    start, end = analysis.delivery_window(date(2026, 10, 25))  # clocks go back
    assert end - start == timedelta(hours=25)


def test_day_ahead_pairs_use_forecast_available_at_decision():
    day = date(2026, 1, 15)
    raw = make_raw(
        {"2026-01-15T00:00:00Z": 1000, "2026-01-15T00:30:00Z": 1100},
        [
            ("2026-01-14T09:30:00Z", "2026-01-15T00:00:00Z", 1500),
            ("2026-01-14T11:30:00Z", "2026-01-15T00:00:00Z", 1050),  # too late for 11:00
        ],
    )
    pairs = analysis.day_ahead_pairs(analysis.WindData(raw), day, 11)
    assert len(pairs) == 24
    first = pairs[0]
    assert first.forecast.mw == 1500
    assert first.error == 500
    assert first.horizon_h == 14.5
    assert all(p.error is None for p in pairs[1:])


def _constant_error_dataset(error: float, days: list[date]) -> analysis.WindData:
    actuals, forecasts = {}, []
    for day in days:
        publish = analysis.iso(analysis.decision_time(day, 11) - timedelta(minutes=30))
        for t in analysis.hourly_targets(*analysis.delivery_window(day)):
            actuals[analysis.iso(t)] = 5000
            forecasts.append((publish, analysis.iso(t), 5000 + error))
    return analysis.WindData(make_raw(actuals, forecasts))


def test_trailing_profile_uses_only_fully_settled_days():
    day = date(2026, 1, 20)
    days = [day - timedelta(days=i) for i in range(0, 10)]
    data = _constant_error_dataset(800, days)
    profile = analysis.trailing_profile(data, day, 11, lookback_days=3)
    # Decision on 19 Jan at 11:00: the latest complete delivery day is 18 Jan.
    assert profile.last_day == date(2026, 1, 18)
    assert profile.first_day == date(2026, 1, 16)
    assert profile.n == 72
    assert profile.bias == 800


def test_day_ahead_view_bias_correction_removes_constant_bias():
    day = date(2026, 1, 20)
    days = [day - timedelta(days=i) for i in range(0, 10)]
    view = analysis.day_ahead_view(_constant_error_dataset(800, days), day, 11, 3)
    assert view["stats"]["bias"] == 800
    assert view["correctedStats"]["mae"] == 0
    point = next(p for p in view["points"] if p.get("forecast") is not None)
    assert point["corrected"] == 5000
    assert point["firm"] == 5000  # p90 of a constant error is the error itself
    # Only hourly actuals exist in this fixture, so the day's actual energy is incomplete.
    assert view["energy"] == {"actualMwh": None, "forecastMwh": 24 * 5800}


def test_delivery_days_cover_january_decisions():
    days = analysis.delivery_days()
    assert days[0] == date(2026, 1, 2)
    assert days[-1] == date(2026, 2, 1)
    assert len(days) == 31
    assert config.DECISION_LAST == date(2026, 1, 31)
