# Daily plan: a server-generated plan, cached as a device snapshot

**Date:** 2026-09-22
**Systems touched:** `mobile/` only. **Zero backend changes** — the server already did the part
that mattered. Covers **Today's Plan and the Exams tab**, on one shared snapshot layer.
**Status:** implemented, typechecked, linted, and exercised on `emulator-5554` including a real
airplane-mode pass. Three QA cases recorded; two **Blocked**, one **Not Executed** — see
"What was not verified".

---

## The audit came first, and it changed the work

The proposal that prompted this was largely right, but three of its premises did not survive a
read of the code. Recording that, because two of them would have been wasted effort.

### §7 — "don't regenerate the plan every request" — was already implemented

`DailyPlanService` line 220:

```java
List<StudyTask> existing = tasks.findForDay(user.getId(), today, examCode);
if (!existing.isEmpty()) {
    return respond(..., existing, false, ...);   // generated: false
}
```

It is already get-or-create. The endpoint's own contract documents `generated: false` on a
re-read, and this project measured the difference on 2026-09-21: **16.7 s to generate a new day,
2.1–2.9 s to re-read one.** So the 17 seconds is the first read of a new day, once per user per
exam per day — not every open. The cache is still worth building, but for **instant open and
offline**, not for eliminating repeated generation.

### §8 — the uniqueness constraint is the right instinct, the wrong shape

`study_tasks` stores **one row per task**, not one per plan. `UNIQUE(user_id, exam_code,
plan_date, zone)` on that table would permit exactly **one task per day**. Expressing "one plan
per day" needs a parent row that does not exist. There is an index
`idx_study_tasks_user_date (user_id, plan_date, exam_code)` but no unique constraint, so the
concurrent double-generation gap is real — just not closable that way. **Left open, deliberately,
and flagged rather than half-fixed.**

### §8 again — putting `zone` in the key would have been a regression

`plan_zone` is recorded on the row but deliberately excluded from `findForDay`. Key on it and a
student who flies Delhi→Dubai gets a *second* plan for the same calendar day. Record-but-don't-key
is correct as it stands and was left alone.

## What was built

| File | What |
|---|---|
| `mobile/src/db/migrations/0031_remote_snapshots.sql` | One generic `remote_snapshots` table |
| `mobile/src/db/schema.ts` | The table, and why it is generic |
| `mobile/src/data/snapshotStore.ts` | The reusable read/write/clear layer |
| `mobile/src/data/dailyPlanProgress.ts` | Local per-topic activity, mirroring the server's rule |
| `mobile/src/data/dailyPlanData.ts` | The stale-while-revalidate policy |
| `mobile/src/app/daily-plan.tsx` | Renders the snapshot, labels it, and refuses to lose it |
| `mobile/src/practice/authContext.tsx` | Sign-out clears the `daily-plan` namespace only |
| `mobile/src/data/examDiscoveryData.ts` | The Exams tab's facade, cache and countdown re-derivation |
| `mobile/src/app/(tabs)/exams.tsx` | Reads through the facade instead of calling the API directly |

**One table, not one per feature.** The daily plan is the first caller, but the study roadmap, the
revision plan and the learning state are the same shape of problem — an expensive, server-owned
read with nowhere on the device to put the result. Three tables would be three migrations and
three near-identical read paths free to drift.

**The payload is the response JSON verbatim, not normalised columns.** This caches somebody else's
contract; typed columns would need a migration every time that contract gains a field.

## The policy

Stale-while-revalidate, with **definition and progress cached differently**.

The **definition** — which topics, which purpose, how many questions, why — is what the server
decides and the device cannot. That is what gets stored.

The **progress** — `status`, `answeredToday`, `accuracyToday` — is server-computed from real
attempts, because Phase 6 *infers* completion rather than offering a "mark done" button
(decisions D6.1/D6.2). Cache those verbatim and a student who answered twelve questions offline
still reads "0 of 15", which looks like their work was lost. So a **cached** plan has its progress
re-derived on the device.

**Server values always win when the server answers.** The local derivation fills a gap; it never
competes. Anything else would make the same task read one way online and another offline.

### The local derivation mirrors the server line for line

`TaskOutcomeService.observedOn` sums `practiceByTopicInWindow` + `mockByTopicInWindow`, both
bounded by `completedAt` within the day and both excluding `UNATTEMPTED` and `PENDING_REVIEW`
(`TaskOutcomeRepository.COUNTED`). `dailyPlanProgress.ts` matches all three — both sources, same
window, same exclusions. Getting that wrong would be worse than not having it at all.

`status` is deliberately **not** re-derived: settlement applies a ≥60% threshold that belongs in
one place, and a second copy is exactly the drift this program spent three phases removing.

**Two honest divergences, both unavoidable on the device and both written into the code:**

1. The server reads `topic_id` frozen onto each result row at upload (V47), so retagging a question
   cannot rewrite history. Local rows carry no topic, so this joins `questions` live — a retagged
   question moves here and not there. Self-correcting on the next successful fetch.
2. A null local `outcome` is counted. Right for practice rows (a row exists only if answered) and
   harmless for mock rows, where genuinely unattempted answers carry a real `UNATTEMPTED`.

## The key, and why every part of it is load-bearing

`daily-plan:{userId}:{examCode}:{planDate}:{zone}`

- **user** — signing in as somebody else must never surface the previous account's plan. Encoding
  the owner makes that impossible by construction rather than dependent on a sign-out hook. Sign-out
  clears snapshots anyway; a stale plan under another name is the kind of bug that looks like a data
  leak whether or not it is one.
- **exam** — switching exams must not evict the other's snapshot.
- **date + zone** — a plan belongs to a calendar day, and the same instant is two different days
  either side of midnight. This is what answers the original "no cache" objection that a saved plan
  risks showing yesterday's work as today's: it cannot, because it would not be found.

## The rule that makes the cache safe rather than harmful

**A failed refresh must never replace a usable plan with an error.** Implemented in both the
background callback and the pull-to-refresh handler. The obvious implementation — set state on
every refresh result — would blank a working plan the moment the network drops, which is worse than
having no cache at all: the student had something to work from and lost it.

## Verified on the device

- **Migration 0031 applied to the real 64 MB populated database** with no failure screen and no data
  loss. This was the riskiest item: a failed local migration is a hard gate that stops the app
  starting.
- **Second open at 1.5 s: the full plan already rendered**, with *"Saved plan, last updated 6:56 PM.
  Your progress below is counted on this device."* Previously this window showed "Working out your
  day…".
- **The note cleared ~8 s later** — the background refresh landed and replaced the snapshot.
- **Airplane mode: the full plan still rendered**, labelled, and the failing refresh left it alone.
  Before this change that exact situation produced "No plan right now".

## The same treatment for the Exams tab

The Exams tab had the same problem and none of the same excuses: it called `discoverExams`
**directly from the screen**, with no data-layer facade at all, so every open and every
sort/category change was a server round trip. It now goes through `data/examDiscoveryData.ts`,
which uses the same `snapshotStore` — which is what the reusable layer was for.

**Two deliberate differences from the daily plan:**

- **No user in the key.** Discover is public, takes no token, and returns nothing personal —
  follow state lives in the local `followed_exams` table and never travels in the payload.
  Keying by user would fragment one shared answer per account for nothing. This is why sign-out
  now clears **only** the `daily-plan` namespace.
- **Only the first page is cached.** That is what an open renders; "load more" is a deliberate
  action on a screen already in front of the student, so it stays live.

**And the same definition-versus-derived split, for a different reason.** Almost every field on
an `ExamCard` is a dated fact and keeps. Two do not: `daysUntilDeadline` and `closingSoon` are
computed relative to *when the server answered*. Replay those from a four-day-old snapshot and a
card claims "closes in 12 days" when it is really 8 — and worse, `closingSoon` decides which
**section** an exam lands in, so a stale flag files it under the wrong heading. Both are
recomputed on the device from `applicationEnd`, which is absolute and safe to store, mirroring
`ExamDiscoveryService`'s rule including its fourteen-day threshold.

### Verified — after three invalid attempts

With airplane mode on, the full catalogue rendered from the snapshot with *"Saved list, last
updated 7:44 PM. Deadlines are counted for today."* Before this change that situation produced
"Couldn't load exams".

**Three earlier attempts at that test were invalid, and both causes are worth writing down
because neither is a product bug:**

1. **Tab screens stay mounted.** Switching Home → Exams does *not* re-run the load effect, so
   what looked like a cache hit was in-memory state from an earlier online load. Changing the
   **sort** is what forces a genuine re-read, because that changes the effect's key.
2. **`10.0.2.2` bypasses `adb reverse`.** This dev build sets `EXPO_PUBLIC_API_BASE_URL` to the
   emulator's host-loopback alias, so removing the `tcp:8080` tunnel did **not** make the backend
   unreachable — the app was talking straight to the host, and my "offline" test was an online
   one. This project's own notes already record this trap once; it caught me again.
   Airplane mode does block it — but also blocks Metro, so a dev build **cannot be cold-started
   offline**. Go offline after the app is running.

I reported the cache as broken twice on the strength of those tests before finding the real cause.
The implementation had been correct throughout.

## What was NOT verified

- **`TC-DAILYPLAN-034` was not run at all, and it is the largest gap.** The whole reason for
  splitting definition from progress is that a student answering questions offline should watch the
  count move — and nobody has seen that happen. The rule mirrors `TaskOutcomeService` by
  construction, but "mirrors by reading" is not "agrees when run".
- **`TC-DAILYPLAN-032` step 4** — two exams each keeping their own snapshot. Correct by
  construction (the exam is in the key); not observed.
- **`TC-DAILYPLAN-033` steps 3–4** — pull-to-refresh *while* offline, and refresh after
  reconnecting. The don't-destroy-the-plan rule exists in both paths; only the background one was
  seen failing.
- **No second account was signed in**, so the per-user key isolation is reasoning, not an
  observation.
- **The concurrent double-generation gap on the server is untouched** (see §8 above).
- **The two Telugu strings in this work are mine and unreviewed** — the note text is English-only
  today, matching the rest of this screen.
- **`TC-CATALOG-050` steps 4-5 were not run** — no card's countdown was checked against a real
  calendar, and no refresh-after-reconnect was observed for the Exams tab.
- **Nothing is committed.**

## QA

`REQ-DAILYPLAN-014/015`, `SCN-DAILYPLAN-031..033`, `TC-DAILYPLAN-032..034`, and
`EXEC-DAILYPLAN-0032..0034` in `qa/execution/2026-09-22-dailyplan-snapshot-cache.yaml`. Two cases
**Blocked**, one **Not Executed** — nothing was marked Pass on the strength of a neighbouring step
passing. RTM 167/319/342 → **169/322/345**.
