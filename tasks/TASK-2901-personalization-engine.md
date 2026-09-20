# TASK-2901 — Personalization engine: the seven-phase program

**Status: ALL SEVEN PHASES SHIPPED** (2026-09-19 / 2026-09-20). Every gate is clean.

| Phase | Task | Shipped | Migrations |
|---|---|---|---|
| 1 Data integrity & capture | [TASK-2801](TASK-2801-behavioral-data-foundation.md) | 🔴 **Gate 1** — device-verified | V47, mobile 0029 |
| 2 Analytics foundation | TASK-2801 | with Phase 1 | — |
| 3 Canonical learning state | [TASK-3001](TASK-3001-canonical-learning-state.md) | 🟠 **Gate 2** | none needed |
| 4 Roadmap + workload | [TASK-3101](TASK-3101-personalized-roadmap-and-workload.md) | ✅ | none needed |
| 7 Revision & assessment timing | [TASK-3201](TASK-3201-revision-and-assessment-timing.md) | ✅ | none needed |
| 5 Daily task assignment | [TASK-3301](TASK-3301-daily-task-assignment.md) | 🟡 **Gate 3** | V48, V49 |
| 6 Adaptive re-planning | [TASK-3401](TASK-3401-adaptive-replanning.md) | 🟢 **Gate 4** | V50 |

**What the program did not turn out to need.** Three of the seven phases shipped with **no
migration at all**, because the audit for each found the capability already present and the work
was naming and exposing it rather than building it. Phase 6 in particular found the adaptation loop
already closed by Phases 3-5 — it added legibility and a record, not an engine. That pattern held
from the first phase to the last, and is the single most useful thing to carry into the next
program.

**The gap the whole program now has: none of it is visible.** All five endpoints work and none has
a caller — see each phase's report, and `memory/STATUS.md`'s resume point.

This is the program-level plan: what each phase is for, **what already exists for it in this
codebase**, what it must decide before starting, and what would make it done. Each phase gets its
own `TASK-29xx` doc and its own sign-off when it starts. This file exists so the phases are not
re-planned from scratch each time — and so nobody builds a planner on top of an undefined state.

---

## The seven phases

```
PHASE 1  Data integrity & capture          ── shipped, not device-verified
   ↓
PHASE 2  Analytics foundation              ── shipped
   ↓
PHASE 3  Canonical learning state  ⭐ GATE
   ↓
   ├──────────────┬──────────────┐
   ▼              ▼              │
PHASE 4        PHASE 7           │
Roadmap +      Revision &        │
workload       assessment        │
   │              │              │
   └──────┬───────┘              │
          ▼                      │
      PHASE 5  Daily task assignment
          ▼
      PHASE 6  Adaptive re-planning
          │
          └──────────► back into the state (Phase 3)

               AI sits on top, afterwards — not a phase of this system
```

**AI is deliberately not a phase.** Its infrastructure is already built and three features are
live in production. It consumes what Phases 3-7 produce; it is not part of producing it. Folding
it in as "Phase 8" invites it being started early, which is exactly the failure mode to avoid.

## The principle

```
RAW HISTORY → ANALYTICS → LEARNING STATE → PLAN → TASKS → new behaviour → (loop)
```

1. **Derived data is never the source of truth.** Every state, score, plan and task must be
   reproducible from the immutable attempt rows. `user_topic_health` (V24) is the worked example:
   drop the table, the next read rebuilds it identically.
2. **Deterministic decisions, AI narration.** `tasks.ts` already declares
   `PERSONALIZED_RECOMMENDATION`, `STUDY_PLAN` and `TOPIC_ANALYSIS` as `DETERMINISTIC`-only, with
   comments naming the services that answer them, specifically to stop someone rebuilding them
   with a model.
3. **A phase ships when the phase above it can read from it**, not when it looks good on a screen.

---

# Phase 3 is the centre of this plan, so it comes first here

## The correction that reshaped this document

The earlier draft of this plan said Phase 3 should "converge" three models into one canonical
learning state. **That was wrong, and collapsing them would destroy information.**

`user_topic_progress`, `user_topic_health` and the analytics trend are not three competing answers
to one question. They are three *dimensions*, and a planner that knows all three can reason in a
way that one flattened label never could:

```
Geometry
  Learning state : PRACTICING        ← where the student is in the curriculum
  Health         : NEEDS_ATTENTION   ← how they are currently performing
  Trend          : DECLINING         ← which way it is moving
  Confidence     : HIGH              ← how much any of this can be trusted
  Last studied   : 5 days ago        ← recency
```

"Geometry is weak" cannot distinguish a student who has barely started from one who was strong
and is slipping. The composite can, and Phases 4-7 need that difference: the first wants
foundational practice, the second wants revision.

**So Phase 3's deliverable is a contract, not a model.** One canonical composite, each dimension
owned by exactly one producer, with defined semantics — and nothing new invented that an existing
producer already answers.

## The dimensions, and who owns each today

| Dimension | Question it answers | Current owner | Status |
|---|---|---|---|
| **Learning state** | Where is the student in this topic's curriculum? | `user_topic_progress.state` (V14) — NOT_STARTED / LEARNING / PRACTICING / MASTERED / NEEDS_REVISION | Exists. Device-derived, synced last-write-wins, cumulative. Already gates prerequisites in `PreparePlanService`. |
| **Health** | How well are they currently performing? | `user_topic_health.state` + `health_score` (V24) — INSUFFICIENT_DATA / DEVELOPING / STRONG / NEEDS_ATTENTION / NEEDS_REVISION / IMPROVING | Exists. Windowed, weighted, renormalised when a component has no evidence. |
| **Trend** | Which way is it moving? | `user_topic_health.trend_direction` → `PerformanceTrend` — IMPROVING / STABLE / DECLINING / NOT_ENOUGH_DATA | Exists, **and is now duplicated** — see below. |
| **Confidence** | How much can any of this be trusted? | `user_topic_health.confidence_score` + `evidence_level` (INSUFFICIENT_DATA / EARLY_SIGNAL / DEVELOPING_CONFIDENCE / RELIABLE) | Exists. Deliberately never shown to a student — its job is to gate whether a verdict is asserted at all. |
| **Recency** | When did they last touch it? | `user_topic_health.last_attempt_at`, `user_topic_progress.last_practiced_at` | Exists, in two places. |
| **Exam importance** | Does this topic matter for *this* exam? | `topic_priority.final_priority` + `exam_topics.weightage_percent` (Epic L) | Exists. Per exam, not per student. |
| **Recommended action** | What should they do about it? | `RecommendedAction` — 9 deterministic values, derived on read, never persisted | Exists. Phase 7 adds *when*, not *what*. |
| **Subject / exam rollup** | How is the student doing overall, per subject? | — | **Genuinely missing.** Every model above is per topic. Phases 4-5 must balance across subjects. |

So Phase 3 is mostly **naming, contracting and exposing** what exists, plus one real new thing
(rollups) and **three** real collisions to resolve.

## Three concrete collisions, found by reading the code

### 1. `NEEDS_REVISION` exists in both state enums, meaning different things

- `TopicProgressState.NEEDS_REVISION` — a regression *from MASTERED*, reachable only from that
  state, derived on-device from cumulative accuracy.
- `TopicHealthState.NEEDS_REVISION` — "was genuinely strong and has slipped", derived server-side
  from a windowed comparison with a confidence gate.

A planner reading the string `NEEDS_REVISION` without knowing which producer it came from has an
ambiguous input. This is the concrete instance of the problem, and Phase 3's contract has to
disambiguate it — by namespacing the dimension, renaming one, or defining precedence.

### 2. "Trend" is computed four times across two different subjects — and I added the fourth

| Producer | Subject | Vocabulary |
|---|---|---|
| `TopicTrend.Direction` (Epic L, V15) | **The exam** — is this topic appearing more often in previous-year papers? Same for every student. | RISING / STABLE / FALLING |
| `PerformanceTrend` (Weakness Radar, V24) | **The student** — is their accuracy in this topic moving? | IMPROVING / STABLE / DECLINING / NOT_ENOUGH_DATA |
| `/api/me/analytics/topics.trend` (TASK-2801) | **The student** — same question, different window and threshold | IMPROVING / DECLINING / STABLE / INSUFFICIENT_DATA |
| `/api/me/analytics/trends.direction` (TASK-2801) | **The student, overall** — series direction | same |

The first two were already correctly separated, and `PerformanceTrend`'s own doc comment says so
explicitly: *"Distinct from the `trend_direction` stored on `topic_trend` (Epic L / V15), which is
about the exam... Two different questions, deliberately two different vocabularies, so a reader of
either column can tell which they are looking at."*

**Rows three and four are mine, and they are a genuine duplicate.** TASK-2801's per-topic `trend`
computes the same concept as `PerformanceTrend` with a different window (recent third of 365 days
vs the radar's own windows), a different evidence floor, and a fourth value spelled
`INSUFFICIENT_DATA` rather than `NOT_ENOUGH_DATA`. Two correct answers that can disagree about the
same student and the same topic.

**Phase 3 must resolve this specifically.** The likely resolution is that the analytics endpoint
stops computing its own per-topic trend and reads `user_topic_health.trend_direction`, leaving
analytics to report facts (attempts, accuracy, time, recency) and the health model to own
direction. That is a small change, but it is exactly the kind of drift that becomes unfixable once
three consumers depend on it — which is why it belongs in the gate rather than in a later cleanup.

### 3. Practice and mock evidence are pooled by one model and separated by the other

Found during the TASK-3001 audit. `TopicHealthService.rebuild` collects practice and mock evidence
into one list and `EvidenceEvent` carries **no source field**, so every health component treats a
rushed mock answer and an untimed practice answer as identical evidence. Phase 2 analytics keeps
`practiceAccuracy` and `mockAccuracy` separate, deliberately.

So D3.4 is not an open question so much as one already answered two different ways. TASK-3001
proposes leaving the scorer alone (separating them there is a retune with its own version bump)
and exposing the split as facts in the contract.

## What Phase 3 must decide before any of it is built

| | Decision |
|---|---|
| **D3.1** | The dimension contract: which producer owns which dimension, what each state means, and how the two `NEEDS_REVISION`s are disambiguated. |
| **D3.2** | ~~Signed-out students.~~ **DECIDED 2026-09-18: personalization is a signed-in feature for V1.** See "D3.2, decided" below. |
| **D3.3** | What "weak" means, once, in one place — and how much evidence is required before saying it. `evidence_level` and `confidence_score` already exist to express this; what is missing is the threshold the planner uses. |
| **D3.4** | How practice and mock evidence combine. **Collision 3 above:** health already pools them and analytics already separates them. |
| **D3.5** | How recency decays a verdict. `last_attempt_at` exists; no decay model does. Deciding this here rather than in Phase 7 avoids two different decay rules. |
| **D3.6** | Whether the composite is a **stored row** or a **read-time join**. `user_topic_health` is already a rebuildable cache with a staleness check; the composite may need nothing more than a read that assembles it. |
| **D3.7** | Sub-topic grain. `topics.parent_id` exists (V12) and is populated, so sub-topic states are representable — but nothing produces evidence at that grain. |
| **D3.8** | What a subject rollup returns — a single weighted score, or a distribution + coverage summary. TASK-3001 argues for the latter: a weighted score is *readiness*, which is still an open business question, and `RadarOverview` already set the precedent of reporting a distribution instead. |

## D3.2, decided — signed-in personalization for V1

**The server is the canonical personalization state.** Taken by the project owner on 2026-09-18,
and it is what makes Phases 3-7 tractable.

The alternative would have duplicated the entire decision architecture:

```
              PERSONALIZATION
                    |
          +---------+---------+
          v                   v
     Server state        Device state
     analytics           analytics
     learning state      learning state
     roadmap             roadmap
     planner             planner
          +------ parity -----+
```

Every personalization rule would need two implementations kept in step by a parity script — the
discipline `check-topic-health-parity.js` already applies to *one* algorithm, applied to seven
phases. That is a large, permanent tax on a feature whose value comes almost entirely from
**longitudinal history**, which is precisely the thing a signed-out student does not have across
devices or reinstalls.

### What this does NOT mean

**It does not mean nothing personal exists locally before sign-in.** The app stays fully usable
signed out — browse exams, practise, mock, revise, read content — and the device keeps the local
state it already keeps:

- the active exam (`app_preferences.active_exam_code`) and followed exams
- UI and content language, theme, zoom
- the onboarding profile (name, exam, stage, target year, preparation level, daily study time)
- the in-flight session, and completed sessions queued in the `is_synced` upload queue
- `user_topic_progress` written on-device by `recordTopicPractice`
- the `radar_cache` payload, so the radar still renders offline

**The distinction is narrower and more precise: which state is *authoritative* for the
cross-session personalization engine.** For V1, the server. Everything above stays exactly as it
is; none of it is removed, and offline-first is untouched.

### Consequences to carry into every later phase

1. **Phases 3-7 are server-side.** No device twin, no second parity script.
2. **Personalization is a real reason to sign in**, and should be presented that way rather than
   as a locked feature — the app's core preparation loop keeps working without it.
3. **D5.1 gets much easier.** If personalization is signed-in anyway, syncing a small preparation
   profile to the server (option (a)) stops fighting the offline-first posture, because the
   planner it feeds already requires an account.
4. **The existing on-device radar stays.** `localRadar.ts` and its parity script are already built,
   already shipped, and already serve the signed-out weakness case. This decision does not remove
   them — it means nothing *new* gets a device twin.
5. **A signed-out student who later signs in is not starting from zero**: their queued sessions
   upload and their history restores through the path that already exists.

**Exit criteria (Gate 2):** one documented contract; one endpoint returning the composite per
topic and per subject; `PreparePlanService`, the radar and analytics all reading it rather than
each deriving their own; and the trend duplication above gone rather than documented.

---

# The phases

## Phase 1 — Data integrity & capture · **shipped, not device-verified**

**Gate 1: "if the student performed an activity, we have a reliable record of it."**

Shipped in TASK-2801: the cross-account ownership fix, migration V47 (practice-session
`started_at`/`duration_ms`/`available_count`/`exam_code`, plus the per-attempt classification
snapshot), mock attempts feeding `user_topic_progress`, and UUID session ids.

**Checklist status** — one item closed since this plan was written, two still open:

- ~~`web/` captures no per-question time at all.~~ **Done 2026-09-18.**
  `web/src/questions/useQuestionTimer.ts` mirrors mobile's hook (same cap, same accumulation
  across revisits, same null rule), wired into `PracticeQuiz.tsx` and `MockTestEngine.tsx`, with
  `timeMs` carried through both upload payloads. Answers given in a browser *before* this remain
  permanently unmeasured — that history cannot be recovered.
- ~~No device pass.~~ **Done 2026-09-18 (emulator-5554).** Migration `0029` applied through the
  real drizzle migrator on a genuine pre-0029 database (29 → 30 migrations, 37,094 questions
  preserved, no failure screen), and again from scratch on a rebuilt database. A real practice
  session recorded `started_at`/`duration_ms`/`available_count`/`exam_code` with `duration_ms`
  exactly equal to `completed_at − started_at`; a real mock attempt (3 answered, 97 skipped) fed
  per-topic mastery with exactly the 3, not the 100. Session ids are UUIDs on device.
- ~~One thing failed and is NOT diagnosed: the four new practice-session fields arrived NULL at the
  server.~~ **RESOLVED 2026-09-19, and the earlier hypothesis was wrong.** Not a stale Metro
  transform and not client code: **the app targets `http://10.0.2.2:8080/api`, the emulator's
  host-loopback alias, which bypasses `adb reverse` entirely** — so the device had been uploading
  to a stale pre-V47 backend left on host:8080, whose DTO did not know those four fields and whose
  Jackson silently ignored them. Re-run with the V47 backend on port 8080: all four arrive, and
  `/api/me/analytics/overview` reports `totalStudyTimeMs 149511` with
  `practiceSessionsWithoutDuration 0` from real device data. `EXEC-USERPROGRESS-0003` (Pass);
  `EXEC-USERPROGRESS-0002` kept as a Fail rather than rewritten. **Gate 1 is clean.**

## Phase 2 — Analytics foundation · **shipped**

**Facts, not judgements.** `/api/me/analytics/{overview,subjects,topics,difficulty,activity,trends}`.
Everything derived on read; no aggregate table. Rules already enforced: unattempted and
pending-review answers excluded from both numerator and denominator; averages divided by *timed*
attempts only; `null` wherever there is nothing to measure.

**Open:**

- The per-topic `trend` duplication described above — **Phase 3 resolves it.** Analytics should
  report what happened; direction is a judgement and belongs to the health model.
- Signed-out students not covered (D3.2).
- No performance measurement against a heavy account; `LIFETIME_DAYS = 365` is a judgement.

## Phase 4 — Personalized roadmap + workload

**Purpose:** an exam-aware ordered sequence, with each topic carrying *how much work it is*.

**What exists.** `PreparePlanService` already orders by Epic L's `final_priority` (weightage + PYQ
trend + admin override), gates on the `topic_prerequisites` DAG requiring MASTERED prerequisites,
skips mastered topics, **excludes topics with zero available questions for that exam** (a real bug
found by on-device testing — a checklist item nobody could practise ranked #1), and marks exactly
one topic `recommended`.

That is a correct backlog. **What it is not is a schedule, and it has no notion of size.**

**The key distinction this phase adds: one topic ≠ one unit of work.**

| Missing | Material available |
|---|---|
| **Workload estimate per topic** | Newly possible: Phase 2 gives real average time per question, and `questionRepository.countByTopicForExam` gives volume. Thin until Phase 1's device pass, and absent for `web/`-only students. |
| **The exam timeline** | `recruitment_cycles` holds `notification_date`, `application_end`, `exam_start` (V17) — for exams with a published cycle. **Ten of eleven exams have none**, so the roadmap must degrade to an undated backlog rather than invent a date. |
| **Subject balance** | Nothing. Priority ordering alone will happily produce three consecutive weeks of Quantitative Aptitude. |
| **Room for revision** | Left as a slot; Phase 7 fills it. |

**Decisions:** stored vs derived roadmap (Phase 6 needs memory of what the plan *was*; a derived
plan cannot drift but also cannot remember it changed); per exam or across exams (`followed_exams`
is plural and synced, `active_exam_code` is singular and device-local); behaviour with no exam date.

**Exit criteria:** an ordered plan with a workload estimate per topic; dated where a cycle exists,
undated where it does not; never naming a topic the student cannot practise.

## Phase 7 — Revision & assessment intelligence · *parallel with Phase 4*

**Purpose:** *when* to revisit and re-test — not *what*, which already exists.

`RecommendedAction`'s nine deterministic values (`LEARN_CONCEPT`,
`PRACTICE_FOUNDATIONAL/MEDIUM/ADVANCED`, `PRACTICE_PYQ`, `TIMED_PRACTICE`, `REVISION`,
`MAINTENANCE_PRACTICE`, and an insufficient-evidence value) are already derived on read from the
health row, and are deliberately not persisted so the rule table can change without a migration.

```
WHAT  →  RecommendedAction        (exists)
WHEN  →  this phase               (missing)
HOW MUCH → Phase 5's allocation   (missing)
```

**Missing:** the time axis. Today? Tomorrow? After revision? Before a mock? And what share of a
day revision may take when it competes with new learning for the same 90 minutes.

**Also missing: any notion of forgetting.** `last_practiced_at` and `last_attempt_at` both exist,
so decay is computable from this app's own data — but no decay model exists, and borrowing a
standard spaced-repetition curve without measuring this app's retention would be a fabricated
signal of exactly the kind this project refuses elsewhere. Settled by D3.5 if possible.

**Reuse rather than rebuild:** `user_bookmarks`, `/api/progress/wrong-answers` (**not** deduped by question — corrected
2026-09-19 during the TASK-3201 audit: it is a plain paged select ordered by recency, so a question
answered wrongly three times appears three times), `timesAnsweredWrong` (already counted, already used by `MISTAKE_ANALYSIS` so a repeat
is counted rather than guessed), and mock attempts as the natural re-assessment instrument.

**Depends only on Phase 3** — it needs the state and a place in the day, not the roadmap.

## Phase 5 — Daily task assignment

**Purpose:** the roadmap and the revision schedule become "what do I do today, in the time I have".

**Assignments are persisted — decided.** Not because the assignment is the source of truth, but
because without it "no Percentage activity" is four different situations that cannot be told
apart:

```
A) Percentage was never assigned
B) assigned, ignored
C) started, abandoned
D) completed offline, not yet synced
```

Phase 6 cannot adapt without that distinction, and nothing else in the schema records it. Shape,
to be designed rather than assumed:

```
StudyTask
  task_id, user_id, date, task_type,
  subject_id, topic_id,
  planned_duration, planned_question_count, priority,
  status, created_at, started_at, completed_at
```

**Design what a task *means* before implementing that table.** The app's existing entry points are
topic+difficulty (`/practice/levels`) and a mock paper, so a task most naturally resolves to one of
those — a task that opens a screen which does not exist is not a task.

**A head start found during the TASK-3001 audit:** that shape already half-exists.
`WeaknessRadarService.recommend` emits `ActionStepDto(action, questionCount, difficultyCode)` — an
ordered plan per topic, e.g. `PRACTICE_FOUNDATIONAL × 10 at the easiest difficulty`, then
`PRACTICE_MEDIUM × 15`, then `PRACTICE_PYQ × 10`, then `TIMED_PRACTICE`. It already refuses to
recommend a topic with zero practicable questions and de-prioritises one whose prerequisites are
unmet. So a task is very nearly `(topic, ActionStepDto, a date)`, and D5.2 is closer to *confirm
this shape and add the time dimension* than to *design one from scratch*. The same finding shortens
Phase 7, whose "what" is `RecommendedAction` and whose "how much" is already here.

**The blocker to resolve first (D5.1):**

> **The student's available study time never reaches the server.** `dailyStudyTime`,
> `preparationLevel` and `targetYear` live only in `app_preferences` (migration 0027), deliberately
> never synced — onboarding runs before any sign-in because accounts are optional. Grepping the
> backend for any of them returns nothing.

Either (a) a preparation profile syncs to the server — a new table, an API, and a rule for "device
says 2h, account says 1h"; or (b) the server returns an unscheduled, weighted plan and the
**device** allocates it into today's minutes. Option (b) preserves offline-first and the
signed-out path; option (a) is simpler to reason about and behaves identically on `web/`.
**Interacts directly with D3.2** — if personalization is signed-in-only, (a) becomes much easier.

**Exit criteria (Gate 3):** a student with 90 minutes gets tasks summing to roughly 90 minutes,
each opening a screen that already exists, none pointing at a topic with no questions behind it —
and every one of them recorded as assigned.

## Phase 6 — Adaptive re-planning

**Purpose:** the plan changes because of what actually happened.

With Phase 5 persisting assignments, the loop closes with no further new concepts:

```
ROADMAP → TASK ASSIGNED → USER ACTIVITY → RESULT → ANALYTICS → LEARNING STATE → REPLAN
```

Worked example the system should be able to produce deterministically:

```
Monday assigned : Geometry, 30 min
Observed        : 30 questions, 42% accuracy, high response time
State moves to  : PRACTICING + NEEDS_ATTENTION + DECLINING, confidence HIGH
Tuesday becomes : Geometry fundamentals 25m, Geometry basic practice 20m,
                  other subjects for the remainder
```

**Decisions:** how aggressively to replan (a plan that changes every day is not a plan); whether a
missed day rolls forward or is dropped; and **what the student is told** — silent replanning feels
arbitrary, which is a product decision rather than an algorithmic one, and this project already
has a precedent for explaining rather than asserting.

**Exit criteria (Gate 4):** a bad session visibly changes tomorrow's tasks, and the system can
explain the change in one deterministic sentence.

---

# The four gates

| | After | The question it answers |
|---|---|---|
| 🔴 **Gate 1** | Phase 1 | Can we trust what the student actually did? |
| 🟠 **Gate 2** | Phase 3 | Can the system consistently describe the student's current state? **The biggest gate.** |
| 🟡 **Gate 3** | Phase 5 | Can it turn exam + student + available time into meaningful daily tasks? |
| 🟢 **Gate 4** | Phases 6/7 | Does the plan change intelligently when behaviour changes? |

**Gate 2 is where to slow down.** Every phase above it reads the learning state. Get it wrong and
4-7 accumulate increasingly complicated logic on top of conflicting definitions; get it right and
`user_topic_progress`, `user_topic_health`, `RecommendedAction` and `PreparePlanService` are all
reused rather than replaced — which, given how much of them already works, is most of the program.

# The AI layer, afterwards

```
                        AI
                         │
          ┌──────────────┴──────────────┐
          │                             │
   Personalization              Content explanation
          │                             │
   Learning state                  Questions
   Roadmap                         Answers
   Planner                         Mistakes
   Revision
```

Nothing to build in infrastructure: `AIService` + the provider registry (ADR-013), the admin
control centre with an encrypted key (ADR-014), per-task flags, answer grounding, `ai_usage_events`
and three live production features already exist.

What AI adds is narration of decisions already made: *"Why am I getting Geometry wrong?"* answered
from a state the system computed, *"I only have 45 minutes"* re-ranking a plan the planner produced.

**The rule, already enforced in this codebase:** the model never makes the decision. `MISTAKE_ANALYSIS`
sends no numeric learner facts at all — after a real bug where a model told a student they had
"repeatedly confused" something they had missed once, the protection moved from the output side to
the input side. A recommendation surface has the same failure mode with higher stakes.

# What this program explicitly does not build

- A giant `user_personalization` table, or per-topic columns on `users` — rejected once already.
- **A new learning-state model.** The correction at the top of this file.
- A second sync mechanism — everything reuses the device-first, is-synced-queue, idempotent-upload path.
- An LLM in any decision. Phases 3-7 are deterministic.
- Predictive scoring ("you will score 142") — ruled out by the Weakness Radar brief; nothing here reinstates it.
- Any fabricated figure. Home's `MOCK.streakDays` / `MOCK.readinessPercent` are still hardcoded
  constants; they get replaced as Phases 2-3 make them real, not before.

# Open questions this program forces

Recorded in [`../reports/open-questions.md`](../reports/open-questions.md) so they are not
rediscovered late:

1. **Signed-out personalization** (D3.2) — the most consequential; decides whether Phases 3-7 each need a device-side twin.
2. **Where the planner runs** (D5.1) — server, device, or split.
3. **Stored vs derived plans** (Phase 4) — adaptation needs memory; memory can drift.
4. **Retention/decay model** (D3.5 / Phase 7) — measured from this app's data, or borrowed.
5. **Multi-exam students** — `followed_exams` is plural; `active_exam_code` is singular and device-local.
6. **Production and dev still share one Neon database** — every phase adds per-student computation
   against the instance serving real students.
