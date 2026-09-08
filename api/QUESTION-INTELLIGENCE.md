# Question Intelligence & Ingestion API

Covers `QuestionOccurrenceController` (`/api/questions/{id}/occurrences`) and
`QuestionIngestionController` (`/api/admin/question-ingestion`) — TASK-2501 Phases 1 and 2. See
[QUESTIONS.md](QUESTIONS.md) for the `questions` endpoints these extend (`occurrences`/
`contentStatus` on `QuestionResponse`, the content_status filter on `/sync`/`/live`/`/counts`/
`/mock-sample`, and the new `PUT /api/questions/{id}/content-status`).

The full design this implements is
[tasks/TASK-2501-question-intelligence-and-ingestion-system.md](../tasks/TASK-2501-question-intelligence-and-ingestion-system.md).
Only Phase 1 (question occurrences) and Phase 2 (rule-based ingestion pipeline, no AI) are built —
Phase 3 (AI classification/pattern taxonomy) and Phase 4 (question relationships) are not, and
have no endpoints here.

All endpoints below require `Authorization: Bearer <token>` for a user whose role is `ADMIN`
(checked by `AuthService.requireAdmin`) unless noted otherwise.

---

## QuestionOccurrenceController — `/api/questions/{id}/occurrences`

A **question occurrence** is one real-world appearance of a canonical question — which exam,
year, shift, paper, and (for a pipeline-produced one) source document/page it came from. One
`questions` row can now have more than one occurrence, which is what lets the same real-world
question legitimately appear in two different exams without duplicating the whole row. See
`system-design/02-database.md` for why this table exists (it did not before TASK-2501) and
`V36__question_occurrences.sql` for the backfill that gave every pre-existing PYQ question its
first occurrence row automatically.

Every existing question's legacy singular `pyq`/`pyqYear`/`pyqShift`/`sourcePaperId`/
`questionNumber`/`sourceUrl` fields (still on `CreateQuestionRequest`/`UpdateQuestionRequest`, see
QUESTIONS.md) keep working completely unchanged — `QuestionService` automatically keeps one
`legacyDerived: true` occurrence row in sync with them on every create/update, so the two
representations never drift. The endpoints below are for recording an **additional** occurrence
explicitly (`legacyDerived: false`) — that is the actual new capability this phase ships.

### POST /api/questions/{id}/occurrences
**Purpose:** Record an additional exam appearance for an already-existing question.
**Auth:** admin
**Request:**
```
{
  examCode: string | null,
  pyqYear: int | null,
  pyqShift: string | null,
  sourcePaperId: uuid | null,   // must reference an existing exam paper if set
  questionNumber: int | null,
  sourceUrl: string | null
}
```
**Response:** `201 Created`, body:
```
{
  id: uuid,
  questionId: uuid,
  examCode: string | null,
  pyqYear: int | null,
  pyqShift: string | null,
  sourcePaperId: uuid | null,
  questionNumber: int | null,
  sourceUrl: string | null,
  sourceDocumentId: uuid | null,   // set only for an occurrence the ingestion pipeline created
  pageNumber: int | null,
  legacyDerived: boolean,          // always false for this endpoint's own writes
  createdAt: ISO-8601 timestamp
}
```
**Errors:** 401, 403, 404 unknown question id, 400 unknown `sourcePaperId`.
**Consumers:** Admin

### GET /api/questions/{id}/occurrences
**Purpose:** List a question's occurrences, oldest first.
**Auth:** admin
**Request:** none
**Response:** array of the same shape as the POST response above.
**Errors:** 401, 403, 404 unknown question id.
**Consumers:** Admin

### DELETE /api/questions/{id}/occurrences/{occurrenceId}
**Purpose:** Remove one occurrence (an admin correction — this is a hard delete, not a
tombstone; occurrences aren't synced to mobile in this phase, so nothing needs to notice the
removal).
**Auth:** admin
**Request:** none
**Response:** `204 No Content`.
**Errors:** 401, 403, 404 unknown question id or occurrence id, 400 if `occurrenceId` belongs to
a different question.
**Consumers:** Admin

### Merge on duplicate resolution
Not a new endpoint — a behavior change to the existing `PUT /api/question-duplicates/{questionId}/
{duplicateOfQuestionId}` (see QUESTIONS.md's sibling `QuestionDuplicateController` doc,
`api/QUESTIONS.md`). Resolving a pair as `"DUPLICATE"` now, in addition to recording the
resolution, re-parents every occurrence from `questionId` (the loser) onto
`duplicateOfQuestionId` (the survivor) and soft-deletes the loser — a confirmed duplicate pair
becomes one canonical question with every occurrence both used to have, not two independent
rows. Idempotent: re-resolving an already-merged pair finds nothing left to move. `"NOT_DUPLICATE"`
is unchanged — no merge.

---

## QuestionIngestionController — `/api/admin/question-ingestion`

Turns a PYQ paper PDF into staged, reviewable question candidates via a deterministic,
**rule-based-only** pipeline (no AI — Phase 3 of the design, not built). Shares its document
fetch/storage/text-extraction core with TASK-2401's exam-guidance ingestion pipeline
(`DocumentFetcher`, `DocumentStorage`/`CloudinaryDocumentStorage`, `PdfTextExtractor`) rather than
duplicating it — a question-paper document is simply one with no `IngestionNotice` attached
(`notice_id IS NULL`), the same table (`ingestion_documents`) TASK-2401 already uses.

### POST /api/admin/question-ingestion/documents
**Purpose:** Fetch a PDF from an admin-supplied URL, store it (deduplicated by sha256, same as
TASK-2401), extract per-page text, split it into candidate question blocks (a question-number
line starts a block; option lines and an `"Answer: X"` line are pulled out of it), and stage one
`question_candidates` row per block.
**Auth:** admin
**Request:** `{ "sourceUrl": string }` — must resolve to a public http(s) URL (the same SSRF
guard, `OutboundUrlGuard`, TASK-2401's own fetcher already uses — no loopback/private/link-local
addresses).
**Response:** `201 Created`:
```
{
  documentId: uuid,
  extracted: number,        // total candidate blocks found this call
  autoAcceptable: number,   // HIGH confidence, no validation warnings, no possible duplicate
  needsReview: number,      // everything else
  possibleDuplicates: number
}
```
**Errors:** 401, 403, 400 unsafe/unreachable URL, 400 the fetched bytes aren't a real PDF.
**Business rules:** Re-ingesting the same document is safe and cheap — `DocumentStoreService`
dedups identical bytes, and `question_raw_extractions`' own unique index
(`document_id, extractor_version, position_in_document`) skips a block already extracted, so a
repeat call only stages anything new. A document with no usable embedded text layer (e.g. a
scanned image PDF — no OCR in this phase) returns `extracted: 0` rather than guessing. One
malformed block never blocks the rest of the batch — each is staged in its own transaction and a
failure there is logged and skipped, not propagated.
**Consumers:** Admin

### POST /api/admin/question-ingestion/documents/upload
**Purpose:** Same pipeline as `POST /api/admin/question-ingestion/documents`, but for a PDF an
admin has on their own machine rather than at a reachable public URL.
**Auth:** admin
**Request:** `multipart/form-data`, field name `file` (a PDF). No SSRF guard applies here — there
is no URL to fetch, the bytes are already local.
**Response:** `201 Created`, same `IngestSummary` shape as the URL-based endpoint.
**Errors:** 401, 403, 400 empty file, 400 file exceeds a 20MB cap (same cap the URL-fetch path
enforces, `DocumentFetcher.MAX_BYTES`), 400 the bytes aren't a real PDF.
**Business rules:** The document's recorded `sourceUrl` is a synthetic `"local-upload:<original
filename>"` string (there's no real URL to store) — this is how the document list distinguishes
an uploaded file from a fetched one. Sha256 dedup still applies — re-uploading identical bytes
(even under a different filename) reuses the existing document row rather than creating a
duplicate.
**Consumers:** Admin

### GET /api/admin/question-ingestion/documents
**Purpose:** List every document this pipeline has ingested (i.e. every `ingestion_documents` row
with no notice attached), most recent first.
**Auth:** admin
**Request:** none
**Response:** array of
```
{ documentId: uuid, sourceUrl: string, pageCount: int | null, isTextExtractable: boolean | null,
  candidateCount: int, createdAt: ISO-8601 timestamp }
```
**Consumers:** Admin

### GET /api/admin/question-ingestion/candidates
**Purpose:** List the staged candidates for one document.
**Auth:** admin
**Request:** query params: `documentId` (required), `status` (optional — `PENDING` | `ACCEPTED` |
`EDITED` | `REJECTED`; omitted returns every status).
**Response:** array of
```
{
  id: uuid,
  documentId: uuid,
  pageNumber: int | null,
  payload: object,                    // shaped like (a subset of) CreateQuestionRequest — see below
  confidence: "HIGH" | "MEDIUM" | "LOW",
  validationWarnings: { messages: string[] } | null,
  possibleDuplicateOfQuestionId: uuid | null,
  duplicateSimilarityPercent: decimal | null,   // 100.00 today — exact-fingerprint match only,
                                                  // no fuzzy/semantic layer in this phase
  sourceExcerpt: string,
  status: "PENDING" | "ACCEPTED" | "EDITED" | "REJECTED",
  rejectionReason: string | null,
  appliedQuestionId: uuid | null,     // set once Accepted — the real questions row this became
  reviewedAt: ISO-8601 timestamp | null,
  createdAt: ISO-8601 timestamp
}
```
**`payload` shape:** `{ questionType: "SINGLE_CHOICE", correctAnswer: string | null,
translations: [{ languageCode: "en", questionText: string, options: string[], explanation: null }]
}`. Deliberately missing `topicId`/`examCodes`/`difficulty` — a rule-based extractor has no way to
know a freshly-extracted question's real taxonomy; a reviewer supplies them as Accept overrides.
`correctAnswer` is `null` when no `"Answer: X"` line was found near the question in the source
(common for a question-only paper with a separate answer-key document) — Accept requires
supplying one via `overrides` in that case, same as the ordinary `POST /api/questions` validation
already requires for `SINGLE_CHOICE`.
**Confidence rule:** `HIGH` — exactly 4 options and a resolved answer letter. `MEDIUM` — exactly 4
options, no resolved answer. `LOW` — anything else (wrong option count, or no options detected at
all); still recorded, never silently dropped.
**Consumers:** Admin

### POST /api/admin/question-ingestion/candidates/{id}/accept
**Purpose:** Merge reviewer-supplied overrides into the candidate's payload and create a real
question from it — the exact same `QuestionService.create()` a hand-typed question already goes
through, so the result is indistinguishable from one, per TASK-2401's own precedent for its
sibling pipeline.
**Auth:** admin
**Request:** `{ "overrides": { topicId: uuid, examCodes: string[], difficulty: string,
correctAnswer?: string, ... } | null }` — `topicId`/`examCodes`/`difficulty` are required in
practice (the underlying `CreateQuestionRequest` validation requires them); any other field
(e.g. a corrected `correctAnswer` or edited `translations`) can also be overridden here.
**Response:** the candidate (same shape as the list above), now `status: "ACCEPTED"` with
`appliedQuestionId` set.
**Errors:** 401, 403, 404 unknown candidate id, 400 the candidate has already been reviewed, 400
the merged payload fails `CreateQuestionRequest` validation (unknown topicId/examCode/difficulty,
missing correctAnswer, wrong option count, etc. — identical errors to `POST /api/questions`).
**Business rules:** The created question is set `content_status = DRAFT` immediately after
creation (never `PUBLISHED` directly from Accept) — publish it from the Questions admin list
(`PUT /api/questions/{id}/content-status`, see QUESTIONS.md) once satisfied. A real
`question_occurrences` row is also created, pointing at the candidate's source document and page
(`legacyDerived: false`).
**Consumers:** Admin

### POST /api/admin/question-ingestion/candidates/{id}/reject
**Purpose:** Reject a candidate — kept, never deleted, for audit.
**Auth:** admin
**Request:** `{ "reason": string }` (required, non-blank).
**Response:** the candidate, now `status: "REJECTED"` with `rejectionReason` set.
**Errors:** 401, 403, 404 unknown candidate id, 400 the candidate has already been reviewed, 400
missing/blank reason.
**Consumers:** Admin

---

## Explicitly out of scope (this API surface, as built)

- No AI-classification fields anywhere in this API (pattern/knowledge-type/cognitive-demand/
  difficulty-factors) — Phase 3 of the design, gated on an unresolved LLM provider/budget
  decision, not built.
- No semantic/fuzzy duplicate detection — `possibleDuplicateOfQuestionId` is an exact-fingerprint
  match only, the same mechanism `api/QUESTIONS.md`'s `QuestionDuplicateController` already uses.
- Only `SINGLE_CHOICE` candidates are produced — a block that doesn't look like a clean 4-option
  MCQ still becomes a `LOW`-confidence candidate, never a different question type.
