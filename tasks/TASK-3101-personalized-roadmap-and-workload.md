# TASK-3101 — Personalized roadmap + workload (Phase 4)

**Status: SCOPED, decisions taken 2026-09-19, implementation in progress.**
Phase 4 of [TASK-2901](TASK-2901-personalization-engine.md). Depends only on Phase 3
([TASK-3001](TASK-3001-canonical-learning-state.md)), which shipped `GET /api/me/learning-state`
and closed 🟠 Gate 2. Runs parallel to Phase 7; Phase 5 depends on this.

**The one sentence:** the app already knows *what to study next* and *in what order* — it does not
know **how much work any of it is**, and that is what a plan needs to be a plan.

---

## Pre-implementation audit — what already exists

### `PreparePlanService` is already a correct backlog, and it has a live consumer

`GET /api/exams/{code}/prepare-plan` already:

- orders by Epic L's `topic_priority.final_priority` (weightage + PYQ trend + admin override),
- gates on the `topic_prerequisites` DAG, requiring MASTERED prerequisites,
- marks exactly one topic `recommended`,
- **excludes topics with zero practicable questions for that exam** — a real bug found by on-device
  testing, where a checklist item nobody could practise ranked #1.

It is consumed today by `mobile/src/app/exam-guide.tsx` (the Preparation Plan card, top 5 items).
**So its contract is not free to change**, and Phase 4 does not change it. This task adds a second,
richer endpoint and leaves the existing one exactly as it is.

One difference between the two worth knowing, found while auditing: `PreparePlanService`'s universe
is `topic_priority` rows (only *scored* topics), while the radar's — and therefore the learning
state's — is `exam_topics` (every curated mapping, scored or not). The roadmap follows the radar's
universe so it agrees with Phase 3 rather than with a third list.

### What the workload estimate can actually be built from

| Input | Where it already is |
|---|---|
| This student's average time per question, per topic | `UserAnalyticsService.topics()` → `TopicStat.averageTimeMs`, averaged over **timed attempts only**, bounded to 365 days |
| Practicable question count per (topic, exam) | `QuestionRepository.countByTopicForExam` |
| *How much* practice each topic needs | `WeaknessRadarService.recommend` already emits ordered `ActionStepDto(action, questionCount, difficultyCode)` — e.g. `PRACTICE_FOUNDATIONAL × 10` at the easiest difficulty, then `PRACTICE_MEDIUM × 15`, then `PRACTICE_PYQ × 10`, then `TIMED_PRACTICE` |
| Difficulty ordering | `difficulty_levels`, admin-editable, ordered by `display_order` — never hardcoded as `"easy"` |
| Exam timeline | `recruitment_cycles.notification_date` / `application_end` / `exam_start` (V17) — **but ten of eleven exams have no published cycle** |

**So the ladder already carries "how much" in questions.** Phase 4's real job is converting questions
into **minutes**, ordering the result so one subject cannot monopolise the top of the plan, and dating
it where a date genuinely exists.

### The gap that needed a decision

A topic the student has **never practised** has no personal time figure, and **no cross-student
average exists anywhere in this codebase** (grepped: nothing aggregates `time_ms` without a user
filter). A brand-new student is precisely who wants a plan most, so "no estimate" would be silent
exactly when it matters.

---

## Decisions taken (2026-09-19, project owner)

| | Decision | Taken |
|---|---|---|
| **D4.1** | Stored roadmap vs recomputed on read | **Recomputed on read.** Matches D3.6 and the health model's rebuildable cache. No migration. Phase 5 persists *assignments*, which is where memory of "what was planned" actually belongs — a stored roadmap would be a second thing that can drift from the state it was derived from. |
| **D4.2** | Where a workload estimate comes from when nothing personal exists | **A labelled fallback ladder** (below), never an unlabelled number. Measured wherever measurement exists; a stated constant only as the last resort, and always declared as such. |
| **D4.3** | Scope of this session | **Phase 4 only.** Phase 7 gets its own task and its own sign-off. |

### D4.2 in full — the estimate ladder, and why every tier is labelled

```
PERSONAL_TOPIC   this student's measured average for this topic      (>= 5 timed attempts)
      ↓
COHORT_TOPIC     every student's measured average for this topic     (>= 20 timed attempts)
      ↓
COHORT_DIFFICULTY  every student's average at this difficulty level  (>= 20 timed attempts)
      ↓
DEFAULT          a stated constant, declared as an assumption
```

Each estimate carries its `source` and the `sampleSize` behind it. That is the difference between
"we measured this" and "we guessed this", and this project has repeatedly paid for not keeping them
apart. `COHORT_DIFFICULTY` exists so that "hard questions take longer" survives without hardcoding a
difficulty code — difficulty is admin-editable data (V3), so the ladder walks
`difficulty_levels.display_order`, never a literal `"easy"`.

**The minimum sample sizes are judgements, and are named as such** in the code rather than buried:
below them the average is noise, and a noisy average presented as a measurement is worse than a
declared default.

---

## What this phase builds

`GET /api/me/study-roadmap?examCode=` — user-scoped from the token, no user-id parameter anywhere,
the same shape `GET /api/me/learning-state` uses.

1. **A workload estimate per topic**, built from the radar's own ordered steps rather than a second
   ladder, so "how much practice" cannot drift between the radar and the roadmap.
2. **A subject-balanced order.** Priority order alone will happily produce five consecutive
   Quantitative Aptitude topics. The roadmap applies a stable interleave — no more than
   `MAX_CONSECUTIVE_PER_SUBJECT` topics in a row from one subject — and **keeps the original
   priority rank in the payload**, so the reordering is visible rather than hidden.
3. **Dates where a cycle exists, none where it does not.** With a published cycle the roadmap
   reports days remaining and the daily minutes implied by the outstanding workload; with no cycle
   it degrades to an undated backlog and says so. It never invents a date.
4. **Per-subject rollups** — topics and minutes outstanding per subject, so a caller can see the
   balance the ordering is enforcing.

### What it deliberately does not build

- **No schedule and no per-day assignment.** That is Phase 5, and it is blocked on D5.1 (the
  student's `dailyStudyTime` lives only in device-local `app_preferences` and never reaches the
  server).
- **No change to `/api/exams/{code}/prepare-plan`**, which has a live mobile consumer.
- **No stored table, no migration** (D4.1).
- **No readiness score.** Same trap D3.8 avoided: a weighted rollup of workload against remaining
  days is a readiness estimate under another name, and readiness is still an open product question.
- **No estimate for a step that has no question count.** `LEARN_CONCEPT` and `REVISION` carry no
  count because there is no concept-learning content in this product to spend time on; inventing a
  study block for them would be a fabricated figure. Those steps are listed with
  `estimatedMinutes: null` and excluded from the total, with the reason stated in the payload's
  own contract rather than left for a reader to infer.

### Exit criteria

An ordered plan where every topic carries a workload estimate whose source is declared; no subject
runs more than the configured streak at the top; dated where a recruitment cycle exists and
explicitly undated where it does not; and never naming a topic the student cannot practise.

---

## Implementation notes

**One radar computation, not two.** The roadmap needs both the Phase 3 composite *and* the radar's
ordered steps (the steps stay on the radar by Phase 3's own design). Calling
`LearningStateService.stateFor` and `WeaknessRadarService.radarFor` separately would recompute the
radar twice per request — and the radar can lazily rebuild health rows, so that is two writes, not
just two reads. `LearningStateService` therefore gained one additional method that returns the
composite **and** the radar response it was built from; `stateFor` delegates to it. Additive, no
contract change, one computation.
