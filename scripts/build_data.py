"""Build web/public/data/ from the monthly parquets + station metadata.

The data covers every month found in data/raw/ (2018-2025 at the time of writing). Everything is
computed for the whole period ("all") and for each calendar year, so the site's year picker only
has to switch files. Layout (all generated; never edit by hand):

  Loaded at start-up (kept small):
    stations.json       passenger stations: identity, weather station, all-years delay + weather
    connections.json    the track network (lines between neighbouring stations)
    route_patterns.json every distinct stop sequence a train ran, with trains per type per year
    summary.json        landing-card headlines per scope, monthly trend, seasonality, weather rules
  Loaded when needed:
    scope/<all|YYYY>/stations_stats.json  per station delay + weather for that scope (all years
                                          is already inside stations.json, so it is not repeated)
    scope/<all|YYYY>/route_stats.json     per train service delay stats + per-stop figures
    route_trends.json                     per train service, delay per month (route pop-up)
    ems/<slug>.json                       one weather station: tiles per scope + monthly series

finland.geojson is static (Natural Earth-derived) and is not touched.

Usage (run with the project venv active, never the conda python on PATH):

    source .venv/Scripts/activate
    python scripts/build_data.py                    # everything in data/raw/
    python scripts/build_data.py --years 2020       # only these years (quick checks)
    python scripts/build_data.py --parquet path/to/one.parquet

Idempotent: same inputs -> identical output bytes.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
import time
import unicodedata
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import routes_lib  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
METADATA_CSV = ROOT / "data" / "raw" / "metadata_closest_ems_to_train_stations.csv"
TOP5_CSV = ROOT / "data" / "raw" / "metadata_top5_closest_ems.csv"
OUT_DIR = ROOT / "web" / "public" / "data"

SERVICE_BY = ("from", "to", "trainType")
# A train service with fewer trains than this in a scope is left out of that scope's route stats.
MIN_SERVICE_RUNS = 3
# Services need this many trains over the whole period to get a month-by-month trend.
MIN_TREND_RUNS = 20


def _round_or_none(v, digits=2):
    return None if v is None or v != v else round(float(v), digits)  # v != v catches NaN


def write_json(path: Path, obj, log: dict | None = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    path.write_text(text, encoding="utf-8")
    if log is not None:
        log[str(path.relative_to(OUT_DIR)).replace("\\", "/")] = len(text.encode("utf-8"))


def _haversine_km(lat1, lon1, lat2, lon2) -> float:
    p = math.pi / 180
    a = math.sin((lat2 - lat1) * p / 2) ** 2 + math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin(
        (lon2 - lon1) * p / 2
    ) ** 2
    return 2 * 6371 * math.asin(math.sqrt(a))


def scope_name(year: int | None) -> str:
    return "all" if year is None else str(year)


# --- weather ------------------------------------------------------------------------------------


def condition_cells(conds: dict | None) -> dict | None:
    """{condition key: [arrivals, % late, extra late per 100 vs usual]} for the conditions that
    have enough arrivals; None if none do."""
    if not conds:
        return None
    cells = {
        k: [c["n"], _round_or_none(c["latePct"], 1), _round_or_none(c["excess"], 1)]
        for k, c in conds.items()
        if c is not None
    }
    return cells or None


def conditions_definition() -> list[dict]:
    """The rules, so the UI never hard-codes a threshold."""
    return [{"key": c["key"], "label": c["label"], "detail": c["detail"]} for c in routes_lib.CONDITIONS]


# --- weather stations -----------------------------------------------------------------------------


def build_station_ems(stations, top5, coords, labels, ems_stats, slugs) -> dict:
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
        shown["file"] = slugs[shown["name"]]
        out[code] = shown
    return out


def make_slugs(names) -> dict[str, str]:
    """Weather station name -> a file-name-safe, unique slug (ASCII, lower case)."""
    slugs: dict[str, str] = {}
    used: set[str] = set()
    for name in sorted(names):
        base = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii").lower()
        base = re.sub(r"[^a-z0-9]+", "-", base).strip("-") or "station"
        slug, i = base, 2
        while slug in used:
            slug, i = f"{base}-{i}", i + 1
        used.add(slug)
        slugs[name] = slug
    return slugs


def build_ems_file(station: dict, months: list[str]) -> dict:
    """Rounded, compact version of one weather station's routes_lib.ems_weather_summary entry."""
    r = _round_or_none
    scopes = {}
    for key, v in station["scopes"].items():
        scopes[key] = {
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
        }
    m = station["monthly"]
    return {
        "months": months,
        "scopes": scopes,
        "monthly": {
            "temp": [None if d is None else [r(d[0], 1), r(d[1], 1), r(d[2], 1)] for d in m["temp"]],
            "snow": [r(x, 0) for x in m["snow"]],
            "gust": [r(x, 1) for x in m["gust"]],
            "n": m["n"],
        },
    }


# --- stations ---------------------------------------------------------------------------------------


def station_stats(row, conds, means) -> dict:
    """The per-scope numbers of one passenger station."""
    weather = None
    if means is not None:
        weather = {
            "avgTemp": _round_or_none(means["avgTemp"], 1),
            "avgSnow": _round_or_none(means["avgSnow"], 1),
            "conditions": condition_cells(conds),
        }
    return {
        "avgDelay": _round_or_none(row["avgDelay"]),
        "onTimePct": _round_or_none(row["onTimePct"], 1),
        "runs": int(row["runs"]),
        "appearances": int(row["appearances"]),
        "distinctRoutes": int(row["distinctRoutes"]),
        "cancelledPct": _round_or_none(row["cancelledPct"], 1),
        "weather": weather,
    }


def build_station_stats(stations, station_conditions, station_means) -> dict:
    """code -> station_stats for every passenger station."""
    passenger = stations[stations["passengerTraffic"] == True]  # noqa: E712
    out = {}
    for _, row in passenger.iterrows():
        code = row["code"]
        means = station_means.loc[code] if code in station_means.index else None
        out[code] = station_stats(row, station_conditions.get((code,)), means)
    return out


def build_stations_payload(stations, all_stats, station_ems) -> list[dict]:
    passenger = stations[stations["passengerTraffic"] == True]  # noqa: E712
    payload = []
    for _, row in passenger.iterrows():
        payload.append(
            {
                "code": row["code"],
                "name": row["name"],
                "lat": _round_or_none(row["lat"], 6),
                "lon": _round_or_none(row["lon"], 6),
                **all_stats[row["code"]],
                "ems": station_ems.get(row["code"]),
            }
        )
    payload.sort(key=lambda s: (s["name"], s["code"]))
    return payload


# --- network --------------------------------------------------------------------------------------------


def build_coord_lookup(stations) -> dict:
    """code -> {lat, lon} for every station (passenger or not), for resolving
    connections.json edge endpoints -- deliberately not filtered to passenger stations."""
    lookup = {}
    for _, row in stations.iterrows():
        lat, lon = _round_or_none(row["lat"], 6), _round_or_none(row["lon"], 6)
        if lat is not None and lon is not None:
            lookup[row["code"]] = {"lat": lat, "lon": lon}
    return lookup


def build_connections_payload(edges, coords_by_code: dict, keep: set | None = None) -> list[dict]:
    payload = []
    skipped = 0
    for _, row in edges.iterrows():
        if keep is not None and (row["from"], row["to"]) not in keep:
            continue
        a = coords_by_code.get(row["from"])
        b = coords_by_code.get(row["to"])
        if a is None or b is None:
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


def build_route_patterns(runs, years: list[int], min_runs: int) -> list[dict]:
    """One entry per distinct full stop sequence (every station the train stops at, passenger or
    not, so a drawn path follows the real track), with the number of runs per train type per year
    (`runsByType[type]` aligns with `years`). Patterns with fewer than `min_runs` runs in total
    are left out. Sorted busiest first, ties by the stop list, so the bytes are stable."""
    counts = runs.groupby(["stopSequence", "trainType", "year"], sort=False).size()
    by_seq: dict[tuple, dict[str, list[int]]] = {}
    for (seq, t, y), n in counts.items():
        by_type = by_seq.setdefault(seq, {})
        by_type.setdefault(t, [0] * len(years))[years.index(int(y))] = int(n)
    payload = []
    for seq, by_type in by_seq.items():
        if sum(sum(v) for v in by_type.values()) < min_runs:
            continue
        payload.append({"stops": list(seq), "runsByType": {t: by_type[t] for t in sorted(by_type)}})
    payload.sort(key=lambda p: (-sum(sum(v) for v in p["runsByType"].values()), p["stops"]))
    return payload


# --- route stats -----------------------------------------------------------------------------------------


def build_route_stats_payload(routes, service_conditions=None, stop_weather=None) -> dict:
    """id (`<from>-<to>-<trainType>`) -> that service's headline delay stats, a compact per-stop
    list along its typical passenger stops, and its weather conditions. Same numbers as
    routes_index.csv (same aggregate() call)."""
    payload = {}
    for _, row in routes.sort_values("id").iterrows():
        if row["runs"] < MIN_SERVICE_RUNS:
            continue

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
        conds = (service_conditions or {}).get((row["from"], row["to"], row["trainType"]))
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
            # Weather conditions of this service's own arrivals: [arrivals, % late, extra late per
            # 100 than usual for the same station and month] per condition with enough arrivals.
            "w": condition_cells(conds),
        }
    return payload


def build_route_trends(runs, months: list[str]) -> dict:
    """service id -> delay per month: `avg` in tenths of a minute (None = no trains) and `n`, trains,
    both aligned with `months`. Only services with at least MIN_TREND_RUNS trains in total."""
    monthly = routes_lib.service_monthly(runs, SERVICE_BY)
    index = {m: i for i, m in enumerate(months)}
    series: dict[str, dict] = {}
    for frm, to, ttype, month, n, avg in zip(
        monthly["from"], monthly["to"], monthly["trainType"], monthly["month"], monthly["runs"], monthly["avgDelay"]
    ):
        s_ = series.setdefault(f"{frm}-{to}-{ttype}", {"avg": [None] * len(months), "n": [0] * len(months)})
        i = index[month]
        s_["n"][i] = int(n)
        s_["avg"][i] = None if pd.isna(avg) else int(round(avg * 10))
    return {
        "months": months,
        "services": {k: v for k, v in sorted(series.items()) if sum(v["n"]) >= MIN_TREND_RUNS},
    }


# --- summary -------------------------------------------------------------------------------------------------


def build_headline(ev, runs, n_stations, conditions) -> dict:
    """Landing-card numbers of one scope. Delay = ARRIVAL rows, early arrivals clamped to 0
    (CLAUDE.md convention); "on time" = <= ON_TIME_THRESHOLD_MIN, same as everywhere else."""
    arrivals = ev[ev["type"] == "ARRIVAL"].dropna(subset=["differenceInMinutes"])
    delay = arrivals["differenceInMinutes"].clip(lower=0)
    by_day = delay.groupby(arrivals["departureDate"].astype(str).to_numpy()).mean()
    worst_date = by_day.idxmax() if len(by_day) else None
    dates = sorted(by_day.index)
    return {
        "firstDate": dates[0] if dates else None,
        "lastDate": dates[-1] if dates else None,
        "trains": int(len(runs)),
        "stations": n_stations,
        "onTimePct": _round_or_none((delay <= routes_lib.ON_TIME_THRESHOLD_MIN).mean() * 100, 1),
        "typicalDelay": _round_or_none(delay.mean(), 1),
        "worstDay": (
            {"date": worst_date, "typicalDelay": _round_or_none(by_day[worst_date], 1)}
            if worst_date is not None
            else None
        ),
        "conditions": condition_cells(conditions),
    }


def build_trend(arrivals, months: list[str]) -> dict:
    """Delay per month ("trend", aligned with `months`) and per calendar month pooled over all
    years ("seasonal", Jan..Dec, weighted by arrivals)."""
    monthly = routes_lib.monthly_delay(arrivals).reindex(months)
    trend = {
        "avg": [_round_or_none(x, 2) for x in monthly["avgDelay"]],
        "onTime": [_round_or_none(x, 1) for x in monthly["onTimePct"]],
        "arrivals": [None if pd.isna(x) else int(x) for x in monthly["arrivals"]],
    }
    moy = pd.Series([int(m[5:7]) for m in months], index=months)
    w = monthly["arrivals"].fillna(0)
    seasonal = {"avg": [], "onTime": [], "arrivals": []}
    for k in range(1, 13):
        sel = moy[moy == k].index
        n = w.loc[sel].sum()
        seasonal["arrivals"].append(int(n))
        seasonal["avg"].append(_round_or_none((monthly.loc[sel, "avgDelay"].fillna(0) * w.loc[sel]).sum() / n, 2) if n else None)
        seasonal["onTime"].append(_round_or_none((monthly.loc[sel, "onTimePct"].fillna(0) * w.loc[sel]).sum() / n, 1) if n else None)
    return {"trend": trend, "seasonal": seasonal}


def years_above(headlines: dict, years: list[int]) -> dict:
    """For each condition: [years where trains ran later than usual in it, years with enough data]."""
    out = {}
    for c in routes_lib.CONDITIONS:
        k = c["key"]
        vals = [
            (headlines[str(y)]["conditions"] or {}).get(k) for y in years
        ]
        vals = [v for v in vals if v is not None]
        out[k] = [sum(1 for v in vals if v[2] > 0), len(vals)]
    return out


# --- main -------------------------------------------------------------------------------------------------------


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--parquet", help="Path to a specific parquet file instead of auto-discovery")
    parser.add_argument("--years", type=int, nargs="*", help="Only these years (default: all found)")
    parser.add_argument("--min-pattern-runs", type=int, default=10,
                        help="Leave out stop sequences with fewer runs than this in route_patterns.json")
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

    t0 = time.time()

    def log(msg: str) -> None:
        print(f"[{time.time() - t0:6.0f}s] {msg}", flush=True)

    sizes: dict[str, int] = {}
    events = routes_lib.load_events(paths, years=args.years)
    runs = routes_lib.derive_routes(events)
    years = sorted(int(y) for y in runs["year"].unique())
    months = sorted(events["month"].astype(str).unique())
    station_meta = routes_lib.load_station_metadata(METADATA_CSV)
    log(f"{len(events):,} rows -> {len(runs):,} runs, {len(years)} year(s) {years[0]}-{years[-1]}, {len(months)} months")

    stations_all = routes_lib.station_summary(events, runs, station_meta)
    edges = routes_lib.station_network_edges(runs, station_meta)
    matched, total, missing = routes_lib.station_coverage_warning(events, METADATA_CSV)
    log(f"{total} station codes, {matched} with coordinates")
    if missing:
        shown = ", ".join(missing[:25]) + (" ..." if len(missing) > 25 else "")
        print(f"[build_data] {len(missing)} station(s) without coordinates: {shown}")
    passenger_codes = set(stations_all.loc[stations_all["passengerTraffic"] == True, "code"])  # noqa: E712
    passenger_missing = [c for c in missing if c in passenger_codes]
    if passenger_missing:
        print(f"[build_data] WARNING passenger stations without coordinates: {', '.join(passenger_missing)}")
    n_stations = int((stations_all["passengerTraffic"] == True).sum())  # noqa: E712

    arrivals = routes_lib.prepare_arrivals(events)
    log(f"{len(arrivals):,} arrivals prepared (weather baseline + conditions)")

    # --- each scope: the whole period, then each year ---------------------------------------------
    headlines: dict[str, dict] = {}
    all_station_stats: dict | None = None
    for year in [None] + years:
        name = scope_name(year)
        ev, rs = routes_lib.subset_year(events, runs, year)
        arr = arrivals if year is None else arrivals[arrivals["year"] == year]
        stations = stations_all if year is None else routes_lib.station_summary(ev, rs, station_meta)

        st_arr = routes_lib.weather_arrivals(arr, rs, by=())
        st_cond = routes_lib.condition_stats(st_arr, ["stationShortCode"])
        st_means = routes_lib.station_weather_means(st_arr)
        station_stats_payload = build_station_stats(stations, st_cond, st_means)

        svc_arr = routes_lib.weather_arrivals(arr, rs, by=SERVICE_BY)
        svc_cond = routes_lib.condition_stats(svc_arr, list(SERVICE_BY))
        service_routes = routes_lib.aggregate(rs, by=SERVICE_BY, station_meta=station_meta, events=ev)
        stop_weather = routes_lib.weather_stop_means(ev, rs, by=SERVICE_BY)
        route_stats = build_route_stats_payload(service_routes, svc_cond, stop_weather)

        scope_cond = routes_lib.condition_stats(st_arr, [])[()]
        headlines[name] = build_headline(ev, rs, n_stations, scope_cond)

        if year is None:
            all_station_stats = station_stats_payload
        else:
            write_json(OUT_DIR / "scope" / name / "stations_stats.json", station_stats_payload, sizes)
        write_json(OUT_DIR / "scope" / name / "route_stats.json", route_stats, sizes)
        log(f"scope {name}: {len(rs):,} trains, {len(route_stats)} services")

    # --- weather stations ------------------------------------------------------------------------------
    top5 = routes_lib.load_ems_top5(TOP5_CSV)
    ems_coords = routes_lib.ems_coordinates(top5, METADATA_CSV)
    ems_summary = routes_lib.ems_weather_summary(events)
    ems_labels = routes_lib.station_ems_label(events)
    slugs = make_slugs(ems_summary["stations"])
    station_ems = build_station_ems(stations_all, top5, ems_coords, ems_labels, ems_summary["stations"], slugs)
    swapped = sum(1 for e in station_ems.values() if e["closest"])
    log(
        f"weather stations: {len(station_ems)} of {n_stations} passenger stations have one "
        f"({swapped} use the parquet's label because rank 1 has no readings); "
        f"{len(ems_summary['stations'])} stations with readings"
    )
    unresolved = set(ems_summary["stations"]) - set(ems_coords)
    if unresolved:
        print(f"[build_data] weather station(s) without coordinates: {', '.join(sorted(unresolved))}")
    for ems_name, st in ems_summary["stations"].items():
        write_json(OUT_DIR / "ems" / f"{slugs[ems_name]}.json", build_ems_file(st, ems_summary["months"]), sizes)

    # --- startup files -----------------------------------------------------------------------------------
    patterns = build_route_patterns(runs, years, args.min_pattern_runs)
    keep_edges = set()
    for p in patterns:
        for a, b in zip(p["stops"], p["stops"][1:]):
            keep_edges.add((a, b) if a < b else (b, a))
    connections = build_connections_payload(edges, build_coord_lookup(stations_all), keep_edges)

    trend = build_trend(arrivals, months)
    summary = {
        "years": years,
        "months": months,
        "conditions": conditions_definition(),
        "minConditionArrivals": routes_lib.MIN_CONDITION_ARRIVALS,
        "scopes": headlines,
        "yearsAbove": years_above(headlines, years),
        **trend,
    }

    write_json(OUT_DIR / "stations.json", build_stations_payload(stations_all, all_station_stats, station_ems), sizes)
    write_json(OUT_DIR / "connections.json", connections, sizes)
    write_json(OUT_DIR / "route_patterns.json", patterns, sizes)
    write_json(OUT_DIR / "summary.json", summary, sizes)
    write_json(OUT_DIR / "route_trends.json", build_route_trends(runs, months), sizes)

    startup = sum(sizes[f] for f in ("stations.json", "connections.json", "route_patterns.json", "summary.json"))
    ems_total = sum(v for k, v in sizes.items() if k.startswith("ems/"))
    ems_biggest = max((v for k, v in sizes.items() if k.startswith("ems/")), default=0)
    log(f"patterns kept: {len(patterns)} (min {args.min_pattern_runs} runs); connections: {len(connections)}")
    log(f"payload bytes at start-up: {startup:,} (stations {sizes['stations.json']:,}, connections "
        f"{sizes['connections.json']:,}, patterns {sizes['route_patterns.json']:,}, summary {sizes['summary.json']:,})")
    log(f"lazy: route_stats all {sizes['scope/all/route_stats.json']:,}; route_trends {sizes['route_trends.json']:,}; "
        f"{len([k for k in sizes if k.startswith('ems/')])} ems files, biggest {ems_biggest:,}, total {ems_total:,}")
    print(json.dumps(headlines["all"], ensure_ascii=False)[:1500])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
