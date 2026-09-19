# Phase 7 — when to come back to a topic

**TASK-3201**, 2026-09-19. Phase 7 of the personalization program
([TASK-2901](../../tasks/TASK-2901-personalization-engine.md)), built the same session as Phase 4
([TASK-3101](../../tasks/TASK-3101-personalized-roadmap-and-workload.md)) and parallel to it, exactly
as the program plan says. Scope doc: [`tasks/TASK-3201-revision-and-assessment-timing.md`](../../tasks/TASK-3201-revision-and-assessment-timing.md).
Contract: new [`api/REVISION-PLAN.md`](../../api/REVISION-PLAN.md).

```
WHAT      RecommendedAction's nine values     already shipped
HOW MUCH  the radar's steps + Phase 4         already shipped
WHEN      this phase                          new
```

---

## What the audit found

### This product already had a forgetting curve, and it is not the one now in use

`TopicHealthService.recencyWeight` decays evidence exponentially — **45-day half-life, floored at
0.15** — and has since V24. It answers *"how much should this old answer count toward my verdict"*.
Revision needs *"when has this student probably forgotten this"*: related, but a different question.

**The recommendation was to reuse that curve**, on the grounds that it is at least this app's own.
**The project owner chose an explicit spaced-repetition ladder instead — 3 / 7 / 21 / 45 days.**
That is their call and it is what shipped; this report records which is which so the next person to
touch it knows the intervals were not derived here.

### The intervals are borrowed, and everything says so

3/7/21/45 comes from published spaced-repetition research **on other learners**. This project could
not have derived its own: reliable per-attempt history only began with V47, weeks ago. So the
payload carries `intervalBasis: "SPACED_REPETITION_LADDER_V1"` — versioned, so replacing it with a
measured curve later is a visible version bump rather than a silent change in what "due" means. The
same statement appears in the service's doc comment, the API contract, the QA requirement and the
module's defects file, because this is exactly the kind of caveat that evaporates between sessions.

### A correction to the program plan, per AI_RULES §6

[TASK-2901](../../tasks/TASK-2901-personalization-engine.md) described
`/api/progress/wrong-answers` as "deduped by question". It is not — `findWrongAnswers` is a plain
paged select ordered by recency, so a question answered wrongly three times appears three times.
Corrected in place. It mattered here because a revision surface built on that assumption would
double-count.

---

## What shipped

`GET /api/me/revision-plan?examCode=` — user-scoped from the token, no user-id parameter anywhere.
New `RevisionPlanDtos`, `RevisionPlanService`, `RevisionPlanController`, `api/REVISION-PLAN.md`, an
`api/README.md` index row. **No migration.**

### The rung comes from state, not from a stored counter

| Rung | Interval | When |
|---|---|---|
| 1 | 3 days | NEEDS_ATTENTION or NEEDS_REVISION — shaky |
| 2 | 7 days | DEVELOPING or IMPROVING — moving, not settled |
| 3 | 21 days | STRONG, curriculum not yet MASTERED |
| 4 | 45 days | STRONG **and** MASTERED |

**This is a deliberate deviation from textbook SM-2**, which advances an item one rung per
successful review and therefore needs a per-item counter. Reading the rung from *current measured
state* means a topic that keeps going well climbs on its own, a topic that slips drops straight back
to 3 days without waiting for a review to fail, and nothing is stored that can go stale (D7.3,
following D4.1 and D3.6).

The cost is real and is stated rather than glossed: this is not a strict per-item progression, so
two students with identical review histories but different current health get different intervals.

### `NOT_SCHEDULED` is an answer

A topic never practised (`NEVER_PRACTISED`) and one measured but not yet judgeable
(`NOT_ENOUGH_EVIDENCE`) are both returned with every scheduling field null and the reason named.
Both belong to the roadmap's *learning* path. A topic whose performance state this service does not
recognise is also left unscheduled rather than defaulted onto a rung — inventing a due date for a
verdict it cannot interpret would be worse than admitting it.

### The re-test

`TIMED_PRACTICE` on the topic (D7.2) — it opens a screen the app already has. The question count
comes from the largest question-bearing step the radar already recommends, so the revision plan and
the roadmap ask for the same amount of work rather than two different amounts, and it is **capped at
what the bank actually holds**. Minutes come from Phase 4's estimator.

### One shared estimator, extracted rather than duplicated

Phase 4's estimate ladder moved into `WorkloadEstimator`, used by both endpoints. Two services each
with their own idea of how long a question takes is precisely the drift Phase 3 existed to remove.
The extraction is behaviour-preserving for Phase 4 — and it paid for itself immediately (below).

---

## Verified

*(filled in from the real run — see below)*

## Not verified

*(see below)*
