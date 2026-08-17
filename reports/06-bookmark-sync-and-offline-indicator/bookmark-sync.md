# Bookmark Sync

**Status:** ✅ done, backend verified against the real Neon DB (5 passing integration tests); mobile side typechecks clean and is wired in, but **was never exercised live on a device** — see "Honest gaps in verification."
**Scope:** un-ticketed (built in a single session, no TICKET-xxx number assigned at the time — see `reports/TICKET-STATUS.md`).

---

## The gap

Practice sessions and mock attempts already synced (v1.1) — but bookmarks didn't. A student who bookmarked questions on one phone and signed into a second phone would not see them. This was a known, explicitly tracked gap ("bookmarks not synced — local-only").

## Why this wasn't just "reuse the progress-sync code"

Practice sessions and mock attempts are **append-only**: created once, uploaded once, never edited. The existing upload pattern — device generates the id, `save()` on a retried upload naturally overwrites instead of duplicating — works because nothing ever changes after creation.

A bookmark is **mutable state**: the same question can be bookmarked, then un-bookmarked, then bookmarked again, possibly from two different phones signed into the same account. There's no "upload it once" here — there's only "what's the current truth," and two devices can disagree about that truth at the same moment. This needed a real conflict-resolution rule, which nothing else in the codebase had needed yet.

## What changed

### Data model
- New table `user_bookmarks`: one row per `(user, question)`, not a log of toggles. Columns: derived string `id` (`userId:questionId`), `user_id`, `question_id`, `is_deleted` (a tombstone, not a real delete), `updated_at`.
- **Rejected first attempt:** a JPA `@IdClass` composite primary key (`user_id` + `question_id` together as the identity). Textbook-correct JPA, but Hibernate's `isNew()` entity-state detection misbehaved for it — see "Real bug" below.
- Backend migration: `V7__user_bookmarks.sql`.
- Mobile: added `isDeleted`/`isSynced`/`updatedAt` columns to the existing local `bookmarks` table (which already existed, local-only, since Phase 4 of the Content Model Redesign).

### The conflict-resolution rule
`BookmarkService.upload()`: for each incoming bookmark, look up the existing row for that `(user, question)`. If the incoming `updatedAt` is not strictly *after* the stored one, skip it — a stale or replayed change must never win. Otherwise, upsert. This is last-write-wins, and it's the first place in the codebase this pattern was needed.

Un-bookmarking sets `is_deleted = true` rather than deleting the row, both locally and server-side. Without the tombstone, a phone that un-bookmarked something while offline would see it silently reappear on its next restore — the server would have no record a removal ever happened.

### Backend
- `UserBookmark` entity, `UserBookmarkRepository`, `BookmarkService`, `BookmarkController`.
- Endpoints: `POST /api/bookmarks/sync` (upload pending changes), `GET /api/bookmarks` (restore — returns only currently-bookmarked questions, tombstones never travel back down).
- Same auth convention as everything else: the acting user comes from the bearer token, never the request body.

### Mobile
- `db/bookmarks.ts`: `insertBookmark`/`deleteBookmark` now tombstone instead of hard-deleting; new `loadPendingBookmarks()`/`markBookmarksSynced()`/`pruneSyncedTombstones()`.
- `sync/bookmarkSync.ts`: `uploadPendingBookmarks()`, `restoreBookmarksFromServer()` (rejoins question text from the locally-synced bank, same fallback pattern as progress restore — `"This question is no longer available."` if the question no longer exists), `syncBookmarks()` (both directions).
- Wired into `practice/authContext.tsx` at the same three points progress sync already used: full sync on sign-in, upload-only flush on backgrounding, upload-only flush on sign-out.
- **Real bug found and fixed:** `BookmarksProvider` read from SQLite once, on mount, and never again — so a restore on sign-in would write the data in but the Revise screen would keep showing whatever it had at mount. This is the *exact same class of bug* already fixed for session history in an earlier session (documented in `system-design/05-why-its-built-this-way.md`, "why screens watch a sync counter") — and was walked into again anyway, in a different provider. Fixed the same way: `progressVersion` from `authContext` added to its effect dependencies.

## Real bugs found and fixed during this work

1. **Composite-key 500 error.** The `@IdClass` version of `UserBookmark` caused every second sync request in a test to fail with a 500. Root cause: Hibernate's default `isNew()` check for a derived composite identifier didn't reliably distinguish "new row" from "existing row" in this shape, so it sometimes tried the wrong INSERT/MERGE path. Fixed by switching to a synthetic string id (`userId:questionId`), matching the convention already used for `user_practice_session_results`. Recorded as `reports/architecture-decisions.md` ADR-005.
2. **Flyway checksum mismatch.** After the composite-key `V7` migration had already been applied once (during the failed first attempt), editing that same migration file to the corrected schema caused Flyway to refuse to boot on the next run — "Migration checksum mismatch for migration version 7." Fixed by connecting directly to the dev Postgres instance with a throwaway JDBC one-off (no `psql` installed) and running `DROP TABLE user_bookmarks; DELETE FROM flyway_schema_history WHERE version = '7';`, then letting Flyway re-apply the corrected file cleanly. **Lesson for next time:** never edit a migration file after it's been applied even once in the same dev database, even mid-session — write a new migration instead, or be ready to do this manual revert.
3. **Drizzle-generated migration would have broken on real devices.** `npx drizzle-kit generate` produced `ALTER TABLE bookmarks ADD updated_at integer NOT NULL` with no default. SQLite refuses a `NOT NULL` column with no default on a non-empty table — this would have crashed the migration on any device that already had bookmark rows before this feature shipped, while working fine on a fresh install (which is why it wasn't obviously wrong just from generating it). Fixed by hand-editing the generated SQL to add `DEFAULT 0` and a follow-up `UPDATE bookmarks SET updated_at = bookmarked_at, is_synced = 0` to backfill existing rows correctly.

## Verified

- **Backend, thoroughly, against the real Neon dev database** (`BookmarkSyncTest`, 5 cases):
  - Upload then restore returns only what's still bookmarked.
  - An older update never overwrites a newer one (the actual point of last-write-wins).
  - Re-syncing the same toggle twice doesn't duplicate or error.
  - One user's bookmarks are invisible to another.
  - Both endpoints correctly return 401 when not signed in.
- **Mobile:** `tsc --noEmit` clean after every change. No runtime errors observed while building.

## Honest gaps in verification

- **Never verified live, end-to-end, on a device or emulator.** No one has actually: bookmarked a question on Device A while signed in, backgrounded the app (triggering the upload-only flush), then signed into the same account on Device B and confirmed the bookmark appeared via a restore. This is the same category of proof progress sync got (a real device wipe + restore) and bookmark sync has not yet gotten.
- **The offline case specifically wasn't tested for bookmarks:** bookmarking a question while offline, then reconnecting, and confirming the sync queue picks it up correctly alongside whatever the offline-indicator work already covers for connectivity detection.
- **Cross-device conflict was only tested at the API level** (`anOlderUpdate_neverOverwritesANewerOne`), not by actually operating two real devices/emulators against the same account at once.

## Still outstanding

- Live on-device verification (above).
- No UI affordance shows *when* a bookmark last synced, or whether one is still pending — a signed-in user has no way to tell "did my bookmark actually save to my account yet."
