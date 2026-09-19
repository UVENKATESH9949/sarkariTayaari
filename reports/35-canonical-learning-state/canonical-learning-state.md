# The canonical learning state (TASK-3001, Phase 3)

**2026-09-19.** Phase 3 of the personalization program ([`TASK-2901`](../../tasks/TASK-2901-personalization-engine.md)).
Scope doc and the full pre-implementation audit:
[`TASK-3001`](../../tasks/TASK-3001-canonical-learning-state.md). Contract:
[`api/LEARNING-STATE.md`](../../api/LEARNING-STATE.md).

Phase 3's deliverable is a **contract, not a model**: one composite per (student, topic), each
dimension owned by exactly one producer, exposed at `GET /api/me/learning-state`. **No migration —
none was needed**, which is the point. The service computes nothing; every field is forwarded from
the producer that already owned it.

---

## What was asked, and what the audit changed about it

The owner's framing, from the program plan, is what this phase exists to honour:

> They are not three competing answers, they are three *dimensions* — learning state (where in the
> curriculum), health (current performance), trend (direction), plus confidence and recency. A
> planner that knows all three can tell "barely started" from "was strong and slipping"; one
> flattened label cannot, and those two want opposite treatment.

The audit changed the plan four times before any code was written.

### 1. The composite already half-existed

`WeaknessRadarDtos.RadarTopic` already returns, per topic: `state`, `healthScore`, `trend`,
`trendDelta`, `evidenceLevel`, `interventionValue`, `recommendedAction` with its ordered steps, and
unmet `prerequisites`. So Phase 3 is **naming and exposing**, not building.

Consequence for the implementation: `LearningStateService` **reads the radar** rather than
reassembling the composite from the same health rows. A parallel assembler would have been a second
place for "what is this student's state" to drift — the exact failure this phase exists to close.

### 2. A third collision, not previously recorded

The program plan recorded two collisions. The audit found a third.

`TopicHealthService.rebuild` collects both evidence sources into one list:

```java
collect(byTopic, evidence.practiceEvidence(user.getId(), since));
collect(byTopic, evidence.mockEvidence(user.getId(), since));
```

and `EvidenceEvent(topicId, eventId, occurredAt, difficultyCode, pyq, answered, correct,
totalTimeMs, timedAnswers)` carries **no source field**. By the time any component runs, the
information that an answer came from a timed paper is gone — accuracy, trend, consistency,
difficulty and PYQ all treat a rushed mock answer and an untimed practice answer as the same
evidence. Phase 2 analytics does the opposite, keeping `practiceAccuracy`/`mockAccuracy` separate
on purpose.

So **D3.4 was not an open question — it was already answered two different ways.** Resolution:
health keeps pooling (separating it there means adding a field to `EvidenceEvent` and branching
every component, which is a retune of a shipped scorer with its own version bump, explicitly out of
scope), and the contract exposes the split as facts so a planner can treat them differently without
redefining what health means.

### 3. The rollup nearly answered an open business question by accident

The obvious subject rollup is a weighted mean of topic health. That is a single 0-100 number
describing how prepared a student is — which is **readiness**, and readiness is an unresolved
product decision: [`reports/open-questions.md`](../open-questions.md) still carries it, and Home's
card is literally `MOCK.readinessPercent = 62`
([`(tabs)/index.tsx:34`](../../mobile/src/app/(tabs)/index.tsx#L34)).

Shipping a weighted rollup would have answered that question as a side effect, under a different
name, with nobody deciding it. The codebase already pointed the other way: `RadarOverview` is an
exam-level rollup that deliberately reports a **distribution** — counts per state,
`topicsInSyllabus`, `topicsWithEvidence`, `topicsReliable` — not an aggregate score. Logged as new
decision **D3.8**.

### 4. The trend collision resolves in the health model's favour, decisively

Not a close call once both were read. `user_topic_health.trend_direction` uses a 30-day window with
a **flagged stale fallback** — when the recent window is too thin it falls back to the newest
attempts whatever their age, marks that, and the mark lowers confidence — plus asymmetric
thresholds (+12pp IMPROVING, −15pp DECLINING, deliberately generous about recognising improvement).
TASK-2801's `/api/me/analytics/topics.trend` was a cruder fixed-window duplicate: recent third of
365 days, symmetric 5pp threshold, no fallback, no confidence coupling — and no consumer.

---

## The three decisions, as taken

The owner asked for the question in plainer words ("if you asking in complex words how can i
understood") and then approved all three as recommended.

| | Decision | Chosen |
|---|---|---|
| **D3.1** | The two `NEEDS_REVISION`s | **Namespace at the contract** — `curriculumState` / `performanceState`, never a bare `state`. Zero migration, zero client change, zero data change |
| **Trend** | Two producers for one judgement | **Keep the health model's, delete mine** from `/api/me/analytics/topics` |
| **D3.8** | What a subject rollup returns | **Distribution + coverage**, never a single score |

Option B for D3.1 (renaming `TopicProgressState.NEEDS_REVISION` → `REGRESSED`) was rejected as a
migration over a synced table plus a mobile change plus an API contract change, for a naming problem
namespacing already solves. Option C (precedence, one wins) was rejected because it destroys the
distinction the phase exists to preserve.

---

## Shipped

**New:** `dto/LearningStateDtos`, `service/LearningStateService`, `controller/LearningStateController`
(`GET /api/me/learning-state?examCode=`), `api/LEARNING-STATE.md`, an `api/README.md` index row.

**Changed:** `UserAnalyticsDtos.TopicStat` lost its `trend` component; `UserAnalyticsService` lost
the `trendWindows` computation and the `mergeTrend` helper; `UserAnalyticsRepository` lost
`practiceTopicTrend`/`mockTopicTrend`. `direction()` and `Window` survive — the **overall** weekly
series on `/trends` still uses them, and that is a different question (activity over time, not a
per-topic verdict).

**Auth and scoping:** mounted under `/api/me/`, user from the bearer token, no user-id parameter
anywhere. `examCode` is required and scopes only the exam-dependent dimensions — priority, curated
weightage, question availability, recommendation. Health and curriculum state are properties of the
student and the topic, and come back the same whichever exam is asked for.

**Null discipline, which is where the two dimensions differ on purpose:**

- `curriculumState` is **never null** — no row means `NOT_STARTED`, a real answer.
- `performanceState` **is** null when nothing was ever measured, which is deliberately different
  from `INSUFFICIENT_DATA` ("measured, not enough to judge"). The radar flattens both to
  `INSUFFICIENT_DATA`, correctly for its own purpose; the contract un-flattens them.
- `weightagePercentTotal` is null when no topic in a subject carries a curated weightage — not `0`,
  which would read as "this subject is worth no marks". When a total does exist, a *started* figure
  of zero is a real measurement and is reported as zero.

---

## The bug, found by running the tests and not by review

`LearningStateService` was first annotated `@Transactional(readOnly = true)`. Obviously correct for
a GET, and wrong.

`TopicHealthService` recomputes **lazily**: `healthForUser` deletes and rewrites a student's health
rows when the cache is stale. A `readOnly` transaction propagates into that recompute and blocks it:

```
JDBC exception executing SQL [delete from user_topic_health uth1_0 where uth1_0.user_id=?]
[ERROR: cannot execute DELETE in a read-only transaction]
```

The shape of the failure is what makes it worth recording: **the endpoint worked perfectly for a
student with no history and returned 500 for anyone who had actually practised.** A fixture-light
test — one that checks the empty case and the shape of the response — would have passed. 5 of 8
tests failed on the first run.

Fixed by dropping `readOnly`, with the surprise written into the service's own doc comment rather
than left for the next reader. **This GET can write, by design.**

A second, smaller failure in the same run was a fixture bug, not product code:
`ProgressDtos.MockAttempt.startedAt` is `@NotNull` and the test's mock fixture did not set it, so
`/api/progress/sync` correctly returned 400.

---

## Verified

- **`LearningStateTest` 8/8** against the real Neon dev database (473s), including the decisive case:
  a topic whose `curriculumState` is `NEEDS_REVISION` while its recent performance is emphatically
  not returns **both**, unmixed, under distinct names.
- The practice/mock split proven on real data through the real endpoints: four questions answered
  correctly in practice and wrongly in a mock returned `practiceAccuracy 100.0`, `mockAccuracy 0.0`,
  pooled `accuracy 50` — the pooled figure being exactly what would have hidden a student who knows
  the material and runs out of time.
- The trend removal asserted **against raw JSON** (`doesNotContain("\"trend\"")`), because a removed
  record component cannot be referenced from Java — so the guard survives a future re-addition.
- Regression: `BehavioralAnalyticsTest` **13/13**, `ProgressSyncTest` **4/4**.
- `mvn compile` / `test-compile` clean.

## Not verified

- **`WeaknessRadarTest` was stopped mid-run when the session ended and is unconfirmed at the time of
  writing.** It matters more than the two that passed: it reads the same health rows this endpoint
  now reads through. Re-running it is the first item in `memory/STATUS.md`'s resume point.
- No `curl` against a real account with a large practice history — the endpoint is covered by real
  HTTP integration tests, not by a human reading a response.
- No performance measurement. The composite read fans out to the radar (which may recompute health),
  `UserAnalyticsService.topics`, `UserTopicProgressRepository.findAllForUser` and an `exam_topics`
  read. That is four sources on one request and nobody has timed it against a large history.
- **No consumer exists.** Nothing in `mobile/` or `web/` calls this endpoint, by design — Phases 4-7
  are its intended callers.

---

## A mistake of mine, recorded because it cost real data

A Python one-off that rewrote `memory/STATUS.md` used `\uXXXX` escapes for astral-plane emoji.
Python encodes those as unpaired surrogates and refuses to write them as UTF-8 — and the exception
fires **after** the file has been opened for writing, so `open(p, "w")` had already truncated it.
`memory/STATUS.md` went to 0 bytes.

Recovered by restoring the committed version (`git show HEAD:memory/STATUS.md`, 4014 lines) and
rebuilding the uncommitted top section from the copy loaded into the session. What was genuinely
lost is the *detailed* session sections for 2026-09-16 to 2026-09-18; their summaries survive, and
their full accounts are intact in `reports/30-` through `reports/33-`. A doc-loss note sits in the
file at the splice point rather than papering over it.

**Two rules from it, now in that file's environment notes:** write emoji as literal characters, and
write to a scratch file before replacing anything that is not committed.

---

## Documentation updated

- New [`api/LEARNING-STATE.md`](../../api/LEARNING-STATE.md) — the dimension table with an owner per
  field, the namespacing rule and why, the practice/mock position, and the reasoning for a
  distribution rollup rather than a score.
- [`api/USER-ANALYTICS.md`](../../api/USER-ANALYTICS.md) — the per-topic `trend` removed from the
  response shape, with a note recording that it was a duplicate, which producer won, and why. The
  earlier "Known duplication, to be resolved by TASK-2901 Phase 3" block is replaced rather than
  left dangling.
- [`api/README.md`](../../api/README.md) — index row for the new contract; the analytics row updated.
- [`TASK-2901`](../../tasks/TASK-2901-personalization-engine.md) — three collisions now, D3.8 added,
  and the `ActionStepDto` head start recorded against Phase 5.

## QA

New `LEARNING-STATE` module: `REQ-LEARNINGSTATE-001..005`, `SCN-LEARNINGSTATE-001..008`,
`TC-LEARNINGSTATE-001..008`, plus `EXEC-LEARNINGSTATE-0001..0008` (all Pass) for the eight automated
cases that genuinely ran. RTM 129/241/262 → **134/249/270**.

`TC-LEARNINGSTATE-008`'s step 5 ("no single per-subject score exists in the shape") is recorded as a
**design guard verified by reading**, not claimed as an executed assertion — it is a property of the
DTO's definition, and recording it as a passed step would overstate what ran.
`qa/defects/learning-state.yaml` is empty and says why: the read-only-transaction bug was found by
the suite written to cover this endpoint, before any build anyone could run existed.

## Next

1. **Re-run `WeaknessRadarTest`** — the one unconfirmed regression.
2. Phase 3's remaining decisions (D3.3 what "weak" means, D3.5 recency decay, D3.6 read-time vs
   stored, D3.7 sub-topic grain) each carry a recommendation in the task doc. None blocks Phase 4 or
   Phase 7, which depend only on the contract now shipped.

**An incidental find worth carrying forward:** `WeaknessRadarService.recommend` already emits
`ActionStepDto(action, questionCount, difficultyCode)` — an ordered plan per topic, already refusing
topics with zero practicable questions and de-prioritising those with unmet prerequisites. So a
Phase 5 study task is very nearly `(topic, ActionStepDto, a date)`, and D5.2 is closer to *confirm
this shape and add the time dimension* than to *design one*.
