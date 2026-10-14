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
SUMMARY_JSON = OUT_DIR / "summary.json"
EMS_WEATHER_JSON = OUT_DIR / "ems_weather.json"
TOP5_CSV = ROOT / "data" / "raw" / "metadata_top5_closest_ems.csv"


def _round_or_none(v, digits=2):
    return None if v is None or v != v else round(float(v), digits)  # v != v catches NaN


def _band_cell(band) -> list | None:
    """[arrivals, mean delay, % late] for one weather band, or None when suppressed."""
    if band is None:
        return None
    return [band["n"], _round_or_none(band["avg"], 2), _round_or_none(band["latePct"], 1)]


def _station_band(band) -> dict | None:
    return None if band is None else {"n": band["n"], "latePct": _round_or_none(band["latePct"], 1)}


def _haversine_km(lat1, lon1, lat2, lon2) -> float:
    import math

    p = math.pi / 180
    a = math.sin((lat2 - lat1) * p / 2) ** 2 + math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin(
        (lon2 - lon1) * p / 2
    ) ** 2
    return 2 * 6371 * math.asin(math.sqrt(a))


def build_station_ems(stations, top5, coords, labels, ems_stats) -> dict:
    """Train station code -> the weather station to show on the map.

    Rule: the top-5 file's rank 1 (the station the weather was matched from first). If that
    name has no readings in the parquet, fall back to the station the parquet itself labelled
    the weather with, and record the rank-1 name as `closest` so the pop-up can say so.
    """
    out = {}
    passenger = stations[stations["passengerTraffic"] == True]  # noqa: E712
    for _, row in passenger.iterrows():
        code = row["code"]
        ranked = top5.get(code, [])
        rank1 = ranked[0] if ranked else None
        shown = None
        if rank1 and rank1["name"] in ems_stats:
            shown = {"name": rank1["name"], "lat": rank1["lat"], "lon": rank1["lon"], "km": rank1["km"]}
        else:
            label = labels.get(code)
            if label and label in coords and label in ems_stats:
                lat, lon = coords[label]
                known = next((e for e in ranked if e["name"] == label), None)
                km = known["km"] if known else _haversine_km(row["lat"], row["lon"], lat, lon)
                shown = {"name": label, "lat": lat, "lon": lon, "km": km}
        if shown is None:
            continue
        shown["closest"] = (
            {"name": rank1["name"], "km": _round_or_none(rank1["km"], 1)}
            if rank1 and rank1["name"] != shown["name"]
            else None
        )
        shown["lat"] = _round_or_none(shown["lat"], 5)
        shown["lon"] = _round_or_none(shown["lon"], 5)
        shown["km"] = _round_or_none(shown["km"], 1)
        out[code] = shown
    return out


def build_ems_weather_payload(summary: dict) -> dict:
    """Rounded, compact version of routes_lib.ems_weather_summary for the browser."""
    r = _round_or_none

    def day(d):
        return None if d is None else [r(d[0], 1), r(d[1], 1), r(d[2], 1)]

    stations = {}
    for name, v in summary["stations"].items():
        stations[name] = {
            "readings": v["readings"],
            "slotShare": r(v["slotShare"], 3),
            "days": v["days"],
            "temp": {
                "avg": r(v["temp"]["avg"], 1), "min": r(v["temp"]["min"], 1), "minAt": v["temp"]["minAt"],
                "max": r(v["temp"]["max"], 1), "maxAt": v["temp"]["maxAt"],
            },
            "snow": {
                "max": r(v["snow"]["max"], 0), "maxAt": v["snow"]["maxAt"],
                "daysWithSnow": v["snow"]["daysWithSnow"], "avg": r(v["snow"]["avg"], 1),
            },
            "gust": {"max": r(v["gust"]["max"], 1), "maxAt": v["gust"]["maxAt"]},
            "visibility": {"min": r(v["visibility"]["min"], 0), "minAt": v["visibility"]["minAt"]},
            "daily": [day(d) for d in v["daily"]],
            "snowDaily": [r(x, 0) for x in v["snowDaily"]],
            "gustDaily": [r(x, 1) for x in v["gustDaily"]],
        }
    return {"dates": summary["dates"], "stations": stations}


def build_stations_payload(stations, station_weather=None, station_means=None, station_ems=None) -> list[dict]:
    passenger = stations[stations["passengerTraffic"] == True]  # noqa: E712
    payload = []
    for _, row in passenger.iterrows():
        entry = None
        if station_weather is not None:
            bands = station_weather.get((row["code"],))
            means = station_means.loc[row["code"]] if row["code"] in station_means.index else None
            if bands is not None and means is not None:
                entry = {
                    "avgTemp": _round_or_none(means["avgTemp"], 1),
                    "avgSnow": _round_or_none(means["avgSnow"], 1),
                    "frost": _station_band(bands["t"][0]),
                    "mild": _station_band(bands["t"][2]),
                    "snow": _station_band(bands["s"][2]),
                    "noSnow": _station_band(bands["s"][0]),
                }
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
                "weather": entry,
                "ems": (station_ems or {}).get(row["code"]),
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


def build_route_stats_payload(routes, service_weather=None, stop_weather=None) -> dict:
    """id (`<from>-<to>-<trainType>`) -> that service's headline delay stats and a
    compact per-stop list `[code, trains, avgDelay, onTimePct]` along its typical
    passenger stops. Same numbers as routes_index.csv (same aggregate() call)."""
    payload = {}
    for _, row in routes.sort_values("id").iterrows():
        # Each stop row: [code, trains, avgDelay, onTimePct, temp, snow, weatherN]. The last three
        # are the mean air temperature and snow depth (cm) when this service's own trains were at
        # the stop, and how many readings that is (None, None, 0 when too few).
        def weather_cells(code):
            w = (stop_weather or {}).get((row["from"], row["to"], row["trainType"], code))
            return [None, None, 0] if w is None else [_round_or_none(w[1], 1), _round_or_none(w[2], 0), w[0]]

        stops = [
            [
                stop["code"],
                int(stop["runs"]),
                _round_or_none(stop["avgDelay"], 2),
                _round_or_none(stop["onTimePct"], 1),
                *weather_cells(stop["code"]),
            ]
            for stop in json.loads(row["stops"])
        ]
        bands = (service_weather or {}).get((row["from"], row["to"], row["trainType"]))
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
            # Weather bands of this service's own arrivals: [arrivals, mean delay, % late] per
            # band (temperature: frost / around freezing / mild; snow: none / a little / deep).
            "w": None
            if bands is None
            else {k: [_band_cell(b) for b in bands[k]] for k in ("t", "s")},
        }
    return payload


def build_summary_payload(events, runs, stations, pooled=None) -> dict:
    """Headline numbers for the landing card. Delay = ARRIVAL rows, early arrivals clamped
    to 0 (CLAUDE.md convention); "on time" = <= ON_TIME_THRESHOLD_MIN, same as everywhere else."""
    arrivals = events[events["type"] == "ARRIVAL"].dropna(subset=["differenceInMinutes"])
    delay = arrivals["differenceInMinutes"].clip(lower=0)
    day = arrivals["departureDate"].astype(str).str.slice(0, 10)
    by_day = delay.groupby(day).mean()
    worst_date = by_day.idxmax() if len(by_day) else None
    dates = sorted(day.unique())
    return {
        "firstDate": dates[0] if dates else None,
        "lastDate": dates[-1] if dates else None,
        "trains": int(len(runs)),
        "stations": int((stations["passengerTraffic"] == True).sum()),  # noqa: E712
        "onTimePct": _round_or_none((delay <= routes_lib.ON_TIME_THRESHOLD_MIN).mean() * 100, 1),
        "typicalDelay": _round_or_none(delay.mean(), 1),
        "worstDay": (
            {"date": worst_date, "typicalDelay": _round_or_none(by_day[worst_date], 1)}
            if worst_date is not None
            else None
        ),
        "weather": None if pooled is None else build_weather_summary(pooled),
    }


def build_weather_summary(pooled: dict) -> dict:
    """Band definitions (labels and edges, so the UI never hard-codes a threshold) and the
    pooled same-station comparison behind the landing card."""
    def pair(p):
        if p is None:
            return None
        return {
            "harshLatePct": _round_or_none(p["harshLatePct"], 1),
            "benignLatePct": _round_or_none(p["benignLatePct"], 1),
            "harshAvg": _round_or_none(p["harshAvg"], 2),
            "benignAvg": _round_or_none(p["benignAvg"], 2),
            "stations": p["stations"],
            "worseAt": p["worseAt"],
        }

    return {
        "minArrivals": routes_lib.MIN_WEATHER_ARRIVALS,
        "bands": {
            k: {"labels": v["labels"], "edges": v["edges"]}
            for k, v in routes_lib.WEATHER_BANDS.items()
        },
        "compare": {"temp": pair(pooled.get("temp")), "snow": pair(pooled.get("snow"))},
    }


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

    # Weather bands: per station (panel + pooled headline) and per train service (pop-up).
    station_arrivals = routes_lib.weather_arrivals(events, runs, by=())
    station_weather = routes_lib.weather_band_stats(station_arrivals, ["stationShortCode"])
    station_means = routes_lib.station_weather_means(station_arrivals)
    pooled = routes_lib.pooled_same_station(station_weather)
    service_arrivals = routes_lib.weather_arrivals(events, runs, by=("from", "to", "trainType"))
    service_weather = routes_lib.weather_band_stats(service_arrivals, ["from", "to", "trainType"])
    missing_weather = 1 - service_arrivals["band_t"].ge(0).mean()
    print(
        f"weather: {len(station_arrivals):,} arrivals, {missing_weather:.1%} without a "
        f"temperature reading; pooled comparison: "
        + ", ".join(
            f"{k} {v['harshLatePct']:.1f}% vs {v['benignLatePct']:.1f}% late "
            f"({v['stations']} stations, worse at {v['worseAt']})"
            for k, v in pooled.items()
            if v
        )
    )

    # Weather station per train station, and the January weather at each station.
    top5 = routes_lib.load_ems_top5(TOP5_CSV)
    ems_coords = routes_lib.ems_coordinates(top5, METADATA_CSV)
    ems_summary = routes_lib.ems_weather_summary(events)
    ems_labels = routes_lib.station_ems_label(events)
    station_ems = build_station_ems(stations, top5, ems_coords, ems_labels, ems_summary["stations"])
    n_passenger = int((stations["passengerTraffic"] == True).sum())  # noqa: E712
    swapped = sum(1 for e in station_ems.values() if e["closest"])
    print(
        f"weather stations: {len(station_ems)} of {n_passenger} passenger stations have one "
        f"({swapped} use the parquet's label because rank 1 has no readings); "
        f"{len(ems_summary['stations'])} stations with readings"
    )
    unresolved = set(ems_summary["stations"]) - set(ems_coords)
    if unresolved:
        print(f"[build_data] weather station(s) without coordinates: {', '.join(sorted(unresolved))}")

    stations_payload = build_stations_payload(stations, station_weather, station_means, station_ems)
    coords_by_code = build_coord_lookup(stations)
    connections_payload = build_connections_payload(edges, coords_by_code)

    route_patterns_payload = build_route_patterns_payload(runs)
    service_routes = routes_lib.aggregate(
        runs, by=("from", "to", "trainType"), station_meta=station_meta, events=events
    )
    stop_weather = routes_lib.weather_stop_means(events, runs, by=("from", "to", "trainType"))
    route_stats_payload = build_route_stats_payload(service_routes, service_weather, stop_weather)
    stop_rows = [s for v in route_stats_payload.values() for s in v["stops"]]
    with_weather = sum(1 for s in stop_rows if s[6] > 0)
    print(f"stop weather: {with_weather} of {len(stop_rows)} service stops have a figure")
    summary_payload = build_summary_payload(events, runs, stations, pooled)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    EMS_WEATHER_JSON.write_text(
        json.dumps(build_ems_weather_payload(ems_summary), ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    SUMMARY_JSON.write_text(
        json.dumps(summary_payload, ensure_ascii=False, indent=None), encoding="utf-8"
    )
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
    print(f"wrote month summary -> {SUMMARY_JSON.relative_to(ROOT)}: {summary_payload}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
