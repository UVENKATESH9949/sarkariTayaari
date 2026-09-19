# TASK-3201 — Revision & assessment timing (Phase 7)

**Status: SCOPED, decisions taken 2026-09-19, implementation in progress.**
Phase 7 of [TASK-2901](TASK-2901-personalization-engine.md). Depends only on Phase 3
([TASK-3001](TASK-3001-canonical-learning-state.md)) and runs parallel to Phase 4
([TASK-3101](TASK-3101-personalized-roadmap-and-workload.md)), exactly as the program plan says.

**The one sentence:** the app already knows *what* a student should do about a topic and *how much*
of it — it has never known **when to come back to it**.

```
WHAT      →  RecommendedAction (9 values)      already shipped
HOW MUCH  →  ActionStepDto + Phase 4's minutes already shipped
WHEN      →  this phase                        missing
```

---

## Pre-implementation audit

### 1. A forgetting curve already exists in this product — and it is not the one being used here

`TopicHealthService.recencyWeight` decays evidence exponentially: **45-day half-life, floored at
0.15** so old evidence fades without vanishing. It has been shipped since V24 and is what makes the
health model weight last week's answers above last quarter's.

That curve answers *"how much should this old answer count toward my verdict"*. Revision needs
*"when has this student probably forgotten this"* — related, but not the same question, and the
project owner chose to answer the second one explicitly rather than by reusing the first.

### 2. Nothing else about revision timing exists

| Needed | State of play |
|---|---|
| Per-topic recency | `user_topic_health.last_attempt_at`, `user_topic_progress.last_practiced_at` — both exist |
| A re-test instrument | `RecommendedAction.TIMED_PRACTICE` exists as an action the radar already emits; the screen it opens exists |
| Review material | `user_bookmarks` (a flat flag — **no review metadata at all**, checked) and `GET /api/progress/wrong-answers` |
| Any notion of "due" | **Nothing.** No due date, no interval, no repetition counter, anywhere |

### 3. A correction to the program plan, recorded per AI_RULES §6

[TASK-2901](TASK-2901-personalization-engine.md) describes `/api/progress/wrong-answers` as
"**deduped by question**". It is not: `findWrongAnswers` is a plain paged select over wrong practice
results ordered by recency, with no `distinct` and no grouping, so a question answered wrongly three
times appears three times. Corrected in that file. It matters here because a revision surface built
on the assumption of one row per question would double-count.

---

## Decisions taken (2026-09-19, project owner)

| | Decision | Taken |
|---|---|---|
| **D7.1** | The forgetting model | **A spaced-repetition ladder — 3 → 7 → 21 → 45 days — scaled by how well the student knows the topic.** Chosen over reusing the app's existing 45-day decay curve. |
| **D7.2** | What re-testing a topic means | **Timed practice on that topic.** It opens a screen that already exists, and the radar already emits `TIMED_PRACTICE` as an action. A full mock paper spans the whole syllabus and cannot be scheduled as "re-test Percentages". |
| **D7.3** | Stored vs derived | **Derived on read**, following D4.1 and D3.6 without re-litigating them. No migration. |

### D7.1, stated honestly

**The intervals are borrowed, not measured.** 3/7/21/45 days comes from published spaced-repetition
research on other learners, not from this app's students — and this project's own data could not
support the alternative yet, because per-question timing and reliable attempt history only started
being captured properly in V47 (Phase 1). The recommendation was to reuse the 45-day curve already
in the product; the owner chose the explicit ladder, and this file records which is which so whoever
later measures real retention knows exactly what they are replacing.

The basis is therefore reported in the payload itself as `intervalBasis: "SPACED_REPETITION_LADDER_V1"`
— a version, so a future measured curve is a version bump rather than a silent change of meaning,
the same discipline `TOPIC_HEALTH_V1` already uses.

### How "scaled by how well the student knows the topic" is implemented

The rung comes from the Phase 3 composite — the state the system already has — rather than from a
stored repetition counter:

| Rung | Interval | When |
|---|---|---|
| 1 | **3 days** | `performanceState` is NEEDS_ATTENTION or NEEDS_REVISION — shaky, come back quickly |
| 2 | **7 days** | DEVELOPING or IMPROVING — moving, not settled |
| 3 | **21 days** | STRONG, but the curriculum ladder is not yet MASTERED |
| 4 | **45 days** | STRONG **and** MASTERED — the longest spacing this ladder allows |
| — | not scheduled | never practised, or INSUFFICIENT_DATA — there is nothing to revise yet, and that topic belongs to the roadmap's *learning* path, not here |

**This is a deliberate deviation from textbook SM-2, and it is worth being explicit about.** Classic
spaced repetition advances an item one rung per successful review, which requires storing a per-item
counter. Here the rung is read from the student's *current measured state* instead, which means:

- a topic that keeps going well climbs the ladder on its own, because its health rises;
- a topic that slips drops straight back to 3 days, without waiting for a review to fail;
- nothing has to be stored, and nothing can go stale (D7.3).

The cost is that the ladder is not a strict per-item progression — two students with identical
review histories but different current health get different intervals. That is the intended
behaviour here, and it is why this is a ladder *scaled by state* rather than SM-2.

---

## What this phase builds

`GET /api/me/revision-plan?examCode=` — user-scoped from the token, no user-id parameter, the same
shape `/api/me/learning-state` and `/api/me/study-roadmap` use.

Per topic: when it was last practised, which rung applies and why, when it falls due, whether it is
due or overdue and by how long, and the re-test it resolves to — timed practice on that topic, with
a question count and an estimated duration.

Ordered **most overdue first**, tie-broken by exam priority, so the head of the list is what a
planner should schedule first.

### Reuse rather than rebuild

- The **state** comes from Phase 3's composite, unchanged.
- The **minutes** come from Phase 4's estimate ladder, which is extracted into a shared
  `WorkloadEstimator` so the two endpoints cannot drift into two different ideas of how long a
  question takes. That extraction is behaviour-preserving for Phase 4.
- The **re-test question count** is taken from the largest question-bearing step the radar already
  recommends for that topic, so it agrees with the roadmap; a topic whose recommendation carries no
  question-bearing step falls back to one stated constant, labelled as such.

### Out of scope, deliberately

- **Any share of the day.** Phase 7 says what is due and how urgent; deciding how much of today's
  minutes revision may take against new learning is Phase 5's allocation, and doing it here would
  split that decision across two phases.
- **Mock papers as scheduled re-assessment** (D7.2 chose topic-level timed practice).
- **Per-question spaced repetition** over bookmarks or wrong answers. `user_bookmarks` has no review
  metadata and the wrong-answers feed is not deduplicated; doing it per question is a bigger,
  separate design with its own storage question.
- **Any stored schedule or migration** (D7.3).

### Exit criteria

A topic the student was shaky on last week is due before one they mastered last month; a topic they
have never touched is not scheduled at all; every interval states which rung produced it and on what
basis; and each due topic resolves to a re-test that opens a screen this app already has.
