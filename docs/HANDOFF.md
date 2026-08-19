# Handoff

Everything a fresh session needs to continue this project without
re-deriving it. Read this first.

---

## What this is

**Raktasetu** (repo name `rednexus`). Blood banks collect in bursts at
donation drives; hospitals consume continuously. That mismatch — not a
shortage of willing donors — causes most shortages.

The platform measures what a blood bank actually issues per blood
group, turns that into a **minimum stock threshold** and a **recurring
weekly collection target**, and requires a named staff member to
approve both. Threshold-breach alerts are the safety net, not the
product.

Spec lives in `CLAUDE.md` (PRD + Architecture + Phases + Rules, all in
one file). It is authoritative and overrides assumptions.

---

## The one rule that governs everything

**Nothing the system decides reaches a donor without a named staff
member approving it.**

Enforced in three places, deliberately redundant:

| Layer | How |
|---|---|
| Schema | `confirmedThreshold` is null until confirmed — null *is* the gate |
| Service | `dispatch()` refuses any request not already at `RAISED` |
| State machine | `DETECTED → NOTIFIED` is not a legal transition |

There is **no bulk-approve endpoint and no auto-confirm setting**, and
adding one is forbidden (Rules §1) even for testing convenience. Use
seed fixtures instead.

Other hard rules: no donor↔patient contact channel · no payment or
reward mechanism · the app never declares medical fitness · donor
contact details only to a verified institution in the context of a
request they raised (F7) · rule-based fallback ships before ML and
stays working forever.

---

## Architecture

**"Approach B"**, chosen 2026-08-19:

```
Browser ──Firebase Auth──> Firebase        (identity only: who are you)
   │
   └──Bearer token──> Express ──Prisma──> PostgreSQL + PostGIS
                          │                (ALL domain data, ALL authority)
                          └──BullMQ──> Redis (escalation timers)
```

Firebase answers *who*. Postgres answers *what may you do* — role and
verification are read from the database on every request, never from a
token claim. Firestore is fully retired.

Auth chain: `verifyFirebaseToken` → `loadUser` → `requireRole` →
`requireVerifiedInstitution`.

---

## Status

**Phases 0–8 complete. 263 backend tests + 6 ML tests. 19 web routes.**

Built: donor onboarding & self-registration · eligibility (computed on
read, never stored) · institution application + admin verification ·
daily usage reporting (T1) · **threshold engine (T2–T4)** · request
pipeline with the 8-state machine and confirmation gate · donor
targeting filter chain · two-step donation screening (TTI before stock)
· staged escalation + notification budget · camps with QR registration
· recurring patients (N1) · admin panel · audit history · CI.

**ML (Phase 9) built and measured.** SARIMA beats the 28-day rolling
average by 4.2%, Prophet by 3.9%. Verdict: **keep the rule-based
path**. `npm.cmd run ml:compare` reproduces it.

### Not built

- **N5 SMS/IVR transport** — the channel chain, ordering, budget and
  fatigue rules are all real; only delivery is a stub (one function per
  channel in `notification.service.js`). Needs a paid gateway. **This is
  the only thing gating a real pilot.**
- N3 camp planning recommendation, N4 rare group registry, N6
  cross-centre dedup, settings screens
- Deployment (Phase 11). Nothing is hosted.

---

## Design system

Swiss grid + editorial typography + clinical restraint. Defined in
`packages/design-tokens/src/tokens.js` and enforced by
`apps/web/tailwind.config.js`, which **replaces** the Tailwind palette
and type scale rather than extending them — so an undefined class
silently does nothing. Check the tokens before inventing a value.

- **Instrument Serif** — display only
- **Inter** — interface and prose
- **IBM Plex Mono** — anything measured, labelled or identified. This is
  where the medical register comes from; lab reports are monospaced.
- One accent `#A4161A`, used **only** where blood is the subject.
  Primary buttons are solid ink, not red.
- Structure comes from hairline rules, not boxes or shadows.

Fully composed: `login`, `dashboard/index`, `dashboard/thresholds`,
donor `index`, both shells. The rest inherit the system through shared
primitives and look coherent but are not deliberately composed yet.

---

## Environment gotchas (all cost time at least once)

- **Windows: `npm.cmd`, never `npm`.** PowerShell's execution policy
  blocks `npm.ps1` — every plain `npm` fails with `UnauthorizedAccess`.
- **PowerShell 5.1 has no `&&`.** Every script runs from the repo root
  so no `cd` chaining is needed.
- **Stop the backend before `npm install` or `prisma generate`** — it
  holds the Prisma query-engine DLL open (`EPERM`).
- **`npm audit fix` corrupts this lockfile.** It has dropped transitive
  dependencies twice. Bump versions explicitly.
- **Dependency overrides need a clean reinstall** — npm records the
  override but leaves the old tree in place.
- **Turbo 2.x `envMode: strict`** — every env var a task needs must be
  declared in `turbo.json` or it is stripped. This broke CI once.
- **Integration tests share one database** — `fileParallelism: false`.
- **Next dev + a prior `next build` collide.** If a page hangs on a
  spinner, `rm -rf apps/web/.next` and restart.
- **CI lives at `.github/workflows/`**, not `infra/.github/` — GitHub
  never scans the latter, so a workflow there silently never runs.

---

## Running it

```bash
npm.cmd install
npm.cmd run infra:up
npm.cmd run db:migrate
npm.cmd run db:seed
npm.cmd run db:seed:auth
npm.cmd run dev
```

Sign in at http://localhost:3000. **Password for every seeded account:
`RaktasetuDev#2026`**

| Account | Surface |
|---|---|
| `anil.sharma@mgmblood.dummy.in` | Dashboard (MGM, VERIFIED) |
| `m.patil@fortisbb.dummy.in` | Dashboard, unverified state |
| `admin@raktasetu.dummy.in` | Admin panel |

Only MGM is seeded VERIFIED on purpose — it keeps the admin approval
flow testable.

Other commands: `npm.cmd test` (263 tests) · `npm.cmd run ml:compare` ·
`npm.cmd run db:studio` · `npm.cmd run worker --workspace=@rednexus/backend`

**Secrets:** `backend/serviceAccountKey.json`, `backend/.env`,
`apps/web/.env.local`. All gitignored and never committed. The web
`projectId` **must** match the service account's, or every real login
401s while forged tokens are still correctly rejected.

---

## Working agreements established with the user

- **Vertical slices, not horizontal layers.** The repo originally had
  26 mock endpoints and zero working paths; that was the failure mode
  to avoid.
- **Tests are written with the code**, not after.
- Rules §6 requires tests for: eligibility date maths, the targeting
  filter chain (each stage proven to exclude what it claims), and
  illegal state transitions.
- **Clicking through the UI finds what tests cannot** — it caught a
  dead-end redirect and missing radio `name` attributes, both with
  every test passing. Ask the user to click; it is the irreplaceable
  part.
- Commit messages explain *why*, at length. Follow the existing style.
- The user works on Windows/PowerShell. Give one command per fenced
  block, no `&&`, no `cd` chaining.

---

## Open decisions

1. **SMS gateway** (Twilio / MSG91 / Gupshup). PRD N5 wants alerts on
   feature phones, which points at SMS over push. Costs money.
2. **Hosting.** Suggested: Neon (Postgres) + Render/Railway (backend) +
   Vercel (web), all free tier. `WEB_ORIGIN` is **required** in
   production or the server refuses to boot.
3. **Delete the abandoned Firebase project `rednexus-984c2`** — its web
   API key is in git history. The current project is
   `rednexus-984c2-f075d`. Deleting neutralises the key without
   rewriting history.
4. Whether to keep committing to `main` or start branching for PRs.

---

## Security posture

A full audit was run and all 10 findings fixed (commit `870edf5`), with
15 regression tests. The two serious ones shared a root cause: donors
are a platform-wide pool, but the code treated "is verified staff" as
authority over *any* of them. Scoping now goes through
`donorScope.service.js` — an institution may only act on donors it has
actually dealt with.

Verified clean: no raw SQL anywhere (all Prisma, parameterized), no
stack traces leaked, pino redaction central, no secret ever committed,
role and verification server-set.
