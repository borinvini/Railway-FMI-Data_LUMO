"""Read-only analysis: does weather go with later arrivals once season and place are held fixed?

For every arrival (ARRIVAL event with a delay value) we ask: was the train more than 5 min late?
The *baseline* for an arrival is the late rate of all arrivals at the same station in the same
calendar month of the year (`sm`, all years pooled) or in the same actual month (`sym`, e.g. only
January 2019, which also removes year-to-year differences such as track works or a strike). An arrival's *excess* is
late (1/0) minus that baseline. Averaging the excess inside a weather band tells how much more
(or less) often trains were late in that weather than is usual for that station at that time of
year. Because the baseline is local, the north being colder, or winter being busier, cannot
produce a difference by itself.

This only describes; it cannot show cause (a cold night is also a quiet night, and a bad
day can bring track work or a failure in the same hours as the frost).

Usage (project venv active):

    python scripts/analyse_weather.py                 # all years
    python scripts/analyse_weather.py --years 2020    # one or more years
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import routes_lib  # noqa: E402

MIN_CELL = 30  # arrivals needed for a station x month x band cell to count

# (column, label, edges, band labels). Edges are right-inclusive, like routes_lib.WEATHER_BANDS.
VARIABLES = [
    ("Air temperature", "Air temperature (°C)", [-15, -5, 0, 5, 15, 25],
     ["<= -15", "-15 to -5", "-5 to 0", "0 to 5", "5 to 15", "15 to 25", "> 25"]),
    ("Snow depth", "Snow depth (cm)", [0, 9, 24],
     ["none", "1-9", "10-24", "25+"]),
    ("Wind speed", "Wind speed (m/s)", [3, 6, 9],
     ["< 3", "3-6", "6-9", "> 9"]),
    ("Gust speed", "Gust speed (m/s)", [8, 12, 16],
     ["< 8", "8-12", "12-16", "> 16"]),
    ("Precipitation intensity", "Precipitation intensity (mm/h)", [0, 0.5, 2],
     ["none", "0-0.5", "0.5-2", "> 2"]),
]


def prepare(events: pd.DataFrame) -> pd.DataFrame:
    a = events[events["type"] == "ARRIVAL"].dropna(subset=["differenceInMinutes"])
    out = pd.DataFrame(
        {
            "station": a["stationShortCode"].astype("category").cat.codes.astype("int32"),
            "moy": a["month"].astype(str).str.slice(5, 7).astype("int8"),
            "year": a["year"].astype("int16"),
            "hour": a["scheduledTime"].dt.hour.fillna(0).astype("int8"),
            "late": (a["differenceInMinutes"] > routes_lib.ON_TIME_THRESHOLD_MIN).astype("float32"),
        }
    )
    for col, *_ in VARIABLES:
        out[col] = a[col].astype("float32")
    out["snow_adj"] = out["Snow depth"].clip(lower=0)
    out["part"] = (out["hour"] // 6).astype("int8")  # night, morning, afternoon, evening
    return out


def add_baseline(df: pd.DataFrame, keys: list[str], name: str) -> None:
    df[name] = (df["late"] - df.groupby(keys)["late"].transform("mean")).astype("float32")


def band_table(df: pd.DataFrame, col: str, edges: list[float], labels: list[str], excess: str) -> pd.DataFrame:
    values = df["snow_adj"] if col == "Snow depth" else df[col]
    band = np.searchsorted(edges, values.to_numpy(dtype=float), side="left")
    ok = values.notna().to_numpy()
    t = pd.DataFrame({"band": band[ok], "late": df["late"].to_numpy()[ok], "ex": df[excess].to_numpy()[ok]})
    g = t.groupby("band").agg(n=("late", "size"), late=("late", "mean"), excess=("ex", "mean"))
    g["late"] *= 100
    g["excess"] *= 100
    g.index = [labels[i] for i in g.index]
    return g


def print_table(title: str, g: pd.DataFrame) -> None:
    print(f"\n{title}")
    print(f"  {'band':<12}{'arrivals':>12}{'late %':>9}{'vs usual':>10}")
    for label, r in g.iterrows():
        print(f"  {label:<12}{int(r['n']):>12,}{r['late']:>9.1f}{r['excess']:>+10.1f}")


def by_year(df: pd.DataFrame, col: str, harsh, excess: str, label: str) -> None:
    values = df["snow_adj"] if col == "Snow depth" else df[col]
    mask = harsh(values)
    rows = []
    for y, g in df[mask.fillna(False)].groupby("year"):
        rows.append((y, len(g), g[excess].mean() * 100))
    print(f"\n{label}: excess late % by year (vs the same station, month and part of day)")
    print("  " + "  ".join(f"{y}: {e:+.1f} (n={n:,})" for y, n, e in rows))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--years", type=int, nargs="*", help="only these years (default: all)")
    args = ap.parse_args()
    if sys.stdout.encoding is None or sys.stdout.encoding.lower() != "utf-8":
        sys.stdout.reconfigure(encoding="utf-8")

    events = routes_lib.load_events(routes_lib.find_parquets(), years=args.years)
    df = prepare(events)
    del events
    print(f"{len(df):,} arrivals, {df['year'].min()}-{df['year'].max()}, "
          f"{(df['late'].mean() * 100):.1f}% more than {routes_lib.ON_TIME_THRESHOLD_MIN} min late overall")

    df["ym"] = (df["year"].astype("int32") * 12 + df["moy"]).astype("int32")
    add_baseline(df, ["station", "moy"], "ex_sm")
    add_baseline(df, ["station", "ym"], "ex_sym")
    add_baseline(df, ["station", "ym", "part"], "ex_symp")

    for col, title, edges, labels in VARIABLES:
        print_table(f"{title}: same station, same calendar month (years pooled)", band_table(df, col, edges, labels, "ex_sm"))
        print_table(f"{title}: same station, same actual month (e.g. Jan 2019)", band_table(df, col, edges, labels, "ex_sym"))
        print_table(f"{title}: same station, actual month and part of day", band_table(df, col, edges, labels, "ex_symp"))

    print("\n--- Does it hold every year? (same station, actual month and part of day) ---")
    by_year(df, "Air temperature", lambda v: v <= -5, "ex_symp", "Frost (<= -5 C)")
    by_year(df, "Air temperature", lambda v: v > 25, "ex_symp", "Heat (> 25 C)")
    by_year(df, "Snow depth", lambda v: v >= 10, "ex_symp", "Deep snow (>= 10 cm)")
    by_year(df, "Gust speed", lambda v: v > 16, "ex_symp", "Strong gusts (> 16 m/s)")

    print("\n--- By calendar month: frost and deep snow only count where they occur ---")
    for name, col, hi in (("Frost (<= -5 C)", "Air temperature", lambda v: v <= -5),
                          ("Deep snow (>= 10 cm)", "snow_adj", lambda v: v >= 10)):
        m = hi(df[col]).fillna(False)
        g = df[m].groupby("moy")["ex_symp"].agg(["size", "mean"])
        print(f"{name}: " + "  ".join(f"{int(i):02d}: {r['mean'] * 100:+.1f} (n={int(r['size']):,})" for i, r in g.iterrows()))

    print("\nHow to read: 'vs usual' is the percentage-point difference in the share of trains "
          "more than 5 min late, compared with all arrivals at that station in that part of the year.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
