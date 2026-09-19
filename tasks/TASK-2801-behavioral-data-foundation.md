# TASK-2801 — User behavioural data & personalization data foundation

**Status: APPROVED AND IMPLEMENTED (2026-09-18), with the project owner's refinements — see
"Implementation status" at the end of this file. Not committed to git, and not yet run on a
device.** The analysis below is the pre-implementation audit, kept as written.

## Objective

Make the app capture a student's meaningful activity automatically, and store it so future
personalization can read it accurately — raw behavioural events preserved, metrics derived.
This is the data foundation, **not** the recommendation engine.

---

# Part 1 — Architectural analysis of the current repository

This section answers the eleven questions the brief asked for, from the real code, not from
the summaries in `memory/STATUS.md`.

## 1. Existing relevant tables / entities

### Server (Postgres, Flyway `V1`–`V46`)

| Table | Migration | What it is |
|---|---|---|
| `users` | V5 (+V8 role) | id, email, password_hash, display_name, phone, role, created_at. **No timezone, no locale, no preparation profile.** |
| `user_tokens` | V5 | opaque revocable bearer tokens (ADR-001) |
| `user_practice_sessions` | V6 | one completed practice run |
| `user_practice_session_results` | V6 (+V24, V26) | **one row per answered question** |
| `user_mock_attempts` | V6 | one completed mock test |
| `user_mock_attempt_results` | V6 (+V24, V26) | **one row per question in the paper**, answered or not |
| `user_topic_progress` | V14 | per-(user, topic) mastery ladder — mutable state, synced last-write-wins |
| `user_topic_health` | V24 | per-(user, topic) **derived cache** — health/confidence/trend, rebuildable, algorithm-versioned |
| `user_bookmarks` | V7 | per-(user, question) mutable state + tombstone |
| `followed_exams` | V23 | per-(user, exam) mutable state + tombstone |
| `user_document_status` | V17 | Exam Guide checklist ticks |
| `user_profile_summaries` | V45 | AI narrative cache keyed by a SHA-256 of the facts it may cite |
| `push_tokens`, `user_reminders` | V20 | notification plumbing |
| `ai_usage_events` | V46 | **the schema's only append-only event log** — the closest existing precedent to what this brief asks for |

The dimensions the brief wants to slice by already exist on the content side and are reachable
from an attempt row: `questions.topic_id`, `questions.difficulty` (FK to `difficulty_levels`
since V3), `questions.is_pyq` (V13), `topics.subject_id`, `topics.parent_id` (V12).

### Device (SQLite, migrations `0001`–`0028`)

Mirrors of the above (`practice_sessions`, `practice_session_results`, `mock_test_attempts`,
`mock_test_attempt_results`, `topic_progress`, `bookmarks`, `followed_exams`), plus:

- `diagnostic_attempts` — **local-only, no server table exists**
- `app_preferences` — the whole onboarding profile, **device-local and never synced**
- `content_language_preferences` — same
- `radar_cache` — a read-only copy of a server-computed payload
- `sync_meta` — watermark + resume state

## 2. Existing practice-session tables

`user_practice_sessions`: `id` (device-generated), `user_id`, `completed_at`, `exam_label`,
`subject_name`, `topic_name`, `level_label`, `correct_count`, `total_count`, `uploaded_at`.
Index `(user_id, completed_at DESC)`.

Locally (`mobile/src/db/schema.ts`) the same table carries **four more fields that never leave
the device**: `exam_code`, `available_count`, `duration_ms`, and `is_synced`. `exam_label`,
`subject_name`, `topic_name`, `level_label` are denormalised **strings**, not ids.

## 3. Existing mock-session tables

`user_mock_attempts` is richer than practice: it has `exam_code`, `started_at`, `completed_at`,
`duration_seconds`, `time_taken_seconds`, fractional `marks_*`, and
`correct/wrong/unattempted/total` counts. Index `(user_id, completed_at DESC)`.

Practice and mock are **separate tables, not one table with a type column** — that is already
the distinction §6 asks for, and it is the right one: a mock attempt has duration, negative
marking and marked-for-review, none of which apply to practice.

## 4. Existing question-answer / attempt tables

Both result tables already carry, per question:

```
order_index, question_id,
selected_index, correct_index,          -- null for the six non-index question types (V26)
is_correct (practice) / marked_for_review (mock),
time_ms                                 -- nullable, V24; null means "not recorded", never 0
question_type, response JSONB, outcome, score_fraction   -- V26 response model
subject_name (mock only, a denormalised string)
```

**`outcome` is populated for every row, old and new** — V26 backfilled history, so it can be
trusted unconditionally. It distinguishes `CORRECT` / `INCORRECT` / `UNATTEMPTED` /
`PENDING_REVIEW`, which is exactly the `answer_status` the brief's §3 asks for.

**Topic, subject, difficulty and PYQ are not stored on the attempt — they are joined from
`questions` via `question_id`.** `TopicEvidenceRepository` already does this, in two grouped
queries, and its doc comment records the reasoning explicitly. `mobile/src/intelligence/
localEvidence.ts` mirrors it for the signed-out path.

**So the raw event store the brief asks for largely exists already.** A new `question_attempts`
table would duplicate it.

## 5. Existing offline-sync tables and mechanism

- Device writes first, always. `practice_sessions.is_synced` / `mock_test_attempts.is_synced`
  are the pending queue; nothing about finishing a quiz waits on the network.
- `POST /api/progress/sync` is **write-once, keyed on the device's own id**, so a retry
  overwrites instead of duplicating (`ProgressService.upload` checks which ids already exist,
  then `persist()`s the new ones and `merge()`s the retries).
- `GET /api/progress` restores everything onto a fresh install; question text is rejoined
  locally from the synced bank rather than stored per answer.
- Bookmarks, topic progress and followed exams use a **different** rule — last-write-wins on
  `updated_at`. `api/USER-PROGRESS.md` documents the split and warns against blending them.
- `web/` has **no local database at all** (online-only, decision 2 of TASK-2601) and uploads
  the identical payload immediately.

## 6. Existing onboarding / user-profile tables

**There is no server-side profile.** `users` holds `display_name` and nothing else.

Everything the brief calls "category B" lives in `app_preferences`, a single device-local row
(migrations 0027/0028): `display_name`, `primary_exam_code`, `exam_stage_id`, `target_year`,
`preparation_level`, `daily_study_time`, `ui_language`, `active_exam_code`,
`onboarding_started_at`, `onboarding_completed_at`, plus `content_language_preferences` rows.

This was deliberate and is recorded: onboarding runs **before any sign-in** on a fresh install
because accounts are optional, so the device is necessarily the source of truth. The stated
consequence is that a reinstall re-onboards.

## 7. What can be reused (most of it)

| Brief asks for | Already exists |
|---|---|
| Raw per-question attempt record | `user_practice_session_results` / `user_mock_attempt_results` |
| `answer_status` | `outcome` (V26), backfilled across all history |
| `is_correct` | `outcome` + `score_fraction` |
| `time_spent` | `time_ms` (V24) + `useQuestionTimer` on mobile |
| `topic_id` / `subject_id` / `difficulty` per attempt | joined from `questions` — `TopicEvidenceRepository` |
| PRACTICE vs MOCK separation | separate tables |
| Session-level record | `user_practice_sessions` / `user_mock_attempts` |
| Idempotent offline upload | device-id keyed `POST /api/progress/sync` |
| "Derived cache, rebuildable, never the only truth" | `user_topic_health` (V24) is a worked example |
| Append-only event log conventions | `ai_usage_events` (V46) |
| Auth / per-user isolation | `AuthService.requireUser`, acting user always from the token |
| Flyway + Controller→Service→Repository→Entity + `dto/` | the whole backend |

## 8. What is genuinely missing

**A. Practice sessions lose their timing and their exam on the server.**
`duration_ms`, `available_count` and `exam_code` are local-only — not in `ProgressDtos`, not in
`PracticeSessionPayload`, not in the table. They are **lost permanently on a device change**,
because restore cannot bring back what was never uploaded. There is no `started_at` for a
practice session anywhere, on device or server. So §5 and §11 (total study time, average
session duration, practice-vs-mock time split) are **not computable server-side at all today**.
Mock attempts are fine — they already carry all of it.

**B. No activity, streak or study-time concept exists anywhere.**
`mobile/src/app/(tabs)/index.tsx` has `const MOCK = { streakDays: 3, readinessPercent: 62 }`.
Both are hardcoded constants, and the file says so. §11 and §12 have nothing behind them.

**C. `REVISION` is not a thing in this product.** Revise (`app/revise.tsx`) is a read-only
review screen — bookmarks and past wrong answers, with no answering and no session. Adding a
`REVISION` source type would be inventing product behaviour to satisfy an enum, which the
brief's own §4 and §13 forbid.

**D. Diagnostic tests are a real third source with no server representation.**
`diagnostic_attempts` is local-only, and it stores only a per-topic JSON summary — **no
per-question rows at all**. It folds into `topic_progress` via `recordTopicPractice` and is
otherwise invisible to the server.

**E. Mock tests never update `user_topic_progress`.** `recordTopicPractice` is called from
`practice/quiz.tsx` and `diagnostic-test.tsx` only. Mastery is practice-and-diagnostic-only;
Weakness Radar reads both sources, mastery reads one. A real inconsistency, pre-existing.

**F. The session-level topic id is thrown away.** `quiz.tsx` has the real `topicId` and passes
it to `recordTopicPractice`, but `SessionRecord` stores only `topicName`, a string. Per-result
topic is still recoverable via the question join; the session-level one is not.

**G. No per-question timing on `web/` at all.** `web/src/practice/session.ts` and
`web/src/mocktest/attempt.ts` send no `timeMs`. Mobile captures display time with two
documented limitations.

**H. No analytics read API.** None of the 41 controllers aggregates a student's own history.
`WeaknessRadarController` computes topic health; `PreparePlanService` computes sequencing.
Nothing answers §23's overall / subject / difficulty / time-window questions.

**I. Interaction events beyond answering are not persisted.** `trackEvent()` writes **Sentry
breadcrumbs** — crash-context only, ephemeral, not queryable, never stored. Bookmarks are
persisted (a real table). "Explanation opened" is not an event (practice reveals it inline on
answer). "Answer changed" is only *possible* in mock (practice locks on first tap) and is not
counted. **No "report question" feature exists**, so §13's report event has nothing behind it.

**J. Local history is capped at 50 sessions** (`MAX_SESSIONS` in `db/practiceSessions.ts`), so
device-computed figures diverge from server-computed ones for a long-running student.

## 9. Proposed database changes

Guiding rule, straight from the brief's §16 and "do not duplicate": **the two result tables
already are the raw event store. Do not add a parallel `question_attempts` table.** Close the
capture gaps on what exists, and add one read layer.

### Migration `V47__behavioral_capture.sql` (additive only)

```sql
-- Practice session: the context and timing the device already has and currently discards.
ALTER TABLE user_practice_sessions ADD COLUMN started_at      TIMESTAMPTZ;
ALTER TABLE user_practice_sessions ADD COLUMN duration_ms     BIGINT;
ALTER TABLE user_practice_sessions ADD COLUMN available_count INT;
ALTER TABLE user_practice_sessions ADD COLUMN exam_code       VARCHAR(30);
ALTER TABLE user_practice_sessions ADD COLUMN topic_id        UUID REFERENCES topics (id);
ALTER TABLE user_practice_sessions ADD COLUMN difficulty_code VARCHAR(30);
-- PRACTICE | DIAGNOSTIC. Not REVISION -- see gap C.
ALTER TABLE user_practice_sessions ADD COLUMN source_type     VARCHAR(20) NOT NULL DEFAULT 'PRACTICE';
```

Every one of those is nullable (or defaulted) because every existing row legitimately has no
value — a client that predates the release omits them, and `NULL` must read as "unknown".

**Decision D1 (needs your call) — dimension snapshot on the attempt row.** Optionally also:

```sql
ALTER TABLE user_practice_session_results ADD COLUMN topic_id        UUID;
ALTER TABLE user_practice_session_results ADD COLUMN subject_id      UUID;
ALTER TABLE user_practice_session_results ADD COLUMN difficulty_code VARCHAR(30);
ALTER TABLE user_practice_session_results ADD COLUMN is_pyq          BOOLEAN;
-- same four on user_mock_attempt_results; backfilled once from the current questions join
```

- **For:** it makes the attempt a true immutable event. Today, re-tagging a question in the
  admin console **silently rewrites every student's history**, because topic/difficulty are
  read live. It also removes a join to a ~37,900-row (and growing) table from every aggregate.
- **Against:** four denormalised columns per row, and a backfill over the whole result history.
- **Recommendation: do it.** §15 says preserve the raw fact; the dimension at answer time *is*
  part of the raw fact. Without it, §10's trend detection is measuring content edits as well as
  student behaviour.

### Indexes

```sql
CREATE INDEX idx_practice_results_question ON user_practice_session_results (question_id);
CREATE INDEX idx_mock_results_question     ON user_mock_attempt_results (question_id);
-- only if D1 is accepted:
CREATE INDEX idx_practice_results_topic    ON user_practice_session_results (topic_id);
CREATE INDEX idx_mock_results_topic        ON user_mock_attempt_results (topic_id);
```

The existing `(user_id, completed_at DESC)` indexes on both parent tables already serve every
time-window and streak query; nothing new is needed for those.

### Explicitly NOT proposed

- **No `user_personalization` table.** §16, and this codebase already rejected that shape once.
- **No streak / study-day table.** A streak is `SELECT DISTINCT date(completed_at)` over an
  already-indexed column. Storing it would make a derived value the source of truth (§15).
- **No pre-computed subject/topic/difficulty aggregate cache in v1.** `user_topic_health`
  already proves the pattern (compute on read, staleness-check against the newest attempt,
  rebuild freely) — add one only if measurement shows it is needed, and follow that shape.
- **No new sync mechanism.** §19: the existing one is reused verbatim.

## 10. Proposed data flow

```
  Student answers a question (offline or online)
        |
        v
  Device SQLite -- practice_session_results / mock_test_attempt_results
  written at session end, with time_ms, outcome, response, and (new) the
  dimension snapshot; parent row marked is_synced = false
        |
        v                                         [ web/: no local DB -- uploads immediately ]
  Network available -> POST /api/progress/sync
  device-generated id = idempotency key; retry overwrites, never duplicates
        |
        v
  Postgres -- user_*_sessions / user_*_results       <-- RAW, IMMUTABLE, never edited
        |
        +--> TopicHealthService  -> user_topic_health   (derived cache, rebuildable)
        +--> UserAnalyticsService -> computed on read   (NEW, this task)
        |
        v
  GET /api/me/analytics/*  -- summarised, user-scoped, raw tables never exposed
        |
        v
  App screens (Progress, Home) / future personalization engine
```

Signed-out students never reach the server at all — a permanent property of this app. Weakness
Radar already solved that by mirroring its algorithm on-device with a parity script
(`scripts/check-topic-health-parity.js`). **Decision D3** below is whether to do the same here.

## 11. Risks with the current architecture

**R1 — `POST /api/progress/sync` can overwrite another user's session, and the ids are
guessable.** `ProgressService.upload` checks `practiceSessions.findAllById(sessionIds)` — **not
scoped to the calling user** — and `toEntity(user, dto)` sets the user. So uploading an id that
belongs to someone else `merge()`s over their row *and reassigns ownership to the caller*.
Mobile generates `session-${Date.now()}` and `mocktest-${Date.now()}`, which are both guessable
and genuinely collision-prone across users at scale (two students finishing in the same
millisecond). Read paths are correctly user-scoped (`findByIdAndUserId`), so this is a
write-integrity and data-loss issue, not a read leak. **It should be fixed before any analytics
is built on these rows** — §18 and §19 both depend on it. (`web/` already uses
`crypto.randomUUID()`.)

**R2 — dimensions are read from live content.** See D1 above.

**R3 — `question_id` has no foreign key** on either result table (deliberate: history must
survive a question being removed). A soft-deleted question is included in evidence on purpose;
a hard-deleted one silently drops out of every join. Analytics must state which it does.

**R4 — device and server will disagree.** The 50-session local cap plus signed-out-only history
means a device figure and a server figure can both be right and different.

**R5 — merge semantics assume immutability.** Adding any *mutable* behavioural field to these
tables would break the write-once rule that makes retries safe. Anything mutable belongs in the
bookmark/topic-progress last-write-wins shape instead.

**R6 — volume.** ~50 questions/day × 10k DAU ≈ **180M result rows/year**. Postgres handles it,
but nothing prunes or partitions, exactly as `ai_usage_events` (V46) documents for itself. Worth
a retention decision before that scale, not before.

**R7 — production and dev share one Neon database** (`memory/STATUS.md`). Analytics queries
would run against the same instance serving real students.

**R8 — doc drift found while doing this.** `system-design/02-database.md`'s Group 5 table map
omits `user_topic_progress` (V14) entirely; it appears only in the migration list at the bottom
of the file. To be corrected in place per `AI_RULES.md` §6 when this lands.

---

# Part 2 — Proposed API surface (read layer)

New `UserAnalyticsService` + `UserAnalyticsController`, following the existing
Controller → Service → Repository layering and `WeaknessRadarController`'s auth shape (acting
user always from the token, never a path parameter). Aggregation happens in SQL, one grouped
query per dimension, the same discipline `TopicEvidenceRepository` already follows.

| Endpoint | Returns |
|---|---|
| `GET /api/me/analytics/overview` | total attempted, total correct, overall accuracy, total study time, practice/mock/diagnostic session counts, last active, days since last activity, current + longest streak |
| `GET /api/me/analytics/subjects` | per subject: attempts, accuracy, average time, last activity, practice accuracy, mock accuracy |
| `GET /api/me/analytics/topics` | the same per topic (paged) |
| `GET /api/me/analytics/difficulty` | per difficulty level: attempts, accuracy, average time |
| `GET /api/me/analytics/activity?window=TODAY\|7D\|30D` | study time, attempts, accuracy, sessions within the window |
| `GET /api/admin/user-analytics?email=` | the same, admin-gated, read-only — mirrors `WeaknessRadarAdminController` |

Contract documented in a new `api/USER-ANALYTICS.md`, with an index row in `api/README.md`.
Raw event tables are never exposed.

---

# Part 3 — Decisions needed before implementation

| # | Decision | Recommendation |
|---|---|---|
| **D1** | Snapshot topic/subject/difficulty/PYQ onto each attempt row, or keep joining live `questions`? | **Snapshot.** Otherwise content edits retroactively rewrite history and distort §10 trends. |
| **D2** | Promote diagnostic tests to a first-class source (`source_type = 'DIAGNOSTIC'` on the existing practice tables, which needs `diagnostic-test.tsx` to start recording per-question rows), or leave them local-only? | **Promote.** It reuses the entire existing pipeline rather than building a third pair of tables — but it is a real client change, not free. |
| **D3** | Signed-out parity: server-side analytics only for v1, or mirror the aggregates on-device too? | **Server-only for v1.** A mirror doubles the algorithm and needs a parity script; the existing local radar already covers the signed-out weakness case. |
| **D4** | Fix R1 (user-scope the upload check + move mobile to UUID ids) inside this task, or as separate hardening? | **Inside this task.** Everything here is built on the integrity of those rows. |
| **D5** | Capture answer-changes (mock only — practice locks on first tap) and explanation-opens? | **Out of v1.** Neither is a discrete event in the current UX for practice, and §4 says not to invent UX for analytics. |

## Proposed implementation order (after sign-off)

1. **R1 fix** — user-scope the upload existence check; mobile ids to UUID. Backend test proving
   a cross-user id is rejected rather than merged.
2. **Migration V47** + entity/DTO/payload changes; mobile local migration `0029` for anything
   the device does not already hold; `progressSync.ts` carries the new fields both ways.
3. **Capture wiring** — `quiz.tsx` sends `startedAt`/`durationMs`/`availableCount`/`examCode`/
   `topicId`; web gains per-question timing.
4. **D2, if approved** — diagnostic per-question rows + `source_type`.
5. **`UserAnalyticsService` + controller + `api/USER-ANALYTICS.md`.**
6. **QA** per §3.21 and the doc corrections (R8).

## Out of scope (explicitly)

- Any recommendation, "study X next", weak-topic verdict or readiness score (§20).
- Any LLM involvement in computing accuracy, time, counts or trends (§21).
- Replacing `MOCK.streakDays` / `MOCK.readinessPercent` on Home with real values — that is a
  consuming feature, not the foundation, and readiness is still an open product decision.
- A server-side onboarding profile. It stays device-local until there is a reason to move it.
- Retention / partitioning for the result tables (R6).

## Testing requirements (when implemented)

Per `AI_RULES.md` §3.13 and §3.21: `mvn -f backend/pom.xml test` for the new service and the
migration against the real dev database; `npx tsc --noEmit` + `npx expo lint` at the exact
9-problem baseline for mobile; `tsc`/`oxlint`/`vite build` for web; the local migration
exercised against a **populated** pre-migration SQLite database; the new endpoints curled
against a real backend with real history; and manual QA cases added to `qa/` under
`user-progress` in the same change, automated where `mvn test` can cover them.

---

# Implementation status — 2026-09-18

**Approved with refinements** (all five decisions taken by the project owner, D1 refined: snapshot
the analytics-relevant classification as **ids**, keep `question_id` canonical; D2 deferred out of
V47; D4 pulled ahead of everything else). Implemented in that order. **Nothing committed to git.**

## 1. D4 — the ownership invariant (done first, before any migration)

`ProgressService.upload` previously asked only whether an id existed, not whose it was, and
`toEntity` then set the row's user to the caller — so an upload naming another account's id
`merge()`d over their session **and reassigned ownership**. New `findIdOwners` queries on both
repositories return `[id, userId]`; an id owned by someone else is now skipped and named in
`SyncResponse.rejectedPracticeSessionIds` / `rejectedMockAttemptIds`, while the rest of the batch
stores normally (one bad id must not strand a device's whole queue).

Mobile ids moved from `session-${Date.now()}` / `mocktest-${Date.now()}` to UUIDs — new
`mobile/src/db/ids.ts`, no new dependency (`expo-crypto` is not installed;
`crypto.getRandomValues` where present, `Math.random` otherwise — these ids are
collision-avoidance, never a capability). `web/` already used `crypto.randomUUID()`.

**A bug in this session's own first draft, caught by reading rather than by a test**: the
empty-id-list guard sat inside `ownersOf(...)`, but the repository call is an argument and is
evaluated first — so the guard never fired. Moved to both call sites.

## 2. V47 — capture completeness and the classification snapshot

`user_practice_sessions` gains `started_at`, `duration_ms`, `available_count`, `exam_code`; both
result tables gain `topic_id`, `subject_id`, `difficulty_code`, `is_pyq`, backfilled once from
the current classification. All nullable, all "NULL means unknown, never zero". Six indexes.
**No new table, no `source_type`, no aggregate/streak/trend table** — per the approved scope.

The snapshot is written **server-side at upload** from one batched `findClassifications` query,
rather than sent by the client. That covers every client including old builds and `web/` with no
client change, and freezes the classification against the unbounded case (a retag months after
everyone synced). The residual gap is stated in the code and the API doc: a device offline for
weeks while a question is retagged records the newer tagging.

Mobile migration `0029` adds `practice_sessions.started_at` (the one field neither side had — the
quiz screen held it in a ref and discarded it). `progressSync.ts` now carries all four fields
**both ways**; dropping them on restore would have reproduced the exact loss they exist to stop.

## 3. Mock attempts now feed per-topic mastery

New `recordMockTopicPractice` in `mobile/src/db/topicProgressStore.ts`, called fire-and-forget
after `insertMockTestAttempt`. Groups the attempt's results by topic (joining the device's own
`questions` rows — no attempt table stores a topic), excludes `outcome === "UNATTEMPTED"`, reads
correctness from `outcome` rather than `selectedIndex === correctIndex`, and sums per-question
`timeMs` rather than dividing the attempt's duration across topics.

## 4. The analytics read layer

`UserAnalyticsRepository` (grouped reads over the snapshot — no join to `questions` on any
aggregate), `UserAnalyticsService` (derived on read, nothing stored), `UserAnalyticsDtos`,
`UserAnalyticsController` at `/api/me/analytics/{overview,subjects,topics,difficulty,activity,trends}`.
Contract: new `api/USER-ANALYTICS.md`, indexed in `api/README.md`.

Lean responses per the brief. `trend` is computed by comparing time windows, never stored, and
returns `INSUFFICIENT_DATA` rather than a default `STABLE` when either window is too thin.
Unattempted and `PENDING_REVIEW` answers are excluded from both numerator and denominator.
Averages divide by the *timed* attempts. `null` is returned wherever there is nothing to measure.

Day-bounded figures take an optional IANA `zone` (default UTC) because `users` stores no time
zone; an unknown zone or activity window is a 400, never a silent fallback.

## Verified

- **`mvn test -Dtest=BehavioralAnalyticsTest` — 13/13 pass** against the real Neon dev database,
  and **migration V47 applied cleanly to it** (6.5s including the backfill).
- **Regression: `ProgressSyncTest`, `ProgressHistoryTest`, `WeaknessRadarTest`, `BookmarkSyncTest`
  — 24/24 pass.** `WeaknessRadarTest` matters most: it reads the same two result tables.
- Backend `mvn compile` clean. `packages/core` `tsc` clean and **280/280** vitest.
- Mobile `tsc --noEmit` clean; `expo lint` at the **exact 9-problem baseline**, with all four
  flagged files (`LanguagePickerModal`, `authContext`, `SyncContext`, `bookmarkSync`) confirmed to
  be files this change never touched. `web/` `tsc` clean.
- **The AI test classes were deliberately not run.** `memory/STATUS.md` records that their
  cleanup disables AI in production, since prod and dev share one Neon database.

## QA

New `ANALYTICS` module (`REQ-ANALYTICS-001..005`, `SCN-ANALYTICS-001..006`,
`TC-ANALYTICS-001..006`) plus `REQ-USERPROGRESS-002..005`, `SCN-USERPROGRESS-003..007`,
`TC-USERPROGRESS-003..007`. Nine execution records (`EXEC-ANALYTICS-0001..0009`, all Pass) for
the fully-automated cases that genuinely ran; `TC-ANALYTICS-005` (PartiallyAutomated) and
`TC-USERPROGRESS-007` (ManualOnly, device-side) are deliberately absent from the execution file.
RTM 119/229/250 → **128/240/261**.

## Not verified

- **No emulator or device pass.** Nothing on the mobile side has been run: not the UUID ids, not
  migration `0029` through the real drizzle migrator (a failed migration is a hard startup gate in
  this app — the highest-risk unverified item), not the mock→mastery write, not the four new
  fields reaching the server from a real device. `TC-USERPROGRESS-007` exists for exactly this.
- **No manual curl or browser pass** on the analytics endpoints. They are exercised by real HTTP
  round trips through `TestRestTemplate` against a real backend and database, which is genuine —
  but nobody has read a response by hand against a large real history.
- **No performance measurement.** The aggregate queries have not been timed against a heavy
  account (the demo account's ~350 sessions / ~85 attempts would be the obvious target), and the
  `LIFETIME_DAYS = 365` bound is a judgement, not a measured one.
- **`/trends` empty-week behaviour** is implemented and documented but not asserted by any test.
- **V47 ran against the shared prod/dev Neon database** (this project's standing R7). It is
  additive and Flyway's `ignoreFutureMigrations` default means the deployed build still starts,
  but production now has columns its running code does not populate until the backend is deployed.

## What this deliberately did not build

No recommendation, no "study X next", no readiness score, no daily planner — the brief's §20.
Home's `MOCK.streakDays` / `MOCK.readinessPercent` are still hardcoded; replacing them is a
consuming change, not part of the foundation. No LLM anywhere near these figures (§21). No
diagnostic-test promotion (D2, deferred). No answer-change or explanation-open capture (D5).
