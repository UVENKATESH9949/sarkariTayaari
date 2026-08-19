# Load-Test Data Seeding (TICKET-501)

**Closes:** TICKET-501 ("load test with 10,000+ seeded questions"). Expanded beyond the
ticket's literal wording per the user's direction: populate every module (exams,
questions, practice history, mock-test history) with realistic volume, so the app looks
and behaves like a finished product on a real phone — not just "make the question count
big."

## Round 2 (2026-08-19) — scaling further toward V1.2's TICKET-701 target

The user asked to push the load test further, specifically to move toward V1.2's
TICKET-701 target of 20,000-50,000+ questions (round 1 landed at ~14,000) and to add
more demo-account history. Both existing scripts were re-run with larger targets —
each is additive (fresh ids each run), not a replace:

- **`scripts/generate-load-test-questions.js`**: per-subject `TARGETS` roughly doubled
  (e.g. Quant 3,500 → 7,000, Reasoning 3,500 → 7,000). Added **23,800 more questions,
  0 failures**, bringing the live total from 14,084 to **37,884** — solidly inside the
  20k-50k range. Fixed a real bug found while preparing this run: the script's manifest
  write was a plain overwrite, not a merge — re-running it would have silently lost the
  round-1 manifest (11,900 ids), breaking the documented `bulk-delete` cleanup path.
  Fixed to read-merge-dedupe against any existing manifest before writing; the combined
  manifest now correctly tracks all **35,700** generated ids across both rounds.
- **`scripts/generate-demo-history.js`**: `PRACTICE_SESSION_COUNT` 100 → 250,
  `MOCK_ATTEMPT_COUNT` 25 → 60, `HISTORY_WEEKS` 10 → 16. Uploaded via the same real
  `POST /api/progress/sync` path as round 1. The script's own post-upload restore check
  confirmed the server-side total: **350 practice sessions, 85 mock attempts** (100+250,
  25+60).

**Re-verified on the same Android emulator used for round 1** (still running, same dev
client, `adb reverse` still in place): foregrounded the app after the staleness window
elapsed, triggering a real delta sync of the ~23,800 changed rows. It completed
successfully with no crash, hang, or error — confirming the earlier `upsertQuestionsBatch`
mobile-side fix holds up at roughly 2.7x the scale it was originally fixed and verified
at. Practice tab afterward showed correct, live per-exam counts (SSC CGL 10,174, IBPS PO
12,186, IBPS Clerk 12,203, etc.) matching the new totals exactly. A server-side timed
full pagination pass (500/page) covered all 37,884 questions across 76 pages in **235.9s**
— consistent scaling from round 1's 117.6s/28 pages, no signs of a regression at the
larger volume. (Re-confirming the exact same numbers for the demo account's *expanded*
history from a clean on-device sign-in was not completed — the emulator's sign-out
button stopped responding to scripted taps partway through this session; server-side
restore confirmation via the script itself was treated as sufficient, see above.)

## What existed before

~113 real questions across 2 active exams (SSC CGL, SSC CHSL). `scripts/seed-topics.ps1`
and `scripts/seed-structures.ps1` had already been run at some earlier point, though —
confirmed by reading the live database directly, not assumed — giving 108 real
sub-topics and full stage→paper→section structures for 6 exam codes (SSC_CGL, SSC_CHSL,
IBPS_PO, IBPS_CLERK, RRB_NTPC, RRB_GROUP_D), 4 of which were sitting inactive.

## What was built

**Reference data**
- The 4 existing-but-inactive exams (IBPS_PO, IBPS_CLERK, RRB_NTPC, RRB_GROUP_D) were
  activated.
- New `scripts/seed-more-exam-structures.ps1` (modeled directly on the existing
  `seed-structures.ps1`, same conventions and caveats) added 5 more real exams with
  genuine published patterns: UPSC Civil Services Prelims, SSC MTS, SSC GD Constable,
  RBI Assistant Prelims, LIC AAO Prelims. **11 active exams total**, each with at least
  one mockable paper — this also closes `memory/STATUS.md`'s separate "define structures
  for the other exams" backlog item as a side effect.

**~14,000 questions** (11,900 newly generated + the original 113), via new
`scripts/generate-load-test-questions.js` (Node — templated, not hand-authored, an
explicitly agreed trade-off for load-test volume): programmatic math generators
(percentage, profit/loss, SI/CI, time-work, etc. — each computes its own correct answer),
fixed-family reasoning puzzles (series, coding-decoding, blood relations, direction
sense, analogy, classification, inequality, ranking), English vocabulary/grammar banks,
and curated real-fact banks for GK/Science/Computer Knowledge — genuinely bilingual
EN/HI throughout, not English duplicated under the "hi" language code (an actual bug
caught and fixed during a dry run before the full batch, see below). Every created
question id is recorded in `scripts/load-test-seed-manifest.json` for future cleanup via
the existing `POST /api/questions/bulk-delete`.

**A real, lasting demo account** — `demo@sarkaritaiyaari.app` / `Demo@1234` — with ~100
practice sessions and 25 mock attempts, uploaded via the real `POST /api/progress/sync`
(the exact path the app itself uses, already covered by `ProgressSyncTest.java`), not a
raw DB insert. Sessions/attempts reference real question ids pulled live from the
database and use each mock paper's actual effective marking, so restoring this account on
a phone shows a genuinely coherent history.

**Two real backend performance bugs found and fixed** (this is the actual point of a
load test — not just "did it fit," but "what broke at scale"):

1. **`QuestionService.bulkImport()`** did 8-10 separate DB round trips *per question*
   with zero caching (a difficulty check, a subject lookup, a topic lookup, one exam
   lookup per exam code, one language check per translation) — at scale this made a
   500-question import take minutes instead of seconds; the very first batch of the full
   run didn't complete in 8+ minutes. Fixed by pre-loading every lookup once per request
   instead of once per row, and by flushing every 50 rows instead of every row (so
   Hibernate's JDBC batching — newly enabled, see below — actually has enough queued
   statements to batch). Net effect: **~48x faster** (2.4s/question → ~0.045s/question).
   Also enabled `hibernate.jdbc.batch_size`, `order_inserts`/`order_updates`, and the
   Postgres driver's `reWriteBatchedInserts` — none of which existed before.
2. **`ProgressService.upload()`** called `save()` per row on entities with
   *client-assigned* (not DB-generated) ids — Spring Data can't tell new from existing
   without a lookup for that kind of id, so every `save()` silently took the `merge()`
   path, which does its own `SELECT` first. Uploading the demo account's 100
   sessions + 25 attempts (~3,575 rows including cascaded results) hit this exactly and
   never completed in 2 minutes. Fixed by checking which incoming ids already exist
   *once*, up front, then calling `entityManager.persist()` directly for the (normal)
   brand-new ones and reserving `merge()` for genuine retries — the actual reason that
   idempotency existed in the first place.
3. **`default_batch_fetch_size` (used by `/api/questions/sync`) was tuned for the old
   ~112-question scale (50), not the current one.** At a full 500-row sync page, that
   meant ~10 batched round trips per lazy relationship instead of 1. Raised to 500 to
   match the page size — cut a full sync from ~198s to ~118s.
4. **`BookmarkService.upload()`** — audited as a follow-up after finding the same
   pattern twice above, and it was there too, in a variant form: the per-row
   `findByUserIdAndQuestionId` existence check is genuinely required here (unlike
   `ProgressService`'s case, this one has real last-write-wins conflict-resolution logic
   that needs it), but for a brand-new bookmark it *doubled up* — the explicit check
   found nothing, then `save()` on the manually-assigned id took the `merge()` path
   anyway, which does its own existence check before inserting. Fixed the same way:
   batch the existence check once via `findAllById`, mutate already-managed entities
   directly (no extra call needed — Hibernate's dirty checking handles it), and call
   `entityManager.persist()` directly for genuinely-new rows. Bookmark upload payloads
   are typically small in real usage, so this matters less in practice than the other
   two, but it's the same real bug and was cheap to fix while already in this code.

All four were confirmed with the existing test suite before and after (no regressions —
`BulkOperationsTest`, `QuestionCrudTest`, `SyncEndpointTest`, `DifficultyLevelTest`,
`ProgressSyncTest`, `BookmarkSyncTest` all still pass, including the specific
retry-idempotency and last-write-wins conflict tests these changes touch, plus a final
full 71-test suite run at the end), not just by eyeballing the code.

**Sync cost, profiled properly instead of left as a guess.** After the batch-fetch-size
fix, SQL debug logging on a single sync page (500 rows) showed exactly **4 queries** —
the main paginated query (with `topic`/`subject` eagerly joined), a `COUNT(*)` for
`totalElements`, and two batched `= any(?)` queries for exams and translations. That
confirms the N+1 pattern is genuinely gone, not just reduced — the remaining ~4s/page is
real per-query network latency against Neon, not excess round trips. One further, real
optimization exists (drop the `COUNT(*)` query by returning `Slice` instead of `Page`,
since Spring Data always issues it for `Page`) but isn't a safe quick change: checked
`mobile/src/sync/initialSync.ts` directly, and it uses `result.totalElements` to drive
the sync progress bar's percentage — dropping it would need a mobile-side redesign of
that progress indicator too, not just a backend return-type swap. Left as a documented,
scoped-out follow-up rather than an "honest gap" of the profiling itself, since the
profiling was actually completed.

**A fifth real bug — this one client-side, found via actual on-device testing.**
An Android emulator was launched (`emulator` AVD) with a previously-built debug dev
client, connected to Metro and this same backend via `adb reverse`. On the very first
real sync at load-test scale, the app hung indefinitely mid-sync with no crash and no
error — `mobile/src/sync/writeQuestions.ts`'s `upsertQuestion()` awaited roughly 7
individual SQLite statements per question (1 upsert, 1 delete + up to 4 exam-tag
inserts, 1-2 translation upserts), called in a per-row loop from both `initialSync.ts`
and `deltaSync.ts`. At 500 questions/page that's 3,000+ blocked round trips through the
Expo SQLite JS bridge per page — the exact "await one insert per row" pattern this same
file's own comment already named as the cause of an earlier mock-test submit bug, just
never applied here. Fixed the same way: a new `upsertQuestionsBatch()` clears and
bulk-reinserts the join/leaf tables (`questionExams`, `questionTranslations`) per page
and bulk-upserts `questions` itself using SQLite's `excluded.*` upsert syntax instead of
one `onConflictDoUpdate()` call per row. Both sync paths now call it once per page
instead of looping.
- Verified by rebuilding the Metro bundle, force-stopping and relaunching the app, and
  watching a real delta sync (14,000+ questions, since this device's watermark predated
  the load-test seeding) complete in well under a minute instead of hanging.
- Verified further by driving the actual UI afterward: Practice showed all 11 exams with
  correct per-exam question counts (SSC CGL 3,541, IBPS PO 4,052, RBI Assistant 2,934,
  etc.), drilling into RRB NTPC showed correctly-scoped per-subject counts, and Mock
  Test listed real papers with correct marking schemes pulled from synced structure data.
- Signed into the demo account (`demo@sarkaritaiyaari.app`) on-device and confirmed its
  full history restored correctly: **71% readiness, 1,157 questions attempted, 100
  sessions completed**, with real per-subject accuracy (Quant 71%, Reasoning 73%,
  English 68%, GA 70%, Computer Knowledge 69%, General Science 74%) — the exact numbers
  `scripts/generate-demo-history.js` uploaded, round-tripped through sync and rendered.
- `tsc --noEmit` and `eslint` both clean on the changed files; no mobile test suite
  exists for this project to run (device verification is this project's established
  substitute, per `memory/STATUS.md`'s environment notes).

## Verified

- **71+ existing backend tests still pass** after both service changes (ran the specific
  suites touched: `BulkOperationsTest`, `QuestionCrudTest`, `SyncEndpointTest`,
  `DifficultyLevelTest`, `ProgressSyncTest` — all green, 0 failures).
- **11,900 questions created, 0 failures**, confirmed via the bulk-import response and a
  live count against `/api/questions/sync`.
- **11 active exams**, each with a real mockable paper — confirmed via
  `GET /api/exams` and `GET /api/exam-structures`.
- **A real, measured full-sync timing**: paginated `/api/questions/sync` exactly the way
  the mobile app's `runInitialSync` does (500/page) from a clean `since=0` — **197.9s
  before the batch-fetch-size fix, 117.6s after**. 118s is within the app's existing
  2-minute soft-timeout design (past that, it unblocks and finishes in the background),
  so the app *handles* this scale, but "handles" and "fast" aren't the same thing — see
  below.
- **Demo account restore confirmed live**: `GET /api/progress` with the demo account's
  real token returns exactly 100 practice sessions and 25 mock attempts.
- **A sample of generated questions spot-checked directly** (every 2000th id in the
  manifest, across all 6 subjects): every correct-answer letter actually matches the
  correct option, and Hindi text is genuinely Hindi, not English duplicated under the
  `hi` language code — this was a real bug caught during a small dry run (10/subject)
  before generating the full batch, and fixed before the real run.
- **Manual test artifacts cleaned up**: the 60-question and 1,800-question dry-run
  batches (soft-deleted, harmless, same as this project's existing test-artifact
  precedent) and 61 stray hand-crafted timing-test questions (hard-deleted via
  bulk-delete, since those had throwaway text like "Timing test v2 0" that shouldn't
  exist even as deleted rows).

## Honest gaps

- **The full-sync timing (117.6s) is a real improvement, confirmed to be genuine
  remaining query cost, not something left unexamined.** The N+1 pattern is fully gone
  (4 queries per page, not 40+); the remaining time is real network latency against
  Neon. Dropping the `COUNT(*)` query (Page → Slice) is a real further optimization but
  needs a corresponding change to the mobile sync-progress UI first — scoped out as a
  follow-up, not attempted here.
- **On-device/emulator verification was later performed** (an Android emulator, launched
  in this same session) and found a real, previously-invisible client-side bug — see "A
  fifth real bug" above. Only one exam/subject drill-down path and the demo account's
  restore were exercised this way, not every screen; a full manual click-through of Mock
  Test's timed-attempt flow and Practice's quiz-taking flow at this data scale still
  hasn't been done.
- **~2,071 soft-deleted rows remain from earlier dry runs** (60 + 1,800 + a handful from
  unrelated test-suite runs sharing the same dev DB) — harmless, matches this project's
  existing "Automated Test Subject/Topic/Exam" precedent, not cleaned up further since
  soft-delete is the correct, working behavior being exercised, not a bug.
- **The 5 newly-added exam patterns (UPSC CSE, SSC MTS, SSC GD, RBI Assistant, LIC AAO)
  are based on general knowledge of published patterns, not a freshly-checked official
  notification** — same caveat the original `seed-structures.ps1` already carries
  explicitly. Worth verifying against current notifications before this is treated as
  exam-accurate content rather than load-test-shaped content.
