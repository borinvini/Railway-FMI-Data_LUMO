"""Shared parquet-reading and route-derivation logic.

This is the only module that reads `matched_data_flat_*.parquet` directly.
`build_data.py` (the web-data build) and `list_routes.py` (the CLI browser)
both go through the functions here, so "what a route is" is defined once.

Uses fastparquet, never pyarrow — pyarrow is broken in the base conda env on
this machine (see CLAUDE.md gotchas). Always run with the project-local venv.
"""

from __future__ import annotations

import glob
import hashlib
import json
import os
import re
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
    # Weather at the nearest FMI station when the event happened (see weather_arrivals).
    "Air temperature",
    "Snow depth",
    # Weather-station panel (ems_weather_summary).
    "closest_ems",
    "Gust speed",
    "Horizontal visibility",
    # Only used by scripts/analyse_weather.py.
    "Wind speed",
    "Precipitation intensity",
]

# "On time" threshold used throughout the project (CLAUDE.md delay convention).
ON_TIME_THRESHOLD_MIN = 5
# Delay severity buckets, based on each run's average arrival delay:
#   on time:     <= ON_TIME_THRESHOLD_MIN
#   minor delay: >  ON_TIME_THRESHOLD_MIN  and <= MINOR_DELAY_THRESHOLD_MIN
#   major delay: >  MINOR_DELAY_THRESHOLD_MIN
MINOR_DELAY_THRESHOLD_MIN = 15

# Weather conditions shown on the site, each judged *like for like*: an arrival's baseline is the
# late rate of every arrival at the same station, in the same actual month (e.g. January 2019)
# and the same part of the day, so geography, season, year-to-year differences (track works, a
# strike) and busy hours cannot produce a gap by themselves. See scripts/analyse_weather.py for
# the analysis behind the choice. Wind is shown only as strong gusts: general wind speed is flat.
# A condition is a rule on one weather column; they overlap on purpose (hard frost is also frost).
CONDITIONS = [
    {"key": "hardFrost", "label": "Hard frost", "detail": "-15°C or colder", "column": "Air temperature", "op": "<=", "value": -15.0},
    {"key": "frost", "label": "Frost", "detail": "-5°C or colder", "column": "Air temperature", "op": "<=", "value": -5.0},
    {"key": "heat", "label": "Hot weather", "detail": "above 25°C", "column": "Air temperature", "op": ">", "value": 25.0},
    {"key": "precip", "label": "Rain or snow falling", "detail": "any precipitation", "column": "Precipitation intensity", "op": ">", "value": 0.0},
    {"key": "gust", "label": "Strong gusts", "detail": "stronger than 16 m/s", "column": "Gust speed", "op": ">", "value": 16.0},
    {"key": "deepSnow", "label": "Deep snow", "detail": "25 cm or more on the ground", "column": "Snow depth", "op": ">=", "value": 25.0},
]
# A condition with fewer arrivals than this is never shown as a number: the extra-late figure
# is a small difference between two shares, so it needs many arrivals to be steady.
MIN_CONDITION_ARRIVALS = 200


def find_parquets(explicit: str | None = None) -> list[Path]:
    """Locate the source parquet file(s).

    If `explicit` is given, use exactly that path. Otherwise prefer
    `data/raw/*.parquet` (where the file lives), falling back to `*.parquet`
    at the project root.
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


CACHE_DIR = Path(__file__).resolve().parent.parent / "data" / "derived" / "cache"
# Columns stored as pandas categoricals once loaded (few distinct values, millions of rows).
_CATEGORY_COLUMNS = [
    "trainType", "stationShortCode", "stationName", "type", "closest_ems", "departureDate", "month",
]
_EPOCH = pd.Timestamp("2000-01-01")
RUN_KEY_STRIDE = 100_000  # train numbers are 1..99999


def run_key(df: pd.DataFrame) -> pd.Series:
    """Integer id of a train run (departure date + train number). Same role as the old
    "<date>_<number>" string, but cheap to build and compare on tens of millions of rows."""
    return df["dayNum"].astype("int64") * RUN_KEY_STRIDE + df["trainNumber"].astype("int64")


def _cache_path(src: Path) -> Path:
    return CACHE_DIR / f"{src.stem}.parquet"


def _compact_month(src: Path) -> pd.DataFrame:
    """One source parquet -> compact frame (small dtypes, repaired text, day number)."""
    df = ParquetFile(str(src)).to_pandas(columns=COLUMNS)
    df["stationShortCode"] = _fix_mojibake_column(df["stationShortCode"])
    df["stationName"] = _fix_mojibake_column(df["stationName"])
    df["scheduledTime"] = pd.to_datetime(df["scheduledTime"], errors="coerce", utc=True).dt.tz_localize(None)
    dep = pd.to_datetime(df["departureDate"].astype(str).str.slice(0, 10))
    df["dayNum"] = ((dep - _EPOCH).dt.days).astype("int32")
    df["departureDate"] = df["departureDate"].astype(str).str.slice(0, 10)
    df["month"] = df["departureDate"].str.slice(0, 7)
    df["trainNumber"] = df["trainNumber"].astype("int32")
    for c in (
        "differenceInMinutes", "Air temperature", "Snow depth", "Gust speed", "Horizontal visibility",
        "Wind speed", "Precipitation intensity",
    ):
        df[c] = df[c].astype("float32")
    for c in _CATEGORY_COLUMNS:
        df[c] = df[c].astype(object).where(df[c].notna(), None)
    return df


def _read_month(src: Path) -> pd.DataFrame:
    """Compact frame for one month, via the on-disk cache (keyed on source size and mtime)."""
    cache = _cache_path(src)
    stamp = Path(str(cache) + ".stamp")
    st = src.stat()
    cols = hashlib.md5(",".join(COLUMNS).encode()).hexdigest()[:8]
    key = f"{st.st_size}:{int(st.st_mtime)}:{cols}"
    if cache.exists() and stamp.exists() and stamp.read_text() == key:
        df = ParquetFile(str(cache)).to_pandas()
    else:
        df = _compact_month(src)
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        from fastparquet import write

        write(str(cache), df, object_encoding="utf8")
        stamp.write_text(key)
    for c in _CATEGORY_COLUMNS:
        df[c] = df[c].astype("category")
    return df


def load_events(paths: list[Path], years: list[int] | None = None) -> pd.DataFrame:
    """Read the needed columns of one or more monthly parquets as one compact frame.

    Each month is cached under data/derived/cache/ (small dtypes, text repaired) so the
    ~48M rows of 2018-2025 fit in memory and reload quickly. `years` keeps only those years.
    Files are split by departure date, so a run never spans two files.
    """
    from pandas.api.types import union_categoricals

    frames = []
    for p in paths:
        m = re.search(r"(\d{4})_(\d{2})", p.stem)
        if years is not None and m and int(m.group(1)) not in years:
            continue
        frames.append(_read_month(p))
    if not frames:
        raise FileNotFoundError("No parquet files match the requested years")

    out = {}
    for c in frames[0].columns:
        if c in _CATEGORY_COLUMNS:
            out[c] = union_categoricals([f[c] for f in frames])
        else:
            out[c] = np.concatenate([f[c].to_numpy() for f in frames])
    events = pd.DataFrame(out)
    events["year"] = events["month"].astype(str).str.slice(0, 4).astype("int16")
    assert events["trainNumber"].max() < RUN_KEY_STRIDE
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
    events["runKey"] = run_key(events)

    events_sorted = events.sort_values(["runKey", "scheduledTime"])

    # First/last stop per run.
    firsts = events_sorted.groupby("runKey", sort=False).first()
    lasts = events_sorted.groupby("runKey", sort=False).last()

    # Distinct-station count per run (to filter out degenerate 1-station runs).
    n_stations = events_sorted.groupby("runKey", sort=False)["stationShortCode"].nunique()

    # Full ordered stop sequence per run (all stations, deduped consecutive).
    st_codes = events_sorted["stationShortCode"].astype("category").cat.codes
    changed = (events_sorted["runKey"] != events_sorted["runKey"].shift()) | (st_codes != st_codes.shift())
    stop_sequences = (
        events_sorted.loc[changed].groupby("runKey", sort=False)["stationShortCode"].agg(
            lambda s: tuple(s.astype(object))
        )
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
            "departureDate": firsts["departureDate"].astype(object).values,
            "trainNumber": firsts["trainNumber"].values,
            "trainType": firsts["trainType"].astype(object).values,
            "month": firsts["month"].astype(object).values,
            "year": firsts["year"].astype("int16").values,
            "from": firsts["stationShortCode"].astype(object).values,
            "fromName": firsts["stationName"].astype(object).values,
            "to": lasts["stationShortCode"].astype(object).values,
            "toName": lasts["stationName"].astype(object).values,
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
        ["runs", "from", "to"], ascending=[False, True, True]
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
    arrivals["runKey"] = run_key(arrivals)
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

    out = out.reset_index().rename(columns={"stationShortCode": "code"})

    ordered_cols = [
        "code", "name", "lat", "lon", "passengerTraffic",
        "appearances", "distinctRoutes", "distinctTrainTypes",
        "runs", "avgDelay", "medianDelay", "p90Delay", "maxDelay", "delayStdDev",
        "onTimePct", "pctMinorDelay", "pctMajorDelay", "avgMinorDelay", "avgMajorDelay",
        "cancelledPct", "firstDate", "lastDate",
    ]
    out = out[ordered_cols]
    return out.sort_values("appearances", ascending=False).reset_index(drop=True)


def prepare_arrivals(events: pd.DataFrame) -> pd.DataFrame:
    """Every ARRIVAL with a delay value, with what the weather figures need, computed once for the
    whole dataset: `late` (> ON_TIME_THRESHOLD_MIN), `clampedDelay`, `ex` (late minus the late
    rate of the same station, actual month and part of the day: the like-for-like baseline,
    taken over *all* trains so a single route's figure is not its own baseline) and one boolean
    `f_<key>` per entry of CONDITIONS. `temp` / `snow` are the readings (snow below 0 = none)."""
    a = events[events["type"] == "ARRIVAL"].dropna(subset=["differenceInMinutes"]).reset_index(drop=True)
    diff = a["differenceInMinutes"].to_numpy(dtype="float32")
    out = pd.DataFrame(
        {
            "runKey": run_key(a).to_numpy(),
            "stationShortCode": a["stationShortCode"].astype("category"),
            "month": a["month"].astype("category"),
            "year": a["year"].to_numpy(),
            "clampedDelay": np.clip(diff, 0, None),
            "late": (diff > ON_TIME_THRESHOLD_MIN).astype("float32"),
            "temp": a["Air temperature"].to_numpy(),
            "snow": a["Snow depth"].clip(lower=0).to_numpy(),
        }
    )
    part = (a["scheduledTime"].dt.hour.fillna(0).to_numpy() // 6).astype("int8")
    cell = pd.DataFrame(
        {
            "s": out["stationShortCode"].cat.codes.to_numpy(),
            "m": out["month"].cat.codes.to_numpy(),
            "p": part,
            "late": out["late"].to_numpy(),
        }
    )
    baseline = cell.groupby(["s", "m", "p"])["late"].transform("mean").to_numpy()
    out["ex"] = (out["late"].to_numpy() - baseline).astype("float32")
    ops = {"<=": np.less_equal, ">": np.greater, ">=": np.greater_equal}
    for cond in CONDITIONS:
        out[f"f_{cond['key']}"] = ops[cond["op"]](a[cond["column"]].to_numpy(dtype="float32"), cond["value"])
    return out


def weather_arrivals(arrivals: pd.DataFrame, runs: pd.DataFrame, by=()) -> pd.DataFrame:
    """The prepared arrivals of just these runs, tagged with each run's route-group columns `by`.
    Same `runKey` merge as `station_level_stats`, so weather numbers cover exactly the arrivals the
    delay numbers do."""
    by = list(by)
    route_of_run = runs[["runKey"] + by].drop_duplicates("runKey")
    return arrivals.merge(route_of_run, on="runKey", how="inner")


# A stop's weather for one train service needs at least this many readings to be shown.
MIN_STOP_WEATHER = 5


def weather_stop_means(events: pd.DataFrame, runs: pd.DataFrame, by=("from", "to", "trainType")) -> dict:
    """{(*by values, station code): (n, mean air temperature, mean snow depth)} for each train
    service at each of its stops, over the readings of that service's own runs.

    Uses **every event type** (arrivals and departures): weather does not care which it is,
    and a route's start station has only departures, so arrivals alone would leave the most
    important pin empty. Snow depth readings below 0 (the -1 "no measurable snow" code) count as
    0. Stops with fewer than MIN_STOP_WEATHER temperature readings are left out.
    """
    by = list(by)
    frame = events.dropna(subset=["Air temperature"])[
        ["dayNum", "trainNumber", "stationShortCode", "Air temperature", "Snow depth"]
    ].copy()
    frame["runKey"] = run_key(frame)
    route_of_run = runs[["runKey"] + by].drop_duplicates("runKey")
    frame = frame.merge(route_of_run, on="runKey", how="inner")
    frame["snow"] = frame["Snow depth"].clip(lower=0)
    grouped = frame.groupby(by + ["stationShortCode"], sort=False).agg(
        n=("Air temperature", "size"), temp=("Air temperature", "mean"), snow=("snow", "mean")
    )
    grouped = grouped[grouped["n"] >= MIN_STOP_WEATHER]
    return {
        tuple(idx): (int(row["n"]), float(row["temp"]), None if pd.isna(row["snow"]) else float(row["snow"]))
        for idx, row in grouped.iterrows()
    }


def condition_stats(arrivals: pd.DataFrame, group_cols: list[str]) -> dict:
    """{group key tuple: {condition key: {"n", "latePct", "excess"} or None}}.

    `latePct` is the share of the group's arrivals in that condition that were more than
    ON_TIME_THRESHOLD_MIN late; `excess` is how many more late trains per 100 than is usual for
    the same station, month and part of the day (the mean of `ex`, in percentage points).
    None below MIN_CONDITION_ARRIVALS. With no group columns the key is the empty tuple."""
    out: dict = {}
    empty = {c["key"]: None for c in CONDITIONS}
    for cond in CONDITIONS:
        sub = arrivals[arrivals[f"f_{cond['key']}"]]
        if group_cols:
            grouped = sub.groupby(group_cols, sort=False).agg(
                n=("late", "size"), late=("late", "mean"), ex=("ex", "mean")
            )
            rows = ((idx if isinstance(idx, tuple) else (idx,), r) for idx, r in grouped.iterrows())
        else:
            rows = [((), pd.Series({"n": len(sub), "late": sub["late"].mean(), "ex": sub["ex"].mean()}))]
        for key, row in rows:
            slot = out.setdefault(key, dict(empty))
            if row["n"] >= MIN_CONDITION_ARRIVALS:
                slot[cond["key"]] = {
                    "n": int(row["n"]),
                    "latePct": float(row["late"] * 100),
                    "excess": float(row["ex"] * 100),
                }
    return out


def station_weather_means(arrivals: pd.DataFrame) -> pd.DataFrame:
    """Per station: mean air temperature and mean snow depth (negative readings = 0)."""
    return arrivals.groupby("stationShortCode").agg(avgTemp=("temp", "mean"), avgSnow=("snow", "mean"))


def monthly_delay(arrivals: pd.DataFrame) -> pd.DataFrame:
    """Per month ("YYYY-MM"): arrivals, mean delay (early clamped to 0) and % on time."""
    g = arrivals.assign(onTime=(arrivals["late"] == 0).astype("float32")).groupby("month")
    out = g.agg(arrivals=("late", "size"), avgDelay=("clampedDelay", "mean"), onTimePct=("onTime", "mean"))
    out["onTimePct"] *= 100
    return out.sort_index()


def service_monthly(runs: pd.DataFrame, by=("from", "to", "trainType")) -> pd.DataFrame:
    """Per train service and month: runs and mean run delay (the same per-run number the route
    table averages)."""
    by = list(by)
    g = runs.groupby(by + ["month"])["avgDelay"]
    return g.agg(runs="size", avgDelay="mean").reset_index()


def subset_year(events: pd.DataFrame, runs: pd.DataFrame, year: int | None):
    """(events, runs) of one year, or both unchanged for year=None (all years)."""
    if year is None:
        return events, runs
    return events[events["year"] == year], runs[runs["year"] == year]


# Weather stations the parquet uses that appear in neither EMS CSV. Coordinates from FMI's open
# station list (opendata.fmi.fi, fmi::ef::stations), like the HMK override for a train station.
EMS_COORD_OVERRIDES = {
    "Liperi Tuiskavanluoto": (62.546010, 29.668180),
}

# Weather readings are matched to a 10-minute slot; many events share one station and slot.
EMS_SLOT = "10min"


def load_ems_top5(top5_csv: Path) -> dict[str, list[dict]]:
    """Train station code -> its 5 closest weather stations, nearest first, each
    `{name, lat, lon, km}`. The matched parquet was built from this list: per variable the
    first of the five that has a value is used, and `closest_ems` carries rank 1."""
    top5 = pd.read_csv(top5_csv, encoding="utf-8").dropna(subset=["train_station_short_code"])
    out: dict[str, list[dict]] = {}
    for _, row in top5.drop_duplicates("train_station_short_code").iterrows():
        ranked = []
        for i in range(1, 6):
            name = row.get(f"ems_{i}_station")
            if isinstance(name, str) and name:
                ranked.append(
                    {
                        "name": name,
                        "lat": float(row[f"ems_{i}_lat"]),
                        "lon": float(row[f"ems_{i}_long"]),
                        "km": float(row[f"ems_{i}_distance_km"]),
                    }
                )
        out[row["train_station_short_code"]] = ranked
    return out


def ems_coordinates(top5: dict[str, list[dict]], closest_csv: Path) -> dict[str, tuple[float, float]]:
    """Weather station name -> (lat, lon): every name in the top-5 file, then the single-closest
    CSV for any that are missing, then EMS_COORD_OVERRIDES."""
    coords: dict[str, tuple[float, float]] = {}
    for ranked in top5.values():
        for ems in ranked:
            coords.setdefault(ems["name"], (ems["lat"], ems["lon"]))
    closest = pd.read_csv(closest_csv)
    for _, row in closest.drop_duplicates("closest_ems_station").iterrows():
        coords.setdefault(row["closest_ems_station"], (float(row["ems_latitude"]), float(row["ems_longitude"])))
    coords.update(EMS_COORD_OVERRIDES)
    return coords


def station_ems_label(events: pd.DataFrame) -> pd.Series:
    """Train station code -> the weather station the parquet labelled its weather with
    (`closest_ems`, most common value)."""
    labelled = events.dropna(subset=["closest_ems", "stationShortCode"])
    return labelled.groupby("stationShortCode")["closest_ems"].agg(lambda s: s.mode().iat[0])


def _at(series: pd.Series, dates: pd.Series, pick) -> tuple[float | None, str | None]:
    """The extreme value of `series` (pick = idxmin/idxmax) and the date it happened."""
    valid = series.dropna()
    if valid.empty:
        return None, None
    i = pick(valid)
    return float(valid.loc[i]), dates.loc[i]


def _ems_tiles(g: pd.DataFrame, day_count: int) -> dict:
    """Headline statistics of one weather station over one period (all years, or one year)."""
    temp, snow = g["Air temperature"], g["snow"]
    t_min, t_min_at = _at(temp, g["date"], pd.Series.idxmin)
    t_max, t_max_at = _at(temp, g["date"], pd.Series.idxmax)
    s_max, s_max_at = _at(snow, g["date"], pd.Series.idxmax)
    gust, gust_at = _at(g["Gust speed"], g["date"], pd.Series.idxmax)
    vis, vis_at = _at(g["Horizontal visibility"], g["date"], pd.Series.idxmin)
    slots_per_day = 24 * 60 // int(EMS_SLOT.rstrip("min"))
    return {
        "readings": int(len(g)),
        "slotShare": float(len(g) / (day_count * slots_per_day)) if day_count else None,
        "days": int(g["date"].nunique()),
        "temp": {
            "avg": None if temp.dropna().empty else float(temp.mean()),
            "min": t_min, "minAt": t_min_at, "max": t_max, "maxAt": t_max_at,
        },
        "snow": {
            "max": s_max, "maxAt": s_max_at if s_max and s_max > 0 else None,
            "daysWithSnow": int(g.loc[snow >= 1, "date"].nunique()),
            "avg": None if snow.dropna().empty else float(snow.mean()),
        },
        "gust": {"max": gust, "maxAt": gust_at},
        "visibility": {"min": vis, "minAt": vis_at},
    }


def ems_weather_summary(events: pd.DataFrame) -> dict:
    """Per weather station (the parquet's `closest_ems`): statistics from the readings taken when
    trains were nearby. NOT true climate records -- there are no readings while no train is
    around. One reading per station per EMS_SLOT: events share slots heavily (about 79% of rows
    are duplicates), and counting each would weight busy minutes.

    Returns {"months": [...], "stations": {name: {"scopes": {"all"|"<year>": tiles}, "monthly":
    {...}}}}. `monthly` rows align with `months` ("YYYY-MM"): `temp` is [min, mean, max] air
    temperature or None for a month with no readings; `snow` and `gust` are the deepest snow and
    strongest gust; `n` the readings. Days are departure dates (a night train's readings after
    midnight stay with the day it left)."""
    cols = ["closest_ems", "scheduledTime", "departureDate", "month", "year",
            "Air temperature", "Snow depth", "Gust speed", "Horizontal visibility"]
    frame = events.dropna(subset=["closest_ems", "scheduledTime"])[cols].copy()
    frame["slot"] = frame["scheduledTime"].dt.floor(EMS_SLOT)
    frame = frame.drop_duplicates(["closest_ems", "slot"])
    frame["date"] = frame["departureDate"].astype(str)
    frame["snow"] = frame["Snow depth"].clip(lower=0)
    frame["month"] = frame["month"].astype(str)
    months = sorted(events["month"].astype(str).unique())
    dates_by_year = events.groupby("year")["departureDate"].nunique().to_dict()
    day_counts = {"all": int(sum(dates_by_year.values())), **{str(y): int(n) for y, n in dates_by_year.items()}}

    stations: dict[str, dict] = {}
    for name, g in frame.groupby("closest_ems", sort=True):
        scopes = {"all": _ems_tiles(g, day_counts["all"])}
        for y, gy in g.groupby("year"):
            scopes[str(y)] = _ems_tiles(gy, day_counts[str(y)])
        t = g.groupby("month")["Air temperature"].agg(["min", "mean", "max"])
        snow_m = g.groupby("month")["snow"].max()
        gust_m = g.groupby("month")["Gust speed"].max()
        n_m = g.groupby("month").size()
        stations[name] = {
            "scopes": scopes,
            "monthly": {
                "temp": [
                    None if m not in t.index or pd.isna(t.at[m, "min"])
                    else [float(t.at[m, "min"]), float(t.at[m, "mean"]), float(t.at[m, "max"])]
                    for m in months
                ],
                "snow": [None if m not in snow_m.index or pd.isna(snow_m[m]) else float(snow_m[m]) for m in months],
                "gust": [None if m not in gust_m.index or pd.isna(gust_m[m]) else float(gust_m[m]) for m in months],
                "n": [int(n_m.get(m, 0)) for m in months],
            },
        }
    return {"months": months, "dayCounts": day_counts, "stations": stations}


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
