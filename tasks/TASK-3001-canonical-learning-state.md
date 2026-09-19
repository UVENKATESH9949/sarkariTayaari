# TASK-3001 — Phase 3: the canonical learning state ⭐ GATE

**Status: DECIDED 2026-09-19 — the owner approved all three proposals as recommended
(D3.1 namespacing, D3.2→ analytics defers trend to the health model, D3.8 distribution rollup).
Implementation follows.** Program context: [`TASK-2901`](TASK-2901-personalization-engine.md). Phase 1
([TASK-2801](TASK-2801-behavioral-data-foundation.md)) is device-verified and Gate 1 is clean.

**Phase 3's deliverable is a contract, not a model.** One canonical composite per (student, topic),
each dimension owned by exactly one producer, with defined semantics — and nothing new invented
that an existing producer already answers. Getting this wrong means Phases 4-7 accumulate logic on
top of conflicting definitions; getting it right means `user_topic_progress`, `user_topic_health`,
`RecommendedAction` and `PreparePlanService` are reused rather than replaced.

---

# Part 1 — What the producers actually compute

Read from the real implementations, not from the earlier summaries.

## `user_topic_progress` — the curriculum ladder (V14, device-derived)

```
NOT_STARTED → LEARNING → PRACTICING → MASTERED ⇄ NEEDS_REVISION
```

`deriveState` (`mobile/src/db/topicProgressStore.ts`), on **cumulative all-time** totals:

| From | Rule |
|---|---|
| anything below MASTERED | `accuracy ≥ 80` **and** `attempts ≥ 10` → MASTERED |
| anything below MASTERED | else `attempts ≥ 10` → PRACTICING, else LEARNING |
| MASTERED or NEEDS_REVISION | `accuracy < 60` → NEEDS_REVISION, else MASTERED |

**The key property, and the reason this dimension is not a performance signal:** LEARNING vs
PRACTICING is decided **purely by attempt count**. It says nothing about how well the student did.
Only MASTERED/NEEDS_REVISION carry quality, and cumulatively — a topic answered badly 200 times
last year and well 10 times today reads the same as the reverse.

The server does not re-derive it; `TopicProgressState.canTransitionTo` only **rejects corrupting
moves** — NEEDS_REVISION is reachable only from MASTERED, and nothing may return to NOT_STARTED.

## `user_topic_health` — the performance verdict (V24, server-derived)

Windowed, weighted, confidence-gated. Real constants from `TopicHealthService`:

- Evidence window **365 days**; recent window **30 days**; both windows need **≥5 answered** to be
  comparable.
- Seven weighted components (accuracy .30, trend .20, speed .15, consistency .10, difficulty .10,
  PYQ .10, retention .05), **renormalised over the components that have evidence** — speed is
  permanently absent in v1, so accuracy's declared 30% is an effective ~35%.
- Trend thresholds are **asymmetric on purpose**: IMPROVING at **+12pp**, DECLINING at **−15pp**
  ("generous about recognising improvement").
- State precedence, which is the design rather than an accident:
  1. insufficient evidence beats everything (a barely-practised topic is **not weak**);
  2. `historicalAccuracy ≥ PREVIOUSLY_STRONG` **and** declined ≥15pp → NEEDS_REVISION;
  3. `health ≥ 70` and confident → STRONG (**before** IMPROVING, so strong-and-rising reads strong);
  4. improving ≥12pp → IMPROVING (**before** NEEDS_ATTENTION — a student climbing 51%→79% must not
     be told they are weak);
  5. `health ≤ ceiling` and confident → NEEDS_ATTENTION; else DEVELOPING.

**A subtlety worth preserving:** when the recent 30-day window is too thin, it falls back to the
newest attempts *whatever their age*, **flags that**, and the flag lowers confidence via the
recency factor. So "hasn't practised lately" degrades the verdict's trust rather than fabricating
a trend or reporting nothing.

## `RecommendedAction` — and it already carries *how much*

The earlier plan said Phase 7 owns "when" and that `RecommendedAction` supplies only "what". The
code says more than that. `WeaknessRadarService.recommend` is an ordered rule table that emits a
primary action **plus an ordered list of `ActionStepDto(action, questionCount, difficultyCode)`** —
for example `PRACTICE_FOUNDATIONAL × 10 at the easiest difficulty`, then `PRACTICE_MEDIUM × 15`,
then `PRACTICE_PYQ × 10`, then `TIMED_PRACTICE`.

It also already guards the two things a planner must never get wrong: it checks
`questionCount() > 0` (never send a student to an empty topic — the same bug `PreparePlanService`
was fixed for, found on-device) and it de-prioritises a topic whose **prerequisites are unmet**,
because "drilling a topic whose prerequisite is shaky mostly produces frustration".

**Consequence for later phases:** a Phase 5 "task" is very nearly `(topic, ActionStepDto)`. That is
a materially bigger head start than the program plan assumed, and it sharpens D5.2 ("what is a
task") into "confirm this shape" rather than "design one".

## `RadarTopic` — the composite already half-exists

`WeaknessRadarDtos.RadarTopic` already returns, per topic: `state`, `healthScore`, `trend`,
`trendDelta`, `evidenceLevel`, `interventionValue`, `recommendedAction` + steps, and unmet
`prerequisites`.

**So Phase 3 is not building a composite from nothing.** The radar response *is* most of it. What
it lacks is the curriculum dimension, subject/exam rollups, and a name that says "this is the
canonical state" rather than "this is one screen's payload". It is also exam-scoped, while health
itself is per (user, topic) and exam-independent.

---

# Part 2 — The proposed contract

## The composite, per (student, topic)

| Field | Owner | Meaning | Null when |
|---|---|---|---|
| `curriculumState` | `user_topic_progress.state` | How far through this topic the student has worked — **coverage, not quality** | never (absent row = NOT_STARTED) |
| `performanceState` | `user_topic_health.state` | How they are currently performing, confidence-gated | no health row yet |
| `healthScore` | `user_topic_health.health_score` | 0-100, rounded for display | no health row |
| `trend` / `trendDelta` | `user_topic_health` | Direction over 30 days vs the rest, ±12/−15pp | `NOT_ENOUGH_DATA` / null |
| `evidenceLevel` | `user_topic_health.evidence_level` | How much evidence stands behind the above | never |
| `confidence` | `user_topic_health.confidence_score` | **Internal only** — gates whether a verdict is asserted; never in a student-facing payload | never |
| `lastAttemptAt` | `user_topic_health.last_attempt_at` | Recency | never practised |
| `attempts` / `accuracy` | Phase 2 analytics | The raw facts behind it all | nothing attempted |
| `examImportance` | `topic_priority.final_priority` | Per **exam**, same for every student | exam not scored |
| `recommendedAction` + `steps` | `WeaknessRadarService.recommend` | What to do, with counts and difficulty | never |

**Rule: no consumer ever reads a bare `state`.** Both state dimensions are always named. That
single rule is what resolves collision 1.

## Collision 1 — `NEEDS_REVISION` in both enums

They are genuinely different findings and both are worth keeping:

- `TopicProgressState.NEEDS_REVISION` — cumulative accuracy fell below 60% **after** the topic had
  reached MASTERED. All-time, device-derived, no confidence gate.
- `TopicHealthState.NEEDS_REVISION` — was strong in the historical window **and** has dropped ≥15pp
  recently, with enough evidence to say so.

| | Option | Cost |
|---|---|---|
| **A — CHOSEN** | **Namespace at the contract**: expose `curriculumState` and `performanceState`, never a bare `state`. Enum values unchanged. | Zero migration, zero client change, zero data change. Ambiguity becomes structurally impossible for any new consumer. |
| B | Rename `TopicProgressState.NEEDS_REVISION` → `REGRESSED` | A migration over a synced table, a mobile change, and a change to the documented `/api/topic-progress` contract — for a naming problem A already solves. |
| C | Define precedence, one wins | Destroys information. This is the mistake the whole phase exists to avoid. |

**A does not fix the two existing readers** (`RadarTopic.state`, `/api/topic-progress`), which keep
their current field names for compatibility. The contract's rule binds new consumers — Phases 4-7 —
and those are the ones that would otherwise be ambiguous.

## Collision 2 — per-topic trend computed twice

`/api/me/analytics/topics.trend` (mine, TASK-2801) and `user_topic_health.trend_direction` answer
the same question about the same student and topic, and can disagree. The health model's version
is strictly better: 30-day window with a **flagged stale fallback**, asymmetric ±12/−15pp
thresholds, and it **feeds confidence**. Mine is a cruder duplicate — recent-third-of-365-days, a
symmetric 5pp threshold, no fallback, no confidence coupling.

**DECIDED: analytics stops computing per-topic trend; the composite serves `trend` from the
health model.** Analytics reports *facts* (attempts, accuracy, time, recency); direction is a
judgement and belongs to the model that also knows how much to trust it.

- No consumer is affected — `api/USER-ANALYTICS.md` records "Consumers: none yet".
- No availability problem: `TopicHealthService.healthForUser` recomputes on read when stale, so the
  composite always has a value to serve.
- `/api/me/analytics/trends` (the **overall weekly series**) stays — that is a different question
  (activity over time), not a per-topic verdict.

Epic L's `TopicTrend.Direction` (RISING/STABLE/FALLING) is untouched: it describes the **exam's**
PYQ frequency, not the student, and its own doc comment already says so.

## Collision 3 — practice and mock evidence are pooled by one model and separated by the other

Found while auditing for D3.4, and not previously recorded anywhere.

`TopicHealthService.rebuild` collects both sources into **one undifferentiated list**:

```java
collect(byTopic, evidence.practiceEvidence(user.getId(), since));
collect(byTopic, evidence.mockEvidence(user.getId(), since));
```

and `EvidenceEvent(topicId, eventId, occurredAt, difficultyCode, pyq, answered, correct,
totalTimeMs, timedAnswers)` carries **no source field** — so by the time any component runs, the
information that an answer came from a timed paper is gone. Accuracy, trend, consistency,
difficulty and PYQ all treat a rushed mock answer and an untimed practice answer as the same
evidence.

Phase 2 analytics does the opposite: `practiceAccuracy` and `mockAccuracy` are kept separate
end-to-end, deliberately.

**So D3.4 is not an open question — it is currently answered two different ways.** Separating them
inside the health model means adding a field to `EvidenceEvent` and branching every component,
which is exactly the retuning of a shipped scorer that Phase 3 puts out of scope. The proposal is
therefore: **health keeps pooling** (unchanged), and the contract **exposes the split as facts**
from analytics, so a planner that wants to treat mock performance differently can, without
redefining what health means. If the owner wants health itself to weight them differently, that is
a scoped change to the scorer with its own algorithm-version bump — not something to slip into a
contract phase.

## The genuinely new piece — rollups, and the trap in them

Every existing model is per topic. Phases 4-5 must balance across subjects, so the composite needs
subject-level and exam-level views. This is the only part of Phase 3 with no existing producer.

**The obvious design is wrong, and the codebase already says so.** A weighted mean of topic health
per exam is a single 0-100 number describing how prepared a student is — which is *readiness*, and
readiness is an **unresolved business decision**: `reports/open-questions.md` still carries it
(TICKET-702/703 vs Future Vision Epic C, "that mapping was never stated explicitly anywhere"), and
Home's card is literally `MOCK.readinessPercent = 62`
([`(tabs)/index.tsx:34`](../mobile/src/app/(tabs)/index.tsx#L34)). Shipping a weighted rollup in
Phase 3 would answer that question as a side effect, under a different name, without anyone
deciding it.

**The existing precedent points the other way.** `RadarOverview` is already an exam-level rollup
and it deliberately reports a **distribution** — counts per state, `topicsInSyllabus`,
`topicsWithEvidence`, `topicsReliable` — not an aggregate score. The same restraint is recorded for
the AI radar card, whose ring is coverage rather than a preparation score, per the radar spec's
§18.

So the proposal is: **subject rollups mirror `RadarOverview`'s shape one level down** — state
distribution, coverage, and (new, because a planner needs it) how much of the subject's
**exam weightage** the covered topics account for, using `exam_topics.weightage_percent`. That last
figure is what lets Phase 4 say "you have covered 70% of the topics but only 30% of the marks",
which is the real planning question, and it is a fact rather than a verdict.

---

# Part 3 — Decisions needed before implementation

| | Decision | Recommendation |
|---|---|---|
| **D3.1** ✅ **APPROVED** | The dimension contract as proposed above, with collision 1 resolved by **namespacing** and collision 2 by **analytics deferring to the health model**. | Adopt as written. |
| **D3.2** | ~~Signed-out students.~~ | **Already decided 2026-09-18** — signed-in personalization for V1, server canonical, nothing local removed. No action here. |
| **D3.3** | What "weak" means for a planner, in one place. Proposal: `performanceState ∈ {NEEDS_ATTENTION, NEEDS_REVISION}` **and** `evidenceLevel` at least DEVELOPING_CONFIDENCE. Never `curriculumState`, which is coverage. | Adopt — it reuses the gate the health model already applies. |
| **D3.4** ✅ **APPROVED** (implied by D3.1) | How practice and mock evidence combine. Today health **pools** them and analytics **separates** them — see collision 3. | **Health keeps pooling in Phase 3**; the contract exposes the split as facts. Changing the scorer is a separate, version-bumped change. |
| **D3.5** | Recency decay. `last_attempt_at` exists; no decay model does. The health model already de-emphasises stale evidence via the confidence recency factor. | **Reuse that; add no second decay model in Phase 3.** Revisit in Phase 7, where spaced revision actually needs one. |
| **D3.6** | Stored composite row vs read-time assembly. | **Read-time.** `user_topic_health` is already a rebuildable cache with a staleness check; a second stored layer would be a second thing that can be stale. |
| **D3.7** | Sub-topic grain (`topics.parent_id` exists and is populated). | **Out of scope for Phase 3** — nothing produces evidence at that grain, so it would be an empty dimension. |
| **D3.8** ✅ **APPROVED** *(new — not in the program plan's original list)* | What a subject rollup returns. (a) a single weighted health score per subject; (b) a **distribution + coverage** summary (state counts, topics with evidence, share of exam weightage covered) with no single number. | **(b)** — (a) would answer the still-open readiness question as a side effect, under another name. See the rollup section. |

## Exit criteria (🟠 Gate 2)

1. One documented contract (`api/LEARNING-STATE.md`) naming every dimension, its owner, its
   semantics and its null rule.
2. One endpoint returning the composite per topic **and** per subject for a student, exam-scoped
   for importance but not for health.
3. `PreparePlanService`, the radar and analytics all read the contract's definitions rather than
   each deriving their own — specifically, the duplicate per-topic trend is gone.
4. A test proving the two `NEEDS_REVISION`s are distinguishable through the contract, and one
   proving a topic's practice and mock accuracy are separately readable from it.

## Out of scope for Phase 3

- Any roadmap, schedule, task or recommendation *timing* — Phases 4/5/7.
- Any change to how health or mastery is **computed**. Phase 3 names and exposes; it does not
  retune weights or thresholds.
- A device-side twin: D3.2 settled that personalization is signed-in for V1, so the composite is
  server-side only. The existing on-device radar (`localRadar.ts` + its parity script) stays
  exactly as it is; nothing *new* gets a mirror.
- Sub-topic grain (D3.7).
- **Readiness.** A single "how prepared am I" number stays an open business question
  (`reports/open-questions.md`); Phase 3 supplies the inputs one would be built from and computes
  none itself. Home's mocked 62% is untouched.
