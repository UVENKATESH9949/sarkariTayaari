# Delta Sync — closing the content-delivery gap

**Status:** ✅ done, verified on the emulator against the live backend (2026-08-15)
**Scope:** TICKET-305, TICKET-306, TICKET-304, plus a stale-screen fix found during verification.

---

## The gap

`runDeltaSync()` was fully built and verified back in TICKET-303 — and **never called anywhere**. `SyncContext` returned early whenever `lastSyncedAt` existed, and there was no `AppState` listener, no pull-to-refresh and no network detection in the app at all.

The consequence: a device that completed its first sync never received anything again. Every verification through Phases A–C had to clear app storage to see new data, which is exactly what a real user cannot do. Three phases of backend and admin work were undeliverable.

---

## What changed

### TICKET-305 — sync on launch and foreground
`SyncProvider` now runs a delta sync when the app launches already-synced, and again whenever it returns to the foreground. Two deliberate details:

- **It reports through `isRefreshing`, not `status`.** The blocking full-screen progress UI keys off `status`, so routing delta syncs through a separate field is what keeps picking up new content invisible instead of throwing up a blocker every time the user switches apps.
- **A 15-minute staleness window** guards the automatic triggers, so foregrounding repeatedly doesn't hammer the server, while content authored today still reaches a device the same day it opens.

The in-flight guard is a `ref`, not state: launch and foreground can fire in the same tick, and a state flag wouldn't have updated in time to stop the second one.

### TICKET-306 — pull to refresh
`RefreshControl` on Home, passing `force: true` so it bypasses the staleness window entirely — the user explicitly asking is not a moment to decide nothing needs doing.

### TICKET-304 — resume an interrupted sync
`sync_meta` gained `resume_page` / `resume_started_at` (migration `0004`). The initial sync checkpoints after each committed page and resumes from the next unwritten one, instead of re-downloading the whole bank after a network drop.

### A correctness bug fixed along the way
Both syncs recorded `setLastSyncedAt(new Date())` **after** finishing. Anything edited *while* a sync was running fell between the old and new watermarks and would never be picked up again. Both now record the time the sync **started**. The cost is re-syncing a few rows that were already written, which the upserts absorb; the alternative was silent permanent data loss.

### The stale-screen fix (found during verification)
Delta sync wrote correctly to SQLite, but the UI still showed old data — because tab and stack state is preserved, so a screen mounted before the sync never re-queried. Pull-to-refresh would have looked broken.

`SyncContext` now exposes a `syncVersion` counter, bumped after any sync that wrote something. Screens reading from SQLite include it in their effect deps: Practice landing, Subjects, Topics, Levels and the Mock Test list.

---

## Verified on the emulator

All checks done with **storage intact** — the whole point — and read back via `uiautomator` text dumps.

- **Additions propagate live.** A difficulty level created through the API alone appeared after a pull-to-refresh on Home, with no storage clear and no rebuild.
- **Deletions propagate live.** Deleting it server-side and refreshing removed it again, confirming the full-replace strategy for reference data works in both directions.
- **The stale-screen case specifically.** Levels was mounted *first*, then a level was added server-side, then Home was pulled to refresh. Returning to the already-mounted Levels screen showed the new level — the exact scenario that failed before the `syncVersion` fix.
- **The banner behaves.** "Checking for new content..." appears during the refresh and clears on completion, without the blocking progress screen ever appearing.

The database was left clean: `easy, medium, hard`, four paper types, both structures intact, 113 questions.

### Honest gaps in verification

- **The foreground and launch triggers share the verified `refresh()` path**, but were not independently exercised — the staleness window makes them awkward to trigger on demand, and forcing them would have tested a different code path than the real one.
- **TICKET-304's resume was not exercised under a real interruption.** The checkpointing and resume logic is in place and the normal path works, but simulating a mid-sync network drop needs a deliberate fault-injection setup. The watermark fix that accompanies it is the more important half and is unconditional.

---

## Still outstanding

- **TICKET-307** — partial-data guard for sections not yet synced.
- **TICKET-405** — offline indicator. Nothing in the app currently detects connectivity; a failed refresh shows a banner, but there is no "you're offline" state.

Neither blocks content delivery any more, which was the point of this work.
