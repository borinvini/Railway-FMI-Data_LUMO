"""Checks for the month periods (m01..m12). Run: python scripts/test_month_scope.py"""
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
import build_data  # noqa: E402
import routes_lib  # noqa: E402


def frames():
    runs = pd.DataFrame(
        {
            "runKey": [1, 2, 3],
            "year": [2019, 2020, 2019],
            "month": pd.Categorical(["2019-01", "2020-01", "2019-07"]),
            "trainType": ["IC", "IC", "IC"],
            "stopSequence": [("HKI", "TPE")] * 3,
        }
    )
    events = pd.DataFrame(
        {
            "runKey": [1, 1, 2, 3],
            "year": [2019, 2019, 2020, 2019],
            "month": pd.Categorical(["2019-01", "2019-01", "2020-01", "2019-07"]),
        }
    )
    return events, runs


def test_subset_month():
    events, runs = frames()
    ev, rs = routes_lib.subset_month(events, runs, 1)
    assert sorted(rs["runKey"]) == [1, 2], rs
    assert len(ev) == 3, ev
    ev, rs = routes_lib.subset_month(events, runs, 7)
    assert list(rs["runKey"]) == [3] and len(ev) == 1


def test_scope_name():
    assert build_data.scope_name() == "all"
    assert build_data.scope_name(2021) == "2021"
    assert build_data.scope_name(month=1) == "m01"
    assert build_data.scope_name(month=12) == "m12"


def test_patterns_by_month():
    _, runs = frames()
    p = build_data.build_route_patterns(runs, [2019, 2020], 1)
    assert len(p) == 1
    assert p[0]["runsByMonth"]["IC"] == [2, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0], p
    for t, per_year in p[0]["runsByType"].items():
        assert sum(p[0]["runsByMonth"][t]) == sum(per_year)


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
