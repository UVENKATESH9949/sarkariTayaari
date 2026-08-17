# V1.1 — Accounts + Progress Sync

**Status:** ✅ done, verified via a real device wipe and restore.
**Scope:** TICKET-601–605. Built across three commits ("step 1/2/3 of progress sync"). No report file existed for this until now — reconstructed from those commits, `offline-exam-app-requirements.md`'s V1.1 section, `system-design/`, and `reports/architecture-decisions.md`.

---

## The gap

Practice sessions, mock attempts, and bookmarks all lived only in local SQLite. Losing or replacing the phone meant losing all of it — explicitly identified as a real drawback for a study app someone might use for months before an exam.

## What changed

### Accounts (TICKET-605)
`users` table (email stored lower-cased, unique; a nullable unique `phone` column reserved for future OTP sign-in but unused). `user_tokens` — opaque, revocable tokens, **not JWT** (see `reports/architecture-decisions.md` ADR-001). `AuthService.register`/`login`/`requireUser`. Deliberately did not add `spring-boot-starter-security` — only `spring-security-crypto` for BCrypt — because the full starter secures every endpoint by default, which would have broken the existing public content endpoints without substantial reconfiguration (ADR-003). No global auth filter exists; each controller that needs identity calls `requireUser(header)` explicitly.

Token TTL is 365 days, deliberately long — forcing frequent re-login on a study app has real UX cost and no compensating security benefit while tokens remain server-revocable.

Accounts are optional throughout: the app is fully usable signed out, exactly as before.

### Upload (write-back queue) (TICKET-601, TICKET-602)
`user_practice_sessions`(+results), `user_mock_attempts`(+results) tables — append-only, mirroring the local shape so uploading is a straight copy, not a translation. Primary keys are the **device-generated ids**, not new server ids — this is what makes upload idempotent: resending a session that already arrived overwrites rather than duplicates.

Locally, each row gained an `isSynced` flag, false on creation, flipped true once the server confirms. A background flush (`uploadPendingProgress`) runs on sign-in, on backgrounding, and on sign-out — the student never has to do anything for it to happen.

Only `question_id` is stored per answer, never question text/options — the question bank is already synced to every device, so text is rejoined locally on restore. Trade-off, explicitly accepted: if a question is later deleted, that specific historical answer loses its display detail on restore (falls back to "This question is no longer available."), but the session's score and subject survive, since those live on the parent row.

### Conflict handling (TICKET-603)
None needed beyond the idempotent upload — attempts are append-only, never edited, so "conflict" doesn't apply the way it later would for bookmarks.

### Progress screen (TICKET-604)
Already existed from Phase 4 (real computed stats from session history) — this ticket is effectively about it now reflecting *restored* history correctly, not a new screen.

## Real bugs found and fixed during this work

1. **`GET /api/auth/me` returned 500 for every valid token.** `LazyInitializationException: could not initialize proxy [User] - no Session`, because `UserToken.user` is a lazy `@ManyToOne` and `open-in-view: false`. This would have broken every authenticated endpoint that relied on the same lookup pattern, not just this one. Fixed with a join-fetch query, `UserTokenRepository.findByTokenWithUser`, plus a regression test.
2. **`login()` was timing-unsafe** — it only performed a BCrypt hash comparison when the user actually existed, so a request for a non-existent email returned faster than one for a real email with a wrong password. Fixed with a hardcoded dummy BCrypt hash compared against when no user is found, so the timing is identical either way regardless of whether the account exists.
3. **All 60 backend tests failed on context startup** at one point during this work — `NoSuchBeanDefinitionException` for a repository interface. Root cause: Spring Data does not register repository interfaces nested inside another class, and `UserProgressRepositories$PracticeSessions` had been written as a nested interface. Fixed by splitting into standalone `UserPracticeSessionRepository` and `UserMockAttemptRepository` files, restoring the codebase's established one-file-per-repository convention.

## Verified

- **A real device wipe and restore**, not just an API-level test: practiced questions and took mock tests while signed in on a device, confirmed the background flush uploaded them, wiped the device (`pm clear`), reinstalled/relaunched, signed into the same account, and confirmed practice/mock history reappeared correctly.
- Full backend integration test suite passing against the real Neon dev DB after each of the three bug fixes above.
- The `open-in-view: false` join-fetch fix specifically verified by calling `/api/auth/me` with a real token after the fix and confirming a 200 with correct user data, where it had previously 500'd on every call.

## Honest gaps in verification

- Restoring history onto a device that **already has some local, unsynced history of its own** (a genuine merge, not a clean restore onto an empty device) was not specifically exercised — the real-device-wipe test above restores onto an empty local database, which is the common case but not the only one.
- Token revocation itself (does signing out on Device A actually invalidate the token if Device B is still using a copy of it, however that would happen) was not specifically tested.

## Still outstanding

- Account deletion — no endpoint exists.
- Phone/OTP sign-in — the `users.phone` column is reserved but unused.
- No UI indicates *when* progress last successfully synced, or whether anything is still pending upload — mirrors the same gap noted for bookmark sync.
