"""Build web/public/data/*.json from the parquet + station metadata.

First implementation: produces the two files the home page's station network
map needs -- stations.json (map dots + selection menu; passenger stations
only) and connections.json (the lines between directly-adjacent stations).
connections.json includes non-passenger stations too, as waypoints only --
they give the lines their real physical curve, but never get a marker and
never appear in stations.json / the selection menu.

route_patterns.json lists every distinct full stop sequence a train ran in
the data, with how many runs of each train type followed it. The route finder
uses it to find direct trains that stop at one station and then another.

route_stats.json has the delay statistics of every train service (origin ->
destination x train type, the same rows as data/derived/routes_index.csv) plus
a compact per-stop delay list. The route details pop-up loads it lazily when a
highlighted route is clicked.

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
ROUTE_PATTERNS_JSON = OUT_DIR / "route_patterns.json"
ROUTE_STATS_JSON = OUT_DIR / "route_stats.json"


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


def build_coord_lookup(stations) -> dict:
    """code -> {lat, lon} for every station (passenger or not), for resolving
    connections.json edge endpoints -- deliberately not filtered to
    passenger stations, unlike build_stations_payload()."""
    lookup = {}
    for _, row in stations.iterrows():
        lat, lon = _round_or_none(row["lat"], 6), _round_or_none(row["lon"], 6)
        if lat is not None and lon is not None:
            lookup[row["code"]] = {"lat": lat, "lon": lon}
    return lookup


def build_connections_payload(edges, coords_by_code: dict) -> list[dict]:
    payload = []
    skipped = 0
    for _, row in edges.iterrows():
        a = coords_by_code.get(row["from"])
        b = coords_by_code.get(row["to"])
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


def build_route_patterns_payload(runs) -> list[dict]:
    """One entry per distinct full stop sequence (every station the train stops
    at, passenger or not, so a drawn path follows the real track), with the
    number of runs per train type that followed it. Sorted by total runs
    (busiest first), ties by the stop list, so the output bytes are stable."""
    payload = []
    for stops, g in runs.groupby("stopSequence", sort=False):
        by_type = g["trainType"].value_counts()
        payload.append(
            {
                "stops": list(stops),
                "runsByType": {t: int(by_type[t]) for t in sorted(by_type.index)},
            }
        )
    payload.sort(key=lambda p: (-sum(p["runsByType"].values()), p["stops"]))
    return payload


def build_route_stats_payload(routes) -> dict:
    """id (`<from>-<to>-<trainType>`) -> that service's headline delay stats and a
    compact per-stop list `[code, trains, avgDelay, onTimePct]` along its typical
    passenger stops. Same numbers as routes_index.csv (same aggregate() call)."""
    payload = {}
    for _, row in routes.sort_values("id").iterrows():
        stops = [
            [
                stop["code"],
                int(stop["runs"]),
                _round_or_none(stop["avgDelay"], 2),
                _round_or_none(stop["onTimePct"], 1),
            ]
            for stop in json.loads(row["stops"])
        ]
        payload[row["id"]] = {
            "from": row["from"],
            "to": row["to"],
            "fromName": row["fromName"],
            "toName": row["toName"],
            "type": row["trainType"],
            "trains": int(row["runs"]),
            "avg": _round_or_none(row["avgDelay"], 2),
            "p90": _round_or_none(row["p90Delay"], 1),
            "onTime": _round_or_none(row["onTimePct"], 1),
            "minor": _round_or_none(row["pctMinorDelay"], 1),
            "major": _round_or_none(row["pctMajorDelay"], 1),
            "cancelled": _round_or_none(row["cancelledPct"], 1),
            "stops": stops,
        }
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
    coords_by_code = build_coord_lookup(stations)
    connections_payload = build_connections_payload(edges, coords_by_code)

    route_patterns_payload = build_route_patterns_payload(runs)
    service_routes = routes_lib.aggregate(
        runs, by=("from", "to", "trainType"), station_meta=station_meta, events=events
    )
    route_stats_payload = build_route_stats_payload(service_routes)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    STATIONS_JSON.write_text(
        json.dumps(stations_payload, ensure_ascii=False, indent=None), encoding="utf-8"
    )
    CONNECTIONS_JSON.write_text(
        json.dumps(connections_payload, ensure_ascii=False, indent=None), encoding="utf-8"
    )
    ROUTE_STATS_JSON.write_text(
        json.dumps(route_stats_payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    ROUTE_PATTERNS_JSON.write_text(
        json.dumps(route_patterns_payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )

    print(
        f"wrote {len(stations_payload)} passenger stations -> "
        f"{STATIONS_JSON.relative_to(ROOT)}"
    )
    print(
        f"wrote {len(connections_payload)} connections -> "
        f"{CONNECTIONS_JSON.relative_to(ROOT)}"
    )
    print(
        f"wrote {len(route_stats_payload)} route stats -> "
        f"{ROUTE_STATS_JSON.relative_to(ROOT)}"
    )
    print(
        f"wrote {len(route_patterns_payload)} route patterns -> "
        f"{ROUTE_PATTERNS_JSON.relative_to(ROOT)}"
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
