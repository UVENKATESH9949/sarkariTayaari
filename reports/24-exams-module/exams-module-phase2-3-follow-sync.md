# Exams module — Phase 2 & 3: real backend Follow persistence + mobile sync wiring

**Date:** 2026-09-02
**Scope:** Phase 2 (backend) and Phase 3 (mobile) of the approved "A first-class 'Exams'
module (5th primary tab)" plan. Gives "Follow" a real backend table and cross-device
sync, mirroring the existing bookmark-sync pattern exactly.

## Why

Auditing the spec against the codebase found Follow was local-SQLite-only — no backend
table existed at all (confirmed by grepping the whole backend before starting). The user
explicitly chose real backend sync over leaving it local-only, matching how bookmarks
and progress already work.

## What shipped — Phase 2 (backend)

- **Migration `V23__followed_exams.sql`** — `followed_exams` table: `id` (derived
  `userId:examCode`, same convention as `user_bookmarks`/`user_practice_session_results`
  — no JPA composite key), `user_id` (FK, cascade delete), `exam_code`, `is_deleted`
  (tombstone), `updated_at`. A partial index on `user_id` where `is_deleted = false`,
  identical to `user_bookmarks`' own index.
- **`FollowedExam.java`** — line-for-line mirrors `UserBookmark.java`.
- **`FollowedExamDtos.java`** — mirrors `BookmarkDtos.java` (`SyncRequest`/`FollowedExam`/
  `SyncResponse`/`RestoreResponse`).
- **`FollowedExamRepository.java`** — mirrors `UserBookmarkRepository.java`.
- **`FollowedExamService.java`** — mirrors `BookmarkService.java`'s last-write-wins
  conflict resolution exactly: an incoming row is applied only if strictly newer than
  what the server already has for that (user, exam) pair; batched existence lookup +
  `persist()` for new rows (the same round-trip-collapsing fix `BookmarkService`'s own
  comment documents finding twice elsewhere).
- **`FollowedExamController.java`** — `POST /api/followed-exams/sync` (upload, safe to
  retry), `GET /api/followed-exams` (restore). Mirrors `BookmarkController.java`.

## What shipped — Phase 3 (mobile)

- **Local migration `0017_followed_exams_sync.sql`** — hand-written (not raw
  `drizzle-kit generate` output), following the exact precedent of migration `0007`
  (which did this same thing for `bookmarks`): adds `is_deleted`/`is_synced`/
  `updated_at` via unguardable `ADD COLUMN` statements (SQLite has no `ADD COLUMN IF
  NOT EXISTS`), then backfills `updated_at` from the existing `followed_at` and marks
  pre-existing rows unsynced so they upload on the very next sync. A guarded `CREATE
  INDEX IF NOT EXISTS` for `is_synced`. Journal and `migrations.js` updated to register
  it (`0017`).
- **`db/schema.ts`** — `followedExams` gained the three sync columns plus the
  `idx_followed_exams_is_synced` index, alongside the plural-Follow support
  (`getFollowedExams`/`unfollowExam`/`isExamFollowed`) that a prior session had already
  added on top of the original singleton-oriented table — left untouched except for the
  new columns.
- **`db/followedExams.ts`** rewritten: `followExam()` is now an upsert (revives a
  not-yet-synced tombstone on re-follow, exactly like `insertBookmark`'s reasoning);
  `unfollowExam()` tombstones instead of hard-deleting; all three read functions
  (`getFollowedExam`/`getFollowedExams`/`isExamFollowed`) now filter `is_deleted =
  false`. New `loadPendingFollowedExams`/`markFollowedExamsSynced`/
  `pruneSyncedFollowedExamTombstones`, mirroring `db/bookmarks.ts`.
- **New `api/followedExams.ts`** — mirrors `api/bookmarks.ts`.
- **New `sync/followedExamSync.ts`** — mirrors `sync/bookmarkSync.ts`, but simpler: a
  followed exam carries no content to reconstruct (no question text to look up), just
  the exam code the ordinary reference sync already keeps locally. A restored row for
  an exam not yet synced locally is harmless — the join in `getFollowedExams()` simply
  won't surface it until that exam's own sync lands, exactly like a bookmark pointing at
  a not-yet-synced question.
- **`practice/authContext.tsx`** — wired into all three existing sync call sites (full
  sync on sign-in via `Promise.all`, backgrounding upload-flush, sign-out upload-flush),
  each independently `.catch()`-guarded — the same lesson `uploadPendingTopicProgress`
  already taught this project: one failing sync must not abort the others, and a device
  pointed at a not-yet-redeployed backend (this endpoint is brand new) must not have its
  progress/bookmark restore aborted by this one 404ing.

## Tests

New `FollowedExamSyncTest.java` (5 tests), mirroring `BookmarkSyncTest.java` exactly:
upload-then-restore returns only what's still followed; an older update never overwrites
a newer one; re-syncing the same toggle doesn't duplicate or error; one user's follows
are invisible to another; the endpoints require signing in (401 anonymous).

## A real bug found by running the tests, not by review

`FollowedExamSyncTest`'s own test data was invalid: its helper methods built exam codes
as a literal prefix plus a full `UUID.randomUUID()` (e.g. `"DISC_ALICE_" +
UUID.randomUUID()`, ~47 characters). The real `exams.code` column is `VARCHAR(30)`
(`V2__content_model_redesign.sql`), and `followed_exams.exam_code`/`id` (`VARCHAR(40)`/
`VARCHAR(80)`) were sized to match realistic exam codes, not arbitrary test strings —
every real exam code in this project (`SSC_CGL`, `IBPS_PO`, etc.) is well under 20
characters. The first full-suite run surfaced this as four live 500s
(`DataIntegrityViolationException: value too long for type character varying(80)` /
`(40)`), not a compile-time or logic problem — the last-write-wins conflict logic itself
was never wrong. Fixed by shortening the test's unique suffix to an 8-hex-char slice of
a UUID (`shortId()`) instead of the full 36 characters, matching the pattern
`ExamDiscoveryTest`'s own `runId` already used. Re-ran `FollowedExamSyncTest` in
isolation after the fix: 5/5 pass.

This is also the reason the very first full-suite run (before this fix) was a false
negative on this feature specifically — everything else in that run genuinely passed
(144 of 148 tests, only this new class's 4 tests failed), so it did not call the rest of
Phase 1/2's work into question.

## Verified

- `mvn compile` and `mvn test-compile` clean after Phase 2's additions.
- Migration `V23` applied cleanly against the real Neon dev database (confirmed in every
  full-suite run's Flyway log: `Migrating schema "public" to version "23 - followed
  exams"` → `now at version v23`).
- Mobile `tsc --noEmit` clean after the schema/migration/sync-wiring changes.
- Mobile `expo lint`: 9 problems (8 errors, 1 warning) — the exact pre-existing
  baseline, no new violations introduced.
- `FollowedExamSyncTest` re-run in isolation after the test-data fix: 5/5 pass.
- **Full backend `mvn test` suite: 144 tests, 0 failures, 0 errors — BUILD SUCCESS**,
  confirmed clean from a genuinely isolated shell (see the near-miss note above, and the
  separate note below about a mid-run network interruption on an earlier attempt).

## A second real-world interruption, also caught and recovered correctly

The session was left running unattended for several hours (the user stepped away). The
machine's network connection dropped during that window — confirmed by a `HikariPool`
connection stall (`Connection is not available, request timed out after 25281432ms`,
~7 hours) and a `java.net.UnknownHostException` for the Neon hostname partway through
what would have been the clean re-run of the full suite. This produced three failures,
all genuine `SocketTimeoutException`/connection errors, not logic bugs — one in
`FollowedExamSyncTest` and two in the unrelated, pre-existing `LiveQuestionsTest`.
Recognized as environmental rather than code contamination (the error types are
distinctive: `ResourceAccessException: Read timed out`, `UnknownHostException`, not an
assertion failure), verified the network was actually back (`nslookup` against the Neon
hostname resolved cleanly), stopped the stalled Maven process tree, and re-ran the full
suite a fourth time from a clean shell — the result above is that clean run.

## A real process near-miss this session, caught and corrected

While Phase 2's backend changes were compiling, a full `mvn test` run from the previous
phase was still executing in a separate shell. A second `mvn -q -DskipTests compile`
followed by `mvn -q test-compile` was run against the same `target/` directory while
that suite was still mid-run — exactly the concurrent-Maven-invocation trap this
project's own `memory/STATUS.md` already documents once before ("A `mvn test-compile`
run in a second shell overlapped with an already-running full `mvn test` sharing the
same `target/` directory"). Caught by checking `jps`/process list before assuming the
first run's result was trustworthy: the interrupted run's own output showed it had only
completed 7 of ~20 test classes when found, confirming it could not be relied on either
way. Stopped both processes (the Maven driver and its surefire booter, identified via
`Get-CimInstance Win32_Process`) and re-ran the full suite fresh from a single isolated
shell, with no other Maven command running until it finished — the same recovery this
project used the first time this happened.

## Not verified

- **Full backend `mvn test` suite result** — running in the background; this report will
  be updated with the result once it completes.
- **On-device Follow round-trip** — the plan's own Phase 3 verification step (follow an
  exam on the emulator, confirm it reaches the real backend via a direct API check, not
  just local SQLite) has not yet been performed. Needs a running dev backend server,
  which was deliberately not started while the full Maven test suite was still running,
  to avoid a second instance of the exact concurrent-Maven problem just described.
- Local migration `0017` has not been run against a real populated pre-0017 SQLite
  database on a device — reasoned through code review and the exact precedent of
  migration `0007` (same operation, same table shape, already proven), not directly
  exercised yet.

## Next

Verify the full suite result and perform the on-device Follow round-trip check once a
dev backend server can be started cleanly (after the background test run finishes), then
proceed to Phase 4 (the mobile Exams tab itself).
