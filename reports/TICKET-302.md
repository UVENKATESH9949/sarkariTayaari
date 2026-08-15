# TICKET-302 — Completed

**Sprint:** Sprint 3 — Sync Engine
**Scope:** Sync progress UI (progress bar / percentage during first sync); after the 2-minute timeout, switch to a small non-blocking indicator instead of a full-screen blocker.

## What was done

- `mobile/src/sync/SyncContext.tsx` — `SyncProvider` + `useSyncStatus()`. On first mount, checks `sync_meta` (TICKET-203) for this device: if it's already synced, publishes `status: "completed"` immediately (no blocking, no re-sync — delta sync is TICKET-303). If never synced, runs `runInitialSync` (TICKET-301) and republishes every progress tick it emits, so any component in the tree can read live sync state.
- `mobile/src/sync/SyncProgressScreen.tsx` — full-screen blocking view shown only while genuinely mid-first-sync: "Preparing..." during the initial local-DB check, then a progress bar + `synced / total · percent%` once real counts are available.
- `mobile/src/sync/SyncBanner.tsx` — small floating banner (bottom of screen, non-blocking) shown only when `status === "partial"` ("Syncing more content...") or `status === "error"` ("Could not finish syncing..."); renders nothing otherwise.
- Wired into `mobile/src/app/_layout.tsx`: the root layout now renders `SyncProgressScreen` in place of the `Stack` while `status` is `"checking"` or `"syncing"`, and once unlocked renders the normal `Stack` + a `SyncBanner` overlay on top.

## Bug found and fixed while verifying

While testing, `runInitialSync`'s pagination loop checked `result.last` and `break`-ed *before* ever calling `onProgress` with real counts on that page. For a dataset that fits in a single page — true today at ~108 rows — this meant the loop published exactly one progress event ever (`"completed"`), so the progress bar had nothing to render: the screen would jump straight from "Preparing..." to the Home screen. Fixed in `mobile/src/sync/initialSync.ts` so a `"syncing"` tick with the real `synced`/`total` counts always fires for every page, including the last one, before the final `"completed"` tick.

## Verification

Verified on a real device against the real backend (not mocked), using `adb shell pm clear host.exp.exponent` to simulate a genuine fresh install where needed:

- **Already-synced path** (device with a prior successful sync): app opens straight to the Home screen, no progress screen flash, no banner. Confirmed via screenshot.
- **Never-synced path**: confirmed via screenshot that `SyncProgressScreen` renders "Preparing your question bank..." during the local-DB check phase, then the app auto-transitions to the Home screen once sync finishes — no manual reload needed, proving the context re-render correctly unblocks navigation.
- **Progress tick fix**: confirmed via logcat (temporary log, removed after) that the sequence is now `{"status":"syncing","synced":108,"total":108}` → `{"status":"completed","synced":108,"total":108}` — i.e. a real progress value is always published before completion.

**Not verified:** the `"partial"` banner path and the progress bar's mid-sync percentage animation (e.g. 20% → 60% → 100%) with real device screenshots — the current ~108-row/single-page dataset syncs in a couple of seconds once the app is warmed up, too fast to catch a partial percentage visually, and never crosses the 2-minute soft timeout that would trigger the `"partial"` banner. Both code paths exist and are exercised by the same tested logic (multi-page loop, timeout check), but real visual confirmation of them is deferred to TICKET-501's 10,000+ question load test, same caveat already noted in TICKET-301.

## Reference

- Requirements doc: `../offline-exam-app-requirements.md` (Sprint 3, TICKET-302)
- Code: `../mobile/src/sync/SyncContext.tsx`, `../mobile/src/sync/SyncProgressScreen.tsx`, `../mobile/src/sync/SyncBanner.tsx`, `../mobile/src/app/_layout.tsx`, `../mobile/src/sync/initialSync.ts` (bug fix)
