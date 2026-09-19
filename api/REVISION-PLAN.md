# Revision Plan — when to come back to a topic, and how to re-test it

**Status:** shipped 2026-09-19 (TASK-3201, Phase 7 of the personalization program — see
[`tasks/TASK-2901-personalization-engine.md`](../tasks/TASK-2901-personalization-engine.md)).

Reads [`LEARNING-STATE.md`](LEARNING-STATE.md). It adds one thing the product never had:

```
WHAT      RecommendedAction's nine values      already shipped
HOW MUCH  the radar's steps + STUDY-ROADMAP    already shipped
WHEN      this contract                        new
```

## ⚠️ The intervals are borrowed, not measured

Every due date here comes from **`SPACED_REPETITION_LADDER_V1`** — rungs of **3 / 7 / 21 / 45 days**
taken from published spaced-repetition research **on other learners**. They were not derived from
this product's own retention data, and could not have been: reliable per-attempt history only began
with V47 (Phase 1), weeks ago.

The alternative considered was reusing `TopicHealthService`'s existing **45-day evidence half-life**
— at least this app's own curve — and that was the recommendation at decision time. The project
owner chose the explicit ladder (TASK-3201 D7.1).

`intervalBasis` is therefore **versioned and reported in every response**. When someone measures
real retention here, replacing the ladder is a visible version bump rather than a silent change in
what "due" means.

## `GET /api/me/revision-plan`

**Auth:** required. The acting student comes from the token; there is no user-id parameter.

| Query parameter | Required | Notes |
|---|---|---|
| `examCode` | yes | Scopes the syllabus, question availability and priority tie-break |

| Status | When |
|---|---|
| `200` | Normal |
| `401` | No or invalid token |
| `404` | Unknown `examCode` |

### Response shape

```jsonc
{
  "examCode": "SSC_CGL",
  "healthAlgorithmVersion": "TOPIC_HEALTH_V1",
  "computedAt": "2026-09-19T14:02:55.401Z",
  "intervalBasis": "SPACED_REPETITION_LADDER_V1",

  "dueCount": 4,
  "totalDueMinutes": 82,          // null when nothing is due — a real answer, not zero work

  "topics": [
    {
      "topicId": "…", "topicName": "Percentages",
      "subjectId": "…", "subjectName": "Quantitative Aptitude",

      "curriculumState": "PRACTICING",
      "performanceState": "NEEDS_ATTENTION",

      "lastPracticedAt": "2026-08-21T11:04:00Z",
      "daysSinceLastPractice": 29,

      "status": "DUE",
      "notScheduledReason": null,
      "rung": 1,
      "rungReason": "PERFORMANCE_NEEDS_ATTENTION",
      "intervalDays": 3,
      "dueAt": "2026-08-24T11:04:00Z",
      "daysUntilDue": null,
      "daysOverdue": 26,           // 0 means due today

      "examPriority": 91.98,

      "retest": {
        "action": "TIMED_PRACTICE",
        "questionCount": 15,
        "questionCountBasis": "RECOMMENDED_STEP",
        "estimatedMinutes": 24,
        "estimate": { "source": "COHORT_TOPIC", "secondsPerQuestion": 94, "sampleSize": 220 }
      }
    }
  ]
}
```

## The ladder, and how a rung is chosen

The rung comes from the Phase 3 composite — the state the system already has:

| Rung | Interval | When |
|---|---|---|
| 1 | 3 days | `performanceState` NEEDS_ATTENTION or NEEDS_REVISION — shaky |
| 2 | 7 days | DEVELOPING or IMPROVING — moving, not settled |
| 3 | 21 days | STRONG, curriculum not yet MASTERED |
| 4 | 45 days | STRONG **and** MASTERED |

`rungReason` names what selected it, so a due date is explicable without reading the service.

### Why there is no repetition counter — a deliberate deviation from SM-2

Textbook spaced repetition advances an item one rung per successful review, which needs a stored
per-item counter. Here the rung is read from **current measured state** instead:

- a topic that keeps going well climbs the ladder on its own, as its health rises;
- a topic that slips drops straight back to 3 days, without waiting for a review to fail;
- nothing is stored, so nothing can go stale (D7.3, following D4.1 and D3.6).

**The cost, stated plainly:** this is not a strict per-item progression. Two students with identical
review histories but different current health get different intervals. That is the intended
behaviour — a ladder *scaled by state*, not SM-2.

## `NOT_SCHEDULED` is an answer, not a gap

| `notScheduledReason` | Meaning |
|---|---|
| `NEVER_PRACTISED` | no attempt on record — nothing to revise |
| `NOT_ENOUGH_EVIDENCE` | measured, but the health model cannot yet assert a verdict (`INSUFFICIENT_DATA`) — nothing to keep *fresh* |

Both belong to the roadmap's *learning* path, not here, and both come back with `dueAt`, `rung`,
`intervalDays` and `retest` all null. A topic with an unrecognised performance state is also left
unscheduled rather than defaulted onto a rung: inventing a due date for a verdict this service does
not understand would be worse than admitting it.

**Topics with zero practicable questions are absent from the plan entirely** — the same rule
[`STUDY-ROADMAP.md`](STUDY-ROADMAP.md) applies, for the same reason: the re-test has to open a
screen with questions behind it.

## The re-test

`TIMED_PRACTICE` on that topic (D7.2), which opens a screen the app already has. A full mock paper
was rejected as the scheduled instrument: it spans the whole syllabus, so it cannot be scheduled as
"re-test Percentages".

`questionCount` comes from the largest question-bearing step the radar already recommends for that
topic (`questionCountBasis: RECOMMENDED_STEP`), so the revision plan and the roadmap ask for the
same amount of work. When the radar recommends no question-bearing step, a stated default of 10 is
used and labelled `DEFAULT`. Either way it is **capped at the questions the bank actually holds**.

`estimate` is the same shared four-tier ladder [`STUDY-ROADMAP.md`](STUDY-ROADMAP.md) documents —
one estimator, so the two endpoints cannot disagree about how long a question takes.

## Ordering

Most overdue first, then soonest due, then the unscheduled; each group tie-broken by exam priority,
then topic name. **Urgency of forgetting outranks exam weight** within the plan — a topic going
stale leads even when a fresher topic carries more marks. Deciding how much of a day that deserves
is Phase 5's job, not this endpoint's.

## What this endpoint does not do

- **No share of the day.** It says what is due and how urgent; allocating today's minutes between
  revision and new learning is Phase 5, and splitting that across two phases would put one decision
  in two places.
- **No mock-paper scheduling** (D7.2).
- **No per-question spaced repetition.** `user_bookmarks` carries no review metadata, and
  `/api/progress/wrong-answers` is **not** deduplicated by question — a question answered wrongly
  three times appears three times. Doing revision per question is a separate design with its own
  storage question.
- **Nothing stored, no migration** (D7.3).

**This GET can write**, for the same reason `GET /api/me/learning-state` can: the health model
recomputes lazily underneath.

## Consumers

None yet. `mobile/` and `web/` do not call it.

## Related

- [`LEARNING-STATE.md`](LEARNING-STATE.md) — the state the rung is read from
- [`STUDY-ROADMAP.md`](STUDY-ROADMAP.md) — the other half of the plan: work not yet done
- [`WEAKNESS-RADAR.md`](WEAKNESS-RADAR.md) — where the recommended steps come from
