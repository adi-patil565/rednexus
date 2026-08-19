"""SARIMA forecasting.

Seasonal ARIMA with a weekly period. Cheaper to fit than Prophet and
pure Python, so it is the first thing tried - if it beats the rolling
average, the heavier dependency may not be worth carrying at all.

Order chosen deliberately rather than searched: (1,0,1)x(1,0,1,7).
Non-seasonal AR and MA terms for short-run persistence, the same
seasonally at lag 7 for the weekday cycle, and no differencing because
daily issuance is mean-reverting around a slow trend rather than a
random walk. A grid search over a synthetic series would be tuning to
this file's own assumptions.
"""

from __future__ import annotations

import warnings

import numpy as np
import pandas as pd

ORDER = (1, 0, 1)
SEASONAL_ORDER = (1, 0, 1, 7)

# Three full weekly cycles. Below this a seasonal model has not seen the
# season it claims to model, and statsmodels will not say so - it fits
# something and returns it.
MIN_HISTORY_DAYS = 21


def forecast(history: pd.Series, horizon: int) -> np.ndarray:
    """Fit and predict, falling back to the trailing mean on failure.

    Rules section 5: a model failure must degrade to the rule-based
    path, never surface as an error. Convergence failures are normal on
    short or near-constant series, so the fallback is a real code path
    rather than defensive decoration.
    """
    from statsmodels.tsa.statespace.sarimax import SARIMAX

    from fallback.rolling_average import forecast as fallback_forecast

    # Guard BEFORE fitting, not just on exception. SARIMA on three days
    # of data does not raise - it returns an all-zeros forecast, which
    # is worse than an error: a confident zero tells the threshold
    # engine no blood is needed and suppresses an alert that is real.
    # "Insufficient data" has to be checked, not inferred from a crash.
    if len(history) < MIN_HISTORY_DAYS:
        return fallback_forecast(history, horizon)

    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            model = SARIMAX(
                history.values,
                order=ORDER,
                seasonal_order=SEASONAL_ORDER,
                enforce_stationarity=False,
                enforce_invertibility=False,
            )
            fitted = model.fit(disp=False, maxiter=200)
            prediction = fitted.forecast(steps=horizon)

        prediction = np.asarray(prediction, dtype=float)
        if not np.all(np.isfinite(prediction)):
            raise ValueError("non-finite forecast")

        # A finite but absurd forecast is still a failure. Predicting
        # near-zero for a group that reliably issues units, or an order
        # of magnitude above anything ever recorded, means the fit did
        # not converge to anything useful - degrade rather than ship it.
        recent_mean = float(history.tail(28).mean())
        if recent_mean > 0:
            forecast_mean = float(np.mean(prediction))
            if forecast_mean < recent_mean * 0.1 or forecast_mean > recent_mean * 10:
                return fallback_forecast(history, horizon)

        # Units issued cannot be negative.
        return np.clip(prediction, 0, None)

    except Exception:
        return fallback_forecast(history, horizon)
