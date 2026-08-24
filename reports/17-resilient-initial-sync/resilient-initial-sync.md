# Resilient Initial Sync (Auto-Retry + Real Progress Bar)

**Closes:** a user-reported production bug, with pasted screenshots — initial sync failing intermittently partway through (around 500 questions in) with a 500 error from the deployed Cloud Run backend, and a UI the user explicitly disliked: "i dont want thoese buttons in bottom of the page... remove completely... put one bar in more page how much it is synced... sync is failing in middle... it should auto trigger until completes." Un-ticketed. Also resolves the "Retry/backoff policy for failed syncs" line under `reports/open-questions.md`'s **Still open** table.

## What existed before

`mobile/src/sync/SyncContext.tsx` called `runInitialSync()` once; if it threw, the error was logged and reported to Sentry but the sync simply stopped — the user was left with a permanently "syncing"/"failed" state and no way forward short of manually retrying from More. The More screen and a floating `SyncBanner` component both showed sync status, but the banner had already been implicated in an earlier bug this session (silently eating bottom-tab-bar taps) and the user wanted it gone entirely, not just fixed again.

## What was built

**`runInitialSyncUntilDone()`** (`mobile/src/sync/initialSync.ts`) wraps the existing `runInitialSync()` in an indefinite retry loop with exponential backoff (`RETRY_BASE_MS = 2s`, doubling each attempt, capped at `RETRY_MAX_MS = 30s`). It relies on the sync's *existing* per-page checkpoint (`getResumeState()`/`setResumeState()`/`clearResumeState()` in `mobile/src/db/syncMeta.ts`, already built for TICKET-304) so a retry resumes at the next unfetched page rather than restarting from zero — a failed attempt costs one page's worth of re-work, not the whole sync. Failures are captured to Sentry (`captureError(err, { context: "initial sync retry", attempt })`) for visibility, but never surfaced to the UI as a terminal "error" state — a failed attempt's progress callback is remapped to `"syncing"` with the last known synced/total counts, so from the screen's point of view sync is always still in progress, just slower during a rough patch.

`SyncContext.tsx` now calls `runInitialSyncUntilDone()` instead of `runInitialSync()`, both on first-ever launch and from the manual "Sync Now" button — the `try/catch` around the old call is gone entirely, since the function no longer throws.

**UI:** `mobile/src/sync/SyncBanner.tsx` (the floating bottom banner) is deleted outright. `mobile/src/app/(tabs)/more.tsx`'s existing Data section now shows a real percentage bar (`{percent}% · {synced}/{total} questions`) computed from the same `synced`/`total` the context already published, replacing what had been a static "Never" / basic status line.

## Real bugs found and fixed

**Root cause of the mid-sync 500s, as far as it was diagnosed:** the Cloud Run deployment (`reports/14-cloud-run-deployment/`) was never given an explicit `--memory` flag, so it runs on Cloud Run's default allocation; combined with Hibernate's `default_batch_fetch_size: 500` (sized for the load-test dataset, see `reports/12-load-test-data-seeding/`), a sync page request under real load is a plausible fit for an out-of-memory kill partway through. **This is a diagnosis from reading the deployment config and the failure pattern (fails consistently partway through a large page, not at a fixed request count), not a confirmed reading of a Cloud Run memory graph or crash log** — it was never independently proven with a memory-usage chart.

**What was actually fixed, and what wasn't:** this change fixes the *symptom* from the mobile side — a transient backend failure no longer strands the user, it just costs a short retry delay. It does **not** touch the backend: no `--memory` flag was added to the Cloud Run service, and Hibernate's batch size was not revisited. If the underlying cause really is memory pressure, it will keep happening on every large sync; this fix just makes each individual failure invisible and recoverable instead of terminal.

## Verified

Verified via real Android emulator testing against the actual deployed Cloud Run backend (not a mock): a real initial sync was observed hitting the intermittent 500s described by the user, retrying automatically with visibly increasing backoff delays in the Metro log (`Initial sync attempt N failed, retrying in Xms`), and eventually completing — the More screen's percentage bar climbed correctly throughout, including through the failed attempts (it held steady rather than resetting or showing an error). The floating banner is confirmed gone from every screen. `npx tsc --noEmit` clean.

## Honest gaps

- The actual Cloud Run memory limit was never changed, so the underlying failure condition (if it is in fact OOM) is still present — this is a resilience fix, not a root-cause fix, and is recorded as such rather than claimed as "sync failures fixed."
- No upper bound exists on the retry loop — a persistently broken backend would retry forever at 30s intervals rather than eventually giving up and telling the user something is wrong. Acceptable for the failure mode observed (transient, self-resolving) but worth revisiting if a genuinely permanent backend outage is a realistic scenario.
- The exact OOM hypothesis was never confirmed against real Cloud Run logs/metrics in this session — see "Real bugs found and fixed" above.
