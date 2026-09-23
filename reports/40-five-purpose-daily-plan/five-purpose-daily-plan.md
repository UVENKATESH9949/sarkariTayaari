# Five learning purposes in the daily plan (TASK-3501)

**Date:** 2026-09-21
**Scope:** turn the daily plan's two task kinds (revision, new ground) into five learning purposes —
New Topics, Revision, Weak Topics, Practice/Strengthening, Mistake Review — with an explicit cap on
new topics, a per-purpose time allocation, and question counts trimmed to fit rather than fixed.

**Not in scope, and untouched:** `TopicIntelligenceService`, `LearningStateService`,
`WeaknessRadarService`, `RevisionPlanService`, `StudyRoadmapService`, `WorkloadEstimator`,
`TopicHealthService`, `TaskOutcomeService`, the `RecommendedAction` enum, the `StudyTask` entity and
every migration before V52. No AI or LLM is involved in any selection.

---

## The audit first: three of the brief's premises, checked

Per `AI_RULES.md` §4, the supplied brief was audited against the code before anything changed.

| Brief's claim | Verdict |
|---|---|
| "WeaknessRadarService currently uses mostly fixed question counts of 10 or 15" | **True.** Literal `10` and `15` in `recommend()`'s `ActionStepDto`s. Preserved as instructed — they are now the *ceiling* a task's count is trimmed from, never replaced. |
| Time bands of "30 / 45 / 60 / 90 / 120 / 180+ minutes" | **Corrected.** This app never asks a student for minutes. Onboarding asks for a **band** (`UNDER_1H` … `SIX_PLUS`), which `DailyPlanService.BUDGETS` resolves to 45/90/180/300/360, plus a 60-minute `DEFAULT` for an account with no profile. The new-topic cap is therefore keyed on **resolved budget minutes**, through a two-threshold ladder that reproduces the brief's table exactly at every value it lists — and which also gives the 60-minute `DEFAULT` a defined answer, which a band-name table would not have. |
| "The current implementation details are documented in the attached Daily Plan generation algorithm" | **No attachment arrived.** The real code was audited instead, which is what §4 requires regardless. |

One further correction, to the existing implementation rather than the brief: `DailyPlanService`'s
`REVISION_SHARE = 0.5` cap ("revision may take at most half the day") is **superseded** by the new
per-purpose allocation, which gives revision ~22%. Keeping both would have been two rules for one
decision, so the constant is gone and the supersession is recorded in the class doc and in
`api/DAILY-PLAN.md`.

---

## What the database needed: one relabel, no schema change

`study_tasks.source` is a plain `VARCHAR(20)` with **no CHECK constraint** — by V49's own design
("the vocabulary lives in Java as an enum … a copy of it here is a copy that can drift") — and
`topic_id` / `planned_question_count` were already nullable. So `WEAK_TOPIC`, `STRENGTHEN` and
`MISTAKE_REVIEW` needed nothing from the schema at all.

**V52 exists for one `UPDATE`.** `'PRACTICE'` has always meant "new ground, from the roadmap". The
new fifth purpose genuinely *is* practice-for-strengthening, so leaving the old value in place would
have meant a stored row's meaning depended on the day it was written:

```
a row written yesterday : source='PRACTICE' means new ground
a row written tomorrow  : source='PRACTICE' would mean strengthening
```

In a table whose entire justification is being a faithful historical record of what the system asked
for, that is the worst available option. Every existing `PRACTICE` row genuinely *was* a new-ground
task, so `UPDATE study_tasks SET source='NEW_TOPIC' WHERE source='PRACTICE'` preserves its meaning
rather than rewriting it — and the resulting vocabulary has no ambiguous value in it. Safe to run
against live data: no index, constraint, view or query anywhere filters on `source`
(`StudyTaskRepository` keys on user/date/exam and on status; `TaskOutcomeService` never reads it).

---

## The five purposes, and where each one's topics come from

Nothing below ranks anything. Every purpose reads an ordering that already existed.

| `source` | Which topics | Whose recommendation |
|---|---|---|
| `REVISION` | `RevisionPlanService`'s `DUE` list, most overdue first — unchanged | its own `retest()` |
| `WEAK_TOPIC` | the radar's **existing** order, filtered to `NEEDS_ATTENTION` then `NEEDS_REVISION` | the radar's action steps |
| `NEW_TOPIC` | the roadmap's order (priority + subject interleave), filtered to ground not yet covered | the roadmap's steps |
| `STRENGTHEN` | the radar's existing order, filtered to `IMPROVING` then `DEVELOPING` | the radar's action steps |
| `MISTAKE_REVIEW` | topics with real `INCORRECT` rows in the last 14 days | the count of mistakes itself |

Two details worth naming:

**The radar was already sorted for this.** `WeaknessRadarService.radarOrder()` sorts by state section
(`NEEDS_ATTENTION` before `NEEDS_REVISION`, `IMPROVING` before `DEVELOPING`) and then, within a
section, by how much fixing the topic is worth. So Weak Topics and Strengthening are a filtered walk
over that list and need no comparator of their own — which is the whole point.

**The roadmap is used as the work catalogue for every topic-based purpose**, not just for new ground.
It already wraps the radar's own ordered steps, already resolved each topic's workload estimate, and
already excluded topics the question bank cannot serve. Reading it means Weak Topics and
Strengthening ask for *exactly* the amount of work the radar recommended, rather than forming a
second opinion about the same topic.

**`STRONG` topics are never selected**, so maintaining a reliable topic cannot take time a
developing one needs.

### New topics have an explicit maximum

| Budget | Max new topics |
|---|---|
| ≤ 45 min | 1 |
| 46–120 min | 2 |
| > 120 min | 3 |

This is the one number the brief asked to stop deriving from time arithmetic, and the reasoning is
worth keeping: a fast solver on a long day would otherwise be handed six unfamiliar topics in one
sitting, which is a worse day than three done properly. That is a judgement about learning, not about
arithmetic, so it is stated rather than computed. Question counts *inside* a selected topic still
come from measured pace.

### How the minutes divide

At the 90-minute reference the brief specifies: New 25, Revision 20, Weak 20, Strengthening 15,
Mistake Review 10. Implemented as shares of that reference, so any budget scales and the five always
sum to **exactly** `budget.minutes` (flooring five shares loses up to four minutes, which are handed
back in fill order rather than silently lost).

- **A purpose may under-spend but never over-spend.** Its unspent minutes are available to whatever
  is filled after it, which is how a day still fills when one purpose has nothing eligible — but no
  purpose can take the whole day.
- **A task that does not fit gets fewer questions, not skipped.** The old code skipped a step whose
  full recommendation overshot the remaining time; now the count is trimmed to what fits, and only a
  topic that cannot fit even one question is passed over.

Fill order is `REVISION` → `WEAK_TOPIC` → `NEW_TOPIC` → `STRENGTHEN` → `MISTAKE_REVIEW`: both the
priority order and what the exclusion set resolves ties with.

---

## A correction to my own design, made before it shipped

My first implementation put mistake review inside the one-purpose-per-topic exclusion set, reading
acceptance criterion 9 literally. Re-reading it against what the data would actually do showed that
would have made the feature **almost unreachable**: a topic with recent mistakes is by definition one
the student has been practising, which is exactly the kind weak-topic or strengthening selection
claims first — so Mistake Review would have been empty for precisely the students who have mistakes.

So the exclusion set now covers the four purposes that assign **fresh practice**, and mistake review
stands outside it. It assigns no question set at all — it points at questions already answered, to be
re-read with their explanations — so it is not competing for the topic's time. Reviewing six wrong
answers in Percentages and then practising Percentages is the natural pairing, not duplication. The
integration test asserts no duplicates *among the four practice purposes*, which is what criterion 9
means.

---

## Mistake Review needed no new content endpoint

The server already knows **which** questions were answered wrongly, **when**, and **on which topic**:
`outcome` (backfilled across all history by V26) plus the `topic_id` frozen onto every attempt row by
V47. `MistakeReviewRepository` is one grouped count in the same shape `TaskOutcomeRepository` already
uses.

It deliberately does **not** fetch the question text, the chosen answer, the correct answer or the
explanation. The client already holds all four for every wrong answer it has recorded — mobile's own
`SessionRecord.results`, already rendered by Revise's Wrong Answers tab — so a second copy over the
wire would be two sources of truth for the same content. A mistake-review task therefore carries only
a topic and a count, and tapping it opens that existing screen.

`UNATTEMPTED` and `PENDING_REVIEW` are excluded: running out of time on a timed paper is a clock
problem, not a mistake, and counting it as one would manufacture mistakes out of the clock.

---

## Files

**Backend**

| File | Change |
|---|---|
| `service/DailyPlanAllocation.java` | **new** — pure rules: the allocation split, the new-topic ladder, question trimming. No repository, no clock, no entity, so it is testable as a decision table |
| `repository/MistakeReviewRepository.java` | **new** — wrong answers per topic, practice + mock |
| `db/migration/V52__study_task_sources.sql` | **new** — the `PRACTICE` → `NEW_TOPIC` relabel plus a column comment |
| `service/DailyPlanService.java` | the five-purpose packer, the exclusion set, per-purpose reasons |
| `dto/DailyPlanDtos.java` | documents the new `source` values (no shape change) |
| `api/DAILY-PLAN.md` | the contract: five purposes, the allocation table, the cap, what Mistake Review does and does not know |

**Frontend**

| File | Change |
|---|---|
| `packages/core/src/api/dailyPlan.ts` | `DailyPlanTaskSource` union, replacing `"REVISION" \| "PRACTICE"` |
| `mobile/src/app/dailyPlanVisuals.ts` | one colour and icon **per purpose** (was cycled per card position), plus section copy |
| `mobile/src/app/daily-plan.tsx` | five sections and five jump pills driven by the server's own `source` |

**Tests / QA**

| File | Change |
|---|---|
| `service/DailyPlanAllocationTest.java` | **new**, plain JUnit — 12 tests, every band, the ladder, the split, trimming |
| `DailyPlanTest.java` | +8 integration tests: the 90-minute cap, both ends of the ladder, duplication, packing, mistake review, purposes |
| `qa/{requirements,scenarios,test-cases}/dailyplan.yaml` | `REQ-DAILYPLAN-010..013`, `SCN-DAILYPLAN-024..030`, `TC-DAILYPLAN-024..031` |

### The mobile screen replaced its own stand-in

An earlier pass this same day had given the screen client-side *previews* of weak topics (computed
from the radar) and recent mistakes (computed from local session history). Those are now the server's
own task categories, so the previews are gone — keeping both would have shown weak topics twice, and
the device-side version was the beginning of exactly the second ranking this program exists to avoid.

The "Mixed Topics" card added earlier the same day is **kept**, below the five sections. It is not a
sixth purpose and the server never assigns it: it is one way to *work* the day the server did assign,
shuffling today's own topics into a single set.

---

## Verification

### Rules, before anything touched a database

`service/DailyPlanAllocationTest` — **12 tests, 0 failures, 0.096s**, plain JUnit with no Spring and
no database. This is the order Phase 6 established and Phase 4 learned the hard way: a rule asserted
against a database the test does not control is not asserted at all.

It covers every band in the brief's table (30/45/60/90/120/180), every band this app can actually
produce including the 60-minute `DEFAULT`, the exact 25/20/20/15/10 split, that the shares sum to the
budget at eleven different budgets, that no purpose can take the whole day, that a recommendation too
large for its allowance is trimmed rather than dropped, that a slower measured pace yields fewer
questions for the same time, and — the contract with `WorkloadEstimator.minutes`'s round-up — that a
fitted count never costs more minutes than the allowance it was measured against, across 7
seconds-per-question values × 40 allowances.

### Migration, against the real database

V52 applied cleanly to the real Neon dev database: **v51 → v52, 1.587s**.

### Compile / typecheck / lint

- `mvn compile` and `mvn test-compile` clean.
- `packages/core`: `tsc --noEmit` clean, **284/284** vitest tests pass.
- `mobile`: `tsc --noEmit` clean; `expo lint` at the **exact pre-existing 9-problem baseline** (8
  errors, 1 warning), all in files this change never touched.

### Integration

One Maven invocation against the real Neon dev database (PostgreSQL 18.6) —
**52 tests, 0 failures, 0 errors, BUILD SUCCESS, 28:50 min**:

| Class | Result | Time |
|---|---|---|
| `DailyPlanTest` | **17/17** (9 pre-existing + 8 new) | 1252 s |
| `AdaptiveReplanningTest` | **5/5** | 465.1 s |
| `service.DailyPlanAllocationTest` | **12/12** | 0.031 s |
| `service.TaskOutcomeRuleTest` | **6/6** | 0.028 s |
| `service.WorkloadEstimatorTest` | **6/6** | 0.033 s |
| `service.RevisionLadderTest` | **6/6** | 0.036 s |

`AdaptiveReplanningTest` was included deliberately, not for completeness. Phase 6 settles a closed
day by reading `study_tasks.source` — the column V52 relabelled and to which this change adds three
further values — so its 5/5 is the evidence that **settlement did not regress.**

Flyway **validated all 52 migrations** at context startup, which independently re-confirms V52 is
applied to this database with a matching checksum.

An earlier attempt at this run was **killed deliberately** on 2026-09-21 so the machine could be shut
down. It produced no surefire report and is recorded as having tested nothing, rather than as a
failure. Before the re-run the fixture cost was cut — the multi-topic loops now create **one**
question per topic instead of three, keeping the higher volume only where the mistake-review and
practised-topic cases genuinely need it. That is the same fixture-cost trap this project already
documents once (305 questions → 61 minutes in Phase 5).

### The shared dev database afterwards

`AbstractIntegrationTest.cleanup()` hard-deletes the questions, topics, subjects and exams a test
creates, so **the successful run left nothing behind.** Verified by direct read-only query rather
than assumed. One partial fixture from the killed run does remain — exam `PLAN_NEWMAX_3EBBFD76`
(`is_active = false`, so never reachable by a student), its subject, six topics, six `exam_topics`
rows and two questions, all carrying run id `3ebbfd76`. **No orphaned accounts survived**, which was
the more likely worry and turned out not to have happened.

Production's AI task flags were read before and after the run and came back **byte-identical**
(`MISTAKE_ANALYSIS`, `SESSION_FEEDBACK`, `PROFILE_SUMMARY` on; the other eight off). Expected, since
no AI test class ran — but this project's own history records a test run silently disabling AI in
production, so it is checked rather than assumed.

---

## Not verified

- **No device pass.** The mobile half is typechecked and linted only. Nobody has watched five
  sections render, tapped a jump pill, or confirmed a Mistake Review card opens Revise's Wrong
  Answers tab. `TC-DAILYPLAN-031` exists for exactly that and is `Not Executed`.
- **The split and the ladder are declared judgements.** 25/20/20/15/10 and 1/2/3 are product
  decisions. The tests assert they behave as decided; none asserts they are *right*, and none could.
- **Review time is estimated as solving time.** Re-reading a question with its explanation is
  probably not the same work as solving a fresh one, but this app has never measured review time and
  a separate constant would have been invented.
- **Mistake Review points at the whole Wrong Answers list, not at that topic's slice.** The task says
  "8 mistakes in Percentages" and the screen then shows every recorded wrong answer. `revise.tsx`
  takes no topic filter today, and adding one was outside this change — a small, easy follow-up.
- **Settlement judges a mistake-review task by topic activity**, like every other task, because there
  is no per-question "reviewed" signal to observe.
- **Which of `WEAK_TOPIC` / `STRENGTHEN` / `REVISION` a struggling topic lands in** depends on health
  thresholds and on whether it is revision-due. That is by design, but it means the three sections'
  contents are not individually predictable from a topic's name alone.
- **`asOffsetDateTime`'s fallback branches are unexercised.** The hardening tolerates a JDBC driver
  returning something other than `OffsetDateTime` from a JPQL `max()`. The passing run shows this
  driver returns a type the code handles, so the other branches are defensive and untested.
