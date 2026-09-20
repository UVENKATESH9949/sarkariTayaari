# Phase 6 — the plan changes because of what happened, and says why

**TASK-3401**, 2026-09-20. The last phase of the personalization program
([TASK-2901](../../tasks/TASK-2901-personalization-engine.md)). Scope doc:
[`tasks/TASK-3401-adaptive-replanning.md`](../../tasks/TASK-3401-adaptive-replanning.md).
Contract: [`api/DAILY-PLAN.md`](../../api/DAILY-PLAN.md), extended. Migration **V50**.

---

## The audit finding that defined the phase: the adaptation already existed

The program plan describes Phase 6 as building adaptive re-planning. The audit found **the loop was
already closed by Phases 3–5**, with every link built:

```
task assigned → student practises → attempt rows → health model → learning state
    → roadmap / revision order → tomorrow's plan
```

A bad session already changed tomorrow, with no new machinery: the attempts land, health drops,
`performanceState` can move to NEEDS_ATTENTION, the radar's `RecommendedAction` changes, the step
the roadmap emits changes, the revision ladder drops that topic to its 3-day rung, and Phase 5
fills the next day from that changed order.

**So this phase does not build an adaptation engine.** Doing so would have meant a second mechanism
competing with the state model — the exact drift Phases 3, 4 and 7 spent their time removing. What
it builds is what Gate 4 actually asks for: *a bad session visibly changes tomorrow's tasks, and the
system can explain the change in one deterministic sentence.*

Three things were genuinely missing, and those are what shipped.

## Decisions (2026-09-20, project owner — all as recommended)

| | Decision |
|---|---|
| **D6.1** | **Outcomes are inferred from real attempts**, not reported by a control. Every answer has carried its `topic_id` since V47, so the system can see whether the assigned topic was practised. Chosen over a "mark as done" button, which needs a screen that does not exist — nothing would work until it did. |
| **D6.2** | **Unfinished work is dropped; each day is planned fresh from current state.** A student returning after a week off gets a normal day, not a backlog. A genuinely important skipped topic comes back through priority ordering — the state model doing its job rather than a second queue doing it. |
| **D6.3** | **One plain deterministic sentence per task.** A plan that changes with no reason reads as arbitrary, and this project explains rather than asserts (`RadarTopic.explanation` is the precedent). |

## What shipped

1. **Outcome settlement.** When a new day's plan is generated, still-`ASSIGNED` tasks from closed
   days are judged from real attempts on their topic that day: `COMPLETED` (≥60% of the asked
   questions), `PARTIAL` (real but insufficient), `SKIPPED` (nothing). Idempotent — only `ASSIGNED`
   rows are eligible — and bounded to 14 days back, so a student returning after a month does not
   trigger a scan of every plan they were ever given.
2. **A stored reason per task** (V50, one additive nullable column). Stored rather than derived,
   because it explains why a task was chosen *at the moment it was chosen*; re-deriving it later
   would explain an old plan using new state, and the state moving is the whole point.
3. **Observed activity on read** — `answeredToday` and `accuracyToday` per task, live for today and
   historical for a past day. **Accuracy never decides the outcome**: doing the work and doing it
   well are different questions, and the health model owns the second.

### Two limits, written down rather than discovered later

- **Self-directed practice counts as the task.** The system sees activity, not intent. Inventing a
  distinction it cannot observe would be worse than the over-count.
- **The 60% line is a declared judgement.** Ten of fifteen questions is doing the task in any sense
  that matters; demanding the exact count would mark real work as a failure.

---

## Verified

**20 tests, 0 failures, BUILD SUCCESS** against the real Neon dev database — `AdaptiveReplanningTest`
**5/5** (526.5s), `TaskOutcomeRuleTest` **6/6** (0.011s), and `DailyPlanTest` **9/9** (559.6s) re-run
as a regression, because Phase 6 changed that endpoint's response shape. **Phase 5 did not
regress.** Migration **V50 applied cleanly** (schema 49 → 50).

On real data: two tasks seeded for yesterday, one topic genuinely practised at 19:30 and one left
alone, settled **COMPLETED** and **SKIPPED** respectively — the first time in this program that a
task has stopped saying `ASSIGNED`. A second read settled nothing (idempotent), today's own tasks
stayed `ASSIGNED`, every task carried a reason naming its own topic, and a real 4-question session
with 1 correct surfaced as `answeredToday 4`, `accuracyToday 25` against the task that asked for it.

**Phase 6 passed on its first real run** — unusual for this program, and worth naming the likely
reason rather than leaving it to luck: the phase's own rules went into a plain-JUnit test
(`TaskOutcomeRuleTest`, no Spring, no database) *before* any integration test ran, so every
threshold was already proven against counts the test controlled. The same split paid off in Phase 4
after a tier test failed against uncontrolled database contents; here it was applied up front.

### One earlier run tested nothing, and it was not the code

On 2026-09-19 at 23:56 all 14 integration tests errored in ~0.001s each. Not test logic — **the
database connection dropped while Flyway was acquiring its startup advisory lock**
(`SocketException: Connection reset` → `Unable to acquire PostgreSQL advisory lock` → the Spring
context never came up). `TaskOutcomeRuleTest`, which needs no database, passed 6/6 in that same
run, which made the diagnosis immediate. This project's `STATUS.md` already records an overnight
network drop producing the same class of failure once before.

**QA**: `REQ-DAILYPLAN-005/006`, `SCN-DAILYPLAN-010..013`, `TC-DAILYPLAN-010..013`, plus
`EXEC-DAILYPLAN-0010..0013` (all Pass). Extended the existing `DAILYPLAN` module rather than
creating a new one — it is the same endpoint, and splitting it would hide that. RTM 148/280/302 →
**150/284/306**.

## Not verified

- **Still no consumer.** Nothing in `mobile/` or `web/` calls any of the five personalization
  endpoints. Six phases of this program are invisible to an actual student, and that is now by far
  the largest gap in it.
- **Mobile still does not send the preparation profile**, unchanged from Phase 5 — so in practice
  every real account gets the declared 60-minute default budget, and D5.1 remains half-implemented.
- **The 60% completion line and the 14-day settlement lookback are declared judgements**, not
  measurements. Nobody has checked what share of an assigned set real students finish.
- **Settlement has never run against a student with a long history** — every test seeds one or two
  past-day tasks. The lookback query is indexed on `(user_id, plan_date, exam_code)` but is
  unmeasured at volume.
- **The adaptation itself is proven by construction, not by a multi-day observation.** The tests
  show settlement, reasons and observed activity working; nobody has watched a real student have a
  bad Monday and compared Tuesday's plan against it, because that needs two real days.
- **No device or browser pass** — there is still nothing to look at.
