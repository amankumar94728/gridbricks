"""Refresh the committed Elexon data snapshot.

Usage (from backend/):  python -m scripts.snapshot
"""

from app import config, elexon


def main() -> None:
    raw = elexon.fetch_all()
    elexon.write_snapshot(raw)
    print(
        f"Wrote {config.SNAPSHOT_PATH.name}: "
        f"{len(raw['actuals'])} actuals, {len(raw['forecasts'])} forecast rows"
    )


if __name__ == "__main__":
    main()
