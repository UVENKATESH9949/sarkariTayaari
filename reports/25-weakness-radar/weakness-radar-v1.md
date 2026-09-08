# Weakness Radar / Preparation Intelligence v1

**Requested:** a spec for a new "Weakness Radar" capability — make the app understand a
student's current preparation state per topic (which topics need attention, which are strong,
which are improving, which need revision, which weaknesses matter most, how confident the
system is, and what to do next), built as an extension of the existing Practice / Progress /
mastery / PYQ / topic-priority systems rather than a parallel one. Its §1 and §25 asked for an
architecture assessment *before* any code changed; its §23 listed 15 test cases; its §24 drew a
hard scope boundary (no LLM, no adaptive engine, no predictive score).

**Plan and decisions:** [`../../tasks/TASK-2201-weakness-radar.md`](../../tasks/TASK-2201-weakness-radar.md).
**API contract:** [`../../api/WEAKNESS-RADAR.md`](../../api/WEAKNESS-RADAR.md).

---

## The architecture assessment, and what it found

Done first, against the real code, before anything was written.

**Reusable as-is — no new source of truth was created for any of it:**

| Signal | Where it already lived |
|---|---|
| Practice attempts | `user_practice_session_results` + `user_practice_sessions` |
| Mock attempts | `user_mock_attempt_results` + `user_mock_attempts` |
| Topic per attempt | **Not on the result row** — but `questions.topic_id` is, and the row carries `question_id`, so it is a join. **No new field was needed** |
| Difficulty per attempt | `questions.difficulty` → `difficulty_levels.display_order` |
| PYQ per attempt | `questions.is_pyq` (Epic L / V13) |
| Topic priority | `topic_priority.final_priority` — Epic L's algorithm v2, admin overrides already resolved |
| Topic → exam scope | `exam_topics` (V12) |
| Prerequisites | `topic_prerequisites` (V12) |
| "Can this be practised" guard | `QuestionRepository.countByTopicForExam` |

**Genuinely missing, verified rather than assumed:**

1. **Per-question time does not exist anywhere.** `practice_sessions.duration_ms` is
   whole-session and is *not even in the upload payload* — the server held no practice timing at
   all. Mock held only whole-attempt `time_taken_seconds`.
2. **No expected-time benchmark exists**, per question or per topic. So §9's Speed Ratio could
   not be computed honestly, and §9.2 explicitly says a missing signal must not become fake
   data.
3. **Practice attempts carry no `examCode` server-side** (the device has it; the payload omits
   it). Harmless: health is topic-scoped and the exam enters only through priority.
4. **Signed-out students' attempts never reach the server**, and this app works fully signed
   out.

**Deliberately not reused: `user_topic_progress`.** The existing mastery ladder is
device-derived cumulative state with no recency, no difficulty split and no PYQ split — lossy as
evidence. The radar reads raw attempts instead, and the ladder is untouched.

## The three decisions taken with the user before implementing

1. **Compute site: backend, plus a device-side fallback for signed-out students.** The scoring
   rules therefore exist twice. Chosen knowingly; see "The duplication" below.
2. **Start capturing per-question time now**, as a nullable additive field, while keeping speed
   *out* of the v1 formula. Without capture starting now, a future speed signal has no history
   to benchmark against.
3. **The existing mastery chips on Practice → Topics stay exactly as shipped.** Radar state
   lives only on the new radar screens. No shipped screen changed its labels.

---

## What shipped

### Backend — migration V24, two services, three endpoints

`V24__weakness_radar.sql` adds **one** table and **two nullable columns**. Nothing existing
changes shape and no migration was edited.

- **`user_topic_health`** — one row per (student, topic): health, confidence, state, trend,
  evidence level, the denormalised evidence, `speed_ratio` (always null in v1), an `inputs`
  JSONB audit blob, `evidence_through_at`, `computed_at`. A **cache, not a record** — deletable
  and rebuildable at any time, which is what makes §19's historical recalculation a version bump
  rather than a data migration.
- **`user_practice_session_results.time_ms` / `user_mock_attempt_results.time_ms`** — nullable.
  Null means *not recorded*, never zero.

**`TopicHealthService`** (`TOPIC_HEALTH_V1`) is the only place the formula lives. Everything
below its entry points is pure and static — it takes evidence and a clock and returns numbers,
which is also what made §23 expressible as fixtures. Constants carry §5's declared weights and a
startup assertion that they sum to 1.00, following `TopicIntelligenceService`'s own pattern.

**`WeaknessRadarService`** turns health into advice for *one exam*: it joins the exam's topic
map, Epic L's priority, question availability and the prerequisite DAG, then runs a
deterministic rule table to produce an ordered action plan and reason codes. Nothing here
recomputes health, and nothing in `TopicHealthService` knows what an exam is.

Endpoints: `GET /api/exams/{code}/weakness-radar` (user), `POST .../recompute` (user), and
`GET /api/admin/weakness-radar?email=&examCode=` (admin, read-only, §22's evidence dump).
Full detail is returned in the *list* response — no separate topic-detail endpoint — which is
what makes the app's detail screen work offline from one cached payload.

### The load-bearing design decision: a missing component is dropped, not neutralised

§5 declares seven components. A component with no evidence is **dropped and the remaining
weights renormalised to 1.0**.

The two alternatives are both wrong in ways that would look like a working feature. Scoring an
absent component at a neutral 50 drags every score toward the middle and asserts something never
measured. Leaving the weights unnormalised caps every student below 100 by whatever fraction is
missing — speed alone would cap everyone at 85. Which components were dropped, and why, is
recorded in `inputs` so the admin view can say so.

**Speed is always dropped in v1.** `speedAvailable` is `false` in every response, and the topic
detail screen shows speed as explicitly *not measured* rather than omitting the row — omitting
it would let a student assume their pace was fine.

§7 and §8's bounds fall out of the same structure. Difficulty is scored against a per-difficulty
*expected* accuracy (interpolated across the real `difficulty_levels` ladder, so easy/medium/hard
yields 75/60/45 and a fourth level needs no code change), so answering hard questions at
hard-question accuracy scores neutral — and the term carries 10% of the weight, so no amount of
hard-question attempting can swing health through it. PYQ is capped the same way.

### Health, priority and confidence are three separate stored fields

Confidence is **never in the student-facing response**. Its job is to gate whether a verdict is
asserted at all (health ≤ 55 with low confidence reports `DEVELOPING`, not `NEEDS_ATTENTION`), so
by the time a topic reaches the payload it has already done its work. `evidenceLevel` is what the
app shows instead — the same information as a statement about practice volume rather than a
coefficient. Full mathematics is on the admin endpoint, which is where §22 wants it.

State resolution order is the design, not an implementation detail: no evidence beats everything;
a real regression from a genuinely strong past is its own finding; `STRONG` before `IMPROVING`
so a strong-and-rising topic reads as strong; `IMPROVING` before `NEEDS_ATTENTION`, which is
§6's requirement that a student climbing 51% → 79% is never told they are weak.

### Mobile — two screens, a write-through cache, and the second implementation

- `app/preparation-radar.tsx` (§16) and `app/radar-topic.tsx` (§17), both root-level pushed
  screens. **Not a sixth tab** — the bar is already five, and Progress was itself moved out of
  it in an earlier session. Reached from a card on Progress and a row in More; the screen
  resolves the exam from the followed one, so both entry points are plain taps.
- `data/weaknessRadarData.ts` is the only thing the screens call. Signed in and online → the
  server, written through to `radar_cache`; signed in and offline → the cache, labelled with its
  age; signed out → computed locally. A signed-in student is never served the local computation,
  because their history spans devices.
- `practice/useQuestionTimer.ts` accumulates per-question display time in both the quiz and the
  mock test.
- Local migration **0018** — hand-written, per this project's own drizzle-kit experience.

### Admin — a read-only evidence view (§22)

`pages/WeaknessRadar.jsx`: look a student up by email, see every topic's attempt counts,
historical-vs-recent accuracy, PYQ accuracy, consistency, health, **confidence**, priority,
intervention value, resolved state, recommended action, reason codes, and the `inputs` blob
verbatim. Deliberately no override and no recompute button: health is derived entirely from a
student's own attempts, so the only honest way to change it is for them to practise.

---

## The duplication, stated plainly

The scoring rules exist twice: `TopicHealthService.java` and
`mobile/src/intelligence/topicHealth.ts` (plus `WeaknessRadarService.recommend` and
`localRadar.ts`'s `recommend`). That was decision 2 above, taken because this app works fully
signed out and those students' attempts never reach a server that could score them — showing
them nothing would regress something they already have.

It follows a precedent this codebase already set: the mastery ladder is *already* mirrored
(`TopicProgressState.canTransitionTo` in Java, `deriveState` in `db/topicProgressStore.ts`).
Three defences, all real but none of them free:

1. Every constant has the same name and value on both sides.
2. `sample-data/weakness-radar-fixtures.json` is one agreed statement of expected output, and
   the Java test asserts against it.
3. Cross-reference comments in both files, and a row in
   `system-design/04-where-do-i-change-things.md` saying to change both.

A fourth defence was added after the fact, because the first three are all documentation and
none of them fails when someone forgets: **`scripts/check-topic-health-parity.js`**. It asserts
that every shared constant exists on both sides with the same value, that both
`ALGORITHM_VERSION`s agree with each other and with the fixture file, and that each side's
declared weights still sum to 1.00. It found the two sides already in agreement — 35 shared
constants, plus two that legitimately exist on only one side (`MAX_CACHE_AGE_HOURS` is a
server-only cache policy; `DAY_MS` is a units helper Java expresses with `Duration`).

It was then **tested by breaking it on purpose**: changing the TypeScript `W_ACCURACY` from 0.30
to 0.35 produced both expected failures (the value mismatch and the 1.05 weight sum) and a
non-zero exit, and reverting restored a clean pass. A check nobody has seen fail is not a check.

**The honest residual risk that remains:** the parity script is a floor, not a guarantee — it
cannot see a *rule* whose logic diverged while its constants stayed put. And this project has no
mobile test runner (no jest/vitest is configured), so the TypeScript copy's behaviour is
verified by reading and on the emulator, not by an automated test.

---

## Bugs and near-misses found

### 1. A staleness bug that would have recomputed on every read, forever

Found by reading the diff, not by a failing test. `latestAttemptAt()` sees a student's whole
history, but the evidence query is bounded to 365 days. A student returning after a year has a
real newest-attempt timestamp and yet nothing in window — so the check would find the cache
empty, recompute, write no rows, and conclude it was stale again on the very next read.

Every fixture and every test student has recent attempts by construction, so no test would ever
have caught it. Fixed by asking "is there evidence a recompute could actually use" rather than
"has this student ever practised".

A rarer variant remains and is deliberately not fixed: a student *every one* of whose practised
topics has since been deleted server-side would still recompute per read. Bounded to one grouped
query, and the condition is close to unreachable.

### 2. A `<>` fragment carrying a key that React never sees

The admin table renders two rows per topic. The key was on the inner `<tr>`, inside a shorthand
fragment — which cannot carry one. `oxlint` passed it. Fixed with a keyed `Fragment`.

### 3. `commitCurrent()` that committed nothing

The first draft of `useQuestionTimer` had the elapsed period living in the effect's closure, so
the explicit "bank the question still on screen" call — the one that exists precisely because a
session finishes *before* unmount — could not actually reach it. Caught while re-reading the
file; restructured around a ref so both the cleanup and the explicit call bank the same period
exactly once.

### 4. Three sets of invented names, caught by compiling rather than by assuming

Theme tokens (`colors.surface.raised` / `colors.accent` do not exist — they are
`colors.surfaceElevated` / `colors.brand.primary`), the shared `Button`'s prop shape (`children`,
not `label`), and four CSS classes in the admin console that no stylesheet defines. All would
have rendered as invisible or unstyled UI rather than as errors.

### 5. `expo-router`'s generated route types are stale for a new screen

`npx tsc --noEmit` fails on any newly added screen until `.expo/types/router.d.ts` is
regenerated, which normally only happens when the dev server starts. The documented CI-safe way
is `npx expo customize tsconfig.json` — confirmed against the Expo 57 docs, and it left
`tsconfig.json` itself unchanged.

### 6. A test fixture that hit the wrong correct branch

`aNewStudentGetsAnOnboardingStateRatherThanWeaknesses` initially failed expecting
`GATHER_EVIDENCE` and getting `LEARN_CONCEPT` — because the fixture created no questions, so it
landed in the (correctly behaving) "nothing to practise" branch that a *different* test covers
deliberately. The test was wrong, not the algorithm.

### 7. A nanosecond/microsecond mismatch that made one computation look like two

**The only failure in the full 159-test regression run**, and it turned out to be a real
inconsistency in the code rather than an over-strict test.
`cachedHealthIsReusedUntilNewPracticeArrives` compares the `computedAt` of two consecutive radar
reads to prove the cache was reused, and got:

```
expected: 2026-09-03T12:00:46.031871900Z
 but was: 2026-09-03T12:00:46.031872Z
```

The same instant, 100 nanoseconds apart. `OffsetDateTime.now()` carries nanoseconds; a Postgres
`TIMESTAMPTZ` stores microseconds. The first read recomputes and returns the **in-memory**
entities (nanoseconds); a later cached read loads the same rows back **from the database**
(microseconds, rounded). So `POST /recompute` and a subsequent `GET` reported *different*
`computedAt` for one and the same computation — and the mobile radar cache stores exactly that
field, so a client comparing the two would have seen a change that never happened.

Fixed at the source rather than by loosening the assertion: `recompute()` now truncates its
clock to microseconds, so the value the service believes it wrote is the value that comes back.
This has direct precedent in the codebase — `recordTopicPractice` already rounds accuracy to two
places to match its `NUMERIC(5,2)` column, for exactly the same reason.

### 8. My own drift test killed the running app — and revealed a genuinely bad design choice

Proving the parity script could detect drift meant editing `W_ACCURACY` from 0.30 to 0.35 on
disk. Metro's Fast Refresh pushed that edit straight into the app running on the emulator, and
the module-scope weight assertion did exactly what it was written to do: threw. The app died
with a red `Uncaught Error: Topic health weights must sum to 1.00 but sum to 1.05`, and the dev
overlay stayed on screen after the file was reverted, because an error overlay persists until a
reload.

Restoring the file and reloading fixed it. But the incident exposed something worth more than
the inconvenience: **that assertion could have taken down the entire app in production.**

`expo-router` imports every route file at startup to build its route tree, so
`preparation-radar.tsx` -> `data/weaknessRadarData.ts` -> `intelligence/localRadar.ts` ->
`intelligence/topicHealth.ts` is evaluated on **every launch**. A module-scope `throw` there
means one mistyped constant in a feature the student may never open would kill Practice, Mock
Test, Progress and everything else with it.

The Java equivalent is fine as-is — a static-initializer failure stops the Spring context at
boot, loudly, in a controlled environment, long before a deploy. The device is not that
environment.

**Fixed** by keeping the hard throw under `__DEV__` — where it is genuinely useful, as this very
incident demonstrated — and in a release build reporting via `console.error` (which Sentry's
default React Native integration already forwards) and carrying on. Carrying on is safe, not a
fudge: `renormalise()` divides by the *actual* sum, so a sum of 1.05 still preserves the relative
weighting and still produces a 0-100 score. A slightly mis-scaled health figure is a much better
outcome for a student than a dead app.

Re-verified afterwards: the app relaunched clean and the radar rendered the same diagnosis as
before the change, `tsc` clean, `expo lint` still at the 9-problem baseline.

### 9. One fixture expectation was my own arithmetic error

The stale-evidence case asserted confidence ≤ 70 and got 71.11. The algorithm was right. Rather
than move the bound, the case was **restated as a relation** — an identical-but-fresh twin
fixture, with the stale one asserting its confidence is strictly below it. That is the honest
form of §21's requirement ("reduce recency influence"), and an absolute bound there would only
have asserted the current weights back at themselves. The fixture now also records what the
number actually is (≈71, down from ≈89 fresh) and why that is the right answer rather than a gap.

---

## Verified

**Backend**

- `mvn -f backend/pom.xml compile` — clean.
- `TopicHealthScoringTest` — a **plain unit test**, no Spring and no database: 20 fixture cases
  from `sample-data/weakness-radar-fixtures.json` plus 4 dedicated tests (purity, no-evidence,
  renormalisation, the one-lucky-answer trap). 19 of 20 fixture cases passed on the first run;
  the one failure was finding #7 above.
- `WeaknessRadarTest` — 10 integration tests against the real Neon dev database, covering the
  question→topic join, unattempted mock questions being excluded from accuracy, the onboarding
  state, cache reuse and invalidation, a recompute leaving raw attempts byte-identical, exam
  priority changing the ranking, the empty-question-bank guard, and 401/403/404 on both
  endpoints. 9 of 10 passed on the first run; the one failure was finding #6 above.
- **Full suite: 159 tests, 1 failure** — that one being finding #7 above, in this task's own
  test, exposing a real precision inconsistency in this task's own code. Fixed at the source,
  after which **both radar classes were re-run and are green: 15 tests, 0 failures, 0 errors**
  (5 unit + 10 integration).
  **The full 159-test suite was not re-run after that fix.** The change is one line in
  `TopicHealthService.recompute()` and affects only the precision of a timestamp written to
  `user_topic_health` — a table no other test class reads or writes — but that is reasoning,
  not a green run, and it should be stated as such. Every other class in the suite passed
  before the fix and none of them touches the changed code path.

**Mobile**

- `npx tsc --noEmit` — clean.
- `npx expo lint` — back to the exact pre-existing baseline of **9 problems (8 errors, 1
  warning)**, all in files this task never touched. Two new warnings were introduced and fixed
  in the same pass (an unused type import, and `timedAnswers` accumulated then dropped — fixed
  by surfacing it as `timedAnswerCount`, which is the field that proves the speed signal is
  absent for want of data rather than for want of a formula).

**Admin**

- `npm run build` — clean. `npx oxlint` — its one pre-existing warning, nothing new.

**Cross-implementation**

- `node scripts/check-topic-health-parity.js` — passes, and was proven to fail on a deliberate
  one-constant drift before being trusted.

**Documentation updated** (AI_RULES §2/§3.5/§3.18): new `api/WEAKNESS-RADAR.md`;
`api/USER-PROGRESS.md` (the optional `timeMs` on both result shapes, with a section on why null
never means zero); `api/README.md`; `system-design/02-database.md` (V24, the derived table, the
`radar_cache` device table); `system-design/04-where-do-i-change-things.md` (the two screens, and
the two-copies rule for the formula). `api/CONTENT-CATALOG.md` and the other pre-existing
uncommitted edits in those files belong to another session and were extended around, not
touched.

---

## On-device verification (Android emulator `emulator-5554`, AVD `Pixel_7`)

A physical device was attached to this machine throughout and was **never driven** — it is the
user's own, per this project's standing rule; every `adb` call was pinned to
`-s emulator-5554`. The emulator was launched with the user's explicit go-ahead.

**Migration 0018 against a genuinely populated pre-0018 database — the riskiest single item,
since a failed local migration is a hard startup gate in this app.** This emulator carries a
real, months-old database from prior sessions. Its contents were snapshotted with
`adb exec-out run-as … cat` (binary-safe; the plain `adb shell` redirect corrupts the file, as
this project's notes already record) both before and after:

| | before | after |
|---|---|---|
| `practice_sessions` | 351 | 351 |
| `practice_session_results` | 3961 | 3961 |
| `mock_test_attempts` | 85 | 85 |
| `mock_test_attempt_results` | 10035 | 10035 |
| `questions` | 460 | 460 |
| `exam_topic_intelligence` | 594 | 594 |
| `topic_progress` | 7 | 7 |
| `radar_cache` table | absent | present |
| `practice_session_results.time_ms` | absent | present |
| `mock_test_attempt_results.time_ms` | absent | present |

Not one row lost, and **all 3961 existing result rows have `time_ms` NULL — zero of them are
`0`**, which is the property every reader depends on. The app started with no migration error,
so the two unguardable `ADD COLUMN`s executed cleanly on a populated table.

**Both entry points render.** Progress shows the "Preparation Radar / See which topics need
attention, and what to do about each" card directly under the readiness ring; More shows a
"Preparation Radar / What to work on next, and why" row under STUDY, after Progress.

**Signed in with the backend unreachable, and no cache yet** → the radar screen showed its
error state ("Radar unavailable … there's nothing saved on this device yet. Try again once
you're online") with a working Try Again. That is the designed behaviour for the one
genuinely unrecoverable combination.

**Signed out — the local computation, on this device's real 351 sessions / 3961 answers.**
Signed out of the real `demo@sarkaritaiyaari.app` account and reopened the radar. Everything
came out coherent and derived from real data, not placeholders:

- Overview: **"On track"**, `0 need attention / 3 revise / 1 improving / 6 strong`, and
  "23 of 61 topics practised · 18 with enough practice to be sure".
- The source note read **"Based on practice on this device. Sign in to include practice from
  your other devices."** — the signed-out label, correctly chosen.
- **Ratio & Proportion → "Worth revising"**, "used to be one of your stronger topics and has
  slipped recently", 70% accuracy, ↓ slipping, **high exam weight**. So `NEEDS_REVISION` and
  the `HIGH_EXAM_WEIGHT` reason both fired off real Epic L priority data — and on the very
  topic the spec's §14 uses as its own worked example.
- **LCM & HCF** and **Geometry** → "builds on a topic that is not solid yet — that one first",
  so `PREREQUISITE_GAP` fired off the real `topic_prerequisites` DAG, and Geometry correctly
  showed its parent ("Quantitative Aptitude · LCM & HCF").
- **Simplification & Approximation → "Improving"** at 68% accuracy, ↑ improving. This is §6
  and §12's central requirement working on real data: a student in the high 60s who is clearly
  climbing is *not* labelled weak.
- **Mixture & Alligation** → "swings a lot between sessions — steadier practice will settle
  it", so `HIGH_VARIANCE` fired (§10).

**The §17 topic detail, on Ratio & Proportion:** status and a plain-language why; the two
reason codes rendered as sentences; Accuracy 70%; "43 of 61 correct"; **"Recent vs earlier:
79% → 53% · Down 26 points"**; **"Real exam questions — / None answered yet"**; **"Speed — /
Not measured yet — we don't have a reliable time benchmark for these questions"**; "Consistency:
Steady across sessions"; and the plan "Revise what you already knew here → Practise 10 questions
at exam level → Finish with a timed mini-test". The PYQ step was correctly *absent* from the
plan because no PYQs are tagged for this topic — the `pyqAvailable` guard doing its job. **No
confidence value appeared anywhere**, per §11.

**The loop closes.** "Start recommended practice" opened Practice's own "Choose a level" screen
scoped to Ratio & Proportion — the same route every other entry point in the app uses. (It
offered only 1 question, because this particular emulator holds the frozen 460-question snapshot
already documented in `memory/STATUS.md`, not because of anything here.)

**`radar_cache` held 0 rows after the signed-out visit** — the local path deliberately does not
write a cache, and it didn't.

### A process note worth keeping

Repeatedly deep-linking `sarkaritaiyaari://expo-development-client/?url=…` to reconnect the dev
client **stacks a second `MainActivity`**, and the new top one renders blank. `dumpsys window`
shows two `mCurrentFocus` lines when this has happened, and both `screencap` and
`uiautomator dump` then report an empty screen — which looks exactly like a crashed app. A
`force-stop` followed by **one** launch fixes it. Roughly twenty minutes went into chasing a
"blank screen" that was this, not a bug: the real tell was that Metro's log showed the app
perfectly healthy (`[cache] hybrid mode -> live`, delta sync running) the whole time.

## Not verified
