"""Response models: documented in OpenAPI (/docs) and validated on the way out.

Fields are snake_case in Python and camelCase in JSON, matching frontend/src/api.ts.
All power values are MW, energy values MWh, times ISO-8601 UTC.
"""

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class Schema(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class Stats(Schema):
    """Error statistics, where error = forecast - actual."""

    n: int = Field(description="Number of hourly forecast/actual pairs")
    mae: float = Field(description="Mean absolute error")
    rmse: float = Field(description="Root mean squared error")
    bias: float = Field(description="Mean error; positive means wind was over-forecast")
    nmae_pct: float | None = Field(description="MAE as % of mean actual generation")
    p10: float
    p50: float
    p90: float
    max_over: float = Field(description="Largest over-forecast")
    max_under: float = Field(description="Largest under-forecast (negative)")
    within1_gw_pct: float = Field(description="% of hours with |error| <= 1 GW")
    mean_actual: float


class Profile(Schema):
    """Error distribution learned from days fully settled before the decision."""

    bias: float
    p10: float
    p90: float
    n: int
    first_day: str
    last_day: str


class Energy(Schema):
    actual_mwh: float | None = Field(description="Null unless every settlement period is present")
    forecast_mwh: float | None = Field(description="Null unless every hour has a forecast")


class Point(Schema):
    """Half-hourly actual; forecast fields are present on the hour only."""

    time: str
    actual: float | None
    forecast: float | None = None
    publish_time: str | None = None
    horizon_h: float | None = Field(None, description="Hours between publication and target")
    error: float | None = None
    corrected: float | None = Field(None, description="Forecast minus recent bias")
    firm: float | None = Field(None, description="Forecast minus recent P90 error")
    upside: float | None = Field(None, description="Forecast minus recent P10 error")


class Meta(Schema):
    decision_first: str
    decision_last: str
    delivery_first: str
    delivery_last: str
    default_decision_hour: int
    default_lookback_days: int
    max_lookback_days: int
    publish_hours_utc: list[str]
    fetched_at: str | None
    source: str


class DayAhead(Schema):
    delivery_day: str
    decision_time: str
    forecast_publish_times: list[str]
    profile: Profile | None
    energy: Energy
    stats: Stats | None
    corrected_stats: Stats | None
    points: list[Point]


class HourOfDay(Schema):
    hour: int
    mae: float
    bias: float
    corrected_mae: float


class Daily(Energy):
    day: str
    mae: float
    bias: float
    corrected_mae: float


class HistogramBin(Schema):
    from_: float = Field(alias="from")
    to: float
    count: int
    pct: float


class HorizonStats(Schema):
    horizon_h: int
    n: int
    mae: float
    rmse: float
    bias: float
    p10: float
    p90: float


class Accuracy(Schema):
    decision_hour: int
    lookback_days: int
    delivery_first: str
    delivery_last: str
    horizon_range_h: tuple[float, float] | None
    raw: Stats
    corrected: Stats
    band_coverage_pct: float | None = Field(description="% of hours inside the P10-P90 range")
    below_firm_pct: float | None = Field(description="% of hours below the firm (P90) level")
    by_hour_of_day: list[HourOfDay]
    daily: list[Daily]
    histogram: list[HistogramBin]
    by_horizon: list[HorizonStats]


class Explorer(Schema):
    start: str
    end: str
    horizon_h: float
    stats: Stats | None
    points: list[Point]


class Health(Schema):
    status: str
