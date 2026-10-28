"""Static configuration for the pilot: scope, market conventions and data source."""

import os
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

UK = ZoneInfo("Europe/London")
UTC = UTC

# Scope from the brief: purchase decisions made in January 2026.
# A decision on day D-1 buys power for delivery day D, so decisions on
# 1-31 Jan cover delivery days 2 Jan - 1 Feb.
DECISION_FIRST = date(2026, 1, 1)
DECISION_LAST = date(2026, 1, 31)
DELIVERY_FIRST = DECISION_FIRST + timedelta(days=1)
DELIVERY_LAST = DECISION_LAST + timedelta(days=1)

# GB day-ahead auctions (EPEX / N2EX) close at 11:00 UK time on D-1.
DEFAULT_DECISION_HOUR = 11

# Trailing window used to learn forecast bias and error spread before each decision.
DEFAULT_LOOKBACK_DAYS = 14
MAX_LOOKBACK_DAYS = 21

# How much history we need around the scope, for the trailing window and the
# horizon analysis (WINDFOR looks up to ~66h ahead).
ACTUALS_FROM = DELIVERY_FIRST - timedelta(days=MAX_LOOKBACK_DAYS + 2)
ACTUALS_TO = DELIVERY_LAST
FORECAST_PUBLISHED_FROM = datetime.combine(
    ACTUALS_FROM - timedelta(days=3), datetime.min.time(), tzinfo=UTC
)
FORECAST_PUBLISHED_TO = datetime.combine(
    DELIVERY_LAST + timedelta(days=1), datetime.min.time(), tzinfo=UTC
)

ELEXON_BASE_URL = "https://data.elexon.co.uk/bmrs/api/v1/datasets"

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
SNAPSHOT_PATH = DATA_DIR / "elexon_wind_jan2026.json.gz"

# "snapshot" (default): load the committed snapshot, falling back to the live API if missing.
# "live": always fetch from Elexon on startup.
DATA_SOURCE = os.getenv("DATA_SOURCE", "snapshot")

STATIC_DIR = Path(os.getenv("STATIC_DIR", Path(__file__).resolve().parent.parent / "static"))

APP_VERSION = "1.1.0"

# Comma-separated origins allowed to call the API cross-origin. Empty (default) means
# same-origin only, which is how the app is deployed (Docker and Vercel).
ALLOWED_ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()]
