# Weakness Radar API (Preparation Intelligence v1)

Per-topic diagnosis for one student: how they are actually doing in each topic of an exam's
syllabus, how much evidence that rests on, which way it is moving, and what to do about it.
Introduced by migration
`backend/src/main/resources/db/migration/V24__weakness_radar.sql`. Design rationale and the
decisions taken before implementing: [`../tasks/TASK-2201-weakness-radar.md`](../tasks/TASK-2201-weakness-radar.md).
Full account of what shipped: `reports/25-weakness-radar/`.

## What this is built on, and what it deliberately does not duplicate

Nothing here is a new source of truth. The evidence is the question attempts already stored by
[`USER-PROGRESS.md`](USER-PROGRESS.md)'s `POST /api/progress/sync`; the per-exam topic
importance is Epic L's existing `topic_priority.final_priority`
([`EXAM-INTELLIGENCE.md`](EXAM-INTELLIGENCE.md)), admin overrides already resolved; the PYQ
classification is Epic L's `questions.is_pyq`; question availability is the same
`countByTopicForExam` guard `GET /api/exams/{code}/prepare-plan` already applies.

Three things it does **not** touch:

- **`user_topic_progress`** (the `NOT_STARTED → … → MASTERED` mastery ladder). That is
  device-derived cumulative state with no recency, difficulty or PYQ split — lossy as evidence.
  The radar reads raw attempts instead, and the ladder is left exactly as shipped. Practice →
  Topics still shows mastery chips; radar state appears only on the radar screens. Two
  vocabularies, kept distinct on purpose.
- **`GET /api/exams/{code}/prepare-plan`**. That *sequences* a syllabus; this *diagnoses*
  topics. Feeding radar output into the checklist is a future extension, not v1.
- **The attempts themselves.** Health is a derived cache and can be deleted and rebuilt at any
  time. Nothing in this API writes to `user_practice_session_results` or
  `user_mock_attempt_results`.

## The three separate dimensions

The single most important thing to understand before changing anything here: **topic health,
topic priority and confidence are three different numbers and must not be collapsed.**

| | Question it answers | Where it comes from |
|---|---|---|
| **Health** (0-100) | How well is this student currently doing in this topic? | `TopicHealthService`, from their attempts |
| **Priority** (0-100) | How much does this topic matter for this exam? | Epic L's `topic_priority.final_priority`, same for every student |
| **Confidence** (0-100) | How much should we trust the health figure? | `TopicHealthService`, from evidence volume, recency, variance and coverage |

A topic at health 50 / confidence 35 and one at health 50 / confidence 92 are different
situations, and the second is the only one worth acting on. Confidence's job is to gate whether
a verdict is asserted at all — so it is **never in the student-facing response**. It appears
only on the admin endpoint. `evidenceLevel` is what the app shows instead: the same information
as a statement about practice volume rather than a coefficient.

## Algorithm versioning

`TopicHealthService.ALGORITHM_VERSION` (currently `"TOPIC_HEALTH_V1"`) is a hand-bumped
constant, stored on every `user_topic_health` row — same convention as
`TopicIntelligenceService.ALGORITHM_VERSION`, and for the same reason: a stored score has to
stay interpretable after the formula changes.

**Unlike `topic_priority`, superseded rows are replaced rather than kept.** Those rows are per
(exam, topic), a few hundred in total, and carry editorial content (admin overrides and their
reasons) that genuinely cannot be recomputed. `user_topic_health` rows are per (user, topic), so
keeping every version would multiply them by users × topics while holding nothing the raw
attempts do not reproduce exactly. A version bump is therefore the whole of the historical-
recalculation path: every student's next read finds a stored version that no longer matches the
code constant and recomputes.

## Freshness — a GET here can write

`user_topic_health` carries `evidence_through_at` and `computed_at`. A read recomputes when:

- there are no rows at the current algorithm version, or
- the student's newest attempt is later than `evidence_through_at`, or
- `computed_at` is more than 24 hours old (health drifts with the calendar alone — recency
  weights decay daily and the 30-day recent window slides).

Recompute-on-read rather than a scheduled job, deliberately. A student's inputs change every
time they finish a quiz, unlike `topic-intelligence`'s, which only change when an admin edits
content — which is why that one is admin-triggered. And an in-process `@Scheduled` timer was
already ruled out for this project: on Cloud Run with scale-to-zero it fires only while some
instance happens to be alive, which can be never (see `ReminderService`).

The staleness check itself is three scalar projections, served off
`idx_user_practice_sessions_user` and `idx_user_mock_attempts_user`, so a read that does not
need to recompute costs index probes rather than a scan of the history.

## Endpoints — `WeaknessRadarController` (mounted under `/api/exams/{examCode}`)

Mounted alongside `topic-intelligence` and `prepare-plan` because priority and question
availability are per-exam, so a radar is meaningless without one. **Unlike its neighbours under
this path, both of these require a user token** — they read one specific student's practice
history. The acting user always comes from the token, never from a path or body parameter, same
rule as every endpoint in `USER-PROGRESS.md`.

### GET /api/exams/{examCode}/weakness-radar
**Purpose:** The whole radar — overview plus full per-topic detail.
**Auth:** user (Bearer token, via `authService.requireUser`)
**Request:** none
**Response:** `WeaknessRadarResponse { examCode, algorithmVersion, computedAt, overview, topics: [ RadarTopic... ] }`

`overview` — `{ status, topicsInSyllabus, topicsWithEvidence, topicsReliable,
needsAttentionCount, needsRevisionCount, improvingCount, strongCount, developingCount,
insufficientDataCount, headline }`. `status` is one of `NO_DATA` / `GETTING_STARTED` /
`BUILDING` / `ON_TRACK` / `STRONG`, derived from evidence coverage and a priority-weighted mean
health. `headline` is a plain English sentence for clients with no string table; the mobile app
renders its own localised copy from `status` and ignores it.

Each `RadarTopic` carries `topicId`, `topicName`, `subjectId/Name`, `parentTopicName`, `state`,
`healthScore` (whole number), `trend`, `trendDelta`, `evidenceLevel`, `attemptedCount`,
`correctCount`, `accuracyPercent`, `recentAccuracyPercent`, `historicalAccuracyPercent`,
`pyqAttemptedCount`, `pyqAccuracyPercent`, `speedAvailable`, `consistency`, `priority`,
`interventionValue`, `questionCount`, `reasonCodes`, `explanation`, `recommendedAction`,
`unmetPrerequisites`, `lastPracticedAt`.

**Errors:** 401 no/invalid/expired token, 404 exam not found
**Business rules:**
- **One payload, no detail endpoint.** Full per-topic detail is returned here so the app's
  topic-detail screen works offline from the same cached response. A syllabus is tens of topics,
  so a second round trip would buy nothing.
- **Built from `exam_topics` outward**, same direction as `topic-intelligence`'s read path: a
  topic in the exam's syllabus the student has never touched appears as `INSUFFICIENT_DATA`
  rather than being silently absent. A topic they *have* practised but which is not mapped to
  this exam is excluded — real evidence, but not about this exam's preparation.
- **`topics` is already ordered** so that grouping by `state` on the client yields the app's
  sections in the right order, each internally ranked by `interventionValue` descending. A
  client must not re-sort.
- **`speedAvailable` is always `false`** under v1. See "The absent speed signal" below.
- **Recomputes if stale** — see "Freshness" above. This GET can write.
**Consumers:** Mobile (`mobile/src/api/weaknessRadar.ts`, via `data/weaknessRadarData.ts`)

### POST /api/exams/{examCode}/weakness-radar/recompute
**Purpose:** Forces a recompute, then returns the radar in the same shape as the GET.
**Auth:** user
**Request:** none
**Response:** identical to `GET` above
**Errors:** 401, 404 exam not found
**Business rules:** For pull-to-refresh, and for the moment just after a progress upload where
the client knows new attempts landed. Idempotent — the inputs are immutable history, so
recomputing twice produces identical rows.
**Consumers:** Mobile (pull-to-refresh on the Preparation Radar screen)

## Endpoint — `WeaknessRadarAdminController` (`/api/admin/weakness-radar`)

Under `/api/admin/` so the path itself says this is not a product surface, the same convention
`SyntheticCurationController` follows.

### GET /api/admin/weakness-radar?email={email}&examCode={code}
**Purpose:** The full evidence for one student's topics, at full precision — the observability
requirement. It exists for one specific situation: a student asks *"why does the app say I'm
weak in this topic?"* and the team has to be able to answer from stored data.
**Auth:** admin (Bearer token + ADMIN role, via `authService.requireAdmin`)
**Request:** `email` (the student — an email rather than a user id, because that is what a
support question arrives with) and `examCode` (whose priority and question availability to
interpret their health against; health itself is exam-independent)
**Response:** `AdminRadarResponse { email, examCode, algorithmVersion, latestAttemptAt, topics: [ AdminRadarTopic... ] }`

Each `AdminRadarTopic` adds, over the student-facing shape: `confidenceScore`, un-rounded
`healthScore`/`recentAccuracy`/`historicalAccuracy`/`pyqAccuracy`/`consistencyScore`/`trendDelta`,
`speedRatio`, `evidenceThroughAt`, `computedAt`, and **`inputs`** — the stored JSONB audit blob
holding every component score, the weight actually applied to it after renormalisation, which
components were dropped and why, the confidence sub-factors, and the recency parameters used.

**Errors:** 401, 403 authenticated but not an admin, 404 no user with that email / exam not found
**Business rules:**
- **Read-only, and never triggers a recompute.** An admin investigating a complaint needs to see
  what the student was actually served, not a fresh answer that may no longer show the problem.
  A student who has never opened their radar therefore has no rows, and the response says so
  rather than computing some.
- **No override exists, deliberately.** Topic health is derived entirely from a student's own
  attempts; the only honest way to change it is for them to practise. (Contrast
  `topic_priority`, where an editorial override is the point.)
- This reads another person's practice history, which is exactly why it is admin-gated and does
  not exist on the public path.
**Consumers:** Admin (`admin/src/pages/WeaknessRadar.jsx`, via `inspectWeaknessRadar` in
`admin/src/api.js`)

## The absent speed signal — read this before "fixing" it

The v1 health formula has **seven** declared components (accuracy 30%, recent trend 20%, speed
15%, consistency 10%, difficulty handling 10%, PYQ performance 10%, retention 5%) and speed is
**always dropped**.

That is not an oversight. Computing it needs both a per-question time *and* an expected time to
compare against, and neither existed:

- No result row carried a per-question time before V24, so **no history has one**.
- There is still **no expected-time benchmark** anywhere in this schema, per question or per
  topic. Inventing one from the question bank's own distribution would be circular.

So `speedRatio` is null on every row, `speedAvailable` is `false` in every response, and the
app's topic detail shows speed as explicitly *not measured* rather than omitting the row (which
would let a student assume their pace was fine).

**What V24 did add** is a nullable `time_ms` on `user_practice_session_results` and
`user_mock_attempt_results`, plus optional `timeMs` on both result shapes in
`POST /api/progress/sync` — so capture starts now and a future v2 has history to derive an
empirical benchmark from. `null` means **not recorded**, never zero; a reader that treated
absence as a fast answer would manufacture the exact fake signal this section exists to prevent.

## How a missing component is handled everywhere else

The same rule, and it is the load-bearing design decision in the formula: **a component with no
evidence is dropped and the remaining weights are renormalised to sum to 1.0** — never
substituted with a neutral 50.

Scoring an absent component at the midpoint would drag every score toward the middle and quietly
assert something that was never measured. Leaving the weights unnormalised would cap every
student below 100 by whatever fraction is missing (speed alone would cap everyone at 85).

Components are dropped when: the recent and historical windows do not both hold at least 5
answered questions (trend, retention); fewer than 3 sessions of 3+ answers exist (consistency);
no attempt has difficulty metadata this database recognises (difficulty handling); or fewer than
5 PYQ questions have been answered (PYQ performance — *excluded*, never assumed to be
non-PYQ). Which components were dropped, and why, is recorded in `inputs`.

## Testing

- `backend/src/test/java/com/sarkaritaiyaari/backend/service/TopicHealthScoringTest.java` — the
  algorithm, as a **plain unit test** (no Spring, no database) over deterministic fixtures in
  [`../sample-data/weakness-radar-fixtures.json`](../sample-data/weakness-radar-fixtures.json).
  `now` is injected, which is the only way the recency and trend cases are expressible at all.
- `backend/src/test/java/com/sarkaritaiyaari/backend/WeaknessRadarTest.java` — the integration
  half: attempts uploaded through the real sync endpoint and read back through the real radar
  endpoint, covering the question→topic join, unattempted mock questions being excluded, cache
  reuse and invalidation, a recompute leaving raw attempts untouched, priority changing the
  ranking, and endpoint auth.

The fixture file is shared with the **second implementation** of this algorithm, in
`mobile/src/intelligence/topicHealth.ts`. That copy exists because this app works fully signed
out, and a signed-out student's attempts never reach a server that could score them; it follows
the precedent already set by the mastery ladder (`TopicProgressState.canTransitionTo` in Java,
`deriveState` in `db/topicProgressStore.ts`). **If you change a constant or a rule in either,
change both and bump `ALGORITHM_VERSION` in both**, then run:

```
node scripts/check-topic-health-parity.js
```

which fails if the two sides' shared constants disagree, if their `ALGORITHM_VERSION`s differ,
if the fixtures were written for a different version, or if either side's declared weights stop
summing to 1.00. It is a floor, not a guarantee — it cannot see a *rule* whose logic diverged
while its constants stayed put. This project has no mobile test runner, so the TypeScript copy
itself is verified by reading and on the emulator, not by an automated test.
