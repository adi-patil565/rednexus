"""Synthetic consumption data — the generative process.

READ THIS BEFORE TRUSTING ANY SCORE PRODUCED FROM THIS DATA.

The signal here is written by hand. Fitting a model to it and reporting
that the model recovered the seasonality is circular: the seasonality is
there because this file put it there. Nothing in the evaluation output
is evidence about real blood bank demand.

What it CAN establish, and what it is for:

  1. The pipeline works end to end - data, features, fit, forecast,
     backtest, comparison, fallback.
  2. The rule-based baseline is a real competitor rather than a
     strawman. If a 28-day rolling average beats Prophet even on data
     built to have learnable structure, that is worth knowing before
     anyone deploys a forecasting service.
  3. The comparison harness itself is correct and can be pointed at
     real pilot data later without changes.

The parameters below mirror backend/prisma/seed.js so the app and the
model see the same shape of world, extended from 60 days to 730 so
there is enough history for annual seasonality to exist at all.
"""

# Two years. Prophet needs at least two full cycles before an annual
# term is anything other than a guess.
DAYS = 730

RANDOM_SEED = 42

# Approximate Indian blood group distribution. Indicative figures,
# rounded - worth checking against a real source before quoting them.
GROUP_SHARE = {
    "O_POS": 0.36,
    "B_POS": 0.31,
    "A_POS": 0.21,
    "AB_POS": 0.07,
    "O_NEG": 0.02,
    "B_NEG": 0.015,
    "A_NEG": 0.01,
    "AB_NEG": 0.005,
}

# O- is issued far above its population share: it is the universal donor
# and goes out in emergencies before a patient's group is known. This is
# exactly the signal a single "Negatives" stock bucket would have hidden.
EMERGENCY_UPLIFT = {"O_NEG": 2.5}

# Hospitals do more elective surgery midweek. Monday index 0.
WEEKDAY_FACTOR = [1.15, 1.10, 1.05, 1.10, 1.05, 0.80, 0.60]

# Monsoon in Navi Mumbai runs June-September: dengue, and more road
# accidents on wet roads. January index 0.
MONTH_FACTOR = [
    0.95,  # Jan
    0.95,  # Feb
    1.00,  # Mar
    1.00,  # Apr
    1.05,  # May
    1.15,  # Jun  monsoon begins
    1.25,  # Jul  peak
    1.25,  # Aug
    1.15,  # Sep
    1.05,  # Oct  festival road traffic
    1.00,  # Nov
    0.95,  # Dec
]

# Slow underlying growth in demand, per year.
ANNUAL_TREND = 0.03

# Mass-casualty events: rare, large, and short.
SHOCK_PROBABILITY = 0.02
SHOCK_MULTIPLIER = (1.5, 3.0)

# Counts are overdispersed - a Poisson would be too tidy, and a Gaussian
# would produce negative days. Negative binomial via a gamma-Poisson
# mixture; lower dispersion means noisier.
NB_DISPERSION = 6.0

# The ten seeded institutions and their scale, matching seed.js.
INSTITUTIONS = {
    "mgm_kamothe": 55,
    "fortis_vashi": 40,
    "dypatil_nerul": 65,
    "apollo_belapur": 50,
    "nmmc_vashi": 80,
    "reliance_kk": 35,
    "terna_nerul": 45,
    "suyash_seawoods": 20,
    "pkc_vashi": 25,
    "pmc_panvel": 50,
}
