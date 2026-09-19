# Behavioural data foundation (TASK-2801)

**Date:** 2026-09-18 · **Branch:** `feature/on-device-llm-spike` · **Committed:** no

Scope doc and the full pre-implementation audit:
[`tasks/TASK-2801-behavioral-data-foundation.md`](../../tasks/TASK-2801-behavioral-data-foundation.md).
API contract: [`api/USER-ANALYTICS.md`](../../api/USER-ANALYTICS.md).

---

## What was asked, and what the audit changed about it

The project owner supplied a 25-section brief: capture the student's meaningful activity
automatically, preserve raw behavioural events, derive metrics from them, and explicitly **do
not** build the recommendation engine yet. Its §25 required an architectural analysis of the
existing repository before any code changed.

That analysis is the most useful thing this session produced, because **most of what the brief
asks for already existed** and building it as specified would have duplicated live tables.

**Three of the brief's premises did not survive, and all three are recorded rather than quietly
worked around:**

1. **The raw event store already exists.** `user_practice_session_results` and
   `user_mock_attempt_results` (V6, extended by V24's `time_ms` and V26's response model) are
   already one row per question, carrying `outcome` — which is precisely the `answer_status` the
   brief's §3 asks for, backfilled across all history by V26 so it can be trusted
   unconditionally. A new `question_attempts` table would have been a second copy.
2. **`REVISION` is not a thing in this product.** `app/revise.tsx` is a read-only review screen —
   bookmarks and past wrong answers, no answering, no session. Adding that source type would have
   meant inventing product behaviour to satisfy an enum, which the brief's own §4 forbids. The
   real third source is the **diagnostic test**, which is local-only with no server table at all.
3. **"Existing analytics functionality" is thinner than it looks.** `trackEvent()` writes Sentry
   breadcrumbs — ephemeral crash context, never persisted, never queryable. And Home's streak and
   readiness are literally `const MOCK = { streakDays: 3, readinessPercent: 62 }`.

The owner accepted the corrected scope and refined one decision: snapshot the
**analytics-relevant classification as ids**, keeping `question_id` canonical — not every piece
of question metadata. They also pulled the integrity fix ahead of everything else, and deferred
the diagnostic-test work out of this migration.

---

## The defect the audit found, fixed first

`ProgressService.upload` decided create-vs-overwrite from
`practiceSessions.findAllById(sessionIds)` — **not scoped to the calling user** — and `toEntity`
then set the row's user to the caller. So an upload naming an id owned by someone else
`merge()`d over their session **and reassigned ownership to the caller**: silent data loss for
one account, corrupted history for the other.

It was reachable two ways. Deliberately, because mobile generated `session-${Date.now()}` and
`mocktest-${Date.now()}` — trivially guessable. And by accident, because a millisecond timestamp
is unique on one device and emphatically not across a user base.

Read paths were already correctly scoped (`findByIdAndUserId`), so this was a write-integrity
issue rather than a read leak — but a personalization engine reading these rows as evidence would
have inherited corrupted ownership.

**Fixed on both sides.** The server now resolves `[id, userId]` for the incoming ids, skips any
owned by another account, and names them in the response. Skipping one row rather than failing
the batch is deliberate: the rest of a device's queue is blameless, and rejecting all of it would
strand a student's whole history behind one bad id. Mobile moved to UUIDs (new
`mobile/src/db/ids.ts`, no new dependency — `web/` already used `crypto.randomUUID()`).

**A bug in this session's own first draft, caught by reading not by a test:** the empty-id-list
guard sat inside the helper, but the repository call is an argument and is evaluated first, so
the guard never fired. Moved to both call sites.

---

## Migration V47 — what was genuinely missing

**Practice sessions lost their timing and their exam.** `duration_ms`, `available_count` and
`exam_code` were recorded on the device since Doc 2 §7 and never sent — absent from `ProgressDtos`,
from the payload, from the table. They were lost outright on a device change, and no server-side
study-time figure was possible. There was no `started_at` for a practice session anywhere, on
either side. Mock attempts have carried the equivalent since V6.

**Classification was read live, so retagging rewrote history.** Every reader — `TopicEvidenceRepository`
server-side, `localEvidence.ts` on device — joined `questions` on `question_id` to get topic,
subject, difficulty and PYQ status. Correct for a screen; wrong for an event store. A student who
answered forty Percentage questions became a student who answered forty Profit & Loss questions,
retroactively, the moment an admin retagged them.

V47 adds the four session fields and freezes the four classifiers onto each attempt, backfilled
once from the current classification. All nullable, all "NULL means unknown, never zero".

**The snapshot is written server-side at upload**, from one batched query, rather than sent by the
client — that covers every client including old builds and `web/` with no client change. The
residual gap is stated in the code and the docs rather than hidden: a device offline for weeks
while a question is retagged records the newer tagging. Narrow and bounded, unlike the unbounded
case it fixes.

**Deliberately not built:** no `user_personalization`, no streak table, no trend table, no
aggregate cache. Every figure they would hold is derivable from immutable rows, and a stored
derived value is a second thing that can be wrong. `user_topic_health` (V24) is the pattern to
copy if one is ever genuinely needed.

---

## A second inconsistency, found while auditing and fixed

`recordTopicPractice` was called only from the practice quiz and the diagnostic test. **Mock tests
never touched `user_topic_progress` at all** — a student could sit twenty mocks and have mastery
show nothing for the topics they were tested on, while Weakness Radar, which reads both sources,
disagreed about the same student.

New `recordMockTopicPractice` closes it, device-side to match practice, with the two rules this
codebase has already established: unattempted questions are excluded rather than counted wrong
(running out of time on a timed paper is normal), and correctness reads `outcome`, never
`selectedIndex === correctIndex`, which has no meaning for MULTIPLE_CHOICE/TRUE_FALSE.

---

## The read layer

`/api/me/analytics/{overview,subjects,topics,difficulty,activity,trends}` — user-scoped from the
token, with no user-id parameter anywhere, so one account cannot address another's figures. Raw
attempt rows stay behind `/api/progress`.

Everything is computed on read. `trend` compares two time windows and returns
`INSUFFICIENT_DATA` rather than defaulting to `STABLE` when either is too thin. Averages divide by
the *timed* attempts, never by all of them. `null` is returned wherever there is nothing to
measure, and `totalStudyTimeMs` ships alongside `practiceSessionsWithoutDuration` so a figure that
necessarily under-reports pre-V47 history is interpretable rather than quietly short.

Day-bounded figures take an optional IANA `zone`, because `users` stores no time zone — onboarding
never asked and the profile is device-local. An unknown zone or window is a 400, never a silent
fallback to a different day boundary than the caller asked for.

**No advice, and no LLM.** Nothing here says what to study next; that is the next milestone's job,
and keeping measurement separate is what lets the planner be rewritten without re-deriving what a
student actually did.

---

## Verified

| Check | Result |
|---|---|
| `mvn test -Dtest=BehavioralAnalyticsTest` | **13/13 pass**, real Neon dev database |
| Migration V47 against that database | **applied cleanly**, 6.5s including the backfill |
| Regression: `ProgressSyncTest`, `ProgressHistoryTest`, `WeaknessRadarTest`, `BookmarkSyncTest` | **24/24 pass** |
| `mvn compile` | clean |
| `packages/core` | `tsc` clean, **280/280** vitest |
| mobile `tsc --noEmit` | clean |
| mobile `expo lint` | **exactly the 9-problem baseline**; all four flagged files untouched by this change |
| `web/` `tsc` | clean |

The two rejection paths were confirmed to actually execute, not merely to pass by the ids not
colliding — the backend logged `progress.sync rejected ids owned by another account` twice during
the run.

**The AI test classes were deliberately not run.** `memory/STATUS.md` records that their cleanup
disables AI in production, because prod and dev share one Neon database.

---

## Not verified

- **No emulator or device pass — nothing on the mobile side has been run.** Not the UUID ids, not
  the mock→mastery write, not the four new fields reaching the server from a real device, and
  **not migration `0029` through the real drizzle migrator**, which is the highest-risk item here:
  a failed migration is a hard startup gate in this app. `TC-USERPROGRESS-007` exists for exactly
  this and is recorded `Not Executed`.
- **No manual curl or browser pass** on the analytics endpoints. They are exercised by real HTTP
  round trips against a real backend and database, which is genuine — but nobody has read a
  response by hand against a large real history.
- **No performance measurement.** The aggregates have not been timed against a heavy account, and
  `LIFETIME_DAYS = 365` is a judgement, not a measured bound.
- **`/trends` empty-week behaviour** is implemented and documented but asserted by no test.
- **V47 ran against the shared prod/dev database** (this project's standing R7). It is additive,
  and Flyway's `ignoreFutureMigrations` default means the deployed build still starts — but
  production now has columns its running code will not populate until the backend is deployed.

## Documentation updated

`api/USER-ANALYTICS.md` (new), `api/README.md` (index row), `api/USER-PROGRESS.md` (the four new
practice fields, the ownership rule, the snapshot note), `system-design/02-database.md`.

Two pieces of drift fixed in place per `AI_RULES.md` §6, neither caused by this change:
`02-database.md`'s Group 5 table map **omitted `user_topic_progress` (V14) entirely** — it appeared
only in the migration list at the bottom of the file — and that same migration list **stopped at
V39**, missing V40-V46.

## QA

New `ANALYTICS` module (`REQ-ANALYTICS-001..005`, `SCN-ANALYTICS-001..006`,
`TC-ANALYTICS-001..006`) plus `REQ-USERPROGRESS-002..005`, `SCN-USERPROGRESS-003..007`,
`TC-USERPROGRESS-003..007`. Nine execution records (`EXEC-ANALYTICS-0001..0009`, all Pass) for the
fully-automated cases that genuinely ran. `TC-ANALYTICS-005` (PartiallyAutomated) and
`TC-USERPROGRESS-007` (ManualOnly, device-side) are deliberately absent from the execution file
rather than recorded as passes. RTM 119/229/250 → **128/240/261**.

## Next

1. An emulator pass — migration `0029` first, then a mock attempt updating mastery, then a real
   practice session's timing reaching the server.
2. Then the planning layer the owner outlined: analytics → topic health → learning state →
   roadmap → workload distribution → daily tasks. That is an algorithm problem now, not a schema
   one, which is what this milestone was for.


---

# Addendum, same day — per-question timing on `web/` (Phase 1's last open item)

The brief's own Phase 1 checklist included "capture web timeMs", and it was the one item TASK-2801
did not close. `web/src/practice/PracticeQuiz.tsx` and `web/src/mocktest/MockTestEngine.tsx` sent
no `timeMs` at all, so **every answer ever given in a browser was permanently unmeasured** — and
average question time per topic is a direct input to the workload estimation Phase 4 of the
personalization program needs.

**New `web/src/questions/useQuestionTimer.ts`**, a deliberate mirror of
`mobile/src/practice/useQuestionTimer.ts`: same 5-minute per-question ceiling, same accumulation
across revisits (both screens let a student move back and forth, so "time on question 4" is the
total of every period it was on screen), same `null`-not-zero rule, same `commitCurrent()` for the
question still showing when a session finishes. The two files are separate because one is a
React-DOM hook and the other a React-Native hook, and `packages/core` is platform-pure and holds
no React — the duplication is one constant and ~40 lines, and it is recorded here rather than
hidden.

`timeMs` now flows through `PracticeResult` → `PracticeResultPayload` and `MockResult` →
`MockResultPayload`. Both new fields are optional so a session already sitting in a browser tab's
`sessionStorage` from before this release still parses.

**The bug this shape exists to avoid**, carried over from mobile's design: the effect that banks a
period only fires on navigation or unmount, but a session finishes while its last question is
still on screen and unmounts *after* the results are built. Without the explicit
`timer.commitCurrent()` at submit, the final question's time is always null. The mock path needs
it for a second reason — an auto-submit on timeout navigates away from nothing.

**Verified:** `web/` `tsc` clean, `oxlint` at its zero-warning baseline, `vite build` clean
(393 kB / 116 kB gzipped).

**Not verified:** no browser pass. Nobody has watched a real session produce real times, and
`web/` has no browser-test runner, so `TC-USERPROGRESS-008` is `ManualOnly` and `Not Executed`.
Its step 3 is written as the explicit regression guard for the last-question case above, and its
step 6 exercises the 5-minute cap.

**Doc drift corrected in place per §6, this one caused by TASK-2801 itself**:
`api/USER-PROGRESS.md`'s per-question-time section still said "**nothing consumes it yet**", which
stopped being true the moment `/api/me/analytics` began reporting `averageTimeMs`. Rewritten to
name the one real consumer and to keep the genuine non-consumer distinct — the Weakness Radar's
*speed* component is still off, because it needs an expected-time benchmark and an average is not
a benchmark.

**QA:** `REQ-USERPROGRESS-006`, `SCN-USERPROGRESS-008`, `TC-USERPROGRESS-008`.
RTM 128/240/261 → **129/241/262**.


---

# Gate 1 — the device pass (emulator-5554, AVD Pixel_7)

Run at the project owner's direction before starting Phase 3. A physical device was attached
throughout and was **never touched**; every `adb` call was pinned to `emulator-5554`.

## Verified

**Migration `0029` through the real drizzle migrator — the highest-risk item in the program.**
The device held a genuine pre-0029 database (29 migrations applied, `started_at` absent, 37,094
questions). After launch: **30 migrations, the column present, all 37,094 questions preserved,
and no "Database migration failed" screen** — the hard startup gate passed. Later in the session
the same migration was also proven from scratch, when the app rebuilt an empty database and
applied all 30 in one chain.

**Strengthened off-device first**, because the device's practice tables were empty (this emulator
was wiped for the 2026-09-17 onboarding session): a populated copy of the real pre-0029 database
was seeded with a legacy session + result row, `0029` applied to it, and the pre-existing row came
back **byte-identical** with `started_at` NULL — not 0, not `""` — and its child row's `time_ms`
intact. A re-run correctly fails with `duplicate column name`, confirming it is one-shot and that
drizzle's journal is what prevents a second application.

**Practice-session capture, from a real session** (Pipes & Cisterns, Easy, 2 of 42 answered):

```
started_at 1789732625754   completed_at 1789732854339   duration_ms 228585
available_count 42   total_count 2   exam_code SSC_CGL
per-question time_ms: 103361, 125053
id: session-c1625ea0-...   <- a UUID, so the TASK-2801 id change is live
```

`duration_ms` is **exactly** `completed_at − started_at`, and the Summary screen independently
read "Finished early · 2 of 42 answered, 40 left" — the offered-vs-answered split working end to
end.

**Mock attempts now feed per-topic mastery — the behaviour that did not exist before.** A real
SSC CGL Tier 1 attempt: 3 answered, **97 left unattempted**, submitted (the app's own dialog said
"97 questions unanswered"). Stored as 1 correct / 2 wrong / 97 unattempted / 100 total. Mastery
then held three new rows:

| topic | attempted | correct | total_time_ms |
|---|---|---|---|
| Matrix | 1 | 0 | 69,285 |
| Seating Arrangement | 1 | 0 | 7,551 |
| Syllogism | 1 | 1 | 72,082 |
| *Pipes & Cisterns (practice, not in this mock)* | *2* | *1* | *228,585* |

Exactly the **3 answered**, not the 100 offered — the skipped questions excluded rather than
counted wrong. Correctness matches the attempt's own 1-correct/2-wrong split, per-topic time is
summed from real per-question values rather than the attempt duration divided across topics, and
a topic the mock did not cover is untouched.

**Incidentally closed a gap this file's predecessor flagged:** onboarding steps 2-7 had never been
seen on a device. All seven rendered and completed, including the content-language step (offering
English and Hindi — the real catalogue, not the fabricated eleven-language list), and Home showed
the personalised greeting "Good evening, venkatesh 👋 / Preparing for SSC CGL".

## Not verified — and one observed failure

**The four new practice-session fields arrived NULL at the server.** After signing in,
`GET /api/progress` returned the session with `startedAt`, `durationMs`, `availableCount` and
`examCode` all null, while `timeMs` on both results arrived correctly. Recorded as
`EXEC-USERPROGRESS-0002`, status **Fail**, because the acceptance criterion is a round trip and it
did not happen.

**It is not diagnosed, and is deliberately not logged as a defect.** Evidence both ways:

- The **server is correct**: the same payload sent by `curl` to the same running backend stored and
  returned all four fields exactly, and 13 integration tests cover the path.
- The **client source is correct**: `progressSync.ts` builds all four, `uploadProgress` passes the
  payload straight through, `packages/core` is consumed from source (no stale `dist`), and both
  sign-in paths in `authContext.tsx` go through the same single function.
- The **device's own database had the values**, so they were not missing at the source.

The leading hypothesis is a stale Metro transform of `progressSync.ts` in the bundle the device was
running — Metro had died and been restarted during the session, and its on-disk cache survives
that. **Next run should start with `expo start --clear`** to eliminate that variable before
suspecting product code.

## A mistake of mine, recorded so it is not repeated

Trying to force a re-upload, I pushed an edited copy of the database back with
`adb shell "run-as … sh -c 'cat > …'"`. **`adb shell` stdin is not binary-safe for writes** — the
64 MB file arrived as 337 bytes and the app then failed to start with "Database migration failed".
This is the write-side counterpart of the already-documented read-side trap (`adb exec-out` rather
than `adb shell` for `cat`), and there is no clean `exec-in` equivalent. Recovered by deleting the
corrupted file and letting the app rebuild, which it did cleanly. The practice and mock evidence
above had already been captured; what was lost was the chance to re-test the upload in this
session.

## Environment notes worth keeping

- **Metro died mid-session.** Because expo-router lazy-loads routes, the symptom was a Start Test
  button that silently did nothing — not a crash. Check `http://localhost:8081/status` before
  concluding a button is broken.
- **`uiautomator dump` served a stale tree repeatedly**, showing "Question 1 of 100 · 0/100" while
  a screenshot of the same moment showed "Question 3 of 100 · 3/100" with the timer running. The
  screenshot is the authority — the same trap this project recorded during the Wave A pass.
- **The LogBox duplicate-key warning** (pre-existing, `quiz.tsx:869`) again intercepted taps well
  above its visible bounds, blocking the Finish row until dismissed.

## Left behind

The pre-existing dev backend on :8080 (started 2026-09-17 22:50, not mine) was **left running and
untouched**; my own backend ran on :8090 and was stopped, and the `adb reverse` remap was restored.
Two test accounts created during the pass — `gate1.device@example.com` and `gate1.ui@example.com`,
plus a `curl-check-1` session — remain in the shared dev database, the same category as the
existing `automated-test-*` fixtures; there is no user-delete endpoint to remove them through.
The emulator was left running.


---

# Correction, 2026-09-19 — the Gate 1 failure is resolved, and my hypothesis was wrong

The Gate 1 section above records the four new practice-session fields arriving **NULL** at the
server, and names a stale Metro transform as the leading hypothesis. **That hypothesis was wrong.**
Re-running the whole flow with a cleared Metro cache resolved it — but not for the reason predicted.

## The real cause

**The app's baked-in base URL is `http://10.0.2.2:8080/api`** — the Android emulator's
*host-loopback alias*. That address resolves to the **host machine's** port 8080 and therefore
**completely bypasses `adb reverse`**.

The previous run had set `adb reverse tcp:8080 tcp:8090` and assumed that pointed the device at the
V47 backend. It did not: `adb reverse` only maps the *device's own* localhost, which this app never
uses. So the device was uploading to whatever was listening on **host:8080** — and that was the
**stale backend left running since 2026-09-17 22:50**, deliberately left untouched that session
precisely because it was not mine.

That build predates V47. Its `ProgressDtos.PracticeSession` had no `startedAt`, `durationMs`,
`availableCount` or `examCode`, and Spring Boot configures Jackson to **ignore unknown JSON
properties** rather than reject them — so those four were silently dropped on arrival, while
`timeMs` (which existed in that older build, from V24) came through untouched.

Every piece of evidence now fits, including the one that originally pointed at the bundle: the
fields that arrived were exactly the pre-existing ones and the fields that vanished were exactly
the ones added in this task. That pattern is equally consistent with an old *server* DTO as with an
old *client* bundle — and it was the server.

**The client was never at fault, and neither was Metro's cache.**

## The re-run, with the V47 backend on the port the app actually uses

A real practice session (Pipes & Cisterns, Easy, 2 of 42 answered) stored locally:

```
started_at 1789744511576   duration_ms 149511   available_count 42   exam_code SSC_CGL
```

and after signing in, `GET /api/progress` returned:

```
startedAt "2026-09-18T15:15:11.576Z"   ← the same instant as the local value, exactly
durationMs 149511   availableCount 42   examCode SSC_CGL
per-result timeMs [76751, 72305]
```

Then, from the same real data, `GET /api/me/analytics/overview?zone=Asia/Kolkata`:

```
totalStudyTimeMs 149511   practiceSessionsWithoutDuration 0
currentStreakDays 1   longestStreakDays 1   daysSinceLastActivity 0
```

and `/topics`: `attempts 2`, `averageTimeMs 74528` — **exactly** the mean of 76751 and 72305 —
with `mockAccuracy: null` (never answered in a mock, not 0%) and `trend: INSUFFICIENT_DATA`
(one session is not a direction of travel). Every null-policy rule this API documents held on real
device data.

**Gate 1 is now clean.** Recorded as `EXEC-USERPROGRESS-0003` (Pass). `EXEC-USERPROGRESS-0002` is
deliberately **kept as a Fail** rather than rewritten — it genuinely failed when it ran — following
the same two-record convention `TC-CATALOG-055` already set. Neither carries a defect id, because
no product code was at fault.

## The environment lesson, which is the durable part

> **`adb reverse` does not affect `10.0.2.2`.** This app's dev build targets the host directly via
> that alias, so port-remapping tricks silently do nothing and the device quietly talks to whatever
> is already on the host's port 8080. Run the backend under test on **8080 itself**, and check what
> is already listening there first.

This is the third distinct appearance of the same underlying trap in this project's history — a
stale process on a dev port serving code that is not the code under test. The earlier two are
already recorded (`reports/13-hybrid-online-sync/` and TASK-2501's own verification pass). What is
new here is that checking the port was not enough: I *did* observe that :8080 was stale and 404ing
the new endpoint, and still routed around it in a way that had no effect.

A secondary note, unrelated to the bug: Metro's cold rebuild after `--clear` stalled for ~15
minutes at **1.28 GB free of 15.67 GB**, then bundled in **20s / 2,717 modules** once restarted
with memory freed — matching this project's own previously recorded figure almost exactly. The
stall is resource pressure, not a broken cache.
