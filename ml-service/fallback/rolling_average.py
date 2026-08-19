"""Rule-based forecasting — the fallback that ships first.

A deliberate port of backend/src/services/threshold.service.js. Same
window, same reorder-point formula, same constants, so the comparison
below is against what the product ACTUALLY DOES today rather than
against a strawman invented to lose.

Rules section 2 requires this path to remain complete and working
forever. Prophet and SARIMA are allowed to replace the forecast inside
it; they are never allowed to become a dependency of it.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

# Mirrors REPLENISHMENT_LEAD_DAYS and SERVICE_LEVEL_Z in the backend.
REPLENISHMENT_LEAD_DAYS = 3
SERVICE_LEVEL_Z = 1.65
DEFAULT_WINDOW = 28


def forecast(history: pd.Series, horizon: int, window: int = DEFAULT_WINDOW) -> np.ndarray:
    """Predict the next `horizon` days as a flat trailing mean.

    Flat is the point. A rolling average has no opinion about weekends,
    monsoon, or trend - which is precisely the gap a real forecaster has
    to beat to justify its existence.
    """
    mean = float(history.tail(window).mean())
    return np.full(horizon, mean)


def threshold_from(history: pd.Series, window: int = DEFAULT_WINDOW) -> dict:
    """The threshold and weekly target the backend would propose today."""
    tail = history.tail(window)
    mean = float(tail.mean())
    # Sample standard deviation, matching the backend's n-1 divisor.
    sd = float(tail.std(ddof=1)) if len(tail) > 1 else 0.0

    expected_demand = mean * REPLENISHMENT_LEAD_DAYS
    safety_buffer = SERVICE_LEVEL_Z * sd * np.sqrt(REPLENISHMENT_LEAD_DAYS)

    threshold = max(1 if mean > 0 else 0, int(np.ceil(expected_demand + safety_buffer)))

    return {
        "threshold": threshold,
        "weekly_collection_target": int(np.ceil(mean * 7)),
        "mean_daily": round(mean, 2),
        "std_daily": round(sd, 2),
    }
