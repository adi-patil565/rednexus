# Raktasetu

Consumption-based blood supply platform. Blood banks collect in lumps at
donation drives; hospitals consume continuously. Raktasetu measures what
a blood bank actually issues per blood group and turns that into two
numbers — a minimum stock threshold and a recurring weekly collection
target — so donation becomes a steady activity rather than a drive-only
event.

**Nothing the system decides reaches a donor without a named staff
member approving it.** That is the platform's core guarantee, enforced
in the schema (`confirmedThreshold` is null until confirmed), in the
service layer (`dispatch` refuses an unapproved request), and in the
state machine (`DETECTED → NOTIFIED` is not a legal transition). There
is no bulk-approve endpoint and no auto-confirm setting.

## Windows: use `npm.cmd`, not `npm`

PowerShell's execution policy blocks `npm.ps1`, so every plain `npm`
command fails with `UnauthorizedAccess`. `npm.cmd` bypasses the
PowerShell wrapper and works normally:

```bash
npm.cmd run ml:compare
```

PowerShell 5.1 also has no `&&` operator — put each command on its own
line rather than chaining them. Every script below is runnable from the
repo root precisely so no `cd` is needed.

## Getting started

```bash
npm.cmd install
```

```bash
npm.cmd run infra:up
```

```bash
npm.cmd run db:migrate
```

```bash
npm.cmd run db:seed
```

Create Firebase logins for the seeded staff — separate because it
creates real credentials in your Firebase project:

```bash
npm.cmd run db:seed:auth
```

Then run the backend and web app:

```bash
npm.cmd run dev
```

Sign in at http://localhost:3000. Only **MGM Hospital Blood Bank** is
seeded as VERIFIED, so only its staff can report usage and confirm
thresholds — the other nine are left UNVERIFIED on purpose, so the
admin approval flow is actually testable.

## Layout

| Path | What it is |
|---|---|
| `backend/` | Express API, Prisma, the threshold and request engines |
| `apps/web/` | Next.js — donor app (`/`), blood bank dashboard (`/dashboard`), admin (`/admin`) |
| `packages/` | Shared API client, validators, domain constants, design tokens |
| `ml-service/` | Python forecasting comparison (Phase 9, optional) |
| `infra/` | Docker Compose: PostGIS + Redis |

## Environment

Copy `.env.example` and fill in:

- `backend/.env` — database, Redis, service account path
- `apps/web/.env.local` — `NEXT_PUBLIC_FIREBASE_*`

`projectId` in the web config **must match** `backend/serviceAccountKey.json`.
Token verification checks the `aud` claim against the project id, so a
mismatch makes every real login fail with 401 while forged tokens are
still correctly rejected — which is a confusing way to find out.

The service account key is gitignored (`*serviceAccount*.json`) and has
never been committed — but keep it **outside the repository** and point
`GOOGLE_APPLICATION_CREDENTIALS` at an absolute path. A key inside the
project directory is one `zip -r` away from leaving with everything else.

In production `WEB_ORIGIN` is required: without it CORS would fall back
to allowing every origin, so the server refuses to start instead.

## Commands

| Command | Does |
|---|---|
| `npm.cmd run dev` | Backend + web |
| `npm.cmd test` | 263 backend tests |
| `npm.cmd run db:migrate` | Apply Prisma migrations |
| `npm.cmd run db:seed` | 10 Navi Mumbai blood banks, donors, 60 days of usage |
| `npm.cmd run db:seed:auth` | Firebase logins for the seeded staff |
| `npm.cmd run db:studio` | Browse the database |
| `npm.cmd run ml:compare` | Forecast models vs the shipping rolling average |
| `npm.cmd run ml:test` | ML fallback tests |
| `npm.cmd run infra:up` / `infra:down` | Postgres + Redis |

## Known gotchas

- **Stop the backend before `npm install` or `prisma generate`.** A
  running server holds the Prisma query-engine DLL open and both fail
  with `EPERM` on Windows.
- **`npm audit fix` corrupts the lockfile here.** It has dropped
  transitive dependencies twice. Bump versions explicitly instead.
- **Dependency overrides need a clean reinstall.** npm records the
  override but leaves the old tree in place; delete `node_modules` and
  `package-lock.json` for it to take effect.

## Status

Phases 0–8 complete. Donor onboarding, eligibility, institution
verification and self-registration, daily usage reporting, the threshold
engine, the full request pipeline, staged escalation, camps and
recurring patients all work end to end with tests.

The ML track is built and measured. On synthetic data, SARIMA and
Prophet beat the 28-day rolling average by roughly 4% — not enough to
justify running a Python service, so the rule-based path remains the
only one. `npm.cmd run ml:compare` reproduces that result and will say
something different if real pilot data disagrees.
