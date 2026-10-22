"""List every station in the parquet with its own delay statistics,
independent of route.

An easy way to browse each station's overall delay profile -- across every
train that stops there, regardless of which route (OD pair x trainType) it
belongs to -- without hand-writing a pandas snippet each time. For per-route,
per-stop stats instead (station X's delay only within route Y), see
scripts/list_routes.py's `stops` column.

Usage (run with the project venv active, never the conda python on PATH):

    source .venv/Scripts/activate
    python scripts/list_stations.py
    python scripts/list_stations.py --search rovaniemi
    python scripts/list_stations.py --passenger-only
    python scripts/list_stations.py --min-appearances 50 --sort delay
    python scripts/list_stations.py --code HKI
    python scripts/list_stations.py --full --no-csv
    python scripts/list_stations.py --parquet path/to/other.parquet

Prints a table to the terminal and (unless --no-csv) writes the full
filtered set to data/derived/station_index.csv.

Delay statistics are the exact same definitions as scripts/list_routes.py
(same clamped-to-0 ARRIVAL delay, same on-time/minor/major buckets), just
grouped by station alone instead of by (route, station):
  onTimePct / pctMinorDelay / pctMajorDelay  -- share of this station's
      arrivals that are on time (<=5 min), minor delay (5-15 min), major
      delay (>15 min)
  avgMinorDelay / avgMajorDelay              -- mean delay *within* the
      minor/major buckets (n/a if this station has no arrivals in that bucket)
  avgDelay / medianDelay / p90Delay / maxDelay -- mean, median, 90th
      percentile, and single worst arrival delay at this station
  delayStdDev                                -- spread across arrivals
  cancelledPct                               -- % of this station's arrival
      events (cancelled ones included in the denominator) that were cancelled
The CSV always has all of these; the terminal table shows a trimmed set
by default -- pass --full to print every column there too.

Full column reference: data/derived/station_index.README.md
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import routes_lib  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
METADATA_CSV = ROOT / "data" / "raw" / "metadata_closest_ems_to_train_stations.csv"
OUTPUT_CSV = ROOT / "data" / "derived" / "station_index.csv"

SORT_KEYS = {
    "appearances": ("appearances", False),
    "delay": ("avgDelay", False),
    "ontime": ("onTimePct", True),
    "name": ("name", True),
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--code", help="Filter: exact station short code (e.g. HKI)")
    parser.add_argument("--search", help="Filter: substring match on station code or name (case-insensitive)")
    parser.add_argument("--passenger-only", action="store_true", help="Filter: only passengerTraffic == True stations")
    parser.add_argument("--min-appearances", type=int, default=0, help="Filter: only stations visited by at least this many runs")
    parser.add_argument("--top", type=int, default=None, help="Limit the printed table to the top N rows (CSV still has all)")
    parser.add_argument("--sort", choices=list(SORT_KEYS), default="appearances", help="Sort key (default: appearances)")
    parser.add_argument("--no-csv", action="store_true", help="Don't write data/derived/station_index.csv")
    parser.add_argument("--parquet", help="Path to a specific parquet file instead of auto-discovery")
    parser.add_argument("--years", type=int, nargs="*", help="Only these years, e.g. --years 2020 2021 (default: every year found)")
    parser.add_argument(
        "--full", action="store_true",
        help="Print every delay statistic in the table, not just the trimmed default set",
    )
    return parser.parse_args()


def apply_filters(stations: pd.DataFrame, args: argparse.Namespace) -> pd.DataFrame:
    out = stations
    if args.code:
        out = out[out["code"].str.upper() == args.code.upper()]
    if args.search:
        needle = args.search.lower()
        mask = (
            out["code"].str.lower().str.contains(needle, na=False)
            | out["name"].str.lower().str.contains(needle, na=False)
        )
        out = out[mask]
    if args.passenger_only:
        out = out[out["passengerTraffic"] == True]  # noqa: E712
    if args.min_appearances:
        out = out[out["appearances"] >= args.min_appearances]
    return out


_MINUTE_COLS = [
    "avgDelay", "medianDelay", "p90Delay", "maxDelay", "delayStdDev",
    "avgMinorDelay", "avgMajorDelay",
]
_PCT_COLS = ["onTimePct", "pctMinorDelay", "pctMajorDelay", "cancelledPct"]

# Trimmed default set shown in the terminal (the CSV always has every column).
_DEFAULT_COLS = [
    "code", "name", "passengerTraffic", "appearances", "distinctRoutes", "runs",
    "avgDelay", "p90Delay", "onTimePct", "pctMinorDelay", "pctMajorDelay", "cancelledPct",
]
_FULL_COLS = [
    "code", "name", "lat", "lon", "passengerTraffic",
    "appearances", "distinctRoutes", "distinctTrainTypes", "runs",
    "avgDelay", "medianDelay", "p90Delay", "maxDelay", "delayStdDev",
    "onTimePct", "pctMinorDelay", "pctMajorDelay",
    "avgMinorDelay", "avgMajorDelay", "cancelledPct",
    "firstDate", "lastDate",
]


def format_table(stations: pd.DataFrame, full: bool = False) -> str:
    display = stations.copy()
    for col in _MINUTE_COLS:
        if col in display.columns:
            display[col] = display[col].map(lambda v: f"{v:.1f}" if pd.notna(v) else "n/a")
    for col in _PCT_COLS:
        if col in display.columns:
            display[col] = display[col].map(lambda v: f"{v:.0f}%" if pd.notna(v) else "n/a")
    if "passengerTraffic" in display.columns:
        display["passengerTraffic"] = display["passengerTraffic"].map(
            lambda v: "yes" if v is True else ("no" if v is False else "n/a")
        )

    cols = _FULL_COLS if full else _DEFAULT_COLS
    cols = [c for c in cols if c in display.columns]
    return display[cols].to_string(index=False)


def main() -> int:
    args = parse_args()

    try:
        paths = routes_lib.find_parquets(args.parquet)
    except FileNotFoundError as e:
        print(f"error: {e}", file=sys.stderr)
        return 1

    if sys.stdout.encoding is None or sys.stdout.encoding.lower() != "utf-8":
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass

    events = routes_lib.load_events(paths, years=args.years)
    runs = routes_lib.derive_routes(events)
    station_meta = routes_lib.load_station_metadata(METADATA_CSV)
    stations = routes_lib.station_summary(events, runs, station_meta)

    matched, total, missing = routes_lib.station_coverage_warning(events, METADATA_CSV)
    missing_note = ""
    if missing:
        expected = [c for c in missing if c == "HMK"]
        unexpected = [c for c in missing if c != "HMK"]
        parts = []
        if expected:
            parts.append("HMK expected (no coords in CSV either)")
        if unexpected:
            parts.append(f"unexpected: {', '.join(unexpected)}")
        missing_note = " (" + "; ".join(parts) + ")"

    date_min = runs["departureDate"].min()
    date_max = runs["departureDate"].max()
    n_passenger = int((stations["passengerTraffic"] == True).sum())  # noqa: E712

    print(
        f"{len(events):,} rows -> {len(runs):,} runs -> "
        f"{len(stations)} stations ({n_passenger} passenger) "
        f"({date_min} .. {date_max})"
    )
    print(f"station coverage: {matched}/{total} matched to coordinates{missing_note}")
    print()

    filtered = apply_filters(stations, args)
    sort_col, ascending = SORT_KEYS[args.sort]
    filtered = filtered.sort_values(sort_col, ascending=ascending).reset_index(drop=True)

    if filtered.empty:
        print("no stations match")
    else:
        table = filtered if args.top is None else filtered.head(args.top)
        print(format_table(table, full=args.full))
        if args.top is not None and len(filtered) > args.top:
            print(f"... ({len(filtered) - args.top} more; see CSV or raise --top)")

    if not args.no_csv:
        OUTPUT_CSV.parent.mkdir(parents=True, exist_ok=True)
        filtered.to_csv(OUTPUT_CSV, index=False, encoding="utf-8-sig")
        print(f"\nwrote {len(filtered)} rows to {OUTPUT_CSV.relative_to(ROOT)}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
