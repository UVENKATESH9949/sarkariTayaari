# Daily Plan — what to do today, in the time this student has

**Status:** shipped 2026-09-19 (TASK-3301, Phase 5), extended 2026-09-20 by
[TASK-3401](../tasks/TASK-3401-adaptive-replanning.md) (Phase 6) with outcome settlement, a stored
reason per task, and observed activity. Program plan:
[`tasks/TASK-2901-personalization-engine.md`](../tasks/TASK-2901-personalization-engine.md).

Phases 4 and 7 say what there is to do and how much of it. This says **what to do today**, and it is
the first phase whose output is **written down**.

Reads [`STUDY-ROADMAP.md`](STUDY-ROADMAP.md) (work not yet done),
[`REVISION-PLAN.md`](REVISION-PLAN.md) (work done and fading) and
[`PREPARATION-PROFILE.md`](PREPARATION-PROFILE.md) (how much time there is). It introduces **no new
ranking** — a third opinion about what matters is the drift this program spent three phases removing.

## `GET /api/me/daily-plan`

**Auth:** required. The acting student comes from the token; there is no user-id parameter.

| Query parameter | Required | Notes |
|---|---|---|
| `examCode` | yes | Which exam the day is planned for |
| `zone` | no | IANA zone, default UTC. **An unknown zone is a 400**, never a silent fallback — a plan belongs to a calendar day, and quietly planning a different one is worse than failing |

| Status | When |
|---|---|
| `200` | Normal, including an empty plan |
| `400` | Unknown time zone |
| `401` | No or invalid token |
| `404` | Unknown `examCode` |

### Response shape

```jsonc
{
  "examCode": "SSC_CGL",
  "planDate": "2026-09-19",
  "zone": "Asia/Kolkata",

  "budget": {
    "dailyStudyTime": "ONE_TO_TWO",   // what the student actually chose
    "minutes": 90,                    // what the planner assumed from it
    "basis": "STATED_BAND"            // or DEFAULT, when there is no profile
  },

  "plannedMinutes": 84,               // what the tasks add up to
  "generated": true,                  // false when this day was already planned
  "settledTaskCount": 3,              // tasks from earlier, closed days judged by this call

  "tasks": [
    {
      "taskId": "…", "displayOrder": 0,
      "source": "REVISION",           // or PRACTICE
      "action": "TIMED_PRACTICE",
      "topicId": "…", "topicName": "Percentages",
      "subjectId": "…", "subjectName": "Quantitative Aptitude",
      "difficultyCode": null,
      "plannedMinutes": 24,
      "plannedQuestionCount": 15,
      "estimate": "COHORT_TOPIC",     // which tier sized this
      "status": "ASSIGNED",           // COMPLETED / PARTIAL / SKIPPED once the day closes

      "reason": "Percentages is 4 days past its revision date — last practised 26 days ago, on a 3-day interval.",
      "answeredToday": 12,            // what the student actually did on this topic that day
      "accuracyToday": 58,            // null when nothing was answered

      "createdAt": "2026-09-19T04:12:55.019Z"
    }
  ]
}
```

## ⚠️ The budget is an assumption, and the payload says so

**The student never said "90 minutes".** Onboarding asks for a **band**, so every minutes figure
here is the planner's own:

| Band | Budgeted | Why |
|---|---|---|
| `UNDER_1H` | 45 | mid-point, leaning achievable |
| `ONE_TO_TWO` | 90 | mid-point |
| `TWO_TO_FOUR` | 180 | mid-point |
| `FOUR_TO_SIX` | 300 | mid-point |
| `SIX_PLUS` | 360 | **the floor** of an open-ended band — never invent an upper bound the student did not give |
| no profile | 60 | a stated default, reported as `basis: "DEFAULT"` |

Reporting `dailyStudyTime` beside `minutes` is what makes that visible: a student who chose "1–2
hours" and sees a 90-minute plan can see where 90 came from. Whether the mid-points are *right* is
unmeasured — nobody has checked what a student who says "1–2 hours" actually does.

## How a day is filled

1. **Revision that is due**, in the revision plan's order (most overdue first), capped at **half the
   budget**. A topic already learned and now fading is cheaper to recover than a new one is to
   build — but revision never takes the whole day, or a student with a long backlog never moves
   forward. The cap is a judgement, named as a constant.
2. **New ground**, in the roadmap's order — already priority-ranked and already balanced across
   subjects.

**One step per topic, not a topic's whole ladder.** A recommendation like "10 foundational, then 15
medium, then 10 PYQ" spans days; putting all of it in one day would blow the budget and misrepresent
what the radar meant.

**Steps with no question count are never scheduled.** They have no duration by
[`STUDY-ROADMAP.md`](STUDY-ROADMAP.md)'s own rule, and scheduling something of unknown length is how
a plan stops meaning anything.

**If nothing fits, one task is assigned anyway** — a student with 45 minutes whose smallest available
piece of work is 50 gets that piece, and `plannedMinutes` exceeds `budget.minutes` honestly rather
than the overshoot being hidden. An empty day is worse than a slightly long one.

## A day is planned once

The first read for a given (student, day, exam) generates and persists into `study_tasks`; every
later read returns the same rows with `generated: false`.

**This GET writes**, therefore — like `/api/me/learning-state` and for an additional reason of its
own. Re-planning on each read would show a different list to a student who had already started, and
would destroy the record of what was originally assigned.

### Why this phase stores anything at all

Every phase before it derives on read and stores nothing, deliberately. This one is the exception,
and the reason is Phase 6 rather than Phase 5. Without a record of what was **assigned**, "no
Percentage practice this week" is four situations nothing else in the schema can tell apart:

```
never assigned  /  assigned and ignored  /  started and abandoned  /  done offline, not yet synced
```

So `study_tasks` is not a cached answer that might drift from its inputs — it is a historical fact
about what the system asked for, which nothing can recompute afterwards.

## Every task says why it is there

`reason` is one deterministic sentence, built from a small rule table and **never from a model**.
A plan that changes with no reason given reads as arbitrary, and this project explains rather than
asserts — `RadarTopic.explanation` is the same idea.

```
"Percentages is 4 days past its revision date — last practised 26 days ago, on a 3-day interval."
"Geometry needs attention — your recent work there has been struggling, and it ranks 3 for this exam."
"Data Interpretation is next by exam priority (rank 1) and you have not started it yet."
```

**It is stored, not derived on read.** A reason explains why a task was chosen *at the moment it was
chosen*; re-deriving it a week later would explain an old plan using new state — and the state
moving is precisely what this exists to show. Null for tasks assigned before migration V50.

## Outcomes: what actually happened

There is **no "mark as done" control**, because there is no screen to put one on. An outcome is
inferred from real attempts instead — every answer has carried its `topic_id` since V47, so the
system can see whether the assigned topic was practised that day.

| `status` | Meaning |
|---|---|
| `ASSIGNED` | the day is still open, or it closed too long ago to judge |
| `COMPLETED` | at least 60% of the asked questions were answered on that topic that day |
| `PARTIAL` | some real work, below that line |
| `SKIPPED` | nothing at all |

`answeredToday` and `accuracyToday` report the underlying activity — live for today, historical for
a past day. **Accuracy never decides the outcome**: doing the work and doing it well are different
questions, and the health model owns the second.

**Two limits, stated rather than left to be discovered:**

1. **Self-directed practice counts.** If Percentages was assigned and the student practised it for
   their own reasons, the task reads as done. The system sees activity, not intent, and inventing a
   distinction it cannot observe would be worse than the over-count.
2. **The 60% line is a declared judgement**, not a measurement. Ten of fifteen questions is doing
   the task in any sense that matters; demanding the exact count would mark real work as a failure.

### When settlement happens

Closed days are settled when a **new day's plan is generated** — the one moment the system is
guaranteed to be looking at this student again, and it needs yesterday's outcome anyway.
`settledTaskCount` reports how many were judged. It is idempotent (only `ASSIGNED` rows are
eligible) and looks back **14 days**: a student returning after a month does not trigger a scan of
every plan they were ever given, and a task from six weeks ago stays `ASSIGNED`, which is an honest
"never judged".

## How the plan adapts

**There is no separate adaptation engine, deliberately.** The loop is already closed by the phases
underneath: a student practises → attempts land → the health model moves → the roadmap and revision
orders change → tomorrow's plan is built from that changed order. A second mechanism competing with
the state model is exactly the drift Phases 3, 4 and 7 exist to prevent.

So a bad session changes tomorrow *through the state*, and `reason` is what makes that visible.
**Unfinished work is not carried forward** (TASK-3401 D6.2): each day is planned fresh from current
state, so a student returning after a week off gets a normal day rather than a backlog. If a skipped
topic genuinely matters, priority ordering brings it back on its own.

## What this endpoint does not do

- **No re-planning when a day goes badly** — Phase 6, which needs these rows to exist first.
- **No new ranking.** Phases 4 and 7 rank; this fills a day from their output.
- **No readiness score**, unchanged from every phase before it.
- **No way for a student to mark a task done.** Outcomes are inferred from attempts (above), and
  there is no control to override that — because there is no screen to put one on.
- **No carried-forward backlog, and no notification.** Telling a student they missed yesterday is a
  product decision nobody has taken, and there is no surface to say it on.

## Consumers

None yet. `mobile/` and `web/` do not call it.

## Related

- [`PREPARATION-PROFILE.md`](PREPARATION-PROFILE.md) — where the time budget comes from
- [`STUDY-ROADMAP.md`](STUDY-ROADMAP.md) and [`REVISION-PLAN.md`](REVISION-PLAN.md) — the two halves this schedules
- [`LEARNING-STATE.md`](LEARNING-STATE.md) — the state underneath all three
