# Raktasetu - Complete AI Agent Reference (CLAUDE.md)

This document serves as the master reference guide for the AI agent to build the Raktasetu project. It combines the Product Requirements Document (PRD), Architecture, Phases, and Development Rules.

---

# Product Requirements Document (PRD)
## Raktasetu — Consumption-Based Blood Supply Regularisation Platform

---

### 1. Overview
Blood banks primarily collect blood through organised donation drives. Between drives, almost no new blood comes in — but hospital consumption is continuous. This mismatch between **episodic collection** and **continuous consumption** is the actual cause of most shortages, not a shortage of willing donors. Raktasetu connects blood banks and hospitals so that the *rate* of blood collection is calibrated to the hospital's actual usage — converting donation from a drive-only event into a regular, ongoing supply — with a threshold-triggered, human-confirmed alert system as the backup for when supply still runs low.

### 2. Problem Statement
Blood banks collect blood mainly during organised donation drives, so supply is naturally lumpy — high right after a drive, declining until the next one. Hospitals consume blood continuously, regardless of drive schedules. When stock runs low between drives, blood banks resort to reactive, manual donor phone calls — a slow, hectic process. Raktasetu addresses the root cause: it calculates how much blood a hospital actually uses per blood group, and uses that to (a) set a sensible minimum stock threshold per blood group, and (b) establish a regular, ongoing collection target — so blood donation becomes a steady, scheduled activity rather than something that only happens at drives. A threshold-breach alert, always confirmed by a blood bank employee before donors are contacted, remains as the safety net.

### 3. Goals
- **Convert episodic, drive-only collection into a steady, consumption-calibrated supply** — this is the primary goal, not a secondary feature.
- Give every blood group at a blood bank a **minimum stock threshold**, derived from real usage data and confirmed by blood bank staff.
- Reduce reliance on reactive, manual, "call around until someone answers" donor outreach.
- Keep a **human being in the loop at every point where a donor notification is triggered by the system** — no fully automated dispatch.
- Reduce the time between "stock running low" and "donor confirmed," for the cases where a threshold alert is still needed.
- Give recurring-transfusion patients a standing, rotating donor pool (a specialised case layered on top of the core mechanism).

### 4. Non-Goals (explicitly out of scope)
- No blood inventory/logistics management across multiple blood banks — this platform coordinates **people and collection scheduling**, not blood unit transport.
- No payment or incentive-for-donation mechanism — paid blood donation is illegal in India.
- No direct donor–patient/family contact. All requests are institution-mediated (F7).
- No medical fitness determination inside the app, and **no collection of detailed medical or sexual-health history at registration.** The real hospital donor questionnaire dedicates most of its length to exactly this (disease history, TTI risk screening, day-of-donation checks) — all of it stays a paper/in-person process handled by blood bank staff and a doctor at the time of actual donation. The app asks only the handful of fields that affect how the system itself behaves (see F1) — it is not a digitisation of the full screening form.
- **The system never decides a threshold or sends a donor notification without explicit human confirmation.** This is a hard constraint, restated here because it governs the entire product, not just one feature (see also Rules.md and Regulatory Constraints below).

### 5. Target Users / Personas

| Persona | Description | Primary need |
|---|---|---|
| **Donor** | Registered voluntary blood donor | Be contacted only when relevant, control frequency, see own donation history |
| **Blood Bank Staff** (in-house or external) | One role, one login, covering the full loop: reports daily usage, confirms thresholds, approves outbound alerts, posts camps | Minimal-effort usage reporting, realistic thresholds from real data, stay in control of every alert sent in their name |
| **Platform Admin** | Approves which blood banks join the platform | A quick, low-friction way to verify a new blood bank's legitimacy before they can operate on the system |
| **Recurring Patient** (registered via a blood bank) | Thalassemia/dialysis/chemo patient with a fixed transfusion schedule | Guaranteed donor coverage arranged in advance |

**Note:** "Institution" is modelled as a single type — `BLOOD_BANK` — with a `category` of `IN_HOUSE` (embedded within, and primarily serving, one specific hospital) or `EXTERNAL` (standalone, serving multiple hospitals and walk-in requests). Both categories report usage and confirm thresholds the same way — the category is context (which hospital(s) they serve), not a different role. There is no separate "Hospital" institution type with its own reporting responsibility: usage data comes from wherever blood is actually issued, and that's always the blood bank, in-house or otherwise.

---


### 5.1 Express App Role & Route Blueprint
Based on the provided specifications, the Node.js/Express backend will support the following feature sets for each entity:

**User (donor/receiver)**
* Auth: login/signup (flag users with thalassemia, etc.)
* Bloodbanks filtered
* Donation registration form (DB + google sheet)
* Calendar (monthly camps/drives)
* Blood availability
* Notification
* Requesting an on-demand donation

**Blood banks/hospitals**
* Auth: login/signup
* Stock tracking
* Stock updation
* On-demand blood donation request
* Handling requests for on-demand donation

**Admin**
* All users' stats, all blood banks' stats, overall trends and pattern, data visualization

### 6. Core Features (build in this order — see Phases.md)

**Layer 1 — Foundation (unchanged from earlier design, still correct)**

| ID | Feature | Description |
|---|---|---|
| F1 | QR-based donor registration | Camp QR → registration form → donor record created. Fields: name, gender, date of birth, blood group (self-reported), phone number, area/pincode, donated before + date of last donation if yes, donation type (Voluntary / Replacement — with patient name if Replacement), "ever advised not to donate blood before?" (yes/no), consent. This matches the essential fields on a real hospital donor questionnaire, minus the full medical/sexual-health screening section — that stays an in-person process at the blood bank at the time of actual donation, not something asked at app registration (see Non-Goals). |
| F10 | Camp directory | Blood bank posts an upcoming camp (date, location, notes); donor app shows nearby upcoming camps with an optional "I'll attend" tap. Distinct from N3 (which *recommends* where/when a blood bank should hold a camp) — F10 is just the basic listing/visibility layer, and is much simpler to build. |

**If "ever advised not to donate blood before?" = Yes:** the donor record is created with status `PENDING_REVIEW` instead of being auto-activated into the targeting pool. A blood bank staff member reviews and clears it before the donor becomes eligible for notification. The app never tries to interpret the medical reason itself — it just routes the person to a human, mirroring how the real donor questionnaire flags this exact question for a doctor to discuss rather than self-certify.
| F2 | Eligibility engine | Computed field: `last_donation_date + interval <= today`. 90 days male / 120 days female. **Overridable**: if blood bank staff set a `deferral_until_date` on a donor's record — e.g. after an in-person medical deferral during an actual donation visit — that date takes precedence over the standard interval calculation until it passes. |
| F7 | Institution-mediated requests only | Only verified institutions can trigger donor-facing communication; donor contact info is never exposed to patients or families |
| F3 | Donor preference profile | Contact frequency cap, notification channel, availability window, preferred centre(s), pause mode |

**Layer 2 — Consumption & Threshold (NEW — this is the actual core of the product)**

| ID | Feature | Description |
|---|---|---|
| T1 | Usage data ingestion | Blood banks — in-house or external — report units issued per blood group, **daily**. This is the platform's primary data feed, since the blood bank is the party actually dispensing units and holds the real record. |
| T2 | Threshold proposal | System computes a suggested minimum stock threshold per blood group from historical usage (starts as a simple rolling average — see F6 for the later ML upgrade path) |
| T3 | **Threshold confirmation (human-in-the-loop)** | Blood bank staff reviews, edits if needed, and explicitly confirms every proposed threshold before it becomes active. A threshold is never auto-activated. |
| T4 | Recurring collection target | System computes an ongoing, regular collection target per blood group (e.g. "we need ~20 units of O+ per week") from the confirmed threshold and consumption rate — this is what actually replaces "wait for the next drive" |
| T5 | Threshold breach detection → draft alert | When current stock for a blood group falls to or below its confirmed threshold, the system **drafts** an alert. It does not send it. |

**Layer 3 — Confirmed Dispatch & Donor Mobilisation (mostly reused from earlier design)**

| ID | Feature | Description |
|---|---|---|
| F7-confirm | **Human confirmation gate** | A drafted alert (from T5, or a scheduled collection batch from T4) sits in a `DETECTED` state. A blood bank employee must explicitly confirm it before it becomes an active request that donors ever see. |
| F4 | Targeted notification | Once confirmed: filter by blood group → eligibility → donor preference → rank → notify the smallest sufficient set. **Unchanged from earlier design — fully reused.** |
| F5 | Staged escalation | Notify a small ranked batch first; widen only if unmet after a wait window. **Unchanged — fully reused.** |
| F8 | Digital donor record | Donation history, blood group (self-reported vs verified), Hb trend, screening status |
| F9 | Auto eligibility reminder | Notify a donor automatically on the day they become eligible again |

**How the two trigger types relate:** every request that ever reaches a donor originates from one of three `origin` types — `SCHEDULED` (from the recurring collection target, T4), `THRESHOLD_BREACH` (from T5), or `MANUAL` (a blood bank employee raises one directly, for a true unplanned emergency). All three converge into the same confirmed request pipeline (F4/F5) once a human has approved them. The *scheduled* origin is expected to be the common case; threshold-breach and manual are the safety net, not the primary mechanism.

---

### 7. Differentiator Features (post-MVP, in priority order)

| ID | Feature | Description |
|---|---|---|
| N1 | Recurring patient module | A specialised case layered on top of the core mechanism: hospital registers a specific patient's transfusion schedule (e.g. thalassemia); system arranges a rotating donor buddy pool 5–7 days ahead of each transfusion |
| F6 | ML-upgraded threshold/target computation & response scoring | Once enough data exists: replace T2/T4's rolling-average calculation with a proper time-series forecast (Prophet/SARIMA), and rank donors by response probability instead of the rule-based fallback. **The rule-based version always remains available and is never a hard dependency.** |
| N3 | Camp planning recommendation | Now much more concrete: since T4 produces an actual number ("40 units of O+ needed this month"), recommend where/when to hold a camp to hit that number |
| N4 | Rare blood group registry | Wider search radius and priority handling for rare groups |
| N5 | SMS/IVR fallback | Alerts work on feature phones |
| N6 | Cross-centre deduplication | Prevent duplicate alerts to donors registered at multiple institutions |

---

### 8. Success Metrics
- **% of blood-group/months where the recurring collection target was met without a threshold-breach alert being needed** — this is the metric that actually measures whether the core idea worked (episodic → steady supply).
- Notifications sent per successful donation (targeting efficiency)
- Donor response rate (%)
- Time from confirmed request → donor secured, for threshold-breach and manual cases
- Donor 6-month retention / opt-out rate
- % of recurring-patient transfusions with donors arranged before the day of need

### 9. Regulatory / Ethical Constraints (hard requirements)
- DPDP Act 2023: explicit consent at registration, purpose limitation, donor-initiated deletion.
- No payment or reward mechanism anywhere in the product.
- Donor contact details are never shown to patients or families — only to the verified institution coordinating the request.
- Final medical fitness is always confirmed by blood bank staff, never the app.
- **No threshold, and no donor-facing alert of any kind, is ever activated or dispatched without an explicit confirming action from a named blood bank staff member.** This applies equally to system-proposed thresholds (T3), threshold-breach drafts (T5), and scheduled collection batches (T4). This is the platform's core trust mechanism and is not configurable.

### 10. Key Risks
- **Usage data quality/reporting consistency is now the platform's most critical dependency.** Reporting is expected **daily** — if blood banks (in-house or external) miss days, threshold and target computations degrade. Mitigate with a staleness/confidence indicator, a simple daily reminder to staff, and allow blood bank staff to manually set or override a threshold if usage data is thin — never block on missing data. A daily reporting cadence also means the reporting UI must be genuinely fast (see Design.md) — if it takes more than a minute, staff will stop doing it consistently, which quietly breaks the whole mechanism.
- **Cold start for both usage data and donor interaction data.** T2/T4 start as simple rolling averages (not ML) specifically so the product works from day one with minimal data; F6's ML upgrade is optional and additive.
- **Human confirmation must never become a rubber-stamp bottleneck.** If confirming a threshold or alert is slow or confusing, staff will stop doing it carefully, which defeats the purpose of the human-in-the-loop design. The confirmation UI needs to be fast and clear (see Design.md).
- Donor fatigue if the preference cap (F3) or staged escalation (F5) are not correctly enforced.


---

# Architecture.md
## Raktasetu — System Architecture & Pipelines

---

## 1. High-Level Architecture

```
┌───────────────────────────────────────────────────────────┐
│ CLIENT LAYER — donors, blood banks, platform admin           │
│  • Donor app          (React (Web App))                   │
│  • Blood bank dashboard (React + JavaScript — usage           │
│                           reporting, threshold confirmation,   │
│                           alert approval, camp posting; one    │
│                           dashboard, one role, used by both    │
│                           in-house and external blood banks)   │
│  • Admin panel          (React + JavaScript — platform-level   │
│                           institution verification/approval;    │
│                           separate from blood bank staff, who   │
│                           only manage their own institution)    │
└───────────────────────────┬───────────────────────────────┘
                             │
┌───────────────────────────▼───────────────────────────────┐
│ BACKEND SERVICES — Node.js & Express, behind an API gateway            │
│  • Core API             (auth, donor, institution CRUD)      │
│  • Threshold Engine       (T1-T5: usage ingestion, threshold │
│                            proposal, confirmation gate,       │
│                            recurring target, breach detection)│
│  • Notification Engine    (F4 targeting, F5 escalation,       │
│                            budget enforcement, channel chain) │
│  • ML Services            (F6: response scoring + upgraded    │
│                            threshold/target forecasting —      │
│                            isolated, retrain/redeploy          │
│                            independently)                      │
└───────────────────────────┬───────────────────────────────┘
                             │
┌───────────────────────────▼───────────────────────────────┐
│ DATA & INFRA                                                 │
│  • PostgreSQL + PostGIS (donor, institution, usage, threshold,│
│                           request, geo data)                  │
│  • Redis + Celery        (reminders, escalation timers,       │
│                           scheduled threshold recompute jobs)  │
└──────┬────────────────────────────────────────┬────────────┘
       │                                         │
┌──────▼─────────────────┐          ┌────────────▼───────────┐
│ FCM + SMS/IVR gateway    │          │ e-RaktKosh scraper       │
│ (outbound, sequential    │          │ (optional supplementary  │
│  escalation chain)       │          │  ingestion — the blood    │
│                           │          │  bank's own reported      │
│                           │          │  usage data (T1) is the   │
│                           │          │  primary source, not this │
│                           │          │  scraper)                 │
└───────────────────────────┘          └─────────────────────────┘
```

**What changed from the previous version:** the e-RaktKosh scraper is now a *secondary, optional* data source. The primary data feeding the Threshold Engine is **T1 — usage data the blood bank itself reports** (in-house or external), since the blood bank is the party actually issuing units and holds the real record. The scraper can still supplement this (e.g. cross-checking regional stock levels) but the core loop does not depend on it.

---

## 2. The Pipelines

### Pipeline 1 — Donor Onboarding & Eligibility
Unchanged from earlier design.

```
QR scan at camp
   → Registration submitted (name, gender, date of birth, blood group
      [self-reported], phone, area/pincode, donated before + date of last
      donation if yes, donation type [Voluntary / Replacement + patient
      name if Replacement], "ever advised not to donate before?", consent)
   → If "ever advised not to donate?" = Yes → status = PENDING_REVIEW,
      held for blood bank staff review before entering the targeting pool
   → Else: Verification (OTP + blood bank confirms first donation)
      — if no first donation yet: status = PROVISIONAL
   → Eligibility clock starts (90 days male / 120 days female —
      OR deferral_until_date if a blood bank staff member has set one,
      which always takes precedence over the standard interval)
   → Eligibility reminder sent automatically on eligible date
   → Donor available for targeting (F4)
   → [on next donation recorded] → eligibility clock RESETS → loop repeats
      (deferral_until_date, if still in the future, continues to override
      the reset standard interval)
```

### Pipeline 2 — Usage Tracking & Threshold Management (NEW — this is now the core loop)

```
Blood bank reports usage (T1) — in-house or external, DAILY
   (units issued per blood group, once a day — via dashboard form
    or simple upload; this is the platform's most important data feed)
   → System computes rolling average consumption rate per blood group
   → System proposes:
        - a minimum stock threshold (T2)
        - a recurring collection target (T4)
   → Blood bank staff reviews and CONFIRMS (T3) — mandatory, no auto-activation
      — staff may edit the proposed numbers before confirming
   → Confirmed threshold + target become active
   → [ongoing, scheduled job] Current stock checked against confirmed threshold
        - stock at or below threshold for a blood group
             → draft alert created, state = DETECTED, origin = THRESHOLD_BREACH
        - recurring target not on pace to be met this period
             → draft collection batch created, state = DETECTED, origin = SCHEDULED
   → Both draft types wait for human confirmation (see Pipeline 3)
```

**This pipeline runs continuously and is what most of the product's day-to-day value comes from.** The Notification Engine (Pipeline 3) is only ever invoked once something from here — or a manual raise — has been confirmed by a human.

### Pipeline 3 — Confirmed Request & Notification (mostly reused from earlier design)

```
A request enters this pipeline one of three ways:
   - origin = SCHEDULED        (from Pipeline 2's recurring target, confirmed)
   - origin = THRESHOLD_BREACH (from Pipeline 2's breach detection, confirmed)
   - origin = MANUAL           (blood bank staff raises one directly — true
                                  unplanned emergency, expected to be the
                                  least common case)

DETECTED (system-proposed, if origin is SCHEDULED or THRESHOLD_BREACH)
   → Blood bank staff confirms → state = RAISED
   [MANUAL origin starts directly at RAISED — a human raised it themselves]

RAISED
   → Filter: matching blood group
   → Filter: eligibility (Pipeline 1 status)
   → Filter: donor preference (F3) + notification budget not exceeded
   → Rank donors: ML score (F6) if enough data, else rule-based fallback
   → Stage 1: notify top N ranked donors → state = NOTIFIED
   → Wait window
   → Check responses:
        - sufficient → state = ACCEPTED → confirm donors → state = CONFIRMED
        - insufficient → Stage 2: widen radius/pool → repeat
        - still insufficient → Stage 3: full eligible pool, marked urgent
   → Donor arrives → state = ARRIVED → donates → state = DONATED
   → Requirement met → state = CLOSED
      → auto "thank you, requirement met" message to donors who accepted
        beyond what was needed
```

**Extended request state machine:**
`DETECTED → RAISED → NOTIFIED → ACCEPTED → CONFIRMED → ARRIVED → DONATED → CLOSED`

`DETECTED` is skipped only for `origin = MANUAL`, since a human already initiated it. For `SCHEDULED` and `THRESHOLD_BREACH` origins, `DETECTED → RAISED` is the mandatory human confirmation gate and can never be automated away, regardless of how much interaction/response data the system has accumulated.

### Pipeline 4 — Recurring Patient Scheduling (N1 — specialised case, unchanged)

```
Patient/hospital registers transfusion schedule
   → Next transfusion date computed
   → Donor buddy pool arranged, 5–7 days in advance
   → Confirmation sent to patient and blood bank
   → Early escalation if pool is short, while time remains
   → Transfusion day: coverage confirmed
```

This sits alongside Pipeline 2/3 as a specialised, patient-specific version of the same underlying idea (predictable need → proactive arrangement), rather than being the platform's primary mechanism.

### Pipeline 5 — ML Training Loop (F6 — upgrades both threshold computation and donor ranking)

```
Log interaction data:
   - notification sent + response outcome (for donor ranking)
   - usage reports + threshold accuracy over time (for T2/T4 forecasting)
   → Feature engineering
   → Retrain response-scoring model (scikit-learn) and
     threshold/target forecasting model (Prophet/SARIMA, replacing the
     rolling-average calculation in Pipeline 2)
   → Redeploy to Notification Engine and Threshold Engine
   → New predictions logged as more interaction data → feeds next retrain
```

**Both the rolling-average threshold calculation (Pipeline 2) and the rule-based donor ranking (Pipeline 3) remain fully functional without this pipeline.** ML is strictly an upgrade to both, never a dependency for either to work.

### Pipeline 6 — Dev / CI-CD
Unchanged.

```
Code pushed to GitHub → CI: lint & test → Build Docker images →
Deploy to staging → Verify & demo → Deploy to pilot/production
```

---

## 3. Cross-Cutting Concerns

- **Institution verification**: unchanged — a prerequisite for any institution action, whether raising a request or confirming a threshold.
- **Consent & audit layer**: unchanged, extended to cover usage-data reporting (blood banks) alongside donor consent.
- **Notification budget enforcement**: unchanged, checked before dispatch inside the Notification Engine.
- **Human confirmation audit trail**: every `DETECTED → RAISED` transition and every threshold confirmation (T3) must record *who* confirmed it and *when*. This is the evidence that the human-in-the-loop guarantee is real, not just a UI label.

---

## 4. Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Donor app | React (Web App) | No install required for QR-based camp signup |
| Blood bank dashboard | React + JavaScript | One dashboard, one role, used by both in-house and external blood banks: usage reporting (T1), threshold confirmation (T3), alert approval, and camp posting (F10). The confirmation/approval screens are the highest-stakes UI in the product and should be designed for speed and clarity |
| Admin panel | React + JavaScript | Platform-level: institution verification/approval only. Separate surface from the blood bank dashboard — an admin approves *which* blood banks exist on the platform; a blood bank's own Confirming Officer approves *that institution's* thresholds and alerts. Different scope, different login |
| Backend core | Node.js & Express | Auth, donor/institution CRUD |
| Threshold engine | Node.js & Express service, Redis-scheduled (e.g., BullMQ) | T1-T5 — usage ingestion, threshold proposal, breach detection |
| Notification engine | Node.js & Express service, Redis-scheduled (e.g., BullMQ) | F4/F5 — targeting, staged escalation, channel sequencing |
| ML services | scikit-learn (F6 response scoring), Prophet/SARIMA (T2/T4 forecasting upgrade) | Isolated service, independent retrain/redeploy |
| Database | PostgreSQL + PostGIS | Donor, institution, usage, threshold, request, geo data |
| Cache / queues | Redis + Celery | Reminders, escalation timers, scheduled threshold recompute |
| Notification delivery | FCM (push) + SMS gateway + IVR | Sequential fallback chain |
| Ingestion (secondary) | e-RaktKosh scraper | Supplementary only — T1 blood-bank-reported data is primary |
| Deployment | Docker + Docker Compose | Staging and pilot environments |
| CI/CD | GitHub Actions | Lint, test, build images |

---

## 5. Proposed Repository Structure

```text
RedNexus/
├── apps/
│   ├── mobile/               # (Note: Present in image, but you are focusing on web)
│   │   ├── src/
│   │   │   ├── components/
│   │   │   └── screens/
│   │   └── package.json
│   └── web/                  # React Web App
│       ├── src/
│       │   ├── components/
│       │   └── views/
│       └── package.json
├── backend/                  # Node.js & Express API
├── infra/
│   ├── .github/workflows/
│   └── docker-compose.yml
├── ingestion/
├── ml-service/
├── packages/
│   ├── api/
│   │   ├── src/
│   │   │   ├── donor.js
│   │   │   ├── notification.js
│   │   │   ├── threshold.js
│   │   │   └── usage.js
│   │   └── package.json
│   ├── design-tokens/
│   │   ├── src/
│   │   │   └── tokens.js
│   │   └── package.json
│   ├── store/
│   │   ├── src/
│   │   │   └── useUserStore.js
│   │   └── package.json
│   ├── types/
│   │   ├── src/
│   │   └── package.json
│   ├── utils/
│   │   ├── src/
│   │   │   ├── formatters.js
│   │   │   └── validators.js
│   │   └── package.json
│   └── validators/
│       ├── src/
│       │   ├── donor.js
│       │   └── threshold.js
│       └── package.json
├── package.json
├── README.md
└── turbo.json
```

---

## 6. Core Data Entities (overview)

- **Donor**: id, name, gender, date_of_birth, blood_group_self_reported, blood_group_verified, contact, area_pincode, last_donation_date, donation_type (`VOLUNTARY` | `REPLACEMENT`), patient_name (nullable, set only when donation_type = `REPLACEMENT`), advised_not_to_donate_flag (boolean, from registration), status (`PROVISIONAL` | `PENDING_REVIEW` | `ACTIVE`), deferral_until_date (nullable — staff-set override; when present and in the future, takes precedence over the standard eligibility interval), eligibility_status (computed, respects deferral_until_date if set), preference profile (F3), consent metadata
- **User** *(new)* — staff/admin logins, distinct from Donor: id, name, contact, role (`BLOOD_BANK_STAFF` | `PLATFORM_ADMIN`), institution_id (set for `BLOOD_BANK_STAFF`, null for `PLATFORM_ADMIN`). One role covers everything a blood bank does on the platform — usage reporting, threshold confirmation, alert approval, camp posting — matching the PRD's persona description. Every verified blood bank must have at least one `BLOOD_BANK_STAFF` user, enforced at institution verification time.
- **Institution**: id, name, type (`BLOOD_BANK` — single type), category (`IN_HOUSE` | `EXTERNAL`), linked_hospital_name (free text, set only for `IN_HOUSE` — the hospital this blood bank is embedded in, for display/context only, not a separate login or reporting role), verification_status, location
- **UsageRecord** *(new)*: id, blood_bank_institution_id, blood_group, units_issued, date
- **BloodGroupThreshold** *(new)*: id, blood_bank_institution_id, blood_group, proposed_threshold, confirmed_threshold, recurring_collection_target, confirmed_by (User id, must have role `BLOOD_BANK_STAFF` with matching institution_id), confirmed_at
- **Request**: id, institution_id, blood_group, units_needed, urgency, **origin** (`SCHEDULED` | `THRESHOLD_BREACH` | `MANUAL`), **state** (`DETECTED → RAISED → NOTIFIED → ACCEPTED → CONFIRMED → ARRIVED → DONATED → CLOSED`), created_at, confirmed_by (User id, must have role `BLOOD_BANK_STAFF` with matching institution_id), confirmed_at
- **RecurringSchedule**: id, patient_ref (anonymised), institution_id, transfusion_frequency, next_due_date, buddy_pool (donor ids)
- **DonationRecord**: id, donor_id, date, institution_id, request_id (nullable)
- **NotificationLog**: id, donor_id, request_id, channel, sent_at, response, response_time
- **Camp** *(new)*: id, blood_bank_institution_id, date, location, notes, created_by (User id)


---

# Phases.md
## Raktasetu — Build Phases

Each phase has a goal and a "done when" condition. Do not start a phase until the previous one's "done when" is met.

**Note on reordering:** the threshold/usage mechanism (Phase 4 below) is now built *before* the full notification pipeline is fleshed out, because it is the platform's actual core idea — converting episodic collection into steady, consumption-calibrated supply. The notification pipeline (Phase 5) still matters, but it is now the *dispatch mechanism* for something the threshold engine decides is needed, not the product's starting point.

---

### Phase 0 — Scaffolding
**Goal:** repo and infra skeleton exist, nothing functional yet.
- Create repository structure (see Architecture.md §5)
- Docker Compose skeleton: backend, PostgreSQL+PostGIS, Redis, frontend-dashboard(s)
- GitHub Actions: lint + test stub
- Base Express app with a health-check endpoint

**Done when:** `docker compose up` runs cleanly and the health-check endpoint responds.

---

### Phase 1 — Donor Onboarding & Data Models
**Goal:** a donor can register via the camp QR flow and land in the database.
- Core data models: Donor (full field set — see Architecture.md §6), Institution (type `BLOOD_BANK`, category `IN_HOUSE`/`EXTERNAL`), DonationRecord
- QR-triggered registration form (F1): name, gender, date of birth, blood group, phone, area/pincode, donation history, donation type (Voluntary/Replacement), "ever advised not to donate?"
- If "ever advised not to donate?" = Yes → status = `PENDING_REVIEW` instead of auto-activating
- OTP verification, first-donation confirmation → status `PROVISIONAL` to `ACTIVE`

**Done when:** a test donor can be registered end-to-end and appears correctly in the database, and a donor who answers Yes to the advised-not-to-donate question lands in `PENDING_REVIEW`, not `ACTIVE`.

---

### Phase 2 — Eligibility Engine
**Goal:** the system always knows, correctly, whether a donor is currently eligible.
- Eligibility as a computed field (F2)
- **Deferral override**: `deferral_until_date` field, settable by blood bank staff, takes precedence over the standard interval when present and in the future
- Eligibility reminder scheduled via Celery (F9)
- Eligibility reset confirmed on new DonationRecord

**Done when:** tests confirm correct eligibility status across edge cases, including a donor with a future `deferral_until_date` correctly showing as ineligible even after their standard 90/120-day interval has passed.

---

### Phase 3 — Institution Verification & Usage Reporting
**Goal:** verified blood banks — in-house or external — can report usage data, which feeds the threshold engine in Phase 4.
- Institution registration + admin-approval flow, with `category` distinction (`IN_HOUSE` / `EXTERNAL`) — single institution type, `BLOOD_BANK`
- **User model with roles**: `BLOOD_BANK_STAFF`, `PLATFORM_ADMIN`. One role covers everything a blood bank does — usage reporting, threshold confirmation, alert approval, camp posting. Enforce at verification time that a blood bank cannot go live without at least one `BLOOD_BANK_STAFF` account.
- Separate admin panel (frontend-admin) for `PLATFORM_ADMIN` institution approval — distinct login and surface from the blood bank dashboard
- Blood bank dashboard: usage reporting form/upload (T1) — units issued per blood group, reported **daily**
- UsageRecord model + endpoint

**Done when:** a verified blood bank (either category) can submit a usage record and it's stored correctly; an unverified institution cannot; a blood bank verification cannot complete without a `BLOOD_BANK_STAFF` user assigned.

---

### Phase 4 — Threshold Engine (T2–T4 — THE CORE MECHANISM)
**Goal:** the platform turns usage data into a confirmed threshold and a recurring collection target.
- Rolling-average consumption calculation per blood group, per blood bank — computed over a trailing window of **daily** usage records (e.g. trailing 14 or 28 days; pick a window long enough to smooth day-to-day noise but short enough to stay responsive — worth tuning once real data comes in) (rule-based, no ML yet — matches the fallback-first principle in Rules.md)
- Threshold proposal (T2) generated from that calculation
- **Threshold confirmation UI (T3)**: blood bank staff can view, edit, and confirm a proposed threshold. No threshold is active until confirmed.
- Recurring collection target (T4) computed alongside the threshold
- BloodGroupThreshold model + confirmation audit trail (who confirmed, when)

**Done when:** given synthetic usage data, the system proposes a sensible threshold and target, and a threshold cannot become active without an explicit confirm action recorded against a staff user.

---

### Phase 5 — Confirmed Request & Notification Pipeline (T5 + F4 + F7 confirmation gate)
**Goal:** a confirmed threshold breach or scheduled target produces a draft, a human confirms it, and eligible donors get notified — rule-based ranking only, no ML yet.
- Threshold breach detection (T5): scheduled job checks current stock against confirmed threshold → creates a `DETECTED` request with `origin = THRESHOLD_BREACH`
- Scheduled collection batch: when a recurring target isn't on pace → creates a `DETECTED` request with `origin = SCHEDULED`
- Manual raise still supported: a `BLOOD_BANK_STAFF` user can create a request directly with `origin = MANUAL`, entering straight at `RAISED`
- **Confirmation gate**: `DETECTED → RAISED` requires an explicit action from a `BLOOD_BANK_STAFF` user at that institution, role-checked — build this as a fast, clear approval UI (see Design.md), since this is the most important human checkpoint in the product
- Request state machine fully implemented: `DETECTED → RAISED → NOTIFIED → ACCEPTED → CONFIRMED → ARRIVED → DONATED → CLOSED`
- Filter chain: blood group → eligibility → donor preference (basic) → budget check
- Rule-based ranking: distance + eligibility + preference
- F7 enforcement: donor contact never exposed to non-institution callers

**Done when:** a simulated threshold breach produces a `DETECTED` request that does *not* notify anyone until a test user explicitly confirms it, after which the full cycle (notify → accept → confirm → close) works end-to-end.

---

### Phase 6 — Staged Escalation, Preferences, Notification Budget (F3, F5)
**Goal:** notification is fatigue-aware, not a single blast.
- Donor preference profile (F3)
- Notification budget enforcement, checked before dispatch
- Staged escalation (F5): Stage 1 → wait → Stage 2 → Stage 3
- Auto "requirement met" message for over-response

**Done when:** a simulated under-response triggers escalation correctly, and a donor with a monthly cap isn't double-notified within the same month in a test.

---

### Phase 7 — Digital Donor Record (F8)
**Goal:** donors have a reason to keep using the app between requests.
- Donation history, Hb trend, blood_group_verified vs self_reported display

**Done when:** a donor with 3+ donations sees an accurate history and trend.

---

### Phase 8 — Recurring Patient Module (N1 — specialised layer)
**Goal:** predictable per-patient transfusion need is handled proactively.
- Patient/hospital registers a transfusion schedule
- Buddy pool assembled 5–7 days in advance
- Early escalation if pool is short

**Done when:** a simulated recurring schedule produces a correctly timed buddy-pool arrangement.

---

### Phase 9 — ML Upgrade Layer (F6)
**Goal:** both threshold/target computation and donor ranking improve on their rule-based versions, without ever removing them.
- Interaction logging (should start as early as Phase 5, not wait for this phase)
- Response-scoring model (donor ranking) — Notification Engine falls back automatically on failure or insufficient data
- Threshold/target forecasting model (Prophet/SARIMA), replacing the rolling-average calculation from Phase 4 when enough usage history exists

**Done when:** both ML paths provably fall back to their rule-based equivalents when data is insufficient (test both paths explicitly).

---

### Phase 10 — Remaining Features & Polish
**Goal:** round out the differentiators that don't block the core loop.
- F10: camp directory — blood bank posts a camp, donor app lists nearby upcoming camps
- N3: camp planning recommendation (now driven by T4's concrete numbers)
- N4: rare blood group registry
- N5: SMS/IVR fallback fully wired
- N6: cross-centre deduplication
- Consent & audit layer finalised, including the human-confirmation audit trail from Phase 4/5

**Done when:** each feature has a working demo path.

---

### Phase 11 — Pilot Deployment
**Goal:** a real (or near-real) pilot with one hospital + one blood bank partner.
- Deploy via CI/CD pipeline
- Manual verification pass against every prior phase's "done when"
- Begin collecting real usage and interaction data to feed Phase 9's training loop going forward

**Done when:** the pilot blood bank can report usage, confirm a threshold, and approve a resulting alert, and the full cycle completes without manual intervention outside the intended confirmation steps.


---

# Rules.md
## Boundaries for AI-assisted development on Raktasetu

---

## 1. Non-negotiable product rules (never implement around these)

- **Never build a direct donor-to-patient/family contact channel.** All requests are institution-mediated (F7). This is the platform's core trust guarantee — do not add a "contact donor directly" feature even if a task description seems to imply it. If a task seems to require it, flag it instead of building it.
- **Never add a payment, reward, or donation-incentive mechanism.** Paid blood donation is illegal in India. This includes referral bonuses, points redeemable for value, or anything resembling compensation.
- **Never let the app declare final medical fitness to donate.** The app tracks self-reported and blood-bank-confirmed eligibility status only. Any "fit to donate" determination happens at the blood bank, not in code.
- **Never expose donor phone numbers or exact addresses to a patient, family member, or any unverified party.** Only verified institutions may view donor contact details, and only in the context of a request they raised.
- **Never fabricate a bulk e-RaktKosh API.** No such public bulk API/download exists — it's a search-form web interface. Any e-RaktKosh integration must be built as a documented scheduled scraper against the public search pages, not assumed as a REST API. Note: e-RaktKosh is now a secondary/optional data source only — usage data reported by blood banks themselves (T1, in-house or external) is the primary feed for the threshold engine.
- **Never let a system-proposed threshold (T2) or a system-detected alert (T5, or a scheduled batch from T4) reach a donor without an explicit confirmation action from a `BLOOD_BANK_STAFF` user at that institution.** This is the platform's core trust mechanism, not a configurable setting or a "trusted after N successful cycles" auto-approval. Every `DETECTED → RAISED` transition and every threshold confirmation must be recorded with who confirmed it and when. Do not build an "auto-confirm" mode, a bulk-approve-without-review shortcut, or a setting that disables this gate, even if requested for convenience during testing — use seed/fixture data with a pre-confirmed test `BLOOD_BANK_STAFF` account instead.

## 2. Architecture rules

- **The rule-based fallback ships before the ML model, for every ML-touched feature (F6, N2).** Never make a feature dependent on the ML service being trained or available — the fallback must always be a complete, working path on its own.
- **Notification channels are sequential, not parallel.** Push → wait → SMS → wait → IVR. Never fire all channels for the same alert simultaneously.
- **Every request-state-affecting endpoint must move the request through the defined state machine explicitly** (`RAISED → NOTIFIED → ACCEPTED → CONFIRMED → ARRIVED → DONATED → CLOSED`). No endpoint should silently mutate request status outside this machine.
- **Institution verification cannot be bypassed**, including in development. Use seed/fixture data for testing unverified-vs-verified scenarios — do not add a debug flag that skips verification in any environment that could ship.
- **Notification budget checks happen inside the Notification Engine, before dispatch** — not scattered across unrelated application code.
- **Eligibility is a computed field, not a stored/scheduled timer**, except for the reminder itself (which is legitimately scheduled via Celery). Don't build a running per-donor timer job for eligibility status — compute it on read.
- **Keep `blood_group_self_reported` and `blood_group_verified` as separate fields.** Never merge them into one column or silently prefer one over the other without ranking logic explicitly accounting for the difference.

## 3. Tech stack constraints

| Layer | Use | Avoid |
|---|---|---|
| Backend | Node.js, Express, Prisma ORM, Zod | Raw SQL string concatenation, a second ORM |
| Database | PostgreSQL + PostGIS | NoSQL for core relational data (geo/location work belongs in PostGIS, not application code) |
| Async/scheduling | Celery + Redis | Ad-hoc threading or unmanaged background tasks |
| ML | scikit-learn (response scoring), Prophet or SARIMA (forecasting) | Deep learning for tasks this small — added complexity with no benefit at this data scale |
| Frontend (dashboard) | React + JavaScript, strict mode | Loosely-typed JS, mixing frameworks |
| Frontend (donor) | React (Web App) | Requiring app install to *receive* a notification (breaks N5's intent) |
| Secrets | Environment variables, `.env` (gitignored) | Hardcoded credentials or keys anywhere in source |

## 4. Data handling & privacy rules

- No PII (name, exact phone number, precise address) in application logs. Log donor/institution IDs only.
- Every donor record must carry a consent timestamp and stated purpose (DPDP Act 2023).
- Deletion requests must cascade correctly across donor records, notification logs, and any derived ML training data referencing that donor.
- Location data should be stored at the precision actually needed (e.g. locality/PIN-code level for matching), not exact home address, unless the feature genuinely requires it.

## 5. Error handling

- Every external call (notification gateway, e-RaktKosh scraper, ML service) must be wrapped with retries and a defined fallback — a failure in the ML service must silently fall back to rule-based ranking, not surface as an error to the institution raising the request.
- Scraper failures should degrade gracefully (use last-known-good data, flagged with a staleness indicator) rather than blocking the forecasting pipeline entirely.

## 6. Testing expectations

- Eligibility calculation logic (F2) must have tests — this is a correctness-critical, easy-to-get-wrong date calculation.
- The notification targeting filter chain (blood group → eligibility → preference → budget) must have tests confirming each filter stage actually excludes what it claims to.
- The request state machine must have tests confirming illegal transitions are rejected (e.g. `RAISED → DONATED` without passing through intermediate states).

## 7. Communication style in donor-facing text

- Plain, simple language. Assume varying literacy and smartphone familiarity — this mirrors the actual donor base surveyed at camps.
- No jargon in notifications ("eligibility window" → "you can donate again from [date]").

## 8. Working with the AI agent

- Don't silently restructure the established folder layout (see Architecture.md) — propose changes before making them.
- Don't skip straight to the ML-based version of a feature; build and confirm the fallback first, exactly as phased in Phases.md.
- When a requirement is ambiguous, prefer the interpretation that's more privacy-preserving and more donor-fatigue-conscious — these are the two failure modes this whole project exists to avoid.

