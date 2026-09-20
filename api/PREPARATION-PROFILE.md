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
    "updatedAt": "2026-09-19T04:02:11.882Z"
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

**`web/` does not write it yet** — same pattern, not yet built.

## Related

- [`DAILY-PLAN.md`](DAILY-PLAN.md) — the only thing that reads this today, and why it exists
