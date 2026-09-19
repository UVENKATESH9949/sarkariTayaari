# Learning State — the canonical per-topic contract

**Status:** shipped 2026-09-19 (TASK-3001, Phase 3 of the personalization program — see
[`tasks/TASK-2901-personalization-engine.md`](../tasks/TASK-2901-personalization-engine.md)).

This is the one place a planner, a recommender or a screen should read "where is this student, on
this topic". It **computes nothing of its own** — every field is forwarded from the producer that
already owned it, and the contract's job is to name each dimension so no consumer can confuse one
for another.

## The dimensions, and who owns each

| Field | Owner | What it means | Null when |
|---|---|---|---|
| `curriculumState` | `user_topic_progress.state` (device-derived) | **Coverage** — how far through the topic the student has worked | never |
| `curriculumAttempts` / `curriculumAccuracy` | same | All-time cumulative totals | accuracy null before any attempt |
| `performanceState` | `user_topic_health.state` (server-derived) | **Quality** — how they are performing lately, confidence-gated | never measured |
| `healthScore` | `user_topic_health.health_score` | 0-100, rounded | never measured |
| `trend` / `trendDelta` | `user_topic_health.trend_direction` | Direction of travel. **The only per-topic trend in the product** | never measured / windows not comparable |
| `evidenceLevel` | `user_topic_health.evidence_level` | How much stands behind the performance dimension | never |
| `attempts` / `accuracy` | the health model's evidence window | Facts, bounded to 365 days | nothing attempted |
| `practiceAccuracy` / `mockAccuracy` | `/api/me/analytics` | Untimed vs timed, kept apart | that source has nothing |
| `lastAttemptAt` | `user_topic_health.last_attempt_at` | Recency | never practised |
| `examPriority` | `topic_priority.final_priority` (Epic L) | How much this exam rewards the topic, same for every student | exam not scored |
| `examWeightagePercent` | `exam_topics.weightage_percent` | Admin-curated share of the exam's marks | not curated |
| `questionCount` | live count | Practicable questions for this exam and topic | never (0 is a real answer) |
| `recommendedAction` | `WeaknessRadarService` | The primary action. Ordered steps stay on the radar | never |

### The rule this contract exists to enforce

**No consumer reads a bare `state`.** Both state enums contain a value spelled `NEEDS_REVISION`,
and it means different things in each:

- `TopicProgressState.NEEDS_REVISION` — this topic reached MASTERED and cumulative accuracy has
  since fallen below 60%. All-time, device-derived, no confidence gate.
- `TopicHealthState.NEEDS_REVISION` — was strong in the historical window and has dropped ≥15
  percentage points recently, with enough evidence to say so.

Both are worth keeping: a student who has barely started and one who was strong and is slipping
want opposite treatment, and one flattened label cannot tell them apart. So the contract names
them `curriculumState` and `performanceState`, and ambiguity becomes impossible to express rather
than something a reader has to remember to avoid.

Note the asymmetry that follows from it: `curriculumState` is **never null** (no row means
NOT_STARTED, a real answer), while `performanceState` **is** null when nothing was ever measured —
which is deliberately different from `INSUFFICIENT_DATA`, meaning "measured, not enough to judge".

### Practice and mock

The health model **pools** practice and mock evidence into one verdict — `EvidenceEvent` carries no
source field, so every component treats a rushed timed answer and an untimed practice answer as the
same evidence. That is unchanged by this contract (changing it is a retune of a shipped scorer with
its own algorithm-version bump). What the contract adds is that the split stays readable as facts,
via `practiceAccuracy` / `mockAccuracy`, so a planner can treat them differently without redefining
what health means.

---

## `GET /api/me/learning-state`

**Auth:** required (`Authorization: Bearer <token>`). The acting student comes from the token;
there is no user-id parameter anywhere, so one student cannot address another's state.

**Query parameters**

| Name | Required | Notes |
|---|---|---|
| `examCode` | yes | Scopes only the **exam-dependent** dimensions — priority, weightage, question availability and the recommendation. Health and curriculum state are properties of the student and the topic, and come back the same whichever exam is asked for. |

**Responses**

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
  "computedAt": "2026-09-19T05:12:44.913Z",
  "topics": [
    {
      "topicId": "…", "topicName": "Percentages",
      "subjectId": "…", "subjectName": "Quantitative Aptitude",

      "curriculumState": "NEEDS_REVISION",      // coverage — the device's ladder
      "curriculumAttempts": 42,
      "curriculumAccuracy": 57.14,
      "curriculumLastPracticedAt": "2026-09-14T…",

      "performanceState": "IMPROVING",          // quality — the health model
      "healthScore": 64,
      "trend": "IMPROVING",
      "trendDelta": 14,
      "evidenceLevel": "DEVELOPING_CONFIDENCE",

      "attempts": 18,                           // bounded to the evidence window,
      "accuracy": 72,                           // so NOT equal to curriculumAttempts
      "practiceAccuracy": 81.0,
      "mockAccuracy": 44.4,
      "lastAttemptAt": "2026-09-14T…",

      "examPriority": 91.98,
      "examWeightagePercent": 8.50,
      "questionCount": 214,

      "recommendedAction": "PRACTICE_MEDIUM"
    }
  ],
  "subjects": [
    {
      "subjectId": "…", "subjectName": "Quantitative Aptitude",
      "topicsInSyllabus": 28,
      "topicsStarted": 19,
      "topicsWithEvidence": 16,
      "curriculumCounts":  { "MASTERED": 4, "PRACTICING": 9, "LEARNING": 6, "NOT_STARTED": 9 },
      "performanceCounts": { "STRONG": 3, "IMPROVING": 5, "NEEDS_ATTENTION": 6, "DEVELOPING": 2 },
      "weightagePercentTotal": 40.00,
      "weightagePercentStarted": 27.50
    }
  ]
}
```

### Why a subject has no single score

`subjects[]` reports a **distribution plus coverage**, never one number. That is a deliberate
decision (TASK-3001 D3.8), not an omission:

- A weighted mean of topic health per exam **is a readiness score**, and readiness is still an open
  product question — see [`reports/open-questions.md`](../reports/open-questions.md). Home's card is
  currently a hardcoded `62%`. Shipping a weighted rollup here would have answered that question by
  accident, under a different name, with nobody deciding it.
- The radar's own `RadarOverview` already set the precedent, reporting state counts and coverage
  rather than an aggregate.
- `weightagePercentTotal` / `weightagePercentStarted` is the pair a planner actually needs: *"you
  have started 19 of 28 topics but only 27.5 of 40 marks"* is actionable in a way one average is
  not.

`performanceCounts` omits topics with no health row entirely rather than bucketing them as
something they were never measured to be. `weightagePercentTotal` is `null` when no topic in the
subject carries a curated weightage — not `0`, which would read as "this subject is worth no marks".

### Caching and cost

Nothing here is stored. `user_topic_health` is already a rebuildable cache with its own staleness
check, and a second stored layer would be a second thing that can go stale.

**One consequence worth knowing: this GET can write.** The health model recomputes lazily, so a
read for a student whose cache has gone stale deletes and rewrites their health rows as part of
serving the request. That is why `LearningStateService` is transactional and *not* `readOnly` — the
first draft was, and every request from a student with real practice history returned a 500.

## Consumers

None yet. This is Phase 3's deliverable and Phases 4-7 are its intended callers. `mobile/` and
`web/` do not call it.

## Related

- [`WEAKNESS-RADAR.md`](WEAKNESS-RADAR.md) — the per-exam screen payload. Most of this composite
  came from there; it keeps the ordered action steps, reason codes and prerequisites.
- [`USER-ANALYTICS.md`](USER-ANALYTICS.md) — the facts layer. **It no longer reports a per-topic
  `trend`**; that was a duplicate of `user_topic_health.trend_direction` computed over a different
  window with a different evidence floor, so the two could disagree about the same student.
- [`USER-PROGRESS.md`](USER-PROGRESS.md) — where the raw attempts and the curriculum ladder are
  uploaded from.
