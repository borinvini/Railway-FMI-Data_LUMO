"""Build web/public/data/*.json from the parquet + station metadata.

First implementation: produces the two files the home page's station network
map needs -- stations.json (map dots + selection menu) and connections.json
(the lines between directly-adjacent stations). Both are scoped to passenger
stations only (passengerTraffic == True), per the current home-page design.

finland.geojson is static (Natural Earth-derived) and already correct in
web/public/data/ -- this script does not touch it.

Usage (run with the project venv active, never the conda python on PATH):

    source .venv/Scripts/activate
    python scripts/build_data.py
    python scripts/build_data.py --parquet path/to/other.parquet

Idempotent: same inputs -> identical output bytes.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import routes_lib  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
METADATA_CSV = ROOT / "data" / "raw" / "metadata_closest_ems_to_train_stations.csv"
OUT_DIR = ROOT / "web" / "public" / "data"

STATIONS_JSON = OUT_DIR / "stations.json"
CONNECTIONS_JSON = OUT_DIR / "connections.json"


def _round_or_none(v, digits=2):
    return None if v is None or v != v else round(float(v), digits)  # v != v catches NaN


def build_stations_payload(stations) -> list[dict]:
    passenger = stations[stations["passengerTraffic"] == True]  # noqa: E712
    payload = []
    for _, row in passenger.iterrows():
        payload.append(
            {
                "code": row["code"],
                "name": row["name"],
                "lat": _round_or_none(row["lat"], 6),
                "lon": _round_or_none(row["lon"], 6),
                "avgDelay": _round_or_none(row["avgDelay"]),
                "onTimePct": _round_or_none(row["onTimePct"], 1),
                "runs": int(row["runs"]),
                "appearances": int(row["appearances"]),
                "distinctRoutes": int(row["distinctRoutes"]),
                "cancelledPct": _round_or_none(row["cancelledPct"], 1),
            }
        )
    payload.sort(key=lambda s: s["name"])
    return payload


def build_connections_payload(edges, stations_by_code: dict) -> list[dict]:
    payload = []
    skipped = 0
    for _, row in edges.iterrows():
        a = stations_by_code.get(row["from"])
        b = stations_by_code.get(row["to"])
        if a is None or b is None:
            # Endpoint missing coordinates (not in the metadata CSV) --
            # can't draw a line segment for it.
            skipped += 1
            continue
        payload.append(
            {
                "from": row["from"],
                "to": row["to"],
                "fromLon": a["lon"],
                "fromLat": a["lat"],
                "toLon": b["lon"],
                "toLat": b["lat"],
                "runs": int(row["runs"]),
            }
        )
    if skipped:
        print(f"[build_data] skipped {skipped} edge(s) with a missing-coordinate endpoint")
    return payload


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--parquet", help="Path to a specific parquet file instead of auto-discovery")
    args = parser.parse_args()

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

    events = routes_lib.load_events(paths)
    runs = routes_lib.derive_routes(events)
    station_meta = routes_lib.load_station_metadata(METADATA_CSV)
    stations = routes_lib.station_summary(events, runs, station_meta)
    edges = routes_lib.station_network_edges(runs, station_meta)

    matched, total, missing = routes_lib.station_coverage_warning(events, METADATA_CSV)
    print(
        f"{len(events):,} rows -> {len(runs):,} runs -> "
        f"{total} stations total, {matched} with coordinates"
    )
    if missing:
        print(f"[build_data] {len(missing)} station(s) without coordinates: {', '.join(missing)}")

    stations_payload = build_stations_payload(stations)
    stations_by_code = {s["code"]: s for s in stations_payload}
    connections_payload = build_connections_payload(edges, stations_by_code)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    STATIONS_JSON.write_text(
        json.dumps(stations_payload, ensure_ascii=False, indent=None), encoding="utf-8"
    )
    CONNECTIONS_JSON.write_text(
        json.dumps(connections_payload, ensure_ascii=False, indent=None), encoding="utf-8"
    )

    print(
        f"wrote {len(stations_payload)} passenger stations -> "
        f"{STATIONS_JSON.relative_to(ROOT)}"
    )
    print(
        f"wrote {len(connections_payload)} connections -> "
        f"{CONNECTIONS_JSON.relative_to(ROOT)}"
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
