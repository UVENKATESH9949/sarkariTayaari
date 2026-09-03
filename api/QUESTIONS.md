# Questions API

Covers `QuestionController` (`/api/questions`), `ImageUploadController` (`/api/images`), and
`QuestionDuplicateController` (`/api/question-duplicates`). For the sync model these endpoints
implement (first sync vs delta sync, soft-deletes as sync markers), see
[system-design/03-how-data-flows.md](../system-design/03-how-data-flows.md) and
[system-design/02-database.md](../system-design/02-database.md) — this file only documents the
request/response contract, not why it's shaped that way.

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
  correctAnswer: string,       // required
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
    { languageCode: string, questionText: string, options: string[4], explanation: string | null }
  ]
}
```
**Response:** `201 Created`, body = `QuestionResponse` (see shape below). If the new question's
fingerprint collides with an existing one, `duplicateOfQuestionIds` is populated with that
question's id — the write still succeeds, it is never blocked.
**Errors:** 401 not signed in, 403 not admin, 400 unknown topicId/difficulty/exam code/language
code/sourcePaperId, or missing root-language ("en") translation, 400 validation errors (blank
correctAnswer, wrong option count, etc.)
**Business rules:** If `pyq=false`, `pyqYear`/`pyqShift`/`sourcePaperId`/`questionNumber` are
force-cleared server-side regardless of what was sent (only `sourceUrl` survives). Content
fingerprint (MD5 of lowercased, alphanumeric-only English text) is computed before save and
duplicate detection runs against it immediately after.
**Consumers:** Admin

### GET /api/questions/{id}
**Purpose:** Fetch one question by id (admin CRUD read).
**Auth:** admin
**Request:** none
**Response:** `QuestionResponse` (includes `duplicateOfQuestionIds` only if a pair was ever
detected for this question — null on the sync/public paths, populated here).
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
**Consumers:** Mobile

### GET /api/questions/live
**Purpose:** Public, filterable, non-cursor read used by the mobile app's hybrid online/local
data layer — lets a screen browse content directly over the network while a device's first sync
hasn't finished (or has never run), instead of waiting on local SQLite.
**Auth:** none
**Request:** query params, all optional: `examCode`, `subjectId`, `topicId`, `difficulty`, `page`
(default 0), `size` (default 200, clamped to a max of 500).
**Response:** Spring `Page<QuestionResponse>` (same page shape as `/sync`).
**Errors:** none beyond generic validation.
**Business rules:** Excludes soft-deleted questions (unlike the admin `list`/`/sync` endpoints,
since students have no use for a deleted row). Same temporary-pool restriction as `/sync`.
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
**Business rules:** Same temporary-pool restriction as `/sync`.
**Consumers:** Mobile

### GET /api/questions/mock-count
**Purpose:** Live per-section availability check for Mock Test — how many non-deleted questions
exist across a given set of subjects for a given exam, used before local sync has populated
enough content to build a mock test locally.
**Auth:** none
**Request:** query params: `examCode` (required), `subjectIds` (required, repeated/list param).
**Response:** `{ "count": number }`.
**Errors:** 400 if `examCode` or `subjectIds` missing.
**Business rules:** Same temporary-pool restriction as `/sync`.
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
restriction as `/sync`.
**Consumers:** Mobile

### PUT /api/questions/{id}
**Purpose:** Update a question's metadata (not its translated text — see the translations
endpoint below).
**Auth:** admin
**Request:** same shape as `CreateQuestionRequest` minus `translations` (`correctAnswer`,
`topicId`, `difficulty`, `examCodes`, `premium`, plus the same PYQ provenance fields).
**Response:** `QuestionResponse`.
**Errors:** 401, 403, 404 unknown question id, 400 unknown topicId/difficulty/exam
code/sourcePaperId.
**Business rules:** Same PYQ-field-clearing rule as create: `pyq=false` wipes
year/shift/paper/number. Bumps `updatedAt` — this is what makes the change visible to the next
delta `/sync`.
**Consumers:** Admin

### PUT /api/questions/{id}/translations/{lang}
**Purpose:** Create or replace one language's text/options/explanation for a question.
**Auth:** admin
**Request:** `{ questionText: string, options: string[4], explanation: string | null }`.
**Response:** `QuestionResponse` (full question, all languages).
**Errors:** 401, 403, 404 unknown question id, 400 unknown language code, 400 wrong option count
(must be exactly 4).
**Business rules:** If `lang` is the root language (`en`), the content fingerprint is recomputed
from the new text — editing the English text invalidates any previous duplicate-detection result
based on the old wording. Bumps `updatedAt`.
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
    { languageCode, questionText, options: string[4], explanation }
  ],
  pyq: boolean,
  pyqYear: int | null,
  pyqShift: string | null,
  sourcePaperId: uuid | null,
  questionNumber: int | null,
  sourceUrl: string | null,
  duplicateOfQuestionIds: uuid[] | null   // only ever populated on admin CRUD reads
                                            // (create/get/list/update), always null on
                                            // /sync, /live, /counts, /mock-sample
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
