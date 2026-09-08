# TASK-2201 — Weakness Radar (Preparation Intelligence v1)

## Objective
Give the app a deterministic, explainable read on *where a student actually stands per topic* —
health, confidence, trend and a recommended next action — computed from the question attempts
already being recorded, and presented as a new Preparation Radar experience. Extends Practice /
Progress / mastery / PYQ / topic-priority; adds no competing intelligence system.

## Architecture assessment (done before planning — supplied spec §1 / §25.1)

### Existing data that is reused as-is

| Signal | Where it already lives | Decision |
|---|---|---|
| Practice attempts | `user_practice_session_results` (`question_id`, `is_correct`) under `user_practice_sessions` (`completed_at`, `topic_name`, `level_label`) | **Source of truth.** Reused, never rewritten |
| Mock attempts | `user_mock_attempt_results` (`question_id`, `selected_index` *nullable*, `correct_index`) under `user_mock_attempts` (`completed_at`) | Reused. Correctness derived as `selected_index == correct_index`; `selected_index IS NULL` means **unattempted** and is excluded from accuracy rather than counted as wrong |
| Topic per attempt | Not on the result row — but `questions.topic_id` is, and the row carries `question_id` | Derived by join. **No new field needed** |
| Difficulty per attempt | `questions.difficulty` → `difficulty_levels.code` / `display_order` | Reused. `display_order` is the hardness rank; a code missing from the active levels table falls back to "unknown", which drops the difficulty signal for that attempt instead of guessing |
| PYQ per attempt | `questions.is_pyq`, `questions.pyq_year` (Epic L / V13) | Reused verbatim. Epic L's classification is the only one |
| Topic priority | `topic_priority.final_priority` (`TopicIntelligenceService` algorithm `v2`, admin override already resolved into `final_priority`) | Reused via the existing `TopicPriorityRepository.findForExamAndVersion`. **No second priority algorithm** |
| Topic → exam scope | `exam_topics` (V12) | Reused — defines which topics the radar covers for an exam |
| Prerequisites | `topics.parent_id`, `topic_prerequisites` | Reused — feeds the "learn the prerequisite first" action rule |
| Practicable-question guard | `QuestionRepository.countByTopicForExam` | Reused. `PreparePlanService` already established that a topic with zero questions for the exam must not be recommended |
| Per-topic mastery ladder | `user_topic_progress` + `TopicProgressState` | **Left completely untouched.** Adjacent, not the same thing — it is device-derived cumulative state with no recency, difficulty or PYQ split, so it is lossy as evidence. Radar reads raw attempts instead |
| Existing recommendation | `PreparePlanService` (`GET /api/exams/{code}/prepare-plan`) | Left untouched. It *sequences* a syllabus; the radar *diagnoses* topics. Wiring radar output into it is a deliberate future extension, not v1 |

### What is genuinely missing (verified, not assumed)

1. **Per-question time does not exist anywhere.** `practice_sessions.duration_ms` is whole-session
   and is *not even in the upload payload* (`ProgressDtos` has no duration field for practice), so
   the server holds no practice timing at all. Mock holds whole-attempt `time_taken_seconds`. The
   only server-side timing is `user_topic_progress.total_time_ms` — a device-computed sum of whole
   session durations.
2. **No expected-time benchmarks exist**, per-question or per-topic.
   ⇒ Per supplied §9.2, **speed is an absent optional signal in v1**, and its weight is
   redistributed by renormalisation, never substituted with a fabricated neutral value.
3. **Practice attempts carry no `examCode` server-side** (the device has
   `practice_sessions.exam_code`; the payload omits it). Harmless here: health is topic-scoped and
   the exam enters only through priority.
4. **Signed-out students' attempts never reach the server.** Resolved by decision D1 below.

### Decisions taken with the user before implementing

- **D1 — compute site: backend, plus a device-side fallback for signed-out students.** The scoring
  algorithm therefore exists twice. This follows the precedent this codebase already set for the
  mastery ladder (`TopicProgressState.canTransitionTo` in Java, `deriveState` in
  `db/topicProgressStore.ts`) rather than inventing a new arrangement. Drift control: identical
  constant names and ordering on both sides, a cross-reference comment in each file naming the
  other, and one shared JSON fixture (`sample-data/weakness-radar-fixtures.json`) that the Java
  test asserts against so the two implementations have a single agreed source of expected output.
  Honest limitation to record: there is no mobile test runner in this project, so the TypeScript
  copy is verified on the emulator and by reading, not by an automated test.
- **D2 — start capturing per-question time now**, as a nullable additive field on both result
  tables and an optional payload field. Speed stays **out** of the v1 health formula. Rationale:
  without capture starting now, a future v2 speed signal has no history to benchmark against, and
  it would need a second migration anyway.
- **D3 — the existing mastery chips on Practice → Topics stay exactly as shipped.** Radar state
  lives only on the new radar screens. No shipped screen changes its labels.

## Data-flow proposal (supplied §15 / §25.2)

```
user_practice_session_results  +  user_mock_attempt_results        (immutable, existing)
        |   joined to questions for topic / difficulty / PYQ
        v
one grouped SQL query per user  ->  rows of
        (topic_id, occurred_at, difficulty_rank, is_pyq, answered, correct, time_ms?)
        v
TopicEvidence            (in-memory value object; recency buckets, per-event accuracy series)
        v
TopicHealthService       ("TOPIC_HEALTH_V1" — the ONLY place the formula lives)
        v
user_topic_health        (derived cache row: health, confidence, state, trend, inputs JSONB)
        v
+ topic_priority.final_priority  + exam_topics  + question coverage      (read-time join)
        v
WeaknessRadarService     (bucketing, intervention ranking, deterministic action rules)
        v
GET /api/exams/{code}/weakness-radar
        v
mobile write-through cache (local `topic_health`) -> radar screens
        ^
        +--- signed-out only: the same rules over local SQLite attempts (D1)
```

**Freshness.** `user_topic_health` carries `evidence_through_at` and `algorithm_version`. A read
recomputes when the user's newest attempt is later than `evidence_through_at`, or when the stored
version differs from the code constant. This is deliberately *not* the admin-triggered model
`TopicIntelligenceService` uses (its inputs only change when an admin edits content; a student's
change every time they finish a quiz) and deliberately *not* `@Scheduled` (this project already
found an in-process timer is silently dead on Cloud Run's scale-to-zero — see
`reports/23-exam-guide-phase1/…phase-d`). A version bump is therefore the full-recalculation path
required by supplied §19: every read recomputes, with no batch job to provision.

## Reuse vs new-model decision (§25.3)

**New:** exactly one table (`user_topic_health`), one enum (`TopicHealthState`), one scoring
service, one radar assembly service, one public endpoint, one admin debug endpoint, two mobile
screens, one mobile cache table.

**Deliberately NOT created:** a radar-result cache table (the response is a cheap read-time join
of health × priority — a second cache means a second thing to invalidate for no gain); a second
priority algorithm; a parallel per-topic progress model; any new dependency.

**Divergence from the house pattern, stated on purpose:** `topic_priority` keys on
`(exam, topic, algorithm_version)` and keeps superseded versions on disk. `user_topic_health` keys
on `userId:topicId` only (ADR-005 synthetic id) and *replaces* on a version change. Reason: this
is a per-user derived cache with no editorial content, and keeping every version would multiply
rows by users × topics with nothing in them the raw attempts cannot reproduce exactly. §19's
actual requirement — recomputable from untouched history — is met either way.

## API changes (§25.4)

1. `GET /api/exams/{examCode}/weakness-radar` — **user** auth. Mounted alongside the existing
   `/api/exams/{examCode}/topic-intelligence` and `/prepare-plan`. Returns the overview plus
   **full per-topic detail** for every covered topic.
   *No separate topic-detail endpoint*: one payload means §17's detail screen works offline from
   the same cached response, and 60-ish rows is not worth a second round trip.
2. `POST /api/exams/{examCode}/weakness-radar/recompute` — **user** auth. Forces a recompute
   (pull-to-refresh, and immediately after a progress upload).
3. `GET /api/admin/weakness-radar` — **admin** auth, `?email=&examCode=`. The §22 evidence dump:
   every input, component score, weight actually applied, confidence sub-factor, and the algorithm
   version, at full precision.

No existing endpoint's behaviour changes. `POST /api/progress/sync` gains **two optional nullable
fields** (`results[].timeMs` on both practice and mock rows) — additive, older clients simply omit
them.

Docs updated in the same change (AI_RULES §3.5/§3.18): new `api/WEAKNESS-RADAR.md`;
`api/USER-PROGRESS.md` (the new optional `timeMs` fields); `api/README.md` (index);
`system-design/02-database.md` (V24 + the new table); `system-design/04-where-do-i-change-things.md`
(where radar things live).

## Algorithm design (§25.5)

`TopicHealthService.ALGORITHM_VERSION = "TOPIC_HEALTH_V1"`, hand-bumped, stored per row — same
convention and reasoning as `TopicIntelligenceService.ALGORITHM_VERSION`.

**Evidence levels (§4), configurable constants, not scattered numbers:**
`INSUFFICIENT_DATA` 0–4 · `EARLY_SIGNAL` 5–9 · `DEVELOPING_CONFIDENCE` 10–19 · `RELIABLE` 20+.

**Windows (§6, §21).** Recent = attempts within `RECENT_WINDOW_DAYS = 30` of *now*. If that
window holds fewer than `MIN_WINDOW_ATTEMPTS = 5`, it falls back to the newest 5+ attempts
regardless of age and the row is flagged stale — which **reduces confidence** rather than
fabricating a trend. Historical = everything else. Evidence older than
`EVIDENCE_WINDOW_DAYS = 365` is excluded entirely (also what bounds the query).
Accuracy is recency-weighted by `w = max(RECENCY_FLOOR 0.15, 0.5 ^ (ageDays / HALF_LIFE_DAYS 45))`
— so old evidence fades but never vanishes.

**Health components.** Declared weights are supplied §5's; **a component with no evidence is
dropped and the remaining weights are renormalised to 1.0** — never replaced with a neutral 50.
Which components actually contributed is recorded in `inputs` JSONB.

| Component | Weight | Source | Dropped when |
|---|---|---|---|
| Accuracy | 30% | recency-weighted accuracy over all evidence | never (evidence exists by definition) |
| Recent trend | 20% | `50 + (recentAcc − historicalAcc)`, clamped | either window under `MIN_WINDOW_ATTEMPTS` |
| Speed | 15% | — | **always in v1** (no benchmarks exist) |
| Consistency | 10% | `100 − min(100, 2 × stdDev)` of per-event accuracy | fewer than 3 qualifying events |
| Difficulty handling | 10% | per-bucket `observed − expected + 50`, attempt-weighted, where expected = easy 75 / medium 60 / hard 45 | no resolvable difficulty metadata |
| PYQ performance | 10% | recency-weighted accuracy on PYQ attempts only | fewer than `MIN_PYQ_ATTEMPTS = 5` PYQ attempts |
| Retention | 5% | `100 − 2 × max(0, historicalAcc − recentAcc)` | no historical window |

§7 is satisfied *by construction*: the difficulty term is a bounded 10% component measured against
a per-difficulty expected band, so answering hard questions at hard-question accuracy scores
neutral, and no amount of hard-question attempting can move health by more than 10 points through
that term. §8 likewise: PYQ is capped at 10% and can never override the rest.

**Confidence (§11), independent of health.** Renormalised weighted sum of: evidence level (40%),
recency of the newest attempt (20%), consistency (15%), difficulty-coverage breadth (15%), PYQ
coverage (10%). Internal — the raw number is exposed only to the admin debug endpoint, never to a
student (§11, §18).

**State resolution (§12), first match wins, order deliberate:**
1. `evidenceLevel == INSUFFICIENT_DATA` → `INSUFFICIENT_DATA`
2. previously strong (`historicalAcc ≥ 75`) and declined `≥ 15`pp → `NEEDS_REVISION`
3. `health ≥ 70` and `confidence ≥ 45` → `STRONG`
4. `trendDelta ≥ 12`pp → `IMPROVING`  ← before NEEDS_ATTENTION, so §6's "don't label a clearly
   improving student weak" holds; after STRONG, so a strong-and-rising topic reads as Strong
5. `health ≤ 55` and `confidence ≥ 45` → `NEEDS_ATTENTION`
6. otherwise → `DEVELOPING`

Health, confidence, trend direction, evidence level and priority are **five separately stored
fields**, so §12's "Health 63 / Trend IMPROVING / Priority HIGH" renders as three facts rather
than one flattened label.

**Intervention ranking (§13):** `((100 − health)/100) × priority × (confidence/100)` — a
moderately weak, high-priority, reliably-diagnosed topic outranks a severely weak, low-priority
one. Null priority (never scored) sorts last rather than defaulting to a made-up midpoint.

**Recommended action (§14):** a deterministic rule table over (state, health band, PYQ gap,
prerequisite status, evidence level, question availability) → an ordered step list with a typed
action per step and a deep link into the existing Practice flow. No LLM anywhere (§14, §24).
Reasons are returned as **codes** (`RECENT_DECLINE`, `PYQ_GAP`, `LOW_ACCURACY`, `IMPROVING_FAST`,
`NOT_ENOUGH_PRACTICE`, `HIGH_VARIANCE`, `PREREQUISITE_GAP`, `STRONG_AND_STABLE`) plus a plain
English fallback string; mobile renders its own i18n text from the code so Telugu keeps working.

## Database changes (§25.6)

**Backend `V24__weakness_radar.sql`:**
- `CREATE TABLE user_topic_health` — synthetic `userId:topicId` PK (ADR-005), `algorithm_version`,
  `health_score`/`confidence_score` `NUMERIC(5,2)`, `state`, `trend_direction`, `trend_delta`,
  `evidence_level`, attempt/correct/recent/PYQ counts and accuracies, `consistency_score`,
  `speed_ratio` (nullable, always NULL in v1), `inputs JSONB`, `last_attempt_at`,
  `evidence_through_at`, `computed_at`; `CHECK`s for `correct ≤ attempted` and 0–100 ranges;
  indexes on `(user_id, algorithm_version)` and `(topic_id)`; `ON DELETE CASCADE` from `users`.
- `ALTER TABLE user_practice_session_results ADD COLUMN time_ms INT` (nullable)
- `ALTER TABLE user_mock_attempt_results ADD COLUMN time_ms INT` (nullable)

No existing table or column changes shape. No existing migration is edited.

**Mobile `0018` (hand-written, per the project's own drizzle-kit index/DDL trap):**
`ALTER TABLE practice_session_results ADD COLUMN time_ms integer;`,
same for `mock_test_attempt_results`, and a guarded
`CREATE TABLE IF NOT EXISTS topic_health` cache.

## UI changes (§25.7 / supplied §16, §17)

New mobile screens (root-level pushed, **not** a new tab — the tab bar is already the five
Home/Practice/Mock Test/Exams/More, and Progress was deliberately moved out of it):
- `app/preparation-radar.tsx` — "Your Preparation Radar" overview, then Needs Attention /
  Improving / Needs Revision / Strong / Building sections.
- `app/radar-topic.tsx` — one topic: status, plain-language why, accuracy, recent trend, PYQ
  performance when available, speed shown as unavailable rather than faked, recommended steps, and
  a "Start recommended practice" button into the existing `/practice/levels` route every other
  entry point already uses.

Entry points, additive only: a card on `(tabs)/progress.tsx` and a row in `(tabs)/more.tsx`.
Both screens must watch `useSyncStatus().syncVersion` (the documented stale-data trap) and must
not block startup. New `trackEvent` breadcrumbs, matching the existing convention.

No numbers like `confidence = 0.812` or `health = 63.74` reach the UI (§18) — bands and words do.

## Affected systems
`backend` (evidence query, scoring service, radar service, 2 + 1 endpoints, migration),
`mobile` (api client, local cache, hybrid facade, signed-out fallback scorer, 2 screens, 2 entry
points, migration, i18n), `admin` (one read-only debug page for §22).

## Affected modules
- `backend/…/service/` — new `TopicHealthService`, `WeaknessRadarService`; new repository query on
  the existing progress repositories. `system-design/04` → "backend feature" path.
- `mobile/src/api/`, `mobile/src/db/`, `mobile/src/data/`, `mobile/src/app/` — the existing
  api → db → data → screen layering, unchanged in shape.
- `admin/src/pages/` — one new page + `api.js` functions, matching `TopicIntelligence.jsx`.

## Risks
- **Two copies of the algorithm (D1).** Mitigated as described; the residual risk is real and is
  called out in the report rather than hidden.
- **Recompute cost on read.** Bounded by one grouped query per user over ≤365 days of attempts,
  on existing indexes (`user_practice_sessions(user_id, completed_at DESC)`,
  `user_practice_session_results(session_id)`). Must be measured against the real demo account
  (350 practice sessions + 85 mock attempts) rather than assumed cheap.
- **Mobile migration `0018` has two unguardable `ADD COLUMN`s.** A failed local migration is a
  hard startup gate in this app. Must be tested against a *populated* pre-0018 database, and the
  drizzle-kit output must be hand-checked (this project has been bitten by both).
- **A student with a stale local question bank** (the frozen-snapshot device already documented in
  STATUS.md) may have attempts whose questions no longer resolve. Evidence rows with no matching
  question are skipped, not counted as anything.
- **`api/USER-PROGRESS.md`, `api/README.md`, `system-design/02`/`04` already carry another
  session's uncommitted edits.** They will be extended additively; those edits are not mine to
  touch, stage or revert (AI_RULES §5.3).

## Testing requirements
- New `WeaknessRadarTest` (backend integration, isolated per-test user, deterministic fixtures)
  covering all 15 cases in supplied §23 — one wrong answer creates no weakness, few attempts stay
  insufficient, sustained poor performance reaches NEEDS_ATTENTION, improvement flips the trend,
  historical strength + recent decline reaches NEEDS_REVISION, variance lowers confidence,
  difficulty and PYQ shift the result within their bounds, missing timing produces no speed value,
  priority raises urgency, a strong topic survives one mistake, and a version change alters no raw
  attempt.
- `mvn -f backend/pom.xml test` — the **full** suite, from a shell with no other Maven or
  `spring-boot:run` process (this project has twice corrupted a run by overlapping them).
- `npx tsc --noEmit` + `npx expo lint` (must return to the exact pre-existing 9-problem baseline).
- `npm --prefix admin run build` + `oxlint`.
- **On-device verification on the emulator (`-s emulator-5554`) against a live backend**, signed in
  as the real demo account, and signed *out* for the fallback path. A clean compile is not
  evidence here — this project's history is explicit about that.

## Allowed files / areas
`backend/src/main/java/com/sarkaritaiyaari/backend/{entity,repository,service,controller,dto}/`
(new files, plus the two `ProgressDtos`/`ProgressService` additions for `timeMs`),
`backend/src/main/resources/db/migration/V24__weakness_radar.sql`,
`backend/src/test/java/…/WeaknessRadarTest.java`,
`mobile/src/{api,db,data,app,i18n,telemetry}/` (new files, plus `quiz.tsx`/`mock-test/test.tsx`
timing capture and the two entry-point rows), `mobile/src/db/migrations/0018_*.sql` + `meta`,
`admin/src/pages/WeaknessRadar.jsx` + `admin/src/api.js` + the sidebar,
`api/WEAKNESS-RADAR.md`, `api/USER-PROGRESS.md`, `api/README.md`,
`system-design/02-database.md`, `system-design/04-where-do-i-change-things.md`,
`sample-data/weakness-radar-fixtures.json`, `reports/25-weakness-radar/`, `memory/STATUS.md`.

## Out of scope
Everything in supplied §24: LLM diagnosis, AI-generated explanations or notes, adaptive learning
engine, predictive exam score, psychological profiling, automatic concept extraction. Also
explicitly out: changing `PreparePlanService`, changing the Practice → Topics mastery chips (D3),
a real speed signal (capture only, per D2), and any change to Practice, Mock Test, Progress, Exam
Guide, Exams, sync or offline behaviour.

## Implementation status
`Done` — see [`../reports/25-weakness-radar/weakness-radar-v1.md`](../reports/25-weakness-radar/weakness-radar-v1.md)
for what actually shipped, the four bugs found (two of them real defects in this task's own
code, both found by running things rather than by review), and what was left unverified — the
signed-in server path was never exercised on a device, because the full `mvn test` suite held
the only safe Maven slot for the whole session.
