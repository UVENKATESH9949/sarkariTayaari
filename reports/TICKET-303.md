# TICKET-303 — Completed

**Sprint:** Sprint 3 — Sync Engine
**Scope:** Delta sync flow — call sync API with stored `last_synced_at`, upsert changed rows, delete soft-deleted rows.

## What was done

- Extracted the write logic shared between full and delta sync into `mobile/src/sync/writeQuestions.ts`: `writeLanguages()`, `upsertQuestion(tx, q)`, `deleteQuestionLocally(tx, questionId)`. `initialSync.ts` (TICKET-301) was refactored to use these instead of its own inline copy.
- `mobile/src/sync/deltaSync.ts` — `runDeltaSync(examType)`:
  - Reads `sync_meta.last_synced_at` (TICKET-203); if the device has never synced, falls back to a full sync (`since=0`) automatically.
  - Paginates the sync endpoint with that `since` value, and for each row in each page: if the server reports it `deleted`, hard-deletes it locally (row + its translations) rather than just flagging it — a read-only client has no reason to keep a ghost row around once the server says it's gone. Otherwise, upserts it (same as full sync).
  - Stamps a fresh `last_synced_at` on completion.
  - No progress UI / 2-minute timeout here — unlike the initial sync, deltas are expected to be small; TICKET-302's progress UI was explicitly scoped to "during first sync".

## Verification

Verified against real mutations made directly through the live backend API (not simulated), with a temporary logging probe on the home screen, removed after confirming:

1. Baseline: local DB had 108 SSC_CGL questions, in sync with the server.
2. Made two real backend changes via `curl`: `PUT /api/questions/{id}` changing one question's difficulty `medium` → `hard`, and `DELETE /api/questions/{id}` soft-deleting a different question.
3. Ran `runDeltaSync("SSC_CGL")` on-device:
   ```
   local questions before = 108
   deltaSync result -> {"status":"completed","upserted":1,"deleted":1}
   local questions after = 107
   ```
4. Confirmed content, not just counts:
   - The updated row's local `difficulty` is now `"hard"`, with `updatedAt` matching the server's new timestamp.
   - The deleted question: 0 rows in `questions`, 0 rows in `question_translations` — fully removed, no orphaned translations left behind.

This confirms the core delta-sync contract: only genuinely changed rows are touched, upserts apply correctly, and deletions clean up both tables.

## Note — real data was intentionally mutated for this test

To get a real (not simulated) delta to sync, one live SSC_CGL question was changed (`difficulty: medium → hard`) and one was soft-deleted, directly against the real Neon-backed dev database. The difficulty change is trivial to revert (`PUT` it back to `medium`). The soft-delete cannot currently be undone through the existing API — there's no "restore" endpoint, only `DELETE` (soft) — so that question stays soft-deleted unless you want a restore endpoint added or it's fixed directly in the database. Flagging this the same way the earlier leftover manual-test rows were flagged, rather than deciding unilaterally.

## Reference

- Requirements doc: `../offline-exam-app-requirements.md` (Sprint 3, TICKET-303)
- Code: `../mobile/src/sync/deltaSync.ts`, `../mobile/src/sync/writeQuestions.ts`, `../mobile/src/sync/initialSync.ts` (refactored)
