# ml-service

Forecasting for the threshold engine (F6, Phase 9).

## What this is, and is not

The rule-based rolling average in
`backend/src/services/threshold.service.js` is the shipping
implementation. It works today, with no Python and no model, and Rules
section 2 requires it to stay that way permanently. Everything here is
an *upgrade path* that must prove it earns its place.

The data is synthetic. Its seasonality exists because
`data_generation/config.py` wrote it in, so a model recovering that
seasonality is evidence the pipeline works — not evidence about real
blood demand. What the comparison can honestly settle is whether the
28-day rolling average is already good enough, which is worth knowing
before anyone deploys a forecasting service.

## Run it

From the repo root, in any shell:

```bash
npm.cmd run ml:compare
```

```bash
npm.cmd run ml:test
```

On Windows use `npm.cmd`, not `npm` - PowerShell's execution policy
blocks `npm.ps1`. On macOS and Linux plain `npm` is fine.

`scripts/ml.js` resolves the virtualenv interpreter for the current
platform. Running the path directly does not work in PowerShell, which
has no `&&`, or in cmd.exe, which reads forward slashes as switches.

## First-time setup

```bash
python -m venv ml-service/.venv
```

Then install into it with the `requirements.txt` in this directory.

## Layout

    data_generation/    synthetic daily consumption, seeded
    fallback/           port of the shipping rolling average
    threshold_forecasting/  prophet_model.py, sarima_model.py
    evaluation/         rolling-origin backtest, time-based splits only
