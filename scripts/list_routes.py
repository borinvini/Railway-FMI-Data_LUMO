"""List every train route (origin -> destination x trainType) in the parquet.

An easy way to browse what routes exist, for QA and for picking routes to
look at more closely, without hand-writing a pandas snippet each time.

Usage (run with the project venv active, never the conda python on PATH):

    source .venv/Scripts/activate
    python scripts/list_routes.py
    python scripts/list_routes.py --from HKI
    python scripts/list_routes.py --to OL --type IC
    python scripts/list_routes.py --search oulu
    python scripts/list_routes.py --min-runs 20 --top 30
    python scripts/list_routes.py --sort delay
    python scripts/list_routes.py --no-csv
    python scripts/list_routes.py --parquet path/to/other.parquet
    python scripts/list_routes.py --from HKI --to TKU --stations
    python scripts/list_routes.py --from HKI --to ROI --full

Prints a table to the terminal and (unless --no-csv) writes the full
filtered set to data/derived/routes_index.csv, including a `stops` column:
a JSON array of that route's typical passenger stations in travel order
(restricted to passengerTraffic == True in
data/raw/metadata_closest_ems_to_train_stations.csv, i.e. no freight-only
stops), each with its own runs/avgDelay/medianDelay/onTimePct computed
only from this route's runs -- so you can see where along the route delay
builds up. Pass --stations to also print each printed route's full stop
list (with per-stop avgDelay) in the terminal.

Delay statistics (all based on each run's average ARRIVAL delay, early
arrivals clamped to 0, per CLAUDE.md's delay convention):
  onTimePct / pctMinorDelay / pctMajorDelay  -- share of runs that are
      on time (<=5 min), minor delay (5-15 min), major delay (>15 min)
  avgMinorDelay / avgMajorDelay              -- mean delay *within* the
      minor/major buckets (n/a if a route has no runs in that bucket)
  avgDelay / medianDelay / p90Delay / maxDelay -- mean, median, 90th
      percentile, and single worst run's delay
  delayStdDev                                -- spread across runs (a
      route can share the same avgDelay as another but be far less
      predictable)
  cancelledPct                               -- % of runs with >=1
      cancelled stop
The CSV always has all of these; the terminal table shows a trimmed set
by default -- pass --full to print every column there too.

Full column reference: data/derived/routes_index.README.md
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import routes_lib  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
METADATA_CSV = ROOT / "data" / "raw" / "metadata_closest_ems_to_train_stations.csv"
OUTPUT_CSV = ROOT / "data" / "derived" / "routes_index.csv"

SORT_KEYS = {
    "runs": ("runs", False),
    "delay": ("avgDelay", False),
    "ontime": ("onTimePct", True),
    "name": ("id", True),
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--from", dest="from_code", help="Filter: origin station short code (e.g. HKI)")
    parser.add_argument("--to", dest="to_code", help="Filter: destination station short code (e.g. OL)")
    parser.add_argument("--type", dest="train_type", help="Filter: trainType (e.g. IC, S)")
    parser.add_argument("--search", help="Filter: substring match on station code or name (case-insensitive)")
    parser.add_argument("--min-runs", type=int, default=0, help="Filter: only routes with at least this many runs")
    parser.add_argument("--top", type=int, default=None, help="Limit the printed table to the top N rows (CSV still has all)")
    parser.add_argument("--sort", choices=list(SORT_KEYS), default="runs", help="Sort key (default: runs)")
    parser.add_argument("--no-csv", action="store_true", help="Don't write data/derived/routes_index.csv")
    parser.add_argument("--parquet", help="Path to a specific parquet file instead of auto-discovery")
    parser.add_argument("--years", type=int, nargs="*", help="Only these years, e.g. --years 2020 2021 (default: every year found)")
    parser.add_argument(
        "--stations", action="store_true",
        help="Also print each printed route's full passenger-station sequence",
    )
    parser.add_argument(
        "--full", action="store_true",
        help="Print every delay statistic in the table, not just the trimmed default set",
    )
    return parser.parse_args()


def apply_filters(routes: pd.DataFrame, args: argparse.Namespace) -> pd.DataFrame:
    out = routes
    if args.from_code:
        out = out[out["from"].str.upper() == args.from_code.upper()]
    if args.to_code:
        out = out[out["to"].str.upper() == args.to_code.upper()]
    if args.train_type:
        out = out[out["trainType"].str.upper() == args.train_type.upper()]
    if args.search:
        needle = args.search.lower()
        mask = (
            out["from"].str.lower().str.contains(needle, na=False)
            | out["to"].str.lower().str.contains(needle, na=False)
            | out["fromName"].str.lower().str.contains(needle, na=False)
            | out["toName"].str.lower().str.contains(needle, na=False)
        )
        out = out[mask]
    if args.min_runs:
        out = out[out["runs"] >= args.min_runs]
    return out


_MINUTE_COLS = [
    "avgDelay", "medianDelay", "p90Delay", "maxDelay", "delayStdDev",
    "avgMinorDelay", "avgMajorDelay",
]
_PCT_COLS = [
    "onTimePct", "pctMinorDelay", "pctMajorDelay", "cancelledPct", "patternShare",
]

# Trimmed default set shown in the terminal (the CSV always has every column).
_DEFAULT_COLS = [
    "id", "from", "to", "trainType", "runs",
    "avgDelay", "p90Delay", "onTimePct", "pctMinorDelay", "pctMajorDelay",
    "cancelledPct", "worstDay", "stationCount", "patternShare",
]
_FULL_COLS = [
    "id", "from", "to", "trainType", "runs",
    "avgDelay", "medianDelay", "p90Delay", "maxDelay", "delayStdDev",
    "onTimePct", "pctMinorDelay", "pctMajorDelay",
    "avgMinorDelay", "avgMajorDelay", "cancelledPct",
    "worstDay", "stationCount", "patternShare",
]


def format_table(routes: pd.DataFrame, full: bool = False) -> str:
    display = routes.copy()
    for col in _MINUTE_COLS:
        if col in display.columns:
            display[col] = display[col].map(lambda v: f"{v:.1f}" if pd.notna(v) else "n/a")
    for col in _PCT_COLS:
        if col in display.columns:
            display[col] = display[col].map(lambda v: f"{v:.0f}%" if pd.notna(v) else "n/a")

    cols = _FULL_COLS if full else _DEFAULT_COLS
    cols = [c for c in cols if c in display.columns]
    return display[cols].to_string(index=False)


def format_station_lines(routes: pd.DataFrame) -> str:
    """One line per route: its full ordered passenger-station sequence,
    each stop annotated with its own avgDelay (parsed from the `stops`
    JSON column)."""
    lines = []
    for _, row in routes.iterrows():
        stops = json.loads(row["stops"]) if pd.notna(row.get("stops")) else []
        parts = []
        for s in stops:
            if s["avgDelay"] is None:
                parts.append(s["name"])
            else:
                parts.append(f"{s['name']} ({s['avgDelay']:.1f} min)")
        share = row.get("patternShare")
        share_note = f" ({share:.0f}% of runs match this pattern)" if pd.notna(share) else ""
        lines.append(f"  {row['id']}: " + " > ".join(parts) + share_note)
    return "\n".join(lines)


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
    routes = routes_lib.aggregate(
        runs, by=("from", "to", "trainType"), station_meta=station_meta, events=events
    )
    od_routes = routes_lib.aggregate(runs, by=("from", "to"))

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

    print(
        f"{len(events):,} rows -> {len(runs):,} runs -> "
        f"{len(od_routes)} OD pairs / {len(routes)} OD x trainType routes "
        f"({date_min} .. {date_max})"
    )
    print(f"station coverage: {matched}/{total} matched to coordinates{missing_note}")
    print()

    filtered = apply_filters(routes, args)
    sort_col, ascending = SORT_KEYS[args.sort]
    filtered = filtered.sort_values(sort_col, ascending=ascending).reset_index(drop=True)

    if filtered.empty:
        print("no routes match")
    else:
        table = filtered if args.top is None else filtered.head(args.top)
        print(format_table(table, full=args.full))
        if args.top is not None and len(filtered) > args.top:
            print(f"... ({len(filtered) - args.top} more; see CSV or raise --top)")
        if args.stations:
            print()
            print(format_station_lines(table))

    if not args.no_csv:
        OUTPUT_CSV.parent.mkdir(parents=True, exist_ok=True)
        filtered.to_csv(OUTPUT_CSV, index=False, encoding="utf-8-sig")
        print(f"\nwrote {len(filtered)} rows to {OUTPUT_CSV.relative_to(ROOT)}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
