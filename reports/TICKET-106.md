# TICKET-106 — Completed

**Sprint:** Sprint 1 — Backend Foundation
**Scope:** CRUD REST API for questions + translations, including bulk import and bulk delete. Added mid-sprint after realizing the original plan jumped to building the sync-out endpoint (TICKET-102) with no way to get data into the database first.

## Endpoints built

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/questions` | Create a question with its translations (must include `en` — the root language) |
| GET | `/api/questions/{id}` | Read one question with all its translations |
| GET | `/api/questions` | Paginated list (admin/manual browsing) |
| PUT | `/api/questions/{id}` | Update the language-independent fields (correctAnswer/topic/difficulty/examType) |
| PUT | `/api/questions/{id}/translations/{lang}` | Add or edit a single language's translation |
| DELETE | `/api/questions/{id}` | Soft delete (sets `is_deleted`, doesn't remove the row) |
| POST | `/api/questions/bulk-import` | Create many questions in one request |
| POST | `/api/questions/bulk-delete` | Soft-delete many questions by ID in one request |

Files: `dto/*` (Create/Update/Translation/BulkImport/BulkDelete request+response classes, `QuestionMapper`), `service/QuestionService.java`, `controller/QuestionController.java`, `config/GlobalExceptionHandler.java` (clean 404/400 JSON instead of stack traces).

## Bugs found and fixed during testing (all caught by actually running requests, not just reading the code)

1. **GET/LIST returned 500 (LazyInitializationException).** `translations` is a lazy-loaded collection. The original code fetched the entity inside a `@Transactional` service method but mapped it to a response DTO in the *controller*, after the transaction had already closed — Hibernate could no longer fetch the translations. **Fix:** all entity→DTO mapping now happens inside the transactional service methods, before the transaction ends.
2. **Translation upsert endpoint rejected every request.** `languageCode` came from the URL path (`/translations/{lang}`), but the shared `TranslationRequest` DTO also required it in the request body, so `@Valid` failed before the code that copies the path variable in even ran. **Fix:** split into two DTOs — `TranslationRequest` (used inside question creation, where `languageCode` is genuinely part of the body) and `UpsertTranslationRequest` (used for this endpoint, no `languageCode` field at all).
3. **Neon free-tier connection drops.** Neon auto-suspends its compute after a few minutes idle, which was silently killing the HikariCP connection pool's cached connections (`This connection has been closed`, 30s timeout). **Fix:** tuned HikariCP in `application.yml` (`max-lifetime: 240000`, `keepalive-time: 120000`, smaller pool) so connections recycle before Neon's idle suspend kicks in.

## Verification

All 8 endpoints tested live against the real Neon database via curl:
- Create → Get → List → add Hindi translation (confirmed `updatedAt` bumps, per the sync note from TICKET-101) → Bulk import (2 questions) → Bulk delete (confirmed soft-delete: row still exists, `deleted:true`) → validation error (missing root `en` translation correctly rejected) → 404 for unknown ID (clean JSON, not a stack trace).

**Note:** a couple of test questions ("What is 5 + 7?") created during this testing are still active (not deleted) in the Neon database. Harmless test data — worth clearing out before real seeding (TICKET-105) if you want a clean slate.

## Reference

- Requirements doc: `../offline-exam-app-requirements.md` (Sprint 1, TICKET-106)
- Prior ticket: `TICKET-101.md`
