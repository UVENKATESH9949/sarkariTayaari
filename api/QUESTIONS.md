# Questions API

Covers `QuestionController` (`/api/questions`), `ImageUploadController` (`/api/images`),
`QuestionDuplicateController` (`/api/question-duplicates`), and `QuestionTypeController`
(`/api/question-types`). For the sync model these endpoints
implement (first sync vs delta sync, soft-deletes as sync markers), see
[system-design/03-how-data-flows.md](../system-design/03-how-data-flows.md) and
[system-design/02-database.md](../system-design/02-database.md) — this file only documents the
request/response contract, not why it's shaped that way.

Shared passages/datasets a question can belong to (`question_groups`) and media attachment
(`question_media`) — TASK-2301 Phase P3 — are documented separately in
[QUESTION-GROUPS.md](QUESTION-GROUPS.md), not here.

A question's exam occurrences (`question_occurrences`, `QuestionOccurrenceController`) and the
rule-based PDF-to-question ingestion pipeline (`QuestionIngestionController`) — both TASK-2501 —
are documented separately in [QUESTION-INTELLIGENCE.md](QUESTION-INTELLIGENCE.md), not here.

All admin-only endpoints below require `Authorization: Bearer <token>` for a user whose role is
`ADMIN` (checked by `AuthService.requireAdmin`, which itself calls `requireUser` first — a missing
or invalid token is 401, a valid token for a non-admin is 403). Endpoints marked "none" have no
auth check at all — they are deliberately public.

---

## QuestionController — `/api/questions`

### POST /api/questions
**Purpose:** Create a question (admin content authoring).
**Auth:** admin
**Request:**
```
{
  questionType: string | null,  // "SINGLE_CHOICE" (default), "MULTIPLE_CHOICE", "TRUE_FALSE",
                                  // "ASSERTION_REASON", "STATEMENT_COMBINATION" (Phase P2 Wave A),
                                  // "NUMERIC", "FILL_BLANK", "MATCH", "ORDERING" (Phase P2 Wave B —
                                  // the 9 types with `is_authoring_enabled=true`).
                                  // Immutable after creation — PUT cannot change it.
  correctAnswer: string | null, // required for SINGLE_CHOICE/ASSERTION_REASON/
                                  // STATEMENT_COMBINATION; ignored (server computes a display
                                  // string instead) for every other type.
  answerKey: object | null,     // required shape depends on questionType — see below. Ignored
                                  // for the three correctAnswer-driven types (the server derives
                                  // it from correctAnswer instead, exactly as in Phase P1).
  contentStructure: object | null, // required for MATCH/ORDERING only (Phase P2 Wave B) — the
                                  // language-independent skeleton (leftKeys/rightKeys/itemKeys —
                                  // see below). Immutable after creation, like questionType —
                                  // there is no field for it on UpdateQuestionRequest.
  questionGroupId: uuid | null,  // Phase P3 — attaches this question to a shared passage/
                                  // dataset/map group. Must reference an existing, non-deleted
                                  // question_groups row if set. Organisational, not evaluator-
                                  // critical — unlike questionType/contentStructure, this (and
                                  // groupOrder below) IS on UpdateQuestionRequest too, i.e.
                                  // mutable after creation.
  groupOrder: int | null,        // Phase P3 — this question's position within its group (used
                                  // to order a passage's questions consistently). Meaningless
                                  // without questionGroupId, not validated against it either way.
  topicId: uuid,                // required, must reference an existing topic
  difficulty: string,           // required, must reference an existing difficulty_levels code
  examCodes: string[],          // required, at least one, each must already exist
  premium: boolean,
  pyq: boolean,
  pyqYear: int | null,           // 1950-2100, only meaningful when pyq=true
  pyqShift: string | null,       // max 30 chars
  sourcePaperId: uuid | null,    // must reference an existing exam paper if set
  questionNumber: int | null,    // >= 1
  sourceUrl: string | null,
  translations: [                // required, at least one entry, must include languageCode "en"
    {
      languageCode: string,
      questionText: string,
      options: string[] | null,  // exactly 4 for SINGLE_CHOICE/MULTIPLE_CHOICE/ASSERTION_REASON/
                                   // STATEMENT_COMBINATION; must be an empty array (`[]`, not
                                   // null/omitted) for TRUE_FALSE/NUMERIC/FILL_BLANK/MATCH/ORDERING
                                   // (Phase P2 Wave B's four new types have no option list either)
      explanation: string | null,
      content: object | null     // required shape depends on questionType — see below
    }
  ]
}
```
**`answerKey` shape by type:**
- `MULTIPLE_CHOICE`: `{ correctOptions: number[] }` — 0-based option indices, non-empty. The
  server derives a display `correctAnswer` from it (e.g. `"A,C"`).
- `TRUE_FALSE`: `{ correctBoolean: boolean }`. The server derives `correctAnswer` as `"TRUE"` or
  `"FALSE"`.
- `NUMERIC` (Phase P2 Wave B): `{ correctValue: number, tolerance: number | null }` — `tolerance`
  defaults to `0.0` server-side when omitted/null, never guessed beyond that. The server derives
  `correctAnswer` as the value with a trailing `.0` dropped for whole numbers (e.g. `"42"`).
- `FILL_BLANK` (Phase P2 Wave B): `{ acceptedAnswers: string[] }` — at least one non-blank entry;
  matching is case-insensitive and whitespace-trimmed. The server derives `correctAnswer` by
  joining them with `" / "` (e.g. `"New Delhi / Delhi"`).
- `MATCH` (Phase P2 Wave B): `{ correctMapping: { [leftKey]: rightKey } }` — must cover every key
  in `contentStructure.leftKeys` with a value from `contentStructure.rightKeys`. The server derives
  `correctAnswer` as a joined pair list (e.g. `"L1-R1,L2-R2"`).
- `ORDERING` (Phase P2 Wave B): `{ correctOrder: string[] }` — must be a permutation of
  `contentStructure.itemKeys` (same size, same set, no duplicates). The server derives
  `correctAnswer` as the joined key order (e.g. `"I1,I2,I3,I4"`).
- `SINGLE_CHOICE` / `ASSERTION_REASON` / `STATEMENT_COMBINATION`: not required in the request —
  the server derives it from `correctAnswer` (a letter A-D or matching English option text),
  exactly as Phase P1 already did.
**`contentStructure` shape by type** (only MATCH/ORDERING require it; every other type ignores it):
- `MATCH`: `{ leftKeys: string[], rightKeys: string[] }` — each at least 2 distinct entries.
- `ORDERING`: `{ itemKeys: string[] }` — at least 2 distinct entries.
**`translations[].content` shape by type** (only these four types read it; any other type's
`content` is stored but not validated against a shape):
- `ASSERTION_REASON`: `{ assertion: string, reason: string }`, both non-blank.
- `STATEMENT_COMBINATION`: `{ statements: string[] }`, at least 2 non-blank entries.
- `MATCH` (Phase P2 Wave B): `{ leftLabels: { [leftKey]: string }, rightLabels: { [rightKey]:
  string } }` — every key in `contentStructure.leftKeys`/`rightKeys` needs a non-blank label here,
  per language.
- `ORDERING` (Phase P2 Wave B): `{ itemLabels: { [itemKey]: string } }` — every key in
  `contentStructure.itemKeys` needs a non-blank label here, per language.
**Response:** `201 Created`, body = `QuestionResponse` (see shape below). If the new question's
fingerprint collides with an existing one, `duplicateOfQuestionIds` is populated with that
question's id — the write still succeeds, it is never blocked.
**Errors:** 401 not signed in, 403 not admin, 400 unknown topicId/difficulty/exam code/language
code/sourcePaperId, or missing root-language ("en") translation, 400 validation errors (blank
correctAnswer, wrong option count, missing/invalid `answerKey` for MULTIPLE_CHOICE/TRUE_FALSE,
missing/invalid `content` for ASSERTION_REASON/STATEMENT_COMBINATION, `questionType` not
`is_authoring_enabled`, etc.)
**Business rules:** If `pyq=false`, `pyqYear`/`pyqShift`/`sourcePaperId`/`questionNumber` are
force-cleared server-side regardless of what was sent (only `sourceUrl` survives). Content
fingerprint (MD5 of lowercased, alphanumeric-only English text) is computed before save and
duplicate detection runs against it immediately after.
**Consumers:** Admin

### GET /api/questions/{id}
**Purpose:** Fetch one question by id (admin CRUD read).
**Auth:** admin
**Request:** none
**Response:** `QuestionResponse`. `duplicateOfQuestionIds` is always null here — see that field's
own corrected note below; only `POST /api/questions` (create) ever populates it, on the response
to the exact call that triggered the collision. Use `GET /api/question-duplicates` to see every
detected pair, resolved or not.
**Errors:** 401, 403, 404 if the id doesn't exist (including a soft-deleted one — this endpoint
does not distinguish).
**Consumers:** Admin

### GET /api/questions
**Purpose:** Paginated, filterable list for the admin question bank table.
**Auth:** admin
**Request:** query params (all optional except pagination): `examCode`, `subjectId`, `topicId`,
`difficulty`, plus standard Spring `Pageable` params (`page`, `size`, `sort`).
**Response:** Spring `Page<QuestionResponse>` — `{ content: [...], totalPages, totalElements,
number, size, last, ... }`.
**Errors:** 401, 403.
**Business rules:** Does **not** exclude soft-deleted rows — admins need to see and restore
deleted questions. Contrast with `/live`, which does exclude them.
**Consumers:** Admin

### GET /api/questions/sync
**Purpose:** The delta-sync endpoint every mobile device polls to catch up on content changes.
This is the single most important read in the system — see
[system-design/03-how-data-flows.md](../system-design/03-how-data-flows.md) for the two-sync-modes
model this implements.
**Auth:** none (deliberately public — this is what a signed-out student's app downloads)
**Request:** query params, all optional:
- `since` — an ISO-8601 timestamp (e.g. `2026-01-01T00:00:00Z`). Omitted, blank, or the literal
  string `"0"` means "everything, from epoch" (a first sync). Anything else that fails to parse
  as ISO-8601 is a `400`.
- `page` — default `0`.
- `size` — default `500`, clamped server-side to a max of `1000` (a client asking for more
  silently gets 1000, not an error).
- `supportedTypes` — Phase P3, capability negotiation. Comma-separated `questionType` codes the
  calling client can render (e.g. `SINGLE_CHOICE,MULTIPLE_CHOICE,...`). Omitted or blank defaults
  to `SINGLE_CHOICE` only. A soft-deleted (tombstone) row is returned **regardless** of its type
  either way — an old client still needs to learn to delete a row it previously downloaded, even
  one of a type it never rendered. **This client (`mobile/src/api/questions.ts`) always sends the
  full list it currently supports** (`mobile/src/evaluation/supportedQuestionTypes.ts`, all 9
  authorable types) on every call — omitting this param is what an already-installed pre-P3 APK
  does, and is the scenario the default protects.
**Response:** Spring `Page<QuestionResponse>`:
```
{
  content: QuestionResponse[],
  totalPages: number,
  totalElements: number,
  number: number,   // current page index
  size: number,      // page size actually used
  last: boolean      // true on the final page
}
```
Ordered by `updatedAt` ascending — a client resuming a paginated sync after a network drop can
safely continue from the last page it successfully processed, because nothing already returned
will move earlier in the ordering on a later call with the same `since`.
**Errors:** 400 invalid `since` timestamp.
**Business rules:**
- Always returns the **entire question bank across every exam** — there is no `examCode` filter
  on this endpoint. The client downloads everything and filters by exam locally. (This is a
  change from an earlier version that *was* scoped by exam — the mobile client type comment in
  `mobile/src/api/questions.ts` notes "the server no longer scopes this by exam".)
- Soft-deleted questions are **included**, not filtered out, and carry their **full content**
  (all translations, options, etc.) exactly as a non-deleted row would — only `deleted: true`
  distinguishes them. The client is expected to notice that flag and remove its local copy; the
  server does not strip the payload down to just an id+deleted marker.
- Currently restricted to a ~500-question temporary pool (`app.question-pool.temporary-enabled`,
  default `true`) rather than the full ~37,900-row bank — a deliberate, reversible interim
  measure (`QuestionService.temporaryPoolEnabled`), not a permanent limit. This applies to every
  public read on this controller (`/sync`, `/live`, `/counts`, `/mock-count`, `/mock-sample`).
- TASK-2501 Phase 2: a non-`PUBLISHED` question (a fresh, unreviewed ingestion candidate) is
  withheld the same way a soft-deleted row is exposed regardless — i.e. a tombstone (`deleted:
  true`) still syncs even if it happens to be non-`PUBLISHED`, but a *live* non-`PUBLISHED` row
  is never returned. Applies to every public read on this controller.
**Consumers:** Mobile

### GET /api/questions/live
**Purpose:** Public, filterable, non-cursor read used by the mobile app's hybrid online/local
data layer — lets a screen browse content directly over the network while a device's first sync
hasn't finished (or has never run), instead of waiting on local SQLite.
**Auth:** none
**Request:** query params, all optional: `examCode`, `subjectId`, `topicId`, `difficulty`,
`supportedTypes` (Phase P3 capability negotiation — same semantics as `/sync`'s), `page`
(default 0), `size` (default 200, clamped to a max of 500).
**Response:** Spring `Page<QuestionResponse>` (same page shape as `/sync`).
**Errors:** none beyond generic validation.
**Business rules:** Excludes soft-deleted questions (unlike the admin `list`/`/sync` endpoints,
since students have no use for a deleted row). Same temporary-pool restriction as `/sync`.
Excludes non-`PUBLISHED` questions (TASK-2501 Phase 2).
**Consumers:** Mobile

### GET /api/questions/counts
**Purpose:** Grouped question counts (e.g. "how many questions does this topic have") for the
hybrid data layer's availability screens — the live-network equivalent of local SQLite aggregate
queries in `mobile/src/db/practiceContent.ts`.
**Auth:** none
**Request:** query params: `groupBy` (required — one of `exam`, `subject`, `topic`, `difficulty`),
`examCode`, `subjectId`, `topicId`, `difficulty` (all optional filters).
**Response:** `{ [groupKey: string]: number }` — a flat map from group value to count.
**Errors:** 400 if `groupBy` is missing.
**Business rules:** Same temporary-pool restriction as `/sync`. Excludes non-`PUBLISHED`
questions (TASK-2501 Phase 2) — a count shown to students shouldn't be inflated by an
unreviewed ingestion candidate.
**Consumers:** Mobile

### GET /api/questions/mock-count
**Purpose:** Live per-section availability check for Mock Test — how many non-deleted questions
exist across a given set of subjects for a given exam, used before local sync has populated
enough content to build a mock test locally.
**Auth:** none
**Request:** query params: `examCode` (required), `subjectIds` (required, repeated/list param).
**Response:** `{ "count": number }`.
**Errors:** 400 if `examCode` or `subjectIds` missing.
**Business rules:** Same temporary-pool restriction as `/sync`. Excludes non-`PUBLISHED`
questions (TASK-2501 Phase 2).
**Consumers:** Mobile

### GET /api/questions/mock-sample
**Purpose:** Live mock-test attempt assembly — a genuinely random sample of questions across a
set of subjects for an exam (server-side equivalent of `mobile/src/db/mockTest.ts`'s
`buildMockTestQuestions()`).
**Auth:** none
**Request:** query params: `examCode` (required), `subjectIds` (required, list), `limit` (default
50, clamped server-side to a max of 200).
**Response:** `QuestionResponse[]` (a flat array, not a Page — unlike every other read endpoint on
this controller).
**Errors:** 400 if `examCode` or `subjectIds` missing.
**Business rules:** Sampling is genuinely random (not "first N matches"). Same temporary-pool
restriction as `/sync`. Excludes non-`PUBLISHED` questions (TASK-2501 Phase 2) — a fresh,
unreviewed ingestion candidate must never land in a live-sampled Mock Test attempt.
**Phase P3 — group-aware**: a question belonging to a `question_groups`
row is never returned alone; the assembly (`QuestionRepositoryImpl.sampleForMock`) fetches a
bounded random candidate pool, expands each group hit to its full non-deleted sibling set (loaded
once per distinct group id), shuffles the resulting units, and greedily packs them without ever
exceeding `limit` — a unit that would overflow is skipped, not split, so `limit` may be
undershot the same way plain random sampling already could (ADR-008), just extended to whole
groups. `mobile/src/db/questionGroupAssembly.ts` mirrors this algorithm for the equivalent local
SQLite path (`buildMockTestQuestions`).
**Consumers:** Mobile

### PUT /api/questions/{id}
**Purpose:** Update a question's metadata (not its translated text — see the translations
endpoint below).
**Auth:** admin
**Request:** same shape as `CreateQuestionRequest` minus `translations`, `questionType`, and
`contentStructure` (`correctAnswer`, `answerKey`, `topicId`, `difficulty`, `questionGroupId`,
`groupOrder`, `examCodes`, `premium`, plus the same PYQ provenance fields). **`questionType` and
`contentStructure` cannot be changed after creation** — neither has a field on this request;
`correctAnswer`/`answerKey` are re-resolved using the question's existing, unchanging type.
`questionGroupId`/`groupOrder` (Phase P3) ARE mutable here — a question can join, leave, or move
within a group at any time.
**Response:** `QuestionResponse`.
**Errors:** 401, 403, 404 unknown question id, 400 unknown topicId/difficulty/exam
code/sourcePaperId, 400 invalid `answerKey` for the question's type (same validation as create).
**Business rules:** Same PYQ-field-clearing rule as create: `pyq=false` wipes
year/shift/paper/number. Bumps `updatedAt` — this is what makes the change visible to the next
delta `/sync`.
**Consumers:** Admin

### PUT /api/questions/{id}/translations/{lang}
**Purpose:** Create or replace one language's text/options/explanation (and, since Phase P2 Wave
A, authored `content`) for a question.
**Auth:** admin
**Request:** `{ questionText: string, options: string[] | null, explanation: string | null,
content: object | null }` — `options`/`content` shape requirements are the same as create's,
driven by the question's own (immutable) `questionType`.
**Response:** `QuestionResponse` (full question, all languages).
**Errors:** 401, 403, 404 unknown question id, 400 unknown language code, 400 wrong option count
or shape for the question's type, 400 invalid/missing `content` for ASSERTION_REASON/
STATEMENT_COMBINATION.
**Business rules:** If `lang` is the root language (`en`), the content fingerprint is recomputed
from the new text — editing the English text invalidates any previous duplicate-detection result
based on the old wording. Bumps `updatedAt`.
**Consumers:** Admin

### PUT /api/questions/{id}/content-status
**Purpose:** TASK-2501 Phase 2 — a one-click content-status change, mirroring Exam Guide's own
`recruitment_cycles` publish/unpublish toggle. This is what makes a question the ingestion
pipeline created (staged `content_status = DRAFT`) actually visible to students, and is equally
usable to unpublish/republish a hand-authored question.
**Auth:** admin or reviewer (`AuthService.requireReviewer` — a plain `ADMIN` token or a
`REVIEWER` token, unlike every other endpoint on this controller which is `requireAdmin` only)
**Request:** `{ "status": "DRAFT" | "REVIEW" | "PUBLISHED" }`.
**Response:** `QuestionResponse` (the updated question).
**Errors:** 401, 403 (a plain `STUDENT` token), 404 unknown question id, 400 `status` missing or
not one of the three literal values.
**Business rules:** No separate "submit for review" step — any of the three values can be set
directly in one call, same as the Exam Guide cycle's own setter. Bumps `updatedAt`.
**Consumers:** Admin

### DELETE /api/questions/{id}
**Purpose:** Soft-delete a question.
**Auth:** admin
**Request:** none
**Response:** `204 No Content`.
**Errors:** 401, 403, 404 unknown question id.
**Business rules:** Sets `deleted=true` and bumps `updatedAt` — the row is never physically
removed. This is the mechanism that makes the deletion visible as a tombstone on the next
`/sync`. See system-design/03-how-data-flows.md, "What changed includes deletions."
**Consumers:** Admin

### POST /api/questions/bulk-import
**Purpose:** Import many questions at once from a prepared file (admin content pipeline).
**Auth:** admin
**Request:** `{ questions: BulkImportQuestionRequest[] }` where each entry is:
```
{
  correctAnswer: string,
  subjectName: string,    // resolved by name; auto-created if it doesn't exist
  topicName: string,      // resolved by (subject, name); auto-created if it doesn't exist
  difficulty: string,     // must already exist
  examCodes: string[],    // must already exist
  premium: boolean,
  pyq, pyqYear, pyqShift, sourcePaperId, questionNumber, sourceUrl,  // same as create
  translations: [...]      // same as create, must include "en"
}
```
**Response:** `201 Created`:
```
{
  createdCount: number,
  ids: uuid[],
  failures: [ { index: number, error: string } ],
  duplicatesDetected: { [importedQuestionId: uuid]: originalQuestionId }
}
```
**Errors:** 401, 403. Per-row failures are reported inside the 201 response body (`failures`),
not as an HTTP error — one bad row does not fail the whole batch.
**Business rules:**
- **SINGLE_CHOICE only** (TASK-2301, still true as of Phase P2 Wave B) — there is no
  `questionType`/`answerKey`/`contentStructure`/`content` field on `BulkImportQuestionRequest` at
  all. Bulk-importing any of the eight newer types needs format work for eight divergent per-row
  shapes, deliberately deferred out of both Wave A and Wave B; every imported row is created as
  `SINGLE_CHOICE`.
- Unlike single create, **Subject and Topic are resolved by name and auto-created if new** —
  exam codes still must pre-exist (curated, carry display metadata).
- Rows are flushed in batches of 50; if a batch's flush fails at the DB level, every row in that
  batch (not just the offending one) is reported as failed, since the batch can't isolate which
  row caused it.
- Duplicate detection runs once across the whole successfully-imported batch, catching
  collisions both against the existing bank and *within* the batch itself (e.g. the same
  question pasted twice in one file). Detected pairs are recorded for review and reported in
  `duplicatesDetected` — never auto-rejected; import still succeeds for those rows.
**Consumers:** Admin

### POST /api/questions/bulk-delete
**Purpose:** Soft-delete many questions at once.
**Auth:** admin
**Request:** `{ ids: uuid[] }` (non-empty).
**Response:** `{ "deletedCount": number }`.
**Errors:** 401, 403. Unknown ids are silently ignored (not counted, no error) — `deletedCount`
reflects only ids that actually existed.
**Business rules:** Same soft-delete/tombstone mechanism as the single DELETE.
**Consumers:** Admin

---

## `QuestionResponse` shape (returned by every read/write above)

```
{
  id: uuid,
  correctAnswer: string,
  subjectId: uuid,
  subjectName: string,
  topicId: uuid,
  topicName: string,
  difficulty: string,
  examCodes: string[],        // sorted
  premium: boolean,
  updatedAt: ISO-8601 timestamp,
  deleted: boolean,
  translations: [
    { languageCode, questionText, options: string[], explanation, content: object | null }
  ],
  pyq: boolean,
  pyqYear: int | null,
  pyqShift: string | null,
  sourcePaperId: uuid | null,
  questionNumber: int | null,
  sourceUrl: string | null,
  duplicateOfQuestionIds: uuid[] | null,  // corrected — this doc previously (incorrectly)
                                            // claimed get/list/update also populate this; only
                                            // POST /api/questions (create) actually does
                                            // (QuestionService.create's own
                                            // duplicateDetection.detectAndRecord call) —
                                            // get/list/update/sync/live/mock-sample never set
                                            // it, so it's always null except immediately after
                                            // a create that collided with an existing question

  // Multi-type question architecture (TASK-2301). `correctAnswer` above stays authoritative
  // for the three index-based types (SINGLE_CHOICE/ASSERTION_REASON/STATEMENT_COMBINATION);
  // for every other type it is a server-computed DISPLAY string only ("A,C" / "TRUE" / "42" /
  // "New Delhi / Delhi" / "L1-R1,L2-R2" / "I1,I2,I3,I4") — `answerKey` below is the actual
  // source of truth for those six.
  questionType: string,              // "SINGLE_CHOICE", "MULTIPLE_CHOICE", "TRUE_FALSE",
                                       // "ASSERTION_REASON", "STATEMENT_COMBINATION" (Phase P2
                                       // Wave A), "NUMERIC", "FILL_BLANK", "MATCH", "ORDERING"
                                       // (Phase P2 Wave B) — the 9 types with
                                       // is_authoring_enabled=true (question_types, V25-V27).
                                       // Immutable per question.
  answerKey: object | null,          // MULTIPLE_CHOICE: { correctOptions: number[] }.
                                       // TRUE_FALSE: { correctBoolean: boolean }.
                                       // NUMERIC: { correctValue: number, tolerance: number }.
                                       // FILL_BLANK: { acceptedAnswers: string[] }.
                                       // MATCH: { correctMapping: { [leftKey]: rightKey } }.
                                       // ORDERING: { correctOrder: string[] }.
                                       // The three index-based types: derived from correctAnswer
                                       // at write time (e.g. { correctOption: 1 }), never drifts
                                       // from it; null only for a small, known pre-Wave-A
                                       // data-quality minority (correctAnswer matches neither a
                                       // letter A-D nor any English option text) — see V25's own
                                       // comment.
  answerConfig: object | null,       // per-question evaluation/scoring overrides. Unused
                                       // until a later phase.
  contentStructure: object | null,   // the language-independent skeleton. MATCH:
                                       // { leftKeys: string[], rightKeys: string[] }. ORDERING:
                                       // { itemKeys: string[] }. Null for every other type.
                                       // Immutable per question (Phase P2 Wave B) — distinct
                                       // from translations[].content, which carries the
                                       // per-language authored Assertion/Reason text, Statement
                                       // list, or MATCH/ORDERING key-to-label maps.

  // Shared content (TASK-2301 Phase P3). Both mutable after creation (see PUT above) — purely
  // organisational, no evaluator reads either.
  questionGroupId: uuid | null,      // set when this question belongs to a shared passage/
                                       // dataset/map — see QUESTION-GROUPS.md for the group's own
                                       // content (passage text, media).
  groupOrder: int | null,             // this question's position within that group.
  media: [                            // Phase P3 — this question's OWN media (an IMAGE/MAP
                                       // question with no group), separate from its group's
                                       // media if any. Usually empty — most media is attached to
                                       // the group, not the individual question.
    { id: uuid, mediaType: "IMAGE" | "MAP", url: string, mimeType: string | null, displayOrder: int }
  ],

  // TASK-2501 Phase 1/2.
  occurrences: [                      // this question's exam appearances. Populated only on
                                       // GET/list/PUT (admin CRUD reads) — always null on
                                       // /sync, /live, /counts, /mock-sample, same "dead weight
                                       // on every synced row" reasoning as duplicateOfQuestionIds.
                                       // See QUESTION-INTELLIGENCE.md for the full shape.
    { id: uuid, examCode: string | null, pyqYear: int | null, pyqShift: string | null,
      sourcePaperId: uuid | null, questionNumber: int | null, sourceUrl: string | null,
      sourceDocumentId: uuid | null, pageNumber: int | null, legacyDerived: boolean,
      createdAt: ISO-8601 timestamp }
  ],
  contentStatus: "DRAFT" | "REVIEW" | "PUBLISHED"   // "PUBLISHED" for every question that
                                       // predates this column and everything hand-authored/
                                       // bulk-imported since (unchanged behavior). Only a
                                       // TASK-2501 ingestion Accept ever produces "DRAFT".
                                       // /sync, /live, /counts, /mock-sample all filter to
                                       // PUBLISHED only — see each endpoint's own business rules.
}
```

---

## ImageUploadController — `/api/images`

### POST /api/images
**Purpose:** Upload an image (question diagrams, exam card art, etc.) to Cloudinary and get back
a URL to store on whichever entity needs it. Generic — not specific to questions or exams.
**Auth:** admin
**Request:** `multipart/form-data`, field name `file`.
**Response:** `{ "url": string }` (Cloudinary's `secure_url`).
**Errors:** 401, 403, 500 if the Cloudinary upload itself fails (`IllegalStateException`, not
mapped to a specific HTTP status by `GlobalExceptionHandler` — falls through to Spring's default
500).
**Consumers:** Admin

---

## QuestionDuplicateController — `/api/question-duplicates`

Admin-only throughout — this is the content-management duplicate review queue (Epic L /
TICKET-2109), not anything a student reads. Detection never deletes a question; it only records
a relationship for a human to review, because two questions can share wording and still be
genuinely different content.

### GET /api/question-duplicates
**Purpose:** List detected duplicate pairs awaiting review.
**Auth:** admin
**Request:** query params: `page` (default 0), `size` (default 20, clamped to a max of 100).
**Response:** Spring `Page<DuplicatePair>`:
```
{
  content: [
    {
      questionId: uuid,
      questionText: string | null,             // null if no "en" translation exists
      duplicateOfQuestionId: uuid,
      duplicateOfQuestionText: string | null,
      similarityPercent: decimal,               // 100.00 for the only detection method implemented
      detectionMethod: string,                  // "EXACT_FINGERPRINT" today
      detectedAt: ISO-8601 timestamp,
      resolvedAt: ISO-8601 timestamp | null,
      resolution: "DUPLICATE" | "NOT_DUPLICATE" | null
    }
  ],
  ...
}
```
**Business rules:** Ordered oldest-detection-first, so nothing sits unreviewed at the bottom
forever.
**Consumers:** Admin

### GET /api/question-duplicates/count
**Purpose:** Two numbers for the queue screen: how many pairs are awaiting review right now, and
how many fingerprint groups a full `/backfill` scan would find if run.
**Auth:** admin
**Request:** none
**Response:** `{ "unresolved": number, "potentialGroups": number }`.
**Consumers:** Admin

### POST /api/question-duplicates/check
**Purpose:** Dry-run duplicate check for the Bulk Import screen — "does this text already exist
in the bank?" — before an admin commits an import.
**Auth:** admin
**Request:** `{ "questionText": string }` (POST rather than GET deliberately — full question text
doesn't belong in a URL: query-string length limits, and it would land in access logs verbatim).
**Response:** `{ "matchCount": number, "matches": uuid[] }` (ids of existing questions whose
fingerprint matches).
**Errors:** 400 if `questionText` is missing or blank.
**Business rules:** Read-only — writes nothing, records no edge. Uses the same fingerprint
(lowercased, alphanumeric-only MD5) as the stored-write path.
**Consumers:** Admin

### PUT /api/question-duplicates/{questionId}/{duplicateOfQuestionId}
**Purpose:** Mark a detected pair as reviewed.
**Auth:** admin
**Request:** `{ "resolution": "DUPLICATE" | "NOT_DUPLICATE" }`.
**Response:** `204 No Content`.
**Errors:** 400 if `resolution` is anything other than those two literal strings (case-insensitive
accepted, trimmed), 404 if no detected pair exists for that exact `(questionId,
duplicateOfQuestionId)` ordered pair.
**Business rules:** Idempotent — resolving an already-resolved pair again just restamps
`resolvedAt`. Marking a pair does not delete or merge either question; it only records a human
decision.
**Consumers:** Admin

### POST /api/question-duplicates/backfill
**Purpose:** Re-run duplicate detection across the whole question bank in one set-based SQL
statement — needed because the fingerprint column was backfilled onto ~37,900 pre-existing rows
that had never been compared against each other.
**Auth:** admin
**Request:** query param `limit` (default 1000), clamped server-side to a **hard max of 5000**.
**Response:** `{ "edgesRecorded": number }`.
**Errors:** 401, 403.
**Business rules:** Never runs automatically (not on startup, not scheduled) — a full table scan,
explicitly admin-triggered only. Bounded per call so one run cannot produce an unbounded write
burst; re-run to continue processing more of the backlog. Uses `INSERT ... ON CONFLICT DO
NOTHING`, so re-running is safe and won't duplicate existing edges.
**Consumers:** Admin

---

## QuestionTypeController — `/api/question-types`

Multi-type question architecture (TASK-2301). Read-only — question types are seeded by migration
V25, never admin-authored (a new type is a code change, not a content-team task).

### GET /api/question-types
**Purpose:** Every question type the system knows about, authorable or not — lets a client know
which types it can render before deciding what to ask for on sync (capability negotiation is a
later phase).
**Auth:** none — deliberately public, like `/api/difficulty-levels`.
**Request:** none.
**Response:** array of
```
{
  code: string,               // "SINGLE_CHOICE", "MULTIPLE_CHOICE", ...
  label: string,
  evaluatorFamily: string,    // "OPTION_SET" | "NUMERIC" | "TEXT" | "MAPPING" | "SEQUENCE" | "MANUAL"
  authoringEnabled: boolean,  // 9 of 11 seeded types as of Phase P2 Wave B: the 5 OPTION_SET
                               // types from Wave A (SINGLE_CHOICE, MULTIPLE_CHOICE, TRUE_FALSE,
                               // ASSERTION_REASON, STATEMENT_COMBINATION) plus Wave B's NUMERIC
                               // (NUMERIC family), FILL_BLANK (TEXT family), MATCH (MAPPING
                               // family), ORDERING (SEQUENCE family). The remaining 2 seeded
                               // types (the MANUAL/descriptive family) exist as rows but are
                               // not yet authorable or renderable.
  defaultNegativeMarking: boolean,
  displayOrder: int
}
```
**Errors:** none beyond generic validation.
**Consumers:** Mobile (`OptionList`/`MultiSelectOptionList`/`ContentPreamble` render the 5 Wave A
types; `FreeTextAnswerInput`/`MatchPairing`/`OrderingBuilder` (all in `mobile/src/questionRenderer/`)
render Wave B's NUMERIC/FILL_BLANK/MATCH/ORDERING respectively, wired into `practice/quiz.tsx` and
`mock-test/test.tsx`; the mobile evaluator mirror is `mobile/src/evaluation/questionEvaluator.ts`),
Admin (`QuestionForm.jsx`'s type-conditional authoring form, all 9 types).
