# Study Roadmap — what to study, in what order, and how much work it is

**Status:** shipped 2026-09-19 (TASK-3101, Phase 4 of the personalization program — see
[`tasks/TASK-2901-personalization-engine.md`](../tasks/TASK-2901-personalization-engine.md)).

Reads [`LEARNING-STATE.md`](LEARNING-STATE.md), which is Phase 4's whole dependency. It adds
exactly three things to what the app already knew, and invents no new judgement about the student:

| Added | Built from |
|---|---|
| **Minutes** per topic and per step | the radar's own ordered action steps × a seconds-per-question estimate whose source is always declared |
| **Subject balance** | a stable interleave over the priority order, capped at 2 consecutive topics from one subject |
| **The exam's clock** | `recruitment_cycles.exam_start`, for the current *published* cycle — absent for ten of eleven exams, which is a normal answer, not an error |

## `GET /api/me/study-roadmap`

**Auth:** required. The acting student comes from the token; there is no user-id parameter, so one
student cannot address another's plan.

| Query parameter | Required | Notes |
|---|---|---|
| `examCode` | yes | Ordering, question availability and the timeline are all per exam |

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
  "computedAt": "2026-09-19T12:41:02.118Z",

  "timeline": {
    "hasExamDate": true,
    "examDate": "2026-11-08",
    "daysRemaining": 50,
    "dailyMinutesRequired": 63,
    "note": "Finishing everything in this plan by the exam date implies about 63 minutes a day."
  },

  "totalEstimatedMinutes": 3140,

  "topics": [
    {
      "topicId": "…", "topicName": "Percentages",
      "subjectId": "…", "subjectName": "Quantitative Aptitude",

      "priorityRank": 1,            // position by priority ALONE, before subject balancing
      "examPriority": 91.98,

      "curriculumState": "PRACTICING",
      "performanceState": "NEEDS_ATTENTION",
      "recommendedAction": "PRACTICE_FOUNDATIONAL",

      "questionCount": 214,
      "prerequisitesMet": true,
      "blockedBy": [],
      "recommended": true,          // exactly one topic in the plan carries this

      "estimatedMinutes": 53,
      "estimate": { "source": "PERSONAL_TOPIC", "secondsPerQuestion": 94, "sampleSize": 38 },

      "steps": [
        { "action": "LEARN_CONCEPT",          "questionCount": null, "difficultyCode": null,   "estimatedMinutes": null },
        { "action": "PRACTICE_FOUNDATIONAL",  "questionCount": 10,   "difficultyCode": "easy", "estimatedMinutes": 16 },
        { "action": "PRACTICE_MEDIUM",        "questionCount": 15,   "difficultyCode": null,   "estimatedMinutes": 24 },
        { "action": "PRACTICE_PYQ",           "questionCount": 10,   "difficultyCode": null,   "estimatedMinutes": 16 },
        { "action": "TIMED_PRACTICE",         "questionCount": null, "difficultyCode": null,   "estimatedMinutes": null }
      ]
    }
  ],

  "subjects": [
    { "subjectId": "…", "subjectName": "Quantitative Aptitude", "topicCount": 19, "estimatedMinutes": 1180 }
  ]
}
```

## Every estimate says where it came from

`estimate.source` is the load-bearing field. A measured average and a stated constant are different
claims, and this contract refuses to present them in the same shape:

| `source` | Meaning | Floor |
|---|---|---|
| `PERSONAL_TOPIC` | this student's own measured average for this topic | ≥ 5 timed attempts |
| `COHORT_TOPIC` | every student's measured average for this topic | ≥ 20 timed attempts |
| `COHORT_DIFFICULTY` | every student's measured average at this difficulty | ≥ 20 timed attempts |
| `DEFAULT` | a stated constant (75s), declared as an assumption | `sampleSize` is 0 |

`COHORT_DIFFICULTY` exists so "harder questions take longer" survives without hardcoding a
difficulty code — difficulty is admin-editable data (V3), so the ladder resolves against the real
`difficulty_levels` table. The two floors are judgements: below them an average is noise, and noise
presented as a measurement is worse than a declared default.

The estimate is resolved **once per topic**, so every step under it shares one rate and the reported
`estimate` is true of all of them.

### Steps with no question count have no minutes

`LEARN_CONCEPT`, `REVISION` and `TIMED_PRACTICE` carry `estimatedMinutes: null` and contribute
nothing to any total. There is no concept-learning content in this product to put a duration
against, and a timed test's length belongs to the paper, not to this plan. An invented number that
is then summed into a total corrupts the total, so it is left null instead.

## `priorityRank` vs. position in `topics[]`

`topics[]` order **is** the roadmap. `priorityRank` is where priority alone would have put that
topic, before balancing. When the two differ, the subject interleave moved it — that is deliberate
and visible rather than silent. A topic only ever moves later than one it outranks, and only to
break a run of more than two consecutive topics from one subject. When the syllabus genuinely has
nothing else left, the run continues: reordering cannot invent variety that isn't there.

## What this endpoint does not do

- **No schedule.** It says how much work there is, not what to do today. That is Phase 5, blocked
  on the student's `dailyStudyTime` living only in device-local `app_preferences`.
- **No readiness figure.** `dailyMinutesRequired` is arithmetic over an estimate and is reported as
  arithmetic. Anything folding health into one per-exam percentage would answer the still-open
  readiness question by accident — the same trap D3.8 avoided for subject rollups.
- **Nothing is stored.** No migration, no roadmap table (D4.1). The composite underneath is already
  a rebuildable cache; a stored plan would be a second thing that can drift from it.
- **It does not replace [`EXAM-GUIDE.md`](EXAM-GUIDE.md)'s `GET /api/exams/{code}/prepare-plan`**,
  which has a live mobile consumer, works signed out, and answers the narrower question.

## Cost, and what is not measured

The cohort averages scan attempt rows across all students, bounded to the same 365-day window
analytics uses. They are the most expensive thing this read does and are **not** measured against a
heavy account. If that becomes a problem the answer is a small periodically-rebuilt aggregate — the
shape `user_topic_health` already uses — not a shorter window, which would change what the figure
means.

**This GET can write**, for the same reason `GET /api/me/learning-state` can: the health model
recomputes lazily underneath, so serving a stale student's roadmap rewrites their health rows.

## Consumers

None yet. `mobile/` and `web/` do not call it.

## Related

- [`LEARNING-STATE.md`](LEARNING-STATE.md) — the state this is ordered from
- [`WEAKNESS-RADAR.md`](WEAKNESS-RADAR.md) — where the ordered action steps come from
- [`USER-ANALYTICS.md`](USER-ANALYTICS.md) — where the per-question timings come from
