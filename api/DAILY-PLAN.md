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
      "source": "REVISION",           // one of the five purposes below
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

## The five purposes a day is built from

`source` says which learning purpose a task serves. All five are selected from state that already
existed — no purpose has a ranking of its own:

| `source` | Purpose | Which topics | Whose recommendation |
|---|---|---|---|
| `REVISION` | work done and now fading | [`REVISION-PLAN.md`](REVISION-PLAN.md)'s `DUE` list, most overdue first | its own `retest` |
| `WEAK_TOPIC` | currently struggling | the radar's order — `NEEDS_ATTENTION`, then `NEEDS_REVISION` | [`WEAKNESS-RADAR.md`](WEAKNESS-RADAR.md)'s action steps |
| `NEW_TOPIC` | ground not yet covered | the roadmap's order, filtered to `NOT_STARTED` / never-measured | [`STUDY-ROADMAP.md`](STUDY-ROADMAP.md)'s steps |
| `STRENGTHEN` | encountered, not yet strong | the radar's order — `IMPROVING`, then `DEVELOPING` | the radar's action steps |
| `MISTAKE_REVIEW` | questions actually got wrong | topics with real wrong answers in the last 14 days | the count of mistakes itself |

> ⚠️ **`NEW_TOPIC` was called `PRACTICE`** before this change. Migration **V52** relabelled every
> stored row, because the new fifth purpose genuinely *is* practice-for-strengthening and one value
> meaning two different things depending on the day it was written is the one thing a historical
> record must not do. Every old `PRACTICE` row really was a new-ground task, so the relabel
> preserves its meaning rather than rewriting it.

**`STRONG` topics are never selected.** Keeping a reliable topic reliable must not take time a
developing one needs.

**A `MISTAKE_REVIEW` task reports `action: "REVISION"`** — the closest existing value, so the radar's
own action vocabulary did not have to grow a value it never produces. `source` is what carries the
distinction.

## How the day's minutes are divided

Each purpose gets a target share. At the 90-minute reference:

| Purpose | Target | Share |
|---|---|---|
| `NEW_TOPIC` | 25 min | 27.8% |
| `REVISION` | 20 min | 22.2% |
| `WEAK_TOPIC` | 20 min | 22.2% |
| `STRENGTHEN` | 15 min | 16.7% |
| `MISTAKE_REVIEW` | 10 min | 11.1% |

Any other budget scales from that reference, and the shares always sum to exactly `budget.minutes`.
Two rules follow:

- **A purpose may under-spend but never over-spend.** Its unspent minutes are available to whatever
  is filled after it — which is how a day still fills when one purpose has nothing eligible — but no
  purpose can take the whole day.
- **A task that does not fit gets fewer questions, not skipped.** The radar's own 10/15-question
  recommendation is the ceiling and the remaining allowance is the floor; only a topic that cannot
  fit even one question is passed over.

This **supersedes** the old half-the-budget revision cap, which was a second, looser rule for the
same decision.

### New topics have an explicit maximum

Question counts still come from measured pace, but the **number of new topics** does not: it is
capped outright, because six unfamiliar topics in one sitting is a worse day than two done properly.
That is a judgement about learning, not arithmetic, so it is stated rather than derived from
dividing the budget by an estimated question duration.

| Budget | Max new topics |
|---|---|
| ≤ 45 min | 1 |
| 46–120 min | 2 |
| > 120 min | 3 |

Keyed on the **resolved budget minutes**, not on the band name — that is what also gives the
60-minute `DEFAULT` a defined answer.

### One purpose per topic per day

A topic selected for one of the four **fresh-practice** purposes is excluded from the others.
Because revision is filled first, a weak topic that also happens to be revision-due becomes a
`REVISION` task rather than appearing twice under two headings.

**`MISTAKE_REVIEW` stands outside that rule, on purpose.** It assigns no question set — it points at
questions already answered wrongly, to be re-read with their explanations — so it is not competing
for the topic's practice time. Excluding it would also have made the feature almost unreachable:
a topic with recent mistakes is by definition one the student has been practising, which is exactly
what weak-topic or strengthening selection claims first. So the same topic can legitimately appear
once under Weak Topics and once under Mistake Review, which is the natural pairing rather than
duplication.

### Fill order

`REVISION` → `WEAK_TOPIC` → `NEW_TOPIC` → `STRENGTHEN` → `MISTAKE_REVIEW`. This is both the priority
order and what the exclusion set resolves ties with.

**One step per topic, not a topic's whole ladder.** A recommendation like "10 foundational, then 15
medium, then 10 PYQ" spans days; putting all of it in one day would blow the budget and misrepresent
what the radar meant.

**Steps with no question count are never scheduled.** They have no duration by
[`STUDY-ROADMAP.md`](STUDY-ROADMAP.md)'s own rule, and scheduling something of unknown length is how
a plan stops meaning anything.

**If nothing fits, one task is assigned anyway** — a student with 45 minutes whose smallest available
piece of work is 50 gets that piece, and `plannedMinutes` exceeds `budget.minutes` honestly rather
than the overshoot being hidden. An empty day is worse than a slightly long one.

### What Mistake Review does and does not know

The server knows **which** questions were answered wrongly, **when**, and **on which topic** —
`outcome` plus the `topic_id` frozen onto every attempt row by V47. It deliberately does not send the
question text, the chosen answer, the correct answer or the explanation: the client already holds all
four for every wrong answer it has recorded, and Revise's Wrong Answers tab already renders them. A
second copy over the wire would be two sources of truth for the same content.

**Two limits, stated rather than left to be discovered:**

1. **Review time is estimated as solving time.** Re-reading a question and its explanation is
   probably not the same work as solving a fresh one, but this app has never measured review time,
   and inventing a separate constant for it would be a fabricated figure.
2. **Settlement judges it by topic activity**, like every other task — there is no per-question
   "reviewed" signal, so a mistake-review task settles on whether the student answered questions on
   that topic that day.

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

**`mobile/` reads it** (2026-09-21): `app/daily-plan.tsx`, a root-level pushed screen reached from a
card on Home and a row in More — **not a sixth tab**, the same call `preparation-radar.tsx` made.
It goes through `data/dailyPlanData.ts`, which reads the session itself so no screen ever holds a
bearer token.

This is the program's **first student-facing surface**: six phases behind five endpoints had shipped
with no reader at all.

Three things about that client are worth knowing before changing it:

- **No cache, deliberately.** Reading this endpoint is what *generates* the day, so a cached read
  would hand back a plan while leaving the day unplanned on the server — and a plan belongs to a
  calendar day, so a saved one risks showing yesterday's work as today's. Signed out is likewise a
  real state with its own message, not a degraded one: the plan is built from a cross-device history
  and there is no local equivalent to fall back to.
- **The screen adds no ranking.** It renders the server's order and nothing else. A third opinion
  about what matters is the drift Phases 3, 4 and 7 exist to remove.
- **The time zone is validated for IANA shape before being sent**, because an unknown zone is a 400.
  If the device cannot resolve one the server plans in UTC — a different calendar day in IST between
  midnight and 05:30 — so the screen shows `planDate` and `zone` rather than letting that be silent.

**A gap this consumer exposed rather than created:** nothing in the app edits the preparation profile
after onboarding, so a student shown `basis: DEFAULT` has no way to correct it. The screen therefore
states the assumption without offering a fix that does not exist. An edit surface is separate work.

**`web/` does not read it** — and has no onboarding either, so it has no profile to feed the budget.

## Related

- [`PREPARATION-PROFILE.md`](PREPARATION-PROFILE.md) — where the time budget comes from
- [`STUDY-ROADMAP.md`](STUDY-ROADMAP.md) and [`REVISION-PLAN.md`](REVISION-PLAN.md) — the two halves this schedules
- [`LEARNING-STATE.md`](LEARNING-STATE.md) — the state underneath all three
