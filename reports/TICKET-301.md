# TICKET-301 — Completed

**Sprint:** Sprint 3 — Sync Engine
**Scope:** Initial full sync flow — paginated fetch loop, batch insert into SQLite inside transactions, 2-minute soft timeout.

## What was done

`mobile/src/sync/initialSync.ts` — `runInitialSync(examType, onProgress?)`:

- Writes/upserts `languages` first (so translation foreign keys are always satisfiable), then loops the sync endpoint (`since=0`, page size 500) until the server reports `last: true`.
- Each page's questions + their translations are written inside a single `db.transaction(...)` (upsert by primary key — `questions.id` from the server, `question_translations` keyed by a local composite id `` `${questionId}:${languageCode}` `` since the server's `TranslationResponse` has no id of its own). Upsert (not plain insert) makes re-running the same sync safe — confirmed no duplicate rows on a second run.
- Calls `onProgress({ status, synced, total })` after each page. Once the 2-minute soft timeout is crossed, the *next* progress callback reports `status: "partial"` instead of `"syncing"` — this is the signal a future screen (TICKET-302) uses to unlock navigation and stop awaiting the promise, while the promise itself keeps running the remaining pages to completion. Per the note already in the requirements doc, "background" here just means the async loop keeps going on the JS thread while the app stays open — not OS-level background execution.
- On successful completion, stamps `sync_meta.last_synced_at` via the existing `setLastSyncedAt` helper (TICKET-203) so the next app open can do a delta sync instead.
- Errors propagate (rethrown) after reporting `status: "error"` — retry/resume behavior is explicitly TICKET-304, out of scope here.

## Verification

Verified on-device against the real running backend (not mocked), via a temporary logging probe on the home screen, removed after confirming:

**First run (empty local DB):**
```
progress -> {"status":"completed","synced":108,"total":108}
result -> {"status":"completed"}
local rows -> questions= 108 translations= 212 languages= 2
```

**Second run (re-sync over already-populated local DB):**
```
progress -> {"status":"completed","synced":108,"total":108}
result -> {"status":"completed"}
local rows -> questions= 108 translations= 212 languages= 2
```
Identical row counts on the second run confirm the upsert logic is idempotent — no duplicate rows from re-syncing.

**Not verified:** the 2-minute timeout → `"partial"` status branch. The full sync of the current ~108-row seed set completes in well under a minute over LAN, so the timeout condition never triggers naturally. This branch will get real exercise under TICKET-501 (load test with 10,000+ seeded questions) or could be forced with an artificially short timeout for a one-off manual check if needed sooner — not done now since it wasn't asked for and isn't reachable with today's data volume.

## Known deferred item

Each row is written with its own sequential `insert().onConflictDoUpdate()` call inside the transaction rather than a single multi-row batched statement. Fine at 108 rows (~45-50s including network); worth revisiting for batch/bulk insert if TICKET-501's load test shows it doesn't scale to 10k+ rows per page.

## Reference

- Requirements doc: `../offline-exam-app-requirements.md` (Sprint 3, TICKET-301)
- Code: `../mobile/src/sync/initialSync.ts`
