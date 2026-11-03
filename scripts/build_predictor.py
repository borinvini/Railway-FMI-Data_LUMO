"""Build web/public/data/predictor.json from the trained delay models of the paper.

The paper trained one LightGBM model per station (Railway-FMI-Data-CSV-Files-v2/AI Results). Each
classifies a train event as *disrupted* (late by 1 min or more, or cancelled). The site lets a
visitor pick a month, a day of the week and a time of day, so this script runs every station's best
model on every such combination ahead of time and saves the results. The browser never loads a
model.

Weather is not a visitor input: it is set to the typical values (training medians) of the station
for the picked month, exactly as the training pipeline fills missing readings.

The models were trained with scale_pos_weight = negatives / positives, so their raw output leans
towards 50/50. A prior shift, logit(p) - ln(scale_pos_weight), turns it back into a chance; the
self-check below compares the result with the real share of disrupted events on the test set.

Reads only the training artefacts (never writes there). Needs lightgbm, scikit-learn, joblib,
pandas and a parquet engine. The project .venv has none of the model libraries, so run it with the
training environment:

    C:/Users/<you>/AppData/Local/miniconda3/envs/venv_rail_fmi_training/python.exe scripts/build_predictor.py
    ... --step-minutes 30          time-of-day resolution (default 30)
    ... --ai-results "<path>"      folder holding "1 - HKI" ... "7 - ROI"

Idempotent: same inputs -> identical output bytes.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import warnings
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
OUT_FILE = ROOT / "web" / "public" / "data" / "predictor.json"
DEFAULT_AI_RESULTS = (
    ROOT.parent / "Railway-FMI-Data-CSV-Files-v2" / "AI Results"
)

# Best configuration per station by test AUC (paper, Table "best"): all LightGBM.
# (site code, folder, scenario folder prefix, scenario label, paper test AUC)
BEST = [
    ("HKI", "1 - HKI", "5 - ", "S5", 0.689),
    ("PSL", "2 - PSL", "1 - ", "S1", 0.756),
    ("TPE", "3 - TPE", "11 - ", "S11", 0.761),
    ("SK", "4 - SK", "11 - ", "S11", 0.891),
    ("YV", "5 - YV", "11 - ", "S11", 0.817),
    ("OL", "6 - OL", "5 - ", "S5", 0.866),
    ("ROI", "7 - ROI", "11 - ", "S11", 0.732),
]
SCENARIO_WORDS = {
    "S1": "timetable and calendar only",
    "S5": "timetable, calendar and the last 3 days of weather",
    "S11": "timetable, calendar, the last 3 days of weather and the weather type",
}
TARGET = "trainDisrupted"
TIME_FEATURES = ("month_sin", "month_cos", "hour_sin", "hour_cos", "day_week_sin", "day_week_cos")
# Stop if the corrected chance on the test set is further than this from the real share (points).
MAX_CALIBRATION_GAP = 3.0
# Real events per calendar month whose weather each answer is averaged over.
WEATHER_SAMPLES = 60
# ...drawn from events within this many minutes of the slot (or the whole month if fewer than
# MIN_WEATHER_POOL events are that close).
WEATHER_WINDOW_MIN = 90
MIN_WEATHER_POOL = 30
# A cell (month, day, time slot) with at least this many real events gets the model's mean for them.
MIN_CELL_EVENTS = 10
# Width of the minute bins a time slot is averaged over (must divide --step-minutes).
SUB_MINUTES = 5


def find_dir(parent: Path, prefix: str) -> Path:
    hits = sorted(p for p in parent.iterdir() if p.is_dir() and p.name.startswith(prefix))
    if len(hits) != 1:
        sys.exit(f"expected one folder starting with {prefix!r} in {parent}, found {[h.name for h in hits]}")
    return hits[0]


def read_parquet(path: Path) -> pd.DataFrame:
    if not path.is_file():
        sys.exit(f"missing {path}")
    return pd.read_parquet(path)


def load_pickle(path: Path):
    if not path.is_file():
        sys.exit(f"missing {path}")
    with warnings.catch_warnings():
        # Pickled with scikit-learn 1.6.1; only the scaler's centre/scale arrays are used, which
        # every recent version stores the same way.
        warnings.simplefilter("ignore")
        return joblib.load(path)


def weekday_code(monday_first: int) -> int:
    """Site order Monday = 0 .. Sunday = 6 -> training code Sunday = 1 .. Saturday = 7."""
    return 1 if monday_first == 6 else monday_first + 2


def time_features(month: int, dow_code: int, hour: float) -> dict[str, float]:
    return {
        "month_sin": math.sin(2 * math.pi * (month - 1) / 12.0),
        "month_cos": math.cos(2 * math.pi * (month - 1) / 12.0),
        "hour_sin": math.sin(2 * math.pi * hour / 24.0),
        "hour_cos": math.cos(2 * math.pi * hour / 24.0),
        "day_week_sin": math.sin(2 * math.pi * (dow_code - 1) / 7.0),
        "day_week_cos": math.cos(2 * math.pi * (dow_code - 1) / 7.0),
    }


class Scaling:
    """The weather scaling of training stage 505: log1p on skewed columns, then RobustScaler."""

    def __init__(self, artefact: dict | None):
        if artefact is None:
            self.cols: list[str] = []
            return
        self.cols = list(artefact["weather_features"])
        self.skewed = set(artefact["skewed_features"])
        self.center = np.asarray(artefact["scaler"].center_, dtype=float)
        self.scale = np.asarray(artefact["scaler"].scale_, dtype=float)
        self.imputer = artefact["imputer"]

    def apply(self, df: pd.DataFrame) -> pd.DataFrame:
        if not self.cols:
            return df
        out = df.copy()
        x = out[self.cols].astype(float)
        for c in self.skewed:
            x[c] = np.log1p(x[c].clip(lower=0))
        out[self.cols] = (x.to_numpy() - self.center) / self.scale
        return out


def correct(p_raw: np.ndarray, spw: float) -> np.ndarray:
    """Undo the positive-class weight: true odds = weighted odds / spw."""
    p = np.clip(p_raw, 1e-9, 1 - 1e-9)
    logit = np.log(p / (1 - p)) - math.log(spw)
    return 1 / (1 + np.exp(-logit))


def decimal_hour(df: pd.DataFrame) -> np.ndarray:
    return (np.arctan2(df["hour_sin"], df["hour_cos"]) * 24 / (2 * math.pi)) % 24


def month_of(df: pd.DataFrame) -> np.ndarray:
    return (np.rint(np.arctan2(df["month_sin"], df["month_cos"]) * 12 / (2 * math.pi)) % 12 + 1).astype(int)


def auc(y: np.ndarray, s: np.ndarray) -> float:
    """ROC AUC via the rank statistic (ties get the average rank)."""
    ranks = pd.Series(s).rank(method="average").to_numpy()
    pos = y.astype(bool)
    n1, n0 = pos.sum(), (~pos).sum()
    return float((ranks[pos].sum() - n1 * (n1 + 1) / 2) / (n1 * n0))


def build_station(code: str, folder: str, prefix: str, label: str, paper_auc: float,
                  ai_results: Path, step: int) -> dict:
    sdir = find_dir(ai_results / folder / "results", prefix)
    print(f"\n{code}: {sdir.name}")
    model = load_pickle(sdir / "1001-lightgbm_randomized_search" / "lightgbm_best_model_selected.pkl")
    model = getattr(model, "best_estimator_", model)
    spw = float(model.get_params()["scale_pos_weight"])
    model_names = [str(n) for n in model.feature_names_in_]
    pos_col = list(model.classes_).index(True)

    def model_input(df: pd.DataFrame) -> pd.DataFrame:
        """Columns in the model's order, under the model's names (LightGBM swaps spaces for _)."""
        return df[features].set_axis(model_names, axis=1)

    scaler_path = sdir / "505-scale_weather_features" / "weather_scaler.joblib"
    scaling = Scaling(load_pickle(scaler_path) if scaler_path.is_file() else None)
    if label != "S1" and not scaling.cols:
        sys.exit(f"{code}: {label} uses weather but has no scaler")

    split = sdir / "503-split_dataset"
    train = read_parquet(split / "merged_data_selected_train.parquet")
    test_raw = read_parquet(split / "merged_data_selected_test.parquet")
    test_ready = read_parquet(sdir / "505-scale_weather_features" / "merged_data_selected_test.parquet") \
        if scaling.cols else test_raw

    by_key = {c.replace(" ", "_"): c for c in test_ready.columns}
    missing = [n for n in model_names if n.replace(" ", "_") not in by_key]
    if missing:
        sys.exit(f"{code}: model features not in the data: {missing}")
    features = [by_key[n.replace(" ", "_")] for n in model_names]

    # 1. Our scaling reproduces the training's scaled test file.
    if scaling.cols:
        ours = scaling.apply(test_raw)[scaling.cols].to_numpy(float)
        theirs = test_ready[scaling.cols].to_numpy(float)
        gap = float(np.nanmax(np.abs(ours - theirs)))
        print(f"  scaling check: max difference {gap:.2e}")
        if not gap < 1e-6:
            sys.exit(f"{code}: scaling does not reproduce the training files")

    # 2. The model reproduces the paper's test AUC.
    y_test = test_ready[TARGET].astype(bool).to_numpy()
    p_test = model.predict_proba(model_input(test_ready))[:, pos_col]
    test_auc = auc(y_test, p_test)
    print(f"  test AUC {test_auc:.4f} (paper {paper_auc:.3f}), scale_pos_weight {spw:.3f}")
    if abs(test_auc - paper_auc) > 0.001:
        sys.exit(f"{code}: test AUC does not match the paper")

    # 3. The corrected chance matches the real share of disrupted events.
    p_true = correct(p_test, spw)
    real = 100 * y_test.mean()
    print(f"  test set: real disrupted {real:.1f}%, raw model {100 * p_test.mean():.1f}%, "
          f"corrected {100 * p_true.mean():.1f}%")
    bins = pd.cut(p_true, np.linspace(0, 1, 11), include_lowest=True)
    rel = pd.DataFrame({"bin": bins, "pred": p_true, "real": y_test}).groupby("bin", observed=True) \
        .agg(n=("real", "size"), pred=("pred", "mean"), real=("real", "mean"))
    for b, r in rel.iterrows():
        print(f"    {str(b):>14}  n={int(r.n):>6}  predicted {100 * r.pred:5.1f}%  real {100 * r.real:5.1f}%")
    if abs(100 * p_true.mean() - real) > MAX_CALIBRATION_GAP:
        sys.exit(f"{code}: corrected chance is off by more than {MAX_CALIBRATION_GAP} points")

    # "Typical weather for the month" = the real weather of that calendar month in the training years:
    # each answer is the mean chance over WEATHER_SAMPLES real events of that month, with only the time
    # features replaced. A single row of medians is a combination the trees never saw and gave answers
    # far from the real late rates (e.g. 40% where 71% of trains were late).
    #
    # Time of day is the models' strongest feature and in effect picks out single trains, so "08:00" alone
    # would answer for whichever train runs near 08:00 sharp. A slot is therefore the average over the
    # minutes where the station's trains really run inside it (SUB_MINUTES bins, weighted by events).
    seen = pd.concat([train, test_raw], ignore_index=True)
    month_col = month_of(train)
    other = [f for f in features if f not in TIME_FEATURES]
    slots = 24 * 60 // step
    subs = step // SUB_MINUTES
    minute = (decimal_hour(seen) * 60).to_numpy()
    sub_count = np.bincount(np.floor(minute / SUB_MINUTES).astype(int) % (slots * subs),
                            minlength=slots * subs).reshape(slots, subs).astype(float)
    sub_count[sub_count.sum(axis=1) == 0] = 1.0  # a slot with no trains: spread evenly
    sub_weight = sub_count / sub_count.sum(axis=1, keepdims=True)

    # The weather comes from events of the same month near the same time of day (nights are colder).
    train_minute = (decimal_hour(train) * 60).to_numpy()
    combos = [(d, k) for d in range(7) for k in range(subs)]
    chance = np.empty((12, 7, slots))
    for month in range(1, 13):
        in_month = month_col == month
        for s in range(slots):
            centre = s * step + step / 2
            dist = np.abs((train_minute - centre + 720) % 1440 - 720)
            pool = train.loc[in_month & (dist <= WEATHER_WINDOW_MIN), other]
            if len(pool) < MIN_WEATHER_POOL:
                pool = train.loc[in_month, other]
            sample = pool.sample(n=min(WEATHER_SAMPLES, len(pool)), random_state=42).reset_index(drop=True)
            n = len(sample)
            block = sample.loc[np.tile(np.arange(n), len(combos))].reset_index(drop=True)
            times = pd.DataFrame([time_features(month, weekday_code(d), (s * step + (k + 0.5) * SUB_MINUTES) / 60)
                                  for d, k in combos])
            block = pd.concat([block, times.loc[np.repeat(np.arange(len(combos)), n)].reset_index(drop=True)], axis=1)
            p = correct(model.predict_proba(model_input(scaling.apply(block)))[:, pos_col], spw)
            per_sub = p.reshape(7, subs, n).mean(axis=2)
            chance[month - 1, :, s] = (per_sub * sub_weight[s]).sum(axis=1)
    # Where enough real trains ran in a cell (month, day, slot), the answer is the model's mean for those
    # trains, with the weather they really had. The made-up trains above, typical weather included, only
    # fill the cells with few or no trains; asked about trains that never ran, the models drift several
    # points from the real rates, so those cells are flagged "few" and the site calls them rough guesses.
    slot_of = np.floor(minute / step).astype(int) % slots
    code_dow = (np.rint(np.arctan2(seen["day_week_sin"], seen["day_week_cos"]) * 7 / (2 * math.pi)) % 7 + 1).astype(int)
    cell = (month_of(seen) - 1) * 7 * slots + ((code_dow - 2) % 7) * slots + slot_of
    p_seen = correct(model.predict_proba(model_input(scaling.apply(seen)))[:, pos_col], spw)
    n_cell = np.bincount(cell, minlength=12 * 7 * slots)
    mean_cell = np.bincount(cell, weights=p_seen, minlength=12 * 7 * slots) / np.maximum(n_cell, 1)
    enough = n_cell >= MIN_CELL_EVENTS
    flat = chance.reshape(-1)
    flat[enough] = mean_cell[enough]
    chance = flat.reshape(12, 7, slots)
    few = (~enough).astype(int).reshape(12, 7, slots)
    print(f"  cells from real trains: {100 * enough.mean():.1f}% "
          f"(holding {100 * n_cell[enough].sum() / n_cell.sum():.1f}% of the events)")
    permille = np.rint(chance * 1000).astype(int)

    share = np.bincount(slot_of, minlength=slots) / len(seen)
    usual = 100 * seen[TARGET].astype(bool).mean()
    print(f"  usual disrupted share (2018-2024) {usual:.1f}%, grid {permille.min() / 10:.1f}-{permille.max() / 10:.1f}%")

    # 4. Looked up at every real event's own month, day and slot, the answers match the real late rate
    #    through the day (busy slots only) and overall.
    looked_up = chance[month_of(seen) - 1, (code_dow - 2) % 7, slot_of] * 100
    real = seen[TARGET].astype(float).to_numpy() * 100
    by_slot = pd.DataFrame({"s": slot_of, "grid": looked_up, "real": real}).groupby("s").mean()
    busy = by_slot.index[share[by_slot.index] * 100 >= 1.0]
    gaps = (by_slot.loc[busy, "grid"] - by_slot.loc[busy, "real"]).abs()
    print(f"  at the real events: grid {looked_up.mean():.1f}% vs real {usual:.1f}%; through the day mean gap "
          f"{gaps.mean():.1f} points (max {gaps.max():.1f}) over {len(busy)} busy slots")
    if abs(looked_up.mean() - usual) > MAX_CALIBRATION_GAP:
        sys.exit(f"{code}: the grid's average is off by more than {MAX_CALIBRATION_GAP} points")

    return {
        "scenario": label,
        "uses": SCENARIO_WORDS[label],
        "testAuc": round(test_auc, 3),
        "usualPct": round(usual, 1),
        "events": int(len(seen)),
        "slotShare": [round(100 * float(v), 2) for v in share],
        "p": permille.tolist(),
        "few": few.tolist(),
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--ai-results", type=Path, default=DEFAULT_AI_RESULTS)
    ap.add_argument("--step-minutes", type=int, default=30)
    ap.add_argument("--out", type=Path, default=OUT_FILE)
    a = ap.parse_args()
    if (24 * 60) % a.step_minutes:
        sys.exit("--step-minutes must divide a day")

    out = {
        "definition": "late by 1 min or more, or cancelled",
        "period": "2018-2024",
        "stepMinutes": a.step_minutes,
        "stations": {code: build_station(code, f, pre, lab, auc_, a.ai_results, a.step_minutes)
                     for code, f, pre, lab, auc_ in BEST},
    }
    a.out.parent.mkdir(parents=True, exist_ok=True)
    a.out.write_text(json.dumps(out, sort_keys=True, separators=(",", ":"), ensure_ascii=False) + "\n",
                     encoding="utf-8")
    print(f"\nwrote {a.out} ({a.out.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
