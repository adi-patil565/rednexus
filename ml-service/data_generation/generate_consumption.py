"""Generate a daily consumption series per institution and blood group.

Deterministic given config.RANDOM_SEED, so every number downstream is
reproducible across machines.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from . import config


def _negative_binomial(rng: np.random.Generator, mean: float, dispersion: float) -> int:
    """Draw an overdispersed count.

    Gamma-Poisson mixture. Real issuance counts have more spread than a
    Poisson allows - some days a bus crashes - and a Gaussian would
    happily return negative units.
    """
    if mean <= 0:
        return 0
    shape = dispersion
    scale = mean / dispersion
    return int(rng.poisson(rng.gamma(shape, scale)))


def generate(days: int | None = None, seed: int | None = None) -> pd.DataFrame:
    """Return tidy rows: institution_id, blood_group, date, units_issued.

    The multiplicative structure is deliberate and matches how demand
    actually moves: a busy month makes every day proportionally busier
    rather than adding a flat number, so variance scales with level.
    """
    days = days or config.DAYS
    rng = np.random.default_rng(seed if seed is not None else config.RANDOM_SEED)

    end = pd.Timestamp.now("UTC").normalize().tz_localize(None)
    dates = pd.date_range(end=end, periods=days, freq="D")

    rows = []

    for institution_id, daily_units in config.INSTITUTIONS.items():
        for group, share in config.GROUP_SHARE.items():
            base = daily_units * share * config.EMERGENCY_UPLIFT.get(group, 1.0)

            for i, date in enumerate(dates):
                # Trend, applied over the whole window rather than from
                # an arbitrary epoch.
                years_elapsed = (i - days) / 365.25
                trend = (1 + config.ANNUAL_TREND) ** years_elapsed

                weekday = config.WEEKDAY_FACTOR[date.weekday()]
                month = config.MONTH_FACTOR[date.month - 1]

                expected = base * trend * weekday * month

                units = _negative_binomial(rng, expected, config.NB_DISPERSION)

                # Mass-casualty event. Rare, and it lifts every group at
                # that institution on that day, which is what makes it a
                # shock rather than noise.
                if rng.random() < config.SHOCK_PROBABILITY:
                    lo, hi = config.SHOCK_MULTIPLIER
                    units = int(units * rng.uniform(lo, hi))

                rows.append(
                    {
                        "institution_id": institution_id,
                        "blood_group": group,
                        "date": date,
                        "units_issued": units,
                    }
                )

    df = pd.DataFrame(rows)
    return df.sort_values(["institution_id", "blood_group", "date"]).reset_index(drop=True)


def series_for(df: pd.DataFrame, institution_id: str, blood_group: str) -> pd.Series:
    """One institution/group as a date-indexed series."""
    subset = df[
        (df["institution_id"] == institution_id) & (df["blood_group"] == blood_group)
    ]
    return subset.set_index("date")["units_issued"].astype(float)


if __name__ == "__main__":
    frame = generate()
    print(f"{len(frame):,} rows")
    print(f"{frame['date'].min().date()} to {frame['date'].max().date()}")
    print()
    summary = (
        frame.groupby("blood_group")["units_issued"]
        .agg(["mean", "std", "max"])
        .sort_values("mean", ascending=False)
        .round(2)
    )
    print(summary)
