"""Rolling-origin backtest.

Time-based splits only. A random train/test split on a time series
leaks the future into training and produces scores that look excellent
and mean nothing.

Each fold trains on everything up to a cutoff and predicts the next
`horizon` days, then the cutoff advances. That mirrors how the service
would actually be used: forecast from what you know today.
"""

from __future__ import annotations

import numpy as np
import pandas as pd


def mae(actual: np.ndarray, predicted: np.ndarray) -> float:
    return float(np.mean(np.abs(actual - predicted)))


def rmse(actual: np.ndarray, predicted: np.ndarray) -> float:
    return float(np.sqrt(np.mean((actual - predicted) ** 2)))


def smape(actual: np.ndarray, predicted: np.ndarray) -> float:
    """Symmetric MAPE, in percent.

    Plain MAPE is unusable here: rare groups have zero-issuance days and
    dividing by zero makes the metric infinite. sMAPE stays finite, and
    the denominator guard covers days where both are zero.
    """
    denominator = (np.abs(actual) + np.abs(predicted)) / 2
    mask = denominator > 0
    if not mask.any():
        return 0.0
    return float(np.mean(np.abs(actual[mask] - predicted[mask]) / denominator[mask]) * 100)


def rolling_origin_backtest(
    series: pd.Series,
    forecaster,
    horizon: int = 7,
    folds: int = 8,
    min_train: int = 180,
) -> dict:
    """Score one forecaster on one series.

    Returns per-fold errors as well as the mean, because a model that
    wins on average while collapsing on one fold is not obviously better
    than one that is merely mediocre everywhere.
    """
    n = len(series)
    usable = n - min_train
    if usable < horizon:
        raise ValueError("series too short to backtest")

    step = max(1, usable // folds)
    cutoffs = [min_train + i * step for i in range(folds) if min_train + i * step + horizon <= n]

    fold_mae, fold_rmse, fold_smape = [], [], []

    for cutoff in cutoffs:
        train = series.iloc[:cutoff]
        actual = series.iloc[cutoff : cutoff + horizon].values.astype(float)
        predicted = np.asarray(forecaster(train, horizon), dtype=float)

        fold_mae.append(mae(actual, predicted))
        fold_rmse.append(rmse(actual, predicted))
        fold_smape.append(smape(actual, predicted))

    return {
        "folds": len(cutoffs),
        "mae": float(np.mean(fold_mae)),
        "rmse": float(np.mean(fold_rmse)),
        "smape": float(np.mean(fold_smape)),
        "mae_worst_fold": float(np.max(fold_mae)),
        "fold_mae": fold_mae,
    }
