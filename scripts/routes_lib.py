"""Shared parquet-reading and route-derivation logic.

This is the only module that reads `matched_data_flat_*.parquet` directly.
`build_data.py` (the web-data build) and `list_routes.py` (the CLI browser)
both go through the functions here, so "what a route is" is defined once.

Uses fastparquet, never pyarrow — pyarrow is broken in the base conda env on
this machine (see CLAUDE.md gotchas). Always run with the project-local venv.
"""

from __future__ import annotations

import glob
import json
import os
from pathlib import Path

import numpy as np
import pandas as pd
from fastparquet import ParquetFile

# Only the columns needed for route listing/derivation — the file has ~150.
COLUMNS = [
    "trainNumber",
    "departureDate",
    "trainType",
    "stationShortCode",
    "stationName",
    "type",
    "scheduledTime",
    "differenceInMinutes",
    "cancelled",
]

# "On time" threshold used throughout the project (CLAUDE.md delay convention).
ON_TIME_THRESHOLD_MIN = 5
# Delay severity buckets, based on each run's average arrival delay:
#   on time:     <= ON_TIME_THRESHOLD_MIN
#   minor delay: >  ON_TIME_THRESHOLD_MIN  and <= MINOR_DELAY_THRESHOLD_MIN
#   major delay: >  MINOR_DELAY_THRESHOLD_MIN
MINOR_DELAY_THRESHOLD_MIN = 15


def find_parquets(explicit: str | None = None) -> list[Path]:
    """Locate the source parquet file(s).

    If `explicit` is given, use exactly that path. Otherwise prefer
    `data/raw/*.parquet` (where CLAUDE.md says the file should live), falling
    back to `*.parquet` at the project root (where it currently sits).
    """
    if explicit:
        p = Path(explicit)
        if not p.exists():
            raise FileNotFoundError(f"No parquet file at {p}")
        return [p]

    root = Path(__file__).resolve().parent.parent

    candidates = sorted(root.glob("data/raw/*.parquet"))
    if candidates:
        return candidates

    candidates = sorted(root.glob("*.parquet"))
    if candidates:
        return candidates

    raise FileNotFoundError(
        "No parquet file found. Searched "
        f"'{root / 'data' / 'raw'}/*.parquet' and '{root}/*.parquet'. "
        "Pass --parquet to point at one explicitly."
    )


def fix_mojibake(s: str) -> str:
    """Repair double-encoded UTF-8 (e.g. 'K�P' -> 'KÄP').

    The parquet stores some station names/codes as UTF-8 bytes that were
    then decoded as latin-1. Round-tripping through latin-1 -> utf-8 repairs
    it. Left unchanged (and safe) for strings that were never mangled.
    """
    if not isinstance(s, str):
        return s
    try:
        return s.encode("latin-1").decode("utf-8")
    except (UnicodeDecodeError, UnicodeEncodeError):
        return s


def _fix_mojibake_column(series: pd.Series) -> pd.Series:
    """Apply fix_mojibake efficiently via a lookup over unique values."""
    uniques = series.dropna().unique()
    mapping = {u: fix_mojibake(u) for u in uniques}
    return series.map(mapping).fillna(series)


def load_events(paths: list[Path]) -> pd.DataFrame:
    """Read and concatenate the needed columns from one or more parquet files."""
    frames = []
    for p in paths:
        pf = ParquetFile(str(p))
        df = pf.to_pandas(columns=COLUMNS)
        frames.append(df)

    events = pd.concat(frames, ignore_index=True) if len(frames) > 1 else frames[0]

    events["month"] = events["departureDate"].astype(str).str.slice(0, 7)

    events["stationShortCode"] = _fix_mojibake_column(events["stationShortCode"])
    events["stationName"] = _fix_mojibake_column(events["stationName"])

    events["scheduledTime"] = pd.to_datetime(events["scheduledTime"], errors="coerce")

    return events


def _ordered_unique(codes: list[str]) -> tuple[str, ...]:
    """Dedup consecutive repeats (ARRIVAL/DEPARTURE pairs at the same stop)
    while preserving order. A station revisited later in the run (rare/none
    in this data) is kept as a separate occurrence."""
    out: list[str] = []
    for c in codes:
        if not out or out[-1] != c:
            out.append(c)
    return tuple(out)


def derive_routes(events: pd.DataFrame) -> pd.DataFrame:
    """Collapse per-station-event rows into one row per train run.

    Run key = departureDate + trainNumber (kept as the `runKey` column, so
    callers can join station-level events back to a run's route). Origin/
    destination = first/last stop by scheduledTime within the run.
    avgDelay/maxDelay computed on ARRIVAL rows only, with early arrivals
    clamped to 0 (CLAUDE.md convention). Also carries `stopSequence`: the
    full ordered tuple of distinct station short codes visited during the
    run (all stations, not filtered yet).
    """
    events = events.dropna(subset=["scheduledTime"]).copy()
    events["runKey"] = (
        events["departureDate"].astype(str) + "_" + events["trainNumber"].astype(str)
    )

    events_sorted = events.sort_values(["runKey", "scheduledTime"])

    # First/last stop per run.
    firsts = events_sorted.groupby("runKey", sort=False).first()
    lasts = events_sorted.groupby("runKey", sort=False).last()

    # Distinct-station count per run (to filter out degenerate 1-station runs).
    n_stations = events_sorted.groupby("runKey", sort=False)["stationShortCode"].nunique()

    # Full ordered stop sequence per run (all stations, deduped consecutive).
    stop_sequences = events_sorted.groupby("runKey", sort=False)["stationShortCode"].agg(
        lambda s: _ordered_unique(s.tolist())
    )

    # Arrival delay stats, early arrivals clamped to 0.
    arrivals = events_sorted[events_sorted["type"] == "ARRIVAL"].copy()
    arrivals["clampedDelay"] = arrivals["differenceInMinutes"].clip(lower=0)
    delay_stats = arrivals.groupby("runKey", sort=False)["clampedDelay"].agg(
        avgDelay="mean", maxDelay="max"
    )

    any_cancelled = events_sorted.groupby("runKey", sort=False)["cancelled"].any()

    runs = pd.DataFrame(
        {
            "runKey": firsts.index,
            "departureDate": firsts["departureDate"].values,
            "trainNumber": firsts["trainNumber"].values,
            "trainType": firsts["trainType"].values,
            "month": firsts["month"].values,
            "from": firsts["stationShortCode"].values,
            "fromName": firsts["stationName"].values,
            "to": lasts["stationShortCode"].values,
            "toName": lasts["stationName"].values,
            "stops": n_stations.values,
            "anyCancelled": any_cancelled.values,
        }
    )
    runs = runs.set_index("runKey")
    runs = runs.join(delay_stats, how="left")
    runs = runs.join(stop_sequences.rename("stopSequence"), how="left")

    before = len(runs)
    runs = runs[(runs["stops"] >= 2) & (runs["from"] != runs["to"])]
    skipped = before - len(runs)
    if skipped:
        print(f"[routes_lib] skipped {skipped} degenerate run(s) (<2 stops or from==to)")

    return runs.reset_index()


def _p90(s: pd.Series) -> float:
    return float(np.percentile(s.dropna(), 90)) if len(s.dropna()) else float("nan")


def _bucket_pct(s: pd.Series, lo: float, hi: float | None) -> float:
    """% of values falling in (lo, hi] (hi=None means no cap)."""
    s = s.dropna()
    if len(s) == 0:
        return float("nan")
    mask = (s > lo) if hi is None else ((s > lo) & (s <= hi))
    return float(mask.mean() * 100)


def _bucket_avg(s: pd.Series, lo: float, hi: float | None) -> float:
    """Mean of values falling in (lo, hi]."""
    s = s.dropna()
    sub = s[s > lo] if hi is None else s[(s > lo) & (s <= hi)]
    return float(sub.mean()) if len(sub) else float("nan")


def _on_time_pct(s: pd.Series) -> float:
    return _bucket_pct(s, float("-inf"), ON_TIME_THRESHOLD_MIN)


def aggregate(
    runs: pd.DataFrame,
    by=("from", "to", "trainType"),
    station_meta: pd.DataFrame | None = None,
    events: pd.DataFrame | None = None,
) -> pd.DataFrame:
    """Aggregate per-run rows into per-route rows, grouped by `by`.

    Default grouping is origin x destination x trainType. Pass
    by=('from', 'to') for map-level OD lines instead.

    If `station_meta` (from `load_station_metadata`) is given, also attaches
    each route's typical ordered passenger-station sequence (see
    `typical_passenger_stops`): `stationCount`, `patternRuns`,
    `patternShare`, and a `stops` column -- a JSON array of
    {order, code, name, runs, avgDelay, medianDelay, onTimePct} per
    passenger station on the route's typical sequence, computed only from
    that route's own runs (see `station_level_stats`). Requires `events`
    (the loaded parquet events, for per-station ARRIVAL delay) when
    `station_meta` is given.
    """
    by = list(by)
    name_map = (
        runs[["from", "fromName"]]
        .drop_duplicates("from")
        .set_index("from")["fromName"]
        .to_dict()
    )
    name_map.update(
        runs[["to", "toName"]]
        .drop_duplicates("to")
        .set_index("to")["toName"]
        .to_dict()
    )

    grouped = runs.groupby(by, sort=False)

    rows = []
    for key, g in grouped:
        key = key if isinstance(key, tuple) else (key,)
        row = dict(zip(by, key))
        worst_idx = g["avgDelay"].idxmax() if g["avgDelay"].notna().any() else None
        delays = g["avgDelay"]
        row.update(
            {
                "runs": len(g),
                "avgDelay": float(delays.mean()),
                "medianDelay": float(delays.median()) if delays.notna().any() else float("nan"),
                "maxDelay": float(g["maxDelay"].max()) if g["maxDelay"].notna().any() else float("nan"),
                "delayStdDev": float(delays.std()) if delays.notna().sum() > 1 else float("nan"),
                "p90Delay": _p90(delays),
                "onTimePct": _on_time_pct(delays),
                "pctMinorDelay": _bucket_pct(delays, ON_TIME_THRESHOLD_MIN, MINOR_DELAY_THRESHOLD_MIN),
                "pctMajorDelay": _bucket_pct(delays, MINOR_DELAY_THRESHOLD_MIN, None),
                "avgMinorDelay": _bucket_avg(delays, ON_TIME_THRESHOLD_MIN, MINOR_DELAY_THRESHOLD_MIN),
                "avgMajorDelay": _bucket_avg(delays, MINOR_DELAY_THRESHOLD_MIN, None),
                "cancelledPct": float(g["anyCancelled"].mean() * 100),
                "worstDay": g.loc[worst_idx, "departureDate"] if worst_idx is not None else None,
                "firstDate": g["departureDate"].min(),
                "lastDate": g["departureDate"].max(),
                "month": g["month"].iloc[0],
            }
        )
        rows.append(row)

    out = pd.DataFrame(rows)
    if "from" in out.columns:
        out["fromName"] = out["from"].map(name_map)
    if "to" in out.columns:
        out["toName"] = out["to"].map(name_map)

    id_parts = [out[c].astype(str) for c in by]
    out["id"] = id_parts[0]
    for part in id_parts[1:]:
        out["id"] = out["id"] + "-" + part

    ordered_cols = ["id"] + by
    if "fromName" in out.columns:
        ordered_cols.append("fromName")
    if "toName" in out.columns:
        ordered_cols.append("toName")
    ordered_cols += [
        "runs",
        "avgDelay",
        "medianDelay",
        "p90Delay",
        "maxDelay",
        "delayStdDev",
        "onTimePct",
        "pctMinorDelay",
        "pctMajorDelay",
        "avgMinorDelay",
        "avgMajorDelay",
        "cancelledPct",
        "worstDay",
        "firstDate",
        "lastDate",
        "month",
    ]

    if station_meta is not None:
        if events is None:
            raise ValueError("aggregate(): `events` is required when `station_meta` is given")
        stops = typical_passenger_stops(runs, station_meta, by=by)
        station_stats = station_level_stats(events, runs, by=by)
        stops["stops"] = stops.apply(
            lambda r: _build_stops_json(r, station_meta, station_stats, by), axis=1
        )
        out = out.merge(stops[by + ["stationCount", "patternShare", "stops"]], on=by, how="left")
        ordered_cols += ["stationCount", "patternShare", "stops"]

    out = out[ordered_cols]
    return out.sort_values("runs", ascending=False).reset_index(drop=True)


def _build_stops_json(
    route_row: pd.Series,
    station_meta: pd.DataFrame,
    station_stats: pd.DataFrame,
    by: list[str],
) -> str:
    """Build the `stops` JSON array for one route: its typical ordered
    passenger-station sequence, each annotated with that station's own
    delay stats within this route's runs."""
    name_lookup = station_meta["name"].to_dict()
    key = tuple(route_row[c] for c in by)

    stats_for_route = station_stats
    for col, val in zip(by, key):
        stats_for_route = stats_for_route[stats_for_route[col] == val]
    stats_by_code = stats_for_route.set_index("stationShortCode")

    _STAT_FIELDS = [
        "avgDelay", "medianDelay", "p90Delay", "maxDelay", "delayStdDev",
        "onTimePct", "pctMinorDelay", "pctMajorDelay",
        "avgMinorDelay", "avgMajorDelay", "cancelledPct",
    ]

    entries = []
    for order, code in enumerate(route_row["stationCodes"]):
        entry = {"order": order, "code": code, "name": name_lookup.get(code, code)}
        if code in stats_by_code.index:
            row = stats_by_code.loc[code]
            entry["runs"] = int(row["runs"])
            for field in _STAT_FIELDS:
                entry[field] = _json_num(row[field])
        else:
            # No ARRIVAL events at all at this station for this route's runs
            # (typically the origin, which only has a DEPARTURE event).
            entry["runs"] = 0
            for field in _STAT_FIELDS:
                entry[field] = None
        entries.append(entry)

    return json.dumps(entries, ensure_ascii=False)


def _json_num(v) -> float | None:
    return None if pd.isna(v) else round(float(v), 2)


def load_station_metadata(metadata_csv: Path) -> pd.DataFrame:
    """Load the station metadata CSV, indexed by station short code.

    Columns: `name`, `passengerTraffic` (bool), `lat`, `lon`. Names in this
    CSV read as clean UTF-8 already (unlike the parquet) — no mojibake fix
    needed here.
    """
    meta = pd.read_csv(metadata_csv)
    meta = meta.rename(
        columns={
            "train_station_short_code": "code",
            "train_station_name": "name",
            "train_lat": "lat",
            "train_long": "lon",
        }
    )
    meta = meta.dropna(subset=["code"]).drop_duplicates("code").set_index("code")
    return meta[["name", "passengerTraffic", "lat", "lon"]]


def typical_passenger_stops(
    runs: pd.DataFrame, station_meta: pd.DataFrame, by=("from", "to", "trainType")
) -> pd.DataFrame:
    """For each route group, find the most common ordered sequence of
    passenger-traffic stations (passengerTraffic == True) across its runs.

    Returns one row per group (indexed the same way `by` groups runs) with:
    `stationCodes` (tuple), `stationNames` (tuple), `stationCount`,
    `patternRuns` (how many runs matched that exact sequence),
    `patternShare` (patternRuns / runs in the group, as a percent).
    """
    passenger_codes = set(station_meta.index[station_meta["passengerTraffic"]])
    name_lookup = station_meta["name"].to_dict()

    by = list(by)
    filtered = runs["stopSequence"].map(
        lambda seq: tuple(c for c in seq if c in passenger_codes)
    )

    tmp = runs[by].copy()
    tmp["filteredStops"] = filtered

    rows = []
    for key, g in tmp.groupby(by, sort=False):
        key = key if isinstance(key, tuple) else (key,)
        counts = g["filteredStops"].value_counts()
        if len(counts) == 0 or (len(counts) == 1 and len(counts.index[0]) == 0):
            top_seq: tuple[str, ...] = ()
            pattern_runs = 0
        else:
            top_seq = counts.index[0]
            pattern_runs = int(counts.iloc[0])
        row = dict(zip(by, key))
        row.update(
            {
                "stationCodes": top_seq,
                "stationNames": tuple(name_lookup.get(c, c) for c in top_seq),
                "stationCount": len(top_seq),
                "patternRuns": pattern_runs,
                "patternShare": (100.0 * pattern_runs / len(g)) if len(g) else float("nan"),
            }
        )
        rows.append(row)

    return pd.DataFrame(rows)


def station_network_edges(runs: pd.DataFrame, station_meta: pd.DataFrame) -> pd.DataFrame:
    """The physical station-to-station adjacency graph: one row per distinct
    pair of stations that are directly consecutive stops on at least one
    run, anywhere in the dataset (not per-route -- the whole network).

    Uses each run's full `stopSequence` -- every station, passenger or not
    -- so the resulting edges trace the real physical curve of the line
    through freight/technical stops too, not just straight jumps between
    passenger stations. (Callers that only want passenger-to-passenger
    connections should filter the result themselves; this only needs
    `station_meta` for station names, not for a passenger filter.) Pairs
    are undirected (an edge between A and B is the same physical segment
    regardless of travel direction), deduped across every run in the
    dataset.

    Returns: `from`, `to` (station codes, `from` < `to` alphabetically),
    `fromName`, `toName`, `runs` (how many runs traverse this edge, in
    either direction).
    """
    name_lookup = station_meta["name"].to_dict()

    pairs: list[tuple[str, str]] = []
    for seq in runs["stopSequence"]:
        for a, b in zip(seq, seq[1:]):
            pairs.append((a, b) if a < b else (b, a))

    if not pairs:
        return pd.DataFrame(columns=["from", "to", "fromName", "toName", "runs"])

    edges = pd.DataFrame(pairs, columns=["from", "to"])
    counts = edges.groupby(["from", "to"], sort=False).size().rename("runs").reset_index()
    counts["fromName"] = counts["from"].map(lambda c: name_lookup.get(c, c))
    counts["toName"] = counts["to"].map(lambda c: name_lookup.get(c, c))
    return counts[["from", "to", "fromName", "toName", "runs"]].sort_values(
        "runs", ascending=False
    ).reset_index(drop=True)


def station_level_stats(
    events: pd.DataFrame, runs: pd.DataFrame, by=("from", "to", "trainType")
) -> pd.DataFrame:
    """Per (route, station) delay stats, using only runs belonging to that
    route (matched via `runKey`). Full parity with the route-level stats in
    `aggregate()`, computed from ARRIVAL events at that station only.

    Returns a long-format frame with one row per route x station actually
    visited by at least one of that route's runs: `by` columns,
    `stationShortCode`, `runs` (how many of the route's runs had an ARRIVAL
    event with a usable delay value here), `avgDelay`, `medianDelay`,
    `p90Delay`, `maxDelay`, `delayStdDev`, `onTimePct`, `pctMinorDelay`,
    `pctMajorDelay`, `avgMinorDelay`, `avgMajorDelay`, `cancelledPct` (%% of
    this station's ARRIVAL events, cancelled or not, that were cancelled --
    denominator includes cancelled events, unlike the other stats).

    A route's origin typically has 0 runs here (it only has a DEPARTURE
    event, no ARRIVAL) -- callers should treat that as "no data", not zero
    delay.
    """
    by = list(by)
    arrivals = events[events["type"] == "ARRIVAL"].copy()
    arrivals["clampedDelay"] = arrivals["differenceInMinutes"].clip(lower=0)
    arrivals["runKey"] = (
        arrivals["departureDate"].astype(str) + "_" + arrivals["trainNumber"].astype(str)
    )
    # Drop any of `by`'s columns already present on `events` (e.g. trainType) so
    # the merge below attaches the run's own route-group values unambiguously,
    # instead of colliding and getting _x/_y suffixes.
    arrivals = arrivals.drop(columns=[c for c in by if c in arrivals.columns])

    route_of_run = runs[["runKey"] + by].drop_duplicates("runKey")
    arrivals = arrivals.merge(route_of_run, on="runKey", how="inner")

    group_cols = by + ["stationShortCode"]
    delay_grouped = arrivals.groupby(group_cols, sort=False)["clampedDelay"]

    stats = delay_grouped.agg(
        runs="count",
        avgDelay="mean",
        medianDelay="median",
        maxDelay="max",
        delayStdDev="std",
        p90Delay=_p90,
        onTimePct=_on_time_pct,
        pctMinorDelay=lambda s: _bucket_pct(s, ON_TIME_THRESHOLD_MIN, MINOR_DELAY_THRESHOLD_MIN),
        pctMajorDelay=lambda s: _bucket_pct(s, MINOR_DELAY_THRESHOLD_MIN, None),
        avgMinorDelay=lambda s: _bucket_avg(s, ON_TIME_THRESHOLD_MIN, MINOR_DELAY_THRESHOLD_MIN),
        avgMajorDelay=lambda s: _bucket_avg(s, MINOR_DELAY_THRESHOLD_MIN, None),
    )
    # Cancellation rate: denominator is every ARRIVAL event at this station
    # (cancelled or not), not just the ones with a usable delay value.
    stats["cancelledPct"] = arrivals.groupby(group_cols, sort=False)["cancelled"].mean() * 100

    return stats.reset_index()


def station_summary(
    events: pd.DataFrame, runs: pd.DataFrame, station_meta: pd.DataFrame
) -> pd.DataFrame:
    """Per-station delay statistics, independent of route: for every station
    code seen in the parquet (passenger or not), its overall delay profile
    across every train that stops there, regardless of which route (OD pair
    x trainType) that train belongs to.

    Same full stat set as the route-level table (via `station_level_stats`
    with no grouping), plus identity (`name`, `lat`, `lon`,
    `passengerTraffic`) and route context (`appearances`, `distinctRoutes`,
    `distinctTrainTypes`, `firstDate`, `lastDate`).
    """
    # Delay stats, collapsed to "this station, across all routes" by passing
    # an empty `by` -- station_level_stats then groups by stationShortCode
    # alone. ARRIVAL events only, so an origin-only station has no rows here.
    delay_stats = station_level_stats(events, runs, by=()).set_index("stationShortCode")

    # Route/train-type context, derived from stopSequence so it also covers
    # stations that never have an ARRIVAL event (e.g. only ever an origin).
    visits = runs[["runKey", "from", "to", "trainType", "departureDate", "stopSequence"]].explode(
        "stopSequence"
    )
    visits = visits.rename(columns={"stopSequence": "stationShortCode"})
    visits = visits.dropna(subset=["stationShortCode"])

    context = visits.groupby("stationShortCode", sort=False).agg(
        appearances=("runKey", "count"),
        firstDate=("departureDate", "min"),
        lastDate=("departureDate", "max"),
    )
    context["distinctRoutes"] = visits.groupby("stationShortCode", sort=False).apply(
        lambda g: g[["from", "to", "trainType"]].drop_duplicates().shape[0]
    )
    context["distinctTrainTypes"] = visits.groupby("stationShortCode", sort=False)[
        "trainType"
    ].agg(lambda s: ",".join(sorted(s.dropna().unique())))

    # Station name straight from the (mojibake-fixed) events, not the
    # metadata CSV, so every station gets a name even the 7 known misses.
    name_lookup = (
        events[["stationShortCode", "stationName"]]
        .dropna(subset=["stationShortCode"])
        .drop_duplicates("stationShortCode")
        .set_index("stationShortCode")["stationName"]
    )

    out = context.copy()
    out["name"] = name_lookup.reindex(out.index)
    out = out.join(station_meta[["lat", "lon", "passengerTraffic"]], how="left")
    out = out.join(delay_stats, how="left")
    out["runs"] = out["runs"].fillna(0).astype(int)

    out["month"] = runs["month"].iloc[0] if len(runs) else None
    out = out.reset_index().rename(columns={"stationShortCode": "code"})

    ordered_cols = [
        "code", "name", "lat", "lon", "passengerTraffic",
        "appearances", "distinctRoutes", "distinctTrainTypes",
        "runs", "avgDelay", "medianDelay", "p90Delay", "maxDelay", "delayStdDev",
        "onTimePct", "pctMinorDelay", "pctMajorDelay", "avgMinorDelay", "avgMajorDelay",
        "cancelledPct", "firstDate", "lastDate", "month",
    ]
    out = out[ordered_cols]
    return out.sort_values("appearances", ascending=False).reset_index(drop=True)


def station_coverage_warning(events: pd.DataFrame, metadata_csv: Path) -> tuple[int, int, list[str]]:
    """Check how many distinct station codes in `events` are missing coordinates.

    Returns (matched, total, missing_codes). HMK is a known/expected miss
    (no coordinates in the CSV either) per CLAUDE.md.
    """
    distinct = set(events["stationShortCode"].dropna().unique())
    if not metadata_csv.exists():
        return 0, len(distinct), sorted(distinct)

    meta = pd.read_csv(metadata_csv)
    meta_codes = set(meta["train_station_short_code"].dropna().astype(str).unique())

    missing = sorted(distinct - meta_codes)
    matched = len(distinct) - len(missing)
    return matched, len(distinct), missing
