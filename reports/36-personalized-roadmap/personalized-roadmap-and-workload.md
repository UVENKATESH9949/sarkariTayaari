# Phase 4 — the personalized roadmap, and what a topic actually costs

**TASK-3101**, 2026-09-19. Phase 4 of the personalization program
([TASK-2901](../../tasks/TASK-2901-personalization-engine.md)), on top of Phase 3's canonical
learning state ([TASK-3001](../../tasks/TASK-3001-canonical-learning-state.md)). Scope doc, with the
full pre-implementation audit: [`tasks/TASK-3101-personalized-roadmap-and-workload.md`](../../tasks/TASK-3101-personalized-roadmap-and-workload.md).
Contract: new [`api/STUDY-ROADMAP.md`](../../api/STUDY-ROADMAP.md).

**The one sentence:** the app already knew *what to study next* and *in what order*; it did not know
**how much work any of it was**, and a backlog without sizes is not a plan.

---

## First: the loose end from the previous session is closed

Phase 3 ended with one unverified item — `WeaknessRadarTest` was **stopped mid-run** when that
session ended, and it mattered more than the two suites that did pass, because it reads the same
health rows the new endpoint now reads through. Re-run first thing this session:

> **`WeaknessRadarTest` — 10 tests, 0 failures, 0 errors (611.4s), against the real Neon dev
> database.** The radar did not regress from Phase 3.

---

## What the audit found before any code was written

**`PreparePlanService` was already a correct backlog**, and it has a live consumer — mobile's Exam
Guide screen renders its top five items. It orders by Epic L's `final_priority`, gates on the
prerequisite DAG, marks exactly one topic `recommended`, and already excludes topics with zero
practicable questions (a rule found on a device, where a topic nobody could practise ranked #1). So
Phase 4 is not a rewrite of it, and **that endpoint is untouched by this change**.

One difference between the two worth recording, found while auditing: `PreparePlanService`'s
universe is `topic_priority` (scored topics only), while the radar's — and therefore the learning
state's — is `exam_topics` (every curated mapping). The roadmap follows the radar's, so it agrees
with Phase 3 rather than becoming a third list.

**Most of the workload inputs already existed too.** The radar's `ActionStepDto` already says *how
much* in questions — "10 foundational at the easiest difficulty, then 15 medium, then 10 PYQ" — and
analytics already computes average time per question per topic. The genuine gap was narrow and
specific: **a topic the student has never practised has no personal time figure, and no
cross-student average existed anywhere in the codebase.** A brand-new student is exactly who wants a
plan most.

## The decisions, as taken

The project owner took all three as recommended:

| | Decision |
|---|---|
| **D4.1** | **Recomputed on read**, not stored. Matches D3.6; no migration. Phase 5 persists *assignments*, which is where memory of "what was planned" actually belongs. |
| **D4.2** | **A labelled fallback ladder** — measured wherever measurement exists, a stated constant only as a last resort, and always declared as which. |
| **D4.3** | **Phase 4 only** this session; Phase 7 gets its own task and sign-off. |

## What shipped

`GET /api/me/study-roadmap?examCode=` — user-scoped from the token, no user-id parameter anywhere,
the same shape `/api/me/learning-state` uses. New `StudyRoadmapDtos`, `StudyRoadmapService`,
`StudyRoadmapController`, `WorkloadTimingRepository`, `api/STUDY-ROADMAP.md`, an `api/README.md`
index row. **No migration — none was needed.**

### 1. Minutes, with the provenance attached

```
PERSONAL_TOPIC     this student's measured average for this topic      (>= 5 timed attempts)
COHORT_TOPIC       every student's measured average for this topic     (>= 20 timed attempts)
COHORT_DIFFICULTY  every student's average at this difficulty level    (>= 20 timed attempts)
DEFAULT            a stated 75s constant, sampleSize 0
```

Every estimate carries its `source` and `sampleSize`. That is the difference between "we measured
this" and "we assumed this", and it is the one field in the payload that must never be dropped by a
consumer. `COHORT_DIFFICULTY` exists so "harder questions take longer" survives without hardcoding a
difficulty code — difficulty is admin-editable data (V3), so the tier resolves against the real
`difficulty_levels` table.

The two sample floors are judgements and are named as constants rather than buried in an expression.
The estimate is resolved **once per topic**, so the reported `estimate` is true of every step under
it rather than approximately true of some.

**Steps with no question count get no minutes at all.** `LEARN_CONCEPT`, `REVISION` and
`TIMED_PRACTICE` report `estimatedMinutes: null` and contribute nothing to any total: there is no
concept-learning content in this product to spend time on, and a timed test's length belongs to the
paper. An invented number summed into a total corrupts the total.

### 2. Subject balance, made visible rather than silent

Priority ordering is per topic and knows nothing about balance, so a student whose weakest topics
all live in one subject would get a plan that is that subject for weeks. The roadmap interleaves —
at most two consecutive topics from one subject — and **keeps each topic's pre-balance
`priorityRank` in the payload**, so a reader can see that a topic was moved and where priority alone
would have put it. When the syllabus genuinely has nothing else left, the run continues: reordering
cannot invent variety that is not there.

### 3. The exam's clock, only when there is one

`timeline` reports the exam date from the current **published** recruitment cycle, days remaining,
and the daily minutes the plan's own total implies. Ten of eleven exams have no published cycle, so
**an undated roadmap is the normal case**, and it says so rather than leaving a client to infer it
from nulls. A date that has passed is reported without a countdown. The application deadline is
never used — that is a date for applying, not for preparing.

## One structural change to Phase 3's service, and why

The roadmap needs both the composite *and* the radar's ordered steps (which Phase 3 deliberately
does not forward). Calling `LearningStateService.stateFor` and `WeaknessRadarService.radarFor`
separately would recompute the radar twice per request — and the radar lazily rebuilds health rows,
so that is **two writes**, not two reads. `LearningStateService` therefore gained one method,
`assemble`, returning the composite plus the radar response it was built from; `stateFor` delegates
to it. Additive; the `/api/me/learning-state` contract is unchanged.

## What this phase deliberately does not build

- **No schedule and no daily assignment** — Phase 5, still blocked on D5.1 (the student's
  `dailyStudyTime` lives only in device-local `app_preferences` and never reaches the server).
- **No readiness figure.** `dailyMinutesRequired` is arithmetic over an estimate and is reported as
  arithmetic. Folding health into one per-exam percentage would have answered the still-open
  readiness question by accident, under a different name — the same trap D3.8 avoided.
- **No change to `/api/exams/{code}/prepare-plan`**, which has a live mobile consumer.
- **No stored plan, no migration.**

## Verified

*(filled in below from the real run — see "Verification" section)*

## Not verified

*(see below)*
