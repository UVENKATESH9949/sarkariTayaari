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

**`StudyRoadmapTest` 12/12 and `WorkloadEstimatorTest` 6/6**, against the real Neon dev database
(857.7s and 0.010s respectively), in a run that also carried Phase 7 — **32 tests, 0 failures,
BUILD SUCCESS**. `mvn compile` / `test-compile` clean throughout.

**The first run did not pass, and every one of the four failures was a test being wrong rather than
the service.** That is worth the space, because two of them are instructive:

1. **Two ERRORs**: a fixture saved a `RecruitmentCycle` straight through its repository and hit
   `NOT NULL` on `created_at`. That entity has no `@PrePersist` — the real write path stamps it in
   `ExamGuideService`. A fixture bug.
2. **`withNothingMeasuredTheEstimateIsADeclaredDefault` expected `DEFAULT` and got
   `COHORT_DIFFICULTY` — 17 seconds, n=53.** The shared dev database genuinely holds cohort
   timings, so the ladder had correctly found a real tier for a topic the *student* had never
   touched. **A tier-selection rule cannot be asserted against a database the test does not
   control.** The rules moved to `WorkloadEstimatorTest` with constructed samples, where every
   branch — including ones the real database can no longer reach — is genuinely exercised; the
   round trip now asserts tier/sample-size consistency instead. Extracting `WorkloadEstimator` for
   Phase 7 paid for itself here: the same rules now take 0.010s to assert instead of ~60s.
3. **The subject-balance test asserted "never more than two topics in a row from one subject" and
   failed at position 9.** With five topics per subject and a cap of two, the tail was `B,B,B` —
   once one subject is exhausted, the remainder *must* run consecutively. That is the service's own
   documented rule ("reordering cannot invent variety the syllabus does not have"), so the
   assertion was relaxed to the real contract: a run past the cap is legitimate only when every
   topic from that point on belongs to one subject. It also now asserts the cap genuinely bites
   where there *is* a choice, so the test cannot pass on a plan the interleave never touched.

**Also worth knowing, and disclosed rather than buried:** that 17-seconds-per-question cohort figure
is almost certainly load-test fixture data, not humans. Cohort estimates on the shared dev database
are contaminated by the ~35,700 synthetic questions and the automated-test accounts, so
`COHORT_TOPIC` / `COHORT_DIFFICULTY` numbers there are not meaningful as measurements of real
students — only as proof that the tier resolves.

**QA**: new `ROADMAP` module — `REQ-ROADMAP-001..005`, `SCN-ROADMAP-001..012`,
`TC-ROADMAP-001..013`, plus `EXEC-ROADMAP-0001..0013` (all Pass) for the runs that genuinely
happened. Two cases carry a `test_case_version: 2` and record in their own remarks why they were
reframed, rather than being quietly corrected.

## Not verified

- **No consumer exists.** Neither `mobile/` nor `web/` calls this endpoint; it ships with no caller
  by design, exactly as Phase 3 did.
- **No `curl` against a real account with a large history**, and **no performance measurement**. The
  cohort queries scan attempt rows across all students, bounded to 365 days, and are the most
  expensive thing this read does. If that becomes a problem the answer is a small periodically-
  rebuilt aggregate — the shape `user_topic_health` already uses — not a shorter window, which
  would change what the figure means.
- **Per-difficulty question availability is not checked.** A step may ask for 10 questions at the
  easiest difficulty when the bank holds fewer *at that difficulty*, even though the topic as a
  whole has plenty. The topic-level zero-question rule holds; this narrower case does not, and
  closing it needs a new grouped query.
- **The subject-balance cap of 2 is a judgement**, not a measured preference, and no student has
  been asked whether a plan balanced this way is better than one in pure priority order.
