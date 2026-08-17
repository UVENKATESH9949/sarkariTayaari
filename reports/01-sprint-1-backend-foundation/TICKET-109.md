# TICKET-109 — Completed

**Sprint:** Sprint 1 (feedback after using TICKET-108)
**Scope:** Fix the bulk-import review flow — review/remove should happen before import, not after.

## The problem

TICKET-108 shipped a post-import review screen: import first, then review and remove anything unwanted. That's backwards — removing something *after* import means calling `DELETE` against the real database, which is unnecessary friction for a mistake that could have been caught for free before anything was written. The fix: let people see and remove questions from the batch while it's still just JSON in the browser, before any database write happens at all.

## What changed

**Frontend (`admin/src/pages/BulkImport.jsx`):**
- The "Analyze" step now doubles as a **review** step — each question in the batch shows its actual content (topic, exam type, difficulty, per-language question text), not just pass/fail status, plus a "Remove from batch" button. Removing is a pure client-side array filter — no API call, nothing to undo in the database.
- After clicking Import, there's no more edit/remove screen. Instead, a simple result summary: *"Imported X of Y question(s)."* If anything failed, each failure is listed with its topic/exam type and the specific reason it wasn't imported.
- Removed the "undo entire import" feature from TICKET-108, since there's no longer a batch of freshly-created rows sitting around to undo — review already happened before creation.

**Backend (`bulk-import` endpoint):**
- Previously all-or-nothing: `saveAll()` on the whole list inside one transaction meant one bad row could affect the batch's outcome as a whole. Changed to process each question independently (`saveAndFlush()` per item, wrapped in its own try/catch), so every item's success or failure is now determined and reported individually.
- `BulkImportResponse` gained a `failures` field: `[{index, error}]`, one entry per question that didn't make it in, with a human-readable reason.
- This is a genuine safety net, not just a UI nicety — even though the frontend analyser filters out invalid questions before sending, this guarantees that if something unexpected still fails (e.g. a language was removed from the `languages` table between analysis and import), you get a clear per-item reason instead of a generic error or a silently-failed batch.

## Verification

- Backend: tested directly via curl with a 2-item batch (1 valid, 1 with a bad translation) — confirmed response: `{"createdCount":1,"ids":[...],"failures":[{"index":1,"error":"Translations must include the root language: en"}]}`. Confirmed the valid item was NOT rolled back by the invalid one's failure. Test question cleaned up afterward.
- Frontend: `BulkImport.jsx` compiles cleanly through Vite (HTTP 200, no error overlay).
- **Not verified:** actual click-through in a browser (remove-from-batch button, full review UI, result summary rendering). No browser automation tool available in this environment.

## Reference

- Requirements doc: `../offline-exam-app-requirements.md` (Sprint 1, TICKET-109)
- Prior ticket: `TICKET-108.md`
