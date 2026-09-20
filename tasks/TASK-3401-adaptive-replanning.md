# TASK-3401 — Adaptive re-planning (Phase 6)

**Status: SCOPED, decisions taken 2026-09-19, implementation in progress.**
Phase 6 of [TASK-2901](TASK-2901-personalization-engine.md), the last phase in the program. Depends
on Phase 5 ([TASK-3301](TASK-3301-daily-task-assignment.md)), which persisted assignments.

**The one sentence:** the plan changes because of what actually happened — and the system can say
why.

---

## Pre-implementation audit: most of the adaptation already exists

This is the finding that shapes the whole phase, and it means Phase 6 is much smaller than the
program plan implies.

The loop the plan describes is already closed by Phases 3–5:

```
task assigned → student practises → attempt rows → health model → learning state
    → roadmap / revision order → tomorrow's plan
```

Every link is built. A bad session **already** changes tomorrow, with no new machinery:

- the attempt rows land (Phase 1) and feed `user_topic_health`;
- a poor session lowers that topic's health and can move `performanceState` to NEEDS_ATTENTION;
- the radar's `RecommendedAction` changes accordingly, which changes the **step** the roadmap emits;
- the revision ladder drops that topic to its 3-day rung, and its `lastAttemptAt` moves to today so
  it stops being due;
- Phase 5 fills the next day from that changed order.

**So Phase 6 does not build an adaptation engine. It makes the adaptation legible and recorded**,
which is what Gate 4 actually asks for: *a bad session visibly changes tomorrow's tasks, and the
system can explain the change in one deterministic sentence.*

Claiming otherwise would mean building a second mechanism that competes with the state model — the
exact drift this program spent Phases 3, 4 and 7 removing.

### What is genuinely missing

| Missing | Consequence today |
|---|---|
| Nothing ever settles a task's outcome | `status` is `ASSIGNED` forever, so the four-way distinction `study_tasks` exists to preserve (never assigned / ignored / abandoned / done offline) is **recordable but never recorded** |
| No task says why it is there | A student seeing yesterday's topic reappear cannot tell whether the app is reasoning or shuffling |
| No read of what actually happened against a plan | Nothing can answer "did they do it?" |

---

## Decisions taken (2026-09-19, project owner)

| | Decision | Taken |
|---|---|---|
| **D6.1** | How a task's outcome is known | **Inferred from real attempts.** Every answer has carried its `topic_id` since V47, so the system can see whether the assigned topic was practised that day. Chosen over a "mark as done" control, which would need a screen that does not exist — nothing would work until it did. |
| **D6.2** | Unfinished or missed work | **Dropped; each day is planned fresh from current state.** A student who takes a week off returns to a normal day, not a backlog. If a skipped topic genuinely matters, priority ordering brings it back on its own — which is the state model doing its job rather than a second queue doing it. |
| **D6.3** | Whether the student is told why | **Yes — one plain deterministic sentence per task.** A plan that changes with no reason given reads as arbitrary, and this project already explains rather than asserts (`RadarTopic.explanation` is the precedent). |

### D6.1's two honest limits, stated rather than discovered later

1. **Practice the student chose themselves counts as the task.** If Percentages was assigned and
   they practised Percentages for their own reasons, it is marked done. The system cannot see
   intent, only activity, and inventing a distinction it cannot observe would be worse than the
   over-count.
2. **Partial work needs a threshold.** A task asking for 15 questions, answered 4 times, is neither
   done nor ignored. `PARTIAL` is a real outcome with its own name, and the threshold that separates
   it from `COMPLETED` is a declared judgement, not a measurement.

---

## What this phase builds

1. **Outcome settlement.** When a new day's plan is generated, the previous day's tasks are settled
   from observed attempts: `COMPLETED`, `PARTIAL` or `SKIPPED` written into `status`. That turns
   `study_tasks` from a list of promises into a record of what happened.
2. **A stored reason per task** (migration **V50**, one additive column). Stored rather than derived
   because it explains why the task was chosen *at the moment it was chosen*; deriving it later
   would re-explain today's plan using tomorrow's state, which is a different sentence.
3. **Observed activity on read.** Each task reports how many questions were actually answered on its
   topic that day, and the outcome that follows — live for today, settled for past days.

### Deliberately not built

- **No new ranking, and no second adaptation path.** The state model already adapts; this phase
  reports and records.
- **No "mark as done" endpoint** (D6.1), and no rollover queue (D6.2).
- **No notification or nudge.** Telling a student they missed yesterday is a product decision nobody
  has taken, and this phase has no surface to say it on.
- **No change to how a day is filled** — Phase 5 owns that.

### Exit criteria (🟢 Gate 4)

A topic practised badly on one day produces a visibly different task the next day, every task
carries a sentence explaining why it is there, and yesterday's tasks stop saying `ASSIGNED` once the
day is over.
