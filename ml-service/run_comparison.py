"""Does a forecasting model beat the 28-day rolling average?

That is the only question this script answers, and it is the question
that decides whether ml-service ships at all. If the rolling average
already in production wins, the correct outcome is to keep it and not
carry a Python service, a model registry, and a retraining loop for
nothing.

Time-based splits throughout. A random split would leak the future into
training and make every model look excellent.
"""

from __future__ import annotations

import sys
import time

import numpy as np
import pandas as pd

from data_generation import config
from data_generation.generate_consumption import generate, series_for
from evaluation.backtest import rolling_origin_backtest
from fallback.rolling_average import forecast as rolling_forecast, threshold_from
from threshold_forecasting.sarima_model import forecast as sarima_forecast

HORIZON = 7  # a week ahead: the cadence a collection target is set on
FOLDS = 6

LABELS = {
    "O_POS": "O+", "O_NEG": "O-", "A_POS": "A+", "A_NEG": "A-",
    "B_POS": "B+", "B_NEG": "B-", "AB_POS": "AB+", "AB_NEG": "AB-",
}

# The groups worth reporting on. The very rare ones average well under
# one unit a day, where every model predicts approximately zero and the
# comparison says nothing useful.
REPORT_GROUPS = ["O_POS", "B_POS", "A_POS", "AB_POS", "O_NEG"]

INSTITUTIONS = ["mgm_kamothe", "nmmc_vashi", "suyash_seawoods"]


def load_prophet():
    """Prophet is optional. SARIMA covers the same job if it is absent."""
    try:
        from threshold_forecasting.prophet_model import forecast

        return forecast
    except Exception as exc:  # pragma: no cover - environment dependent
        print(f"  Prophet unavailable ({type(exc).__name__}); comparing SARIMA only.\n")
        return None


def main() -> int:
    print()
    print("=" * 78)
    print("  Forecast comparison - can a model beat the shipping rolling average?")
    print("=" * 78)
    print()
    print("  Synthetic data. Its weekly and yearly seasonality exist because")
    print("  data_generation/config.py wrote them in, so a model recovering them")
    print("  proves the pipeline runs, not that it would help a real blood bank.")
    print("  The result that IS meaningful: whether the 28-day rolling average")
    print("  already in production is hard to beat.")
    print()

    started = time.time()
    df = generate()
    print(f"  {len(df):,} rows | {df['date'].min().date()} to {df['date'].max().date()}")
    print(f"  {FOLDS} folds | {HORIZON}-day horizon | rolling origin\n")

    prophet_forecast = load_prophet()

    models = {"rolling avg": rolling_forecast, "SARIMA": sarima_forecast}
    if prophet_forecast:
        models["Prophet"] = prophet_forecast

    header = f"  {'institution':<18}{'grp':<6}" + "".join(f"{m:>14}" for m in models)
    print(header)
    print("  " + "-" * (len(header) - 2))

    wins = {name: 0 for name in models}
    totals = {name: [] for name in models}
    comparisons = 0

    for institution in INSTITUTIONS:
        for group in REPORT_GROUPS:
            series = series_for(df, institution, group)
            if series.mean() < 0.5:
                continue

            scores = {}
            for name, forecaster in models.items():
                try:
                    result = rolling_origin_backtest(
                        series, forecaster, horizon=HORIZON, folds=FOLDS
                    )
                    scores[name] = result["mae"]
                    totals[name].append(result["mae"])
                except Exception as exc:
                    scores[name] = float("nan")
                    print(f"    {name} failed on {institution}/{group}: {exc}")

            best = min((v, k) for k, v in scores.items() if not np.isnan(v))[1]
            wins[best] += 1
            comparisons += 1

            cells = ""
            for name in models:
                marker = " *" if name == best else "  "
                cells += f"{scores[name]:>12.2f}{marker}"
            print(f"  {institution:<18}{LABELS[group]:<6}{cells}")

    print()
    print("  Mean absolute error, units/day. Lower is better. * = best.")
    print()
    print("  " + "-" * 76)
    print(f"  {'OVERALL':<24}" + "".join(f"{np.mean(totals[m]):>14.2f}" for m in models))
    print(f"  {'series won':<24}" + "".join(f"{wins[m]:>14}" for m in models))
    print()

    baseline = np.mean(totals["rolling avg"])
    verdict_lines = []
    for name in models:
        if name == "rolling avg":
            continue
        delta = (baseline - np.mean(totals[name])) / baseline * 100
        verdict_lines.append(
            f"  {name}: {delta:+.1f}% error vs the rolling average "
            f"({'better' if delta > 0 else 'WORSE'})"
        )
    print("\n".join(verdict_lines))
    print()

    # What the numbers mean for the decision in front of us.
    best_model = min(
        ((np.mean(v), k) for k, v in totals.items() if k != "rolling avg")
    )
    best_error, best_name = best_model
    improvement = (baseline - best_error) / baseline * 100

    print("  " + "=" * 74)
    if improvement < 5:
        print("  VERDICT: keep the rolling average.")
        print()
        print(f"  The best model improves error by {improvement:.1f}%, which does not")
        print("  justify a Python service, a model registry and a retraining loop.")
        print("  Rules section 2 already requires the rule-based path to work alone;")
        print("  on this evidence it should also remain the only path.")
    else:
        print(f"  VERDICT: {best_name} is worth pursuing on real data.")
        print()
        print(f"  It improves error by {improvement:.1f}% against the shipping baseline.")
        print("  That is a reason to collect real usage history and re-run this")
        print("  comparison against it - not a reason to deploy yet. The margin")
        print("  here is measured on data whose seasonality was written by hand.")
    print("  " + "=" * 74)
    print()

    # The threshold the backend would propose today, for reference.
    print("  For reference - thresholds the shipping code proposes right now:\n")
    print(f"    {'institution':<18}{'grp':<6}{'avg/day':>9}{'threshold':>11}{'weekly':>9}")
    for institution in ["mgm_kamothe"]:
        for group in REPORT_GROUPS:
            series = series_for(df, institution, group)
            t = threshold_from(series)
            print(
                f"    {institution:<18}{LABELS[group]:<6}"
                f"{t['mean_daily']:>9.1f}{t['threshold']:>11}{t['weekly_collection_target']:>9}"
            )

    print(f"\n  Completed in {time.time() - started:.1f}s\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
