# TICKET-101 — Completed

**Sprint:** Sprint 1 — Backend Foundation
**Original scope:** Add `updated_at` and `is_deleted` columns to existing `questions` table
**Actual scope:** Since there was no existing backend/database, built the full schema from scratch — including a multi-language design that wasn't in the original doc (added after discussion).

## What was done

Created Flyway migration `backend/src/main/resources/db/migration/V1__init_schema.sql`, applied successfully to the Neon Postgres database. Created 3 tables:

1. **`languages`** — `code` (PK), `name`, `is_active`. Seeded with `en` (English) and `hi` (Hindi).
2. **`questions`** — language-independent fields only: `id`, `correct_answer`, `topic`, `difficulty`, `exam_type`, `updated_at`, `is_deleted`. Indexed on `topic`, `difficulty`, `exam_type`, `updated_at`.
3. **`question_translations`** — one row per question per language: `id`, `question_id` (FK), `language_code` (FK), `question_text`, `options` (JSONB), `explanation`. Unique constraint on `(question_id, language_code)`.

Added matching JPA entities in `backend/src/main/java/com/sarkaritaiyaari/backend/entity/`:
- `Language.java`
- `Question.java`
- `QuestionTranslation.java` (options mapped as `List<String>` via Hibernate's native JSON support)

## Key decision: multi-language, not just English/Hindi

Original plan was a simple bilingual table (English + Hindi columns). Changed to a normalized 3-table design (`languages` + `questions` + `question_translations`) so that **adding any new language later (Telugu, Kannada, or others) requires zero schema changes** — just inserting new rows. This was an explicit ask based on past experience with painful schema migrations from lack of upfront planning.

**Sync implication (important for TICKET-102/103):** delta sync is driven by `questions.updated_at`. If a translation is added/edited without the parent question changing, that change must still bump `questions.updated_at` — otherwise delta sync would silently miss translation-only updates. This needs to be handled at the write layer, not the sync query layer.

## Verification

Ran the app against the real Neon database — confirmed in logs:
```
Successfully applied 1 migration to schema "public", now at version v1
```
Hibernate validated entities against the schema with no errors.

## Reference

- Requirements doc data model: `../offline-exam-app-requirements.md` (Section 2)
- Migration file: `../backend/src/main/resources/db/migration/V1__init_schema.sql`
