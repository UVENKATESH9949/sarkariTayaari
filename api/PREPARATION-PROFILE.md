# Preparation Profile — what the student told onboarding, on the server

**Status:** shipped 2026-09-19 (TASK-3301, Phase 5). Migration **V48**.

Onboarding has always asked for a display name, primary exam, stage, target year, preparation level
and daily study time, and written all six to **device-local** `app_preferences` (mobile migration
0027). That was correct: onboarding runs **before** any sign-in, because accounts in this app are
optional, so the device is necessarily the source of truth at the moment those values are written.

This endpoint is the account-wide copy, and it exists for one reason: **the daily planner runs on
the server and cannot budget a day without knowing how much time the student has** (D5.1, decided by
the project owner on 2026-09-19).

Migration 0027 predicted it, in its own comment: *"Making the profile account-wide is an additive
backend table plus an endpoint plus a conflict rule for two devices disagreeing — real work,
deliberately not done here, and nothing in this migration would have to move to do it later."*
Nothing in it moved.

**What this does not change:** the device keeps its own copy, onboarding still runs signed out, and
a signed-out student still gets the whole app. This row is authoritative **for planning**, which is
narrower than being authoritative for the profile.

## `GET /api/me/preparation-profile`

**Auth:** required. No user-id parameter anywhere.

```jsonc
{
  "profile": {
    "displayName": "Asha",
    "primaryExamCode": "SSC_CGL",
    "examStageId": null,
    "targetYear": 2027,
    "preparationLevel": "PRACTICING",
    "dailyStudyTime": "ONE_TO_TWO",
    "updatedAt": "2026-09-19T04:02:11.882Z",
    "onboardingCompletedAt": "2026-09-19T04:02:11.882Z"
  }
}
```

`{"profile": null}` for an account that has never uploaded one — a real answer, not an error. The
planner reads it as "no stated study time" and budgets a declared default.

## `POST /api/me/preparation-profile`

Same body as `profile` above. Returns:

```jsonc
{ "stored": true, "profile": { … } }
```

| Status | When |
|---|---|
| `200` | Stored, **or** rejected as older than what the server holds — see below |
| `400` | Unknown `preparationLevel` or `dailyStudyTime`, missing `updatedAt`, or a `targetYear` outside 2000–2100 |
| `401` | No or invalid token |

### Last-write-wins, resolved on when the edit happened

Two devices can disagree. The winner is whichever carries the later `updatedAt` — the same rule
`user_bookmarks` and `followed_exams` already use.

**`updatedAt` is supplied by the device, not stamped on arrival.** An edit made offline and uploaded
three days later happened three days ago; stamping on arrival would let a stale edit win purely by
syncing second. That is why it is required, and why a missing one is a 400 rather than defaulting to
now.

**A losing upload is not an error.** It returns `200` with `stored: false` **and the winning
profile**, so the device that just lost can correct itself in the same round trip rather than
discovering the disagreement later.

### `onboardingCompletedAt` is monotonic, and outside last-write-wins (V53, 2026-09-24)

When this student first finished onboarding on **any** device, or `null` when that is not known.
This is what lets a reinstalled app, or a second phone, skip onboarding after signing in.

- An upload may **set** it. When both sides have one, the **earlier** moment is kept.
- It is **never cleared** — not by a newer upload carrying `null`, and not by an older app that
  omits the field entirely (the field is optional on upload).
- It is recorded **even when the upload loses** last-write-wins: it is a fact about the student,
  not an edit to a field.

V53 backfilled it (`= updated_at`) for every existing row with a non-blank `displayName`; a row
without one stays `null`, because those are the rows a half-finished upload produced.

**Client rule that goes with it (mobile, 2026-09-24):** an install that has not finished onboarding
never uploads — it only downloads, and only a finished profile. Before this, a reinstalled app
uploaded its empty profile with a newer timestamp and overwrote the student's real one.

A server that predates V53 does not return the field at all; mobile then treats a stored profile
with a display name as finished (`remoteCompletedAt` in `sync/preparationProfileSync.ts`).

### An upload replaces every field, including with null

The profile is one thing a student edits as a whole — in onboarding, or later in settings — not a
set of independently-owned fields. Merging only the non-null fields would make "I cleared that"
impossible to express.

### Validation

`preparationLevel` must be one of `JUST_STARTING`, `LEARNING`, `PRACTICING`, `REVISING`,
`EXAM_READY`; `dailyStudyTime` one of `UNDER_1H`, `ONE_TO_TWO`, `TWO_TO_FOUR`, `FOUR_TO_SIX`,
`SIX_PLUS`. Both may be null — a student can finish onboarding having skipped a step.

`packages/core/src/onboarding/profile.ts` is the definition; the server mirrors it so an unknown
value is rejected at the boundary rather than reaching the planner, which would then have to guess
what it means. Deliberately **not** a database CHECK constraint, which would be a third copy able to
drift from the other two.

`primaryExamCode` and `examStageId` carry **no foreign key**, for the same reason V47 left
`exam_code` unconstrained on attempt rows: this is a record of what the student said during
onboarding, and an exam later deactivated or a stage later restructured must not make an existing
profile unwritable.

## Consumers

`DailyPlanService` reads it.

**`mobile/` writes it** (2026-09-20): `sync/preparationProfileSync.ts`, wired into all three of
`authContext`'s sync points — the full sync after sign-in, the push-only sync, and the flush before
sign-out. It uploads, and takes the server's copy when that copy is newer, writing it back with the
*remote* edit's own timestamp so this device does not look like the most recent editor.

The device's timestamp comes from `app_preferences.profile_updated_at` (mobile migration **0030**),
stamped whenever the student edits the profile. An install predating that migration has none, so it
**falls back to `onboarding_completed_at`** — which is not a guess: that *is* the moment the student
answered these questions, and it was already stored. Only an install with neither timestamp, one
that never completed onboarding, uploads nothing, because inventing a "now" there would beat a
genuine older edit on the student's other device.

That fallback was added on 2026-09-20 after the device pass, and it is the difference between this
feature working and not: `profile_updated_at` arrives *with* 0030, so it is NULL on every install
that already exists. The first version treated NULL as "nothing to say" and would have kept every
current student's real answer on their phone forever — exactly the population the change exists to
serve. Verified on `emulator-5554`: a real install carrying `ONE_TO_TWO` reached the server with
`updatedAt` equal to its onboarding moment to the millisecond, and the daily plan then budgeted
**90 minutes with `basis: STATED_BAND`** instead of 60 / `DEFAULT`.

Failures are caught per-call and never abort the sync batch: a backend predating V48 returns 404
here, and that must not cost a student their restored practice history.

**A student can now change it** (2026-09-21): `mobile/src/app/study-preferences.tsx`, reached from
More and from the daily plan whenever the budget is an assumed default. Until it existed,
`savePreparationProfile` had exactly one caller and it was the first-run flow — so the app could
tell a student *"we've assumed an hour"* and offer no way to correct it. Each tap saves locally
(stamping `profileUpdatedAt` to that moment, so the edit wins against an older one elsewhere) and
pushes through the same sync; a failed push is silent, because the edit is safely on the device and
every sync point retries it.

**Changing the band moves the budget immediately but not today's tasks.** `budget` is resolved on
each read of the daily plan, while the tasks were stored when the day was generated. Both are true
at once, and the preferences screen says so rather than claiming nothing changes today. Re-planning
the remainder of a day is deliberately not done: it would destroy the record of what was originally
assigned, which Phase 6 depends on.

**`web/` does not write it yet** — and has no onboarding either, so it has no profile to write.

## Related

- [`DAILY-PLAN.md`](DAILY-PLAN.md) — the only thing that reads this today, and why it exists
