# Daily Plan — what to do today, in the time this student has

**Status:** shipped 2026-09-19 (TASK-3301, Phase 5 of the personalization program — see
[`tasks/TASK-2901-personalization-engine.md`](../tasks/TASK-2901-personalization-engine.md)).

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
      "status": "ASSIGNED",
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

## What this endpoint does not do

- **No re-planning when a day goes badly** — Phase 6, which needs these rows to exist first.
- **No new ranking.** Phases 4 and 7 rank; this fills a day from their output.
- **No readiness score**, unchanged from every phase before it.
- **No way to complete a task yet.** `status` is always `ASSIGNED`; acting on a task needs a client
  surface, which does not exist. The field is here so that work adds behaviour rather than a
  migration.

## Consumers

None yet. `mobile/` and `web/` do not call it.

## Related

- [`PREPARATION-PROFILE.md`](PREPARATION-PROFILE.md) — where the time budget comes from
- [`STUDY-ROADMAP.md`](STUDY-ROADMAP.md) and [`REVISION-PLAN.md`](REVISION-PLAN.md) — the two halves this schedules
- [`LEARNING-STATE.md`](LEARNING-STATE.md) — the state underneath all three
