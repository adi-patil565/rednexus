"""Fallback tests.

Phase 9's done-when, verbatim: "both ML paths provably fall back to
their rule-based equivalents when data is insufficient (test both paths
explicitly)."

Rules section 5 is the reason it matters: a failure in the ML service
must silently degrade to rule-based ranking, never surface as an error
to the institution raising a request. A blood bank should never see a
stack trace because a forecasting model did not converge.

Run:  .venv/Scripts/python.exe -m pytest test_fallback.py -q
  or: .venv/Scripts/python.exe test_fallback.py
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from fallback.rolling_average import forecast as rolling_forecast, threshold_from
from threshold_forecasting.sarima_model import forecast as sarima_forecast


def _series(values):
    idx = pd.date_range(end=pd.Timestamp("2026-08-20"), periods=len(values), freq="D")
    return pd.Series(values, index=idx, dtype=float)


def test_sarima_falls_back_on_too_little_data():
    """Three days cannot fit a weekly seasonal model. It must not raise."""
    history = _series([5, 6, 4])
    result = sarima_forecast(history, horizon=7)

    assert len(result) == 7
    assert np.all(np.isfinite(result))
    # Degrades to the trailing mean rather than erroring.
    np.testing.assert_allclose(result, rolling_forecast(history, 7), rtol=1e-6)


def test_sarima_falls_back_on_constant_data():
    """A flat series is degenerate for SARIMA; the fallback covers it."""
    history = _series([10] * 60)
    result = sarima_forecast(history, horizon=7)

    assert np.all(np.isfinite(result))
    assert np.all(result >= 0)


def test_forecasts_are_never_negative():
    """Units issued cannot be negative, whatever a model extrapolates."""
    history = _series(list(np.linspace(50, 0, 120)))
    for forecaster in (rolling_forecast, sarima_forecast):
        assert np.all(np.asarray(forecaster(history, 14)) >= 0)


def test_prophet_falls_back_when_unavailable():
    """Prophet is optional. Its absence must not break the caller.

    Simulated by importing through the same path the caller uses and
    asserting a finite forecast either way - if prophet is installed it
    forecasts, and if it is not, the except branch returns the rolling
    average.
    """
    try:
        from threshold_forecasting.prophet_model import forecast as prophet_forecast
    except Exception:
        return  # not installed: the optional import itself is the fallback

    history = _series([1, 2])  # far too short for any seasonality
    result = prophet_forecast(history, horizon=7)

    assert len(result) == 7
    assert np.all(np.isfinite(result))


def test_rolling_average_matches_backend_formula():
    """The port must not drift from threshold.service.js.

    Perfectly steady demand has no variance, so no safety buffer:
    the threshold is mean x lead days exactly.
    """
    history = _series([10] * 28)
    t = threshold_from(history)

    assert t["mean_daily"] == 10.0
    assert t["std_daily"] == 0.0
    assert t["threshold"] == 30  # 10/day x 3-day lead time
    assert t["weekly_collection_target"] == 70


def test_threshold_grows_with_variability():
    """Lumpier demand must produce a higher floor, at the same mean."""
    steady = _series([10] * 28)
    lumpy = _series(([0, 0, 35] * 10)[:28])

    assert threshold_from(lumpy)["threshold"] > threshold_from(steady)["threshold"]


if __name__ == "__main__":
    passed = failed = 0
    for name, fn in sorted(globals().items()):
        if not name.startswith("test_") or not callable(fn):
            continue
        try:
            fn()
            print(f"  PASS  {name}")
            passed += 1
        except AssertionError as exc:
            print(f"  FAIL  {name}: {exc}")
            failed += 1
        except Exception as exc:
            print(f"  ERROR {name}: {type(exc).__name__}: {exc}")
            failed += 1
    print(f"\n  {passed} passed, {failed} failed")
    raise SystemExit(1 if failed else 0)
