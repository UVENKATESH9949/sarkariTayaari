# Content Model Redesign — Phase 1 (Backend) — Completed

**Scope:** Full backend rework to move from a flat `topic`/`exam_type` string model on `questions` to a normalized, exam-agnostic content model — see `offline-exam-app-requirements.md` Section 5 for the full rationale and rollout plan. This report covers Phase 1 (backend schema + API) only.

## What was done

### Migration (`V2__content_model_redesign.sql`)
- Removed the one known leftover manual-test row (`topic='Test'`, `exam_type='TEST'`, already soft-deleted).
- New tables: `exams` (real data, not a hardcoded enum — mirrors `languages`), `subjects` (global), `topics` (global, one per subject), `question_exam_types` (many-to-many join).
- Seeded `exams` with all 6 known codes (SSC_CGL active, the rest inactive/"coming soon" — matches current mobile UI), `subjects` with the 6 existing topic categories, and one placeholder "General" `topics` row per subject.
- Backfilled all existing questions: `topic` string → `topic_id` FK (via subject name match → its "General" topic), `exam_type` string → a `question_exam_types` row. Added `is_premium` (default `false`). Dropped the old `topic`/`exam_type` columns.
- Verified against real data before writing the migration (see "Real-data migration note" in the requirements doc) — inspected every non-SSC_CGL row first so the migration's assumptions were based on what's actually in the database, not guesses.

### Entities / repositories
- New: `Exam`, `Subject`, `Topic`.
- `Question` reworked: `topic` (String) → `topic` (`@ManyToOne` to `Topic`); `examType` (String) → `exams` (`@ManyToMany` via `question_exam_types`); added `premium` (boolean).
- `QuestionRepository.findByExamTypeAndUpdatedAtAfter` → `findByUpdatedAtAfter` (no exam scoping).
- `QuestionSpecifications.filter` reworked: `examCode` (joins the many-to-many), `subjectId`/`topicId`, `difficulty`.

### DTOs / mapping
- `CreateQuestionRequest`/`UpdateQuestionRequest`: `topic`+`examType` strings → `topicId` (UUID) + `examCodes` (List<String>) + `premium`.
- `QuestionResponse`: adds `subjectId`/`subjectName`/`topicId`/`topicName`/`examCodes`/`premium`, drops the old flat fields.
- New `BulkImportQuestionRequest`: takes `subjectName`/`topicName` (resolved-or-created by name) instead of IDs — bulk import shouldn't require pre-registering a new sub-topic.
- New: `ExamRequest`/`ExamResponse`, `SubjectRequest`/`SubjectResponse`, `TopicRequest`/`TopicResponse`, `LanguageRequest`, `ImageUploadResponse`. `LanguageResponse` gains an `active` field.

### Services / controllers
- New `ExamService`/`SubjectService`/`TopicService`/`LanguageService` (Language upgraded from a bare repository call in the controller to a proper service, alongside full CRUD).
- `QuestionService` reworked: `create`/`update` resolve `topicId` → `Topic` and `examCodes` → `Set<Exam>` (unknown exam code → 400, matching the existing "unknown language code" pattern); `sync` drops the `examType` parameter entirely — it always returns the full bank, paginated by `updatedAt`; `bulkImport` resolves/creates Subject+Topic by name and validates exam codes.
- New `ExamController` (`/api/exams`, `/api/exams/all` for admin), `SubjectController` (`/api/subjects`), `TopicController` (`/api/topics`, `?subjectId=` filter). `LanguageController` upgraded to full CRUD with the same active/all split as Exam.
- `QuestionController`: `list` takes `examCode`/`subjectId`/`topicId`/`difficulty`; `sync` takes only `since`/`page`/`size`.

### Image upload (Cloudinary)
- `cloudinary-http5` (v2.3.0) dependency. `CloudinaryConfig` (bean from `cloudinary.cloud-name`/`api-key`/`api-secret`), `ImageUploadService` (generic — not exam- or question-specific), `ImageUploadController` (`POST /api/images`, multipart → `{url}`).
- Added `cloudinary.*` placeholders to both `application-local.yml` (gitignored, real file — currently `FILL_ME_IN`) and `application-local.yml.example` (committed template). **Needs real credentials before it'll actually work** — confirmed it fails cleanly (500, not a crash) with placeholders still in place.

## Verification

**Automated (39 tests, all passing against the real Neon dev database):**
- Existing suites reworked for the new shape: `QuestionCrudTest`, `BulkOperationsTest`, `SyncEndpointTest`, `LanguageControllerTest` (expanded with CRUD cases).
- New: `ExamCrudTest`, `SubjectCrudTest`, `TopicCrudTest`.
- `AbstractIntegrationTest` now creates a dedicated inactive "Automated Test" exam/subject/topic fixture once (idempotent, mirrors the existing `TEST_EXAM_TYPE` isolation pattern) instead of using free-form topic strings.
- One real bug found and fixed *in a test*, not the API: `SyncEndpointTest`'s helper built the `since` URL param via raw string concatenation. An `OffsetDateTime` cutoff like `...+05:30` sent that way gets misread by the server as a space (form-encoding rules for query strings); pre-encoding it manually then double-encoded it instead, since `RestTemplate` also encodes URI template variables. Fixed by passing `since` as a proper URI template variable (`?since={since}`, with `since` as a `uriVariables` arg) instead of hand-building the string — the correct, idiomatic way to do this with `RestTemplate`.

**Manual (curl against the live server, after tests passed):**
- `GET /api/exams` → SSC_CGL only (active). `GET /api/exams/all` → all 7 (6 real + 1 test fixture), correct active flags/order.
- `GET /api/subjects` / `GET /api/topics` → 6 real subjects/topics + 1 test fixture each, confirming the migration backfill.
- `GET /api/questions/sync?since=0&size=3` → `totalElements: 111` (108 SSC_CGL + 3 legitimate IBPS_PO/RRB_NTPC, across *all* exams, no exam param needed) — matches the expected post-migration count exactly.
- `GET /api/questions?examCode=SSC_CGL&size=2` → `totalElements: 108`, correctly filtered.
- `GET /api/languages` / `/all` → both return en/hi (no inactive languages exist yet, so identical for now — the split is there for when one is added).
- `POST /api/images` → 500 as expected (placeholder Cloudinary credentials) — confirms the endpoint is wired correctly and fails cleanly rather than crashing.
- Created a real question via the new API shape (`topicId` + `examCodes: [SSC_CGL, IBPS_PO]`) — confirmed the response has the correct `subjectName`/`topicName`/`examCodes`/`premium` shape, and that one question can genuinely be tagged to two exams at once (the core point of this whole redesign). Soft-deleted it afterward to clean up.

## Known follow-ups / flagged items

- **One soft-deleted verification question remains** in the real dev DB (created and soft-deleted during manual curl verification, same category as the previously-flagged leftover test rows — no hard-delete endpoint exists via the API).
- **Cloudinary credentials still need to be filled in** — `backend/application-local.yml` has `cloudinary.cloud-name`/`api-key`/`api-secret` as `FILL_ME_IN` placeholders. Fill them in directly in that gitignored file (never paste secrets into chat).
- **Real sub-topics don't exist yet** — every existing question sits under a placeholder "General" topic per subject. Real sub-topic tagging is content-authoring work, not a schema blocker.
- Phases 2–4 (admin UI, mobile foundation rework, new mobile screens) are not started.

## Reference

- Requirements doc: `../offline-exam-app-requirements.md` (Section 5 — Content Model Redesign)
- Code: `../backend/src/main/resources/db/migration/V2__content_model_redesign.sql`, `../backend/src/main/java/com/sarkaritaiyaari/backend/{entity,repository,dto,service,controller,config}/*`
