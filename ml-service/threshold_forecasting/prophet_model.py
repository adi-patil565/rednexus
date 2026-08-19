"""Prophet forecasting.

Additive decomposition into trend plus weekly and yearly seasonality,
which is a good structural match for this problem: hospital demand
genuinely does have a weekday cycle and a monsoon season, and Prophet
models those as named components rather than as lags.

The honest caveat, stated once and meant: the synthetic data has weekly
and yearly seasonality because data_generation/config.py wrote them in.
Prophet recovering them is evidence the pipeline works, not evidence
about real demand.
"""

from __future__ import annotations

import logging
import warnings

import numpy as np
import pandas as pd

# Prophet logs a banner per fit; hundreds of backtest folds make that
# unreadable.
# Prophet logs a fit banner and cmdstanpy logs two lines per chain.
# Hundreds of backtest folds make the actual result unreadable. Setting
# the level is not enough - cmdstanpy attaches its own handler - so the
# logger is disabled and detached from the root.
for _name in ("prophet", "cmdstanpy"):
    _logger = logging.getLogger(_name)
    _logger.setLevel(logging.CRITICAL)
    _logger.handlers.clear()
    _logger.propagate = False
    _logger.disabled = True


def forecast(history: pd.Series, horizon: int) -> np.ndarray:
    """Fit and predict, falling back to the trailing mean on failure."""
    from fallback.rolling_average import forecast as fallback_forecast

    # Same guard as SARIMA, for the same reason: too little history
    # produces a confident forecast of nothing rather than an error.
    if len(history) < 21:
        return fallback_forecast(history, horizon)

    try:
        # Imported INSIDE the try, deliberately. Prophet is optional -
        # CI does not install it, because its absence is a path worth
        # testing. An import at function top level raises ImportError
        # out of forecast() instead of degrading, which is the failure
        # Rules section 5 exists to prevent.
        from prophet import Prophet

        frame = pd.DataFrame({"ds": history.index, "y": history.values})

        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            model = Prophet(
                weekly_seasonality=True,
                # Only claim an annual cycle with two FULL years of
                # history. Prophet warns below 730 days that the
                # trend/seasonality split is under-identified, and it is
                # right: an annual term fitted to 18 months is
                # extrapolation dressed as a seasonal component.
                yearly_seasonality=len(history) >= 730,
                daily_seasonality=False,
                # Blood demand drifts; it does not have abrupt regime
                # changes. A low value stops the trend chasing shocks.
                changepoint_prior_scale=0.05,
                seasonality_mode="multiplicative",
                uncertainty_samples=0,
            )
            model.fit(frame)

            future = model.make_future_dataframe(periods=horizon)
            prediction = model.predict(future)["yhat"].tail(horizon).values

        prediction = np.asarray(prediction, dtype=float)
        if not np.all(np.isfinite(prediction)):
            raise ValueError("non-finite forecast")

        recent_mean = float(history.tail(28).mean())
        if recent_mean > 0:
            forecast_mean = float(np.mean(prediction))
            if forecast_mean < recent_mean * 0.1 or forecast_mean > recent_mean * 10:
                return fallback_forecast(history, horizon)

        return np.clip(prediction, 0, None)

    except Exception:
        return fallback_forecast(history, horizon)
