# Phase 5 — what to do today

**TASK-3301**, 2026-09-19. Phase 5 of the personalization program
([TASK-2901](../../tasks/TASK-2901-personalization-engine.md)), on Phases 4 and 7. Scope doc:
[`tasks/TASK-3301-daily-task-assignment.md`](../../tasks/TASK-3301-daily-task-assignment.md).
Contracts: new [`api/DAILY-PLAN.md`](../../api/DAILY-PLAN.md) and
[`api/PREPARATION-PROFILE.md`](../../api/PREPARATION-PROFILE.md). Migrations **V48** and **V49**.

**The one sentence:** Phases 4 and 7 say what there is to do and how much of it — this says what to
do **today**, and is the first phase whose output is written down.

---

## D5.1, the blocker, decided

The student's available study time lived only in device-local `app_preferences` and had never
reached the server; grepping the backend for `dailyStudyTime` returned nothing. **The project owner
chose to sync the profile up** rather than have the server send an unscheduled plan down for the
device to allocate. The rejected option would have needed the same allocation logic written twice —
once for mobile, once for `web/` — with a parity script to keep them honest, which is the tax this
program has avoided since D3.2.

Migration 0027 had predicted this table in its own comment, down to "an additive backend table plus
an endpoint plus a conflict rule". Nothing in it had to move.

## The finding that shaped the phase: the student never says a number

`DAILY_STUDY_TIMES` is a set of **bands** — `UNDER_1H`, `ONE_TO_TWO`, `TWO_TO_FOUR`, `FOUR_TO_SIX`,
`SIX_PLUS`. So a planner filling "today's 90 minutes" is working from a figure nobody supplied.

Handled the way Phase 4 handled workload: pick a figure per band, **declare it**, and report the
band beside the minutes so a student who chose "1–2 hours" can see where 90 came from. `SIX_PLUS`
takes the **floor** of an open-ended band — inventing an upper bound the student never gave would be
worse than planning short. No profile at all budgets a stated 60 and reports `basis: "DEFAULT"`.

Whether the mid-points are *right* is unmeasured, and is recorded as such rather than presented as
derived.

## What shipped

- **V48 `user_preparation_profiles`** + `GET`/`POST /api/me/preparation-profile`. Last-write-wins on
  a **client-supplied** `updatedAt`, because an edit made offline and uploaded three days later
  happened three days ago; stamping on arrival would let a stale edit win by syncing second. A
  losing upload returns `200 stored: false` **with the winning profile**, so the losing device
  corrects itself in the same round trip.
- **V49 `study_tasks`** + `GET /api/me/daily-plan?examCode=&zone=`. Revision first (capped at half
  the day), then new ground, both in the order Phases 7 and 4 already established. **One step per
  topic**, never a topic's whole multi-day ladder. A day is planned **once**: later reads return the
  same rows with `generated: false`.

### Why this phase stores anything, when no other phase does

Phases 3, 4 and 7 all derive on read and store nothing, deliberately. This is the exception, and the
reason is Phase 6 rather than Phase 5: without a record of what was **assigned**, "no Percentage
practice this week" is four situations nothing else in the schema can separate — never assigned,
ignored, abandoned, or completed offline and unsynced. So `study_tasks` is not a cached answer that
might drift from its inputs; it is a historical fact nothing can recompute afterwards.

---

## Verified

**`DailyPlanTest` 9/9, BUILD SUCCESS**, 670.4s against the real Neon dev database. **Migrations V48
and V49 applied cleanly** to it (3.868s) — the riskiest single step in the phase.

Gate 3's own wording, now a passing assertion: a `ONE_TO_TWO` student gets a **90-minute budget with
`basis: STATED_BAND`**, tasks summing inside it, every task naming a topic with real questions
behind it and carrying a declared estimate tier. Also proven end to end: the profile round-trips and
stays scoped to its owner; an older edit loses and the loser is told what won; an invented band is
rejected before it reaches the planner; a second read returns **the same task ids**, not a
reshuffled list; an account with no profile still gets a plan labelled `DEFAULT`; an unknown zone is
a 400; an exam with nothing practicable returns an empty plan rather than an error.

### It took three runs, and only one failure was a product bug

**Run 1 — 5 of 9 failed, all 500s, one cause.** `UserPreparationProfile` was first mapped with
`@MapsId` onto a `@OneToOne User`. That makes Hibernate treat the user as part of the row's identity
and cascade a persist into it — and the `User` handed in by `AuthService` was loaded in an earlier
transaction, so it is **detached**. Every write died with *"detached entity passed to persist:
User"*. Fixed by storing a bare `userId` on both new entities: neither needs to navigate to the
user, and the database still enforces the foreign key. **A real bug in this session's own code,
found by the tests written to cover it.**

The tell was which test *passed*: `anExamWithNothingPracticableGetsAnEmptyPlan` was the only plan
test that never reaches a write, and it was green throughout.

**Run 2 — 3 of 9 failed, none of them the planner.** Two were `SocketTimeoutException` while
fixtures were still creating topics. The third was
`NoClassDefFoundError: WeaknessRadarService$1` — the synthetic class `javac` generates for a switch
over an enum — **missing from `target/classes` because an earlier `mvn test-compile` in this same
session ran while a test suite was still executing.** That is the concurrent-Maven trap this
project's own `memory/STATUS.md` already documents, and I walked into it and then read past the
error in the first log. `mvn clean` resolved it. An environment fault, not a code fault.

**Run 3 — 9 of 9.**

### A fixture cost worth recording

Run 1 took **3652 seconds — 61 minutes** — because the fixtures created **305 questions** one API
call at a time, at roughly 14 seconds each against the remote database, none of which anything
asserted on. The roadmap's steps ask for a fixed question count whatever the bank holds, so three
per topic exercises the same paths as thirty. Cut to 33 questions; the suite now runs in 670s. The
reason is written into the test class so nobody enlarges them again.

## Not verified

- **Mobile does not send the profile yet.** The server side is complete and tested, but nothing on a
  device uploads it, so in practice every real account still has no profile and gets the `DEFAULT`
  60-minute budget. **This is the single most important follow-up** — without it the phase is
  server-side only, and the decision that unblocked it is only half-implemented.
- **No consumer for the plan.** Like Phases 3, 4 and 7, nothing in `mobile/` or `web/` calls it.
- **No task can be completed.** `status` is always `ASSIGNED`; there is no endpoint to mark a task
  done or skipped, so the four-way distinction the table exists to preserve is not yet *recorded* —
  only made recordable.
- **The band mid-points are unmeasured.** Nobody has checked what a student who says "1–2 hours"
  actually does.
- **The half-a-day revision cap is a judgement**, not a measured preference.
- **No performance measurement**, and no run against an account with a large history.
- **No device or browser pass** — there is still nothing to look at.
