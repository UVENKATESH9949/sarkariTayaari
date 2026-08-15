# TICKET-110 — Completed

**Sprint:** Sprint 1 (added after user asked to test the API "parallel with development")
**Scope:** Automated integration tests covering everything built so far — not just the sync endpoint (that's still TICKET-104, blocked on TICKET-102 not existing yet).

## What was built

3 test classes in `backend/src/test/java/com/sarkaritaiyaari/backend/`, sharing a common base:

- **`AbstractIntegrationTest.java`** — `@SpringBootTest(webEnvironment = RANDOM_PORT)`, wires up `TestRestTemplate` (makes real HTTP calls) and `QuestionRepository` (for cleanup), plus a `sampleRequest()` helper for building a minimal valid question.
- **`QuestionCrudTest.java`** (7 tests) — create→get round-trip, update core fields, upsert a new translation, soft-delete behavior, missing-root-language validation (400), unknown-language-code validation (400), list filtering by exam type.
- **`BulkOperationsTest.java`** (3 tests) — all-valid bulk import, one-bad-item-doesn't-block-the-rest bulk import (the exact scenario from TICKET-109), bulk delete.
- **`LanguageControllerTest.java`** (1 test) — confirms `en` and `hi` are returned as active languages.

**Result:** 11 tests, all passing. Run anytime with `mvn test` from `backend/`.

## An important constraint and how it was handled

There's no local Postgres or Docker available on this machine (no admin rights), so Testcontainers — the usual way to get an isolated, disposable test database — isn't an option here. These tests run against the **real Neon dev database**, the same one the admin UI and manual testing use.

To keep that safe:
- Every question created by a test is tagged `examType = "AUTOMATED_TEST"`, making it instantly recognizable if it ever showed up in the admin UI by mistake.
- Each test's created question IDs are tracked and **hard-deleted directly via the repository** in `@AfterEach` — bypassing the API's soft-delete entirely, since soft-deleted rows would otherwise pile up and stay visible (dimmed) in the admin list forever. This required no new "hard delete" API endpoint — the test just uses `QuestionRepository` directly, which is normal practice for test-only cleanup.
- Verified after a full test run: `GET /api/questions?examType=AUTOMATED_TEST` returns `totalElements: 0` — confirmed no leftover rows.

## Deliberately not built

- **Postman collection** — you chose automated tests over Postman when asked. Automated tests were judged suffient for now; a Postman collection can be added later if you want something for manual/exploratory clicking or demoing to someone non-technical.
- **Testcontainers-based isolated DB** — would be the more "correct" long-term setup (tests wouldn't touch real data at all), but needs Docker, which needs admin rights not available on this machine. Worth revisiting if that constraint changes.

## Reference

- Requirements doc: `../offline-exam-app-requirements.md` (Sprint 1, TICKET-110)
- Test files: `../backend/src/test/java/com/sarkaritaiyaari/backend/`
