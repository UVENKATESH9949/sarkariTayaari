# AI Content — `/api/admin/ai-content` (admin) and `/api/ai-content/sync` (public)

Covers `AiContentController` (admin) and `AiContentSyncController` (public). TASK-2701 Phase 2
built generation and human review; Phase 3 added the public sync feed. See `AI_ARCHITECTURE.md`
§4 ("Tier 2 is the load-bearing idea") for why this is a batch-and-review-and-sync pipeline rather
than a live per-request endpoint: an explanation for a given question is identical for every
student who sees it, so it is generated once, reviewed once, and synced to devices as ordinary
reference content — never regenerated per request and never shown to a student before a human
approves it.

**Not built, and not this contract's job**: any endpoint a mobile/web client calls to *generate* a
live explanation. There is no `POST /api/ai/explain` and none is planned — see
`system-design/06-ai-foundation.md`'s security note on why no generic AI passthrough exists in
this backend. The public surface below is read-only reference-content sync, nothing more.

Every endpoint requires `Authorization: Bearer <token>`. Generation additionally requires the
caller be `ADMIN` (`AuthService.requireAdmin`) — it is the one action here that spends real
money. Every review transition requires `ADMIN` or `REVIEWER` (`AuthService.requireReviewer`),
matching `ExamGuideAdminController`'s recruitment-cycle transitions exactly.

Every write that mutates an existing row (`submit-for-review`, `publish`, `reject`, `unpublish`)
requires `expectedVersion` — the `version` the caller's last read of that row returned. A stale
value is rejected `409 Conflict`.

---

### POST /api/admin/ai-content/generate
**Purpose:** Generate AI content for an explicitly named set of questions or topics.
**Auth:** admin
**Request:**
```
{
  taskId: "QUESTION_EXPLANATION" | "CONCEPT_EXPLANATION",
  languageCode: "en" | "hi",          // no other language has real question content — see
                                       // AI_ARCHITECTURE.md §13 decision 3
  subjectIds: string[]                // question ids for QUESTION_EXPLANATION,
                                       // topic ids for CONCEPT_EXPLANATION
}
```
**Deliberately no "generate for every question" mode.** Nothing in this backend distinguishes a
real, authored question from one of the ~35,700 synthetic load-test rows — no column, no marker
— so scoping which questions to spend money on is always the caller's explicit decision, never
this endpoint's guess. Per decision 2 in `AI_ARCHITECTURE.md` §13, generate for real content only.

**Response:** `200 OK`:
```
{
  requested: number,
  generated: number,
  skippedExisting: number,    // a non-deleted row already exists for this (task, subject, language)
  failedValidation: number,   // malformed response, or the model's claimed answer didn't match
                               // the verified one (UNGROUNDED_ANSWER) — see AI_ARCHITECTURE.md §8
  failedProvider: number,     // the AI call itself failed (rate limit, auth, timeout, ...)
  items: [
    { subjectId: string, outcome: "GENERATED" | "SKIPPED_EXISTING" | "FAILED_VALIDATION" | "FAILED_PROVIDER",
      detail: string | null, contentId: string | null }
  ]
}
```
A row is **never regenerated over an existing one** in this phase, published or not — reject or
delete the existing row first. Every new row lands `DRAFT`.

**Errors:** `400` unknown `taskId`, unsupported `languageCode`, or an empty `subjectIds`.

---

### GET /api/admin/ai-content?taskId=&status=
**Purpose:** The review queue.
**Auth:** admin or reviewer
**Query:** `taskId` (optional filter), `status` (`DRAFT` | `REVIEW` | `PUBLISHED`, default `REVIEW`)
**Response:** `200 OK`, an array of the content shape below, oldest-generated first.

### GET /api/admin/ai-content/{id}
**Purpose:** One row.
**Auth:** admin or reviewer
**Response:** `200 OK`:
```
{
  id: string,
  taskId: string,
  questionId: string | null,        // exactly one of questionId/topicId is set
  topicId: string | null,
  languageCode: string,
  promptVersion: string,            // AiContentPrompts.PROMPT_VERSION at generation time
  provider: string,
  modelId: string,
  payload: object,                  // the validated structured response — shape depends on taskId
  contentStatus: "DRAFT" | "REVIEW" | "PUBLISHED",
  rejectionReason: string | null,
  generatedAt: string,              // ISO instant
  reviewedAt: string | null,
  reviewedByEmail: string | null,
  updatedAt: string,
  version: number
}
```
**Errors:** `404` unknown id.

---

### PUT /api/admin/ai-content/{id}/submit-for-review
**Purpose:** DRAFT → REVIEW.
**Auth:** admin or reviewer
**Request:** `{ expectedVersion: number }`
**Response:** `200 OK`, the content shape above.
**Errors:** `400` if not currently DRAFT. `409` on a stale `expectedVersion`.

### PUT /api/admin/ai-content/{id}/publish
**Purpose:** DRAFT or REVIEW → PUBLISHED. An admin/reviewer may publish directly from DRAFT,
mirroring `ExamGuideAdminController`'s own fast path — the submit-for-review step is a workflow
convenience, not a hard gate.
**Auth:** admin or reviewer
**Request:** `{ expectedVersion: number }`
**Response:** `200 OK`. Clears any prior `rejectionReason`; stamps `reviewedAt`/`reviewedByEmail`.
**Errors:** `400` if already PUBLISHED. `409` on a stale `expectedVersion`.

### PUT /api/admin/ai-content/{id}/reject
**Purpose:** REVIEW → DRAFT, with a reason.
**Auth:** admin or reviewer
**Request:** `{ reason: string, expectedVersion: number }` — `reason` required, non-blank.
**Response:** `200 OK`.
**Errors:** `400` blank reason, or not currently REVIEW. `409` on a stale `expectedVersion`.

### PUT /api/admin/ai-content/{id}/unpublish
**Purpose:** PUBLISHED → DRAFT.
**Auth:** admin or reviewer
**Request:** `{ expectedVersion: number }`
**Response:** `200 OK`.
**Errors:** `400` if not currently PUBLISHED. `409` on a stale `expectedVersion`.

---

## Grounding — why an explanation can fail validation before a reviewer ever sees it

`POST /generate`'s `FAILED_VALIDATION` outcome most often means the model's claimed answer did
not match `questions.correct_answer`/`answer_key` — the verified value it was given. That
response is discarded, never persisted as a row a reviewer has to reject. See
`AiAnswerGrounding.groundedAnswer` (backend) and `answerMatches` in
`packages/core/src/ai/schema/validate.ts` (shared client layer) — the same check, kept in parity
via `sample-data/ai-answer-grounding-fixtures.json`.

---

### GET /api/ai-content/sync?since=
**Purpose:** Delta sync for AI-generated reference content — the same shape and convention as
`GET /api/questions/sync`, minus pagination (today's volume doesn't need it; add it the same way
`QuestionService.sync` does, if that ever changes).
**Auth:** none — public, exactly like the questions/exam-structure sync surface (`api/README.md`'s
own stated rule: an endpoint with neither auth check is a deliberate public content-sync surface,
not an oversight).
**Query:** `since` — an ISO-8601 timestamp, or `0`/omitted for a full sync.
**Response:** `200 OK`, an array:
```
{
  id: string,
  taskId: string,
  questionId: string | null,
  topicId: string | null,
  languageCode: string,
  published: boolean,
  payload: object | null,   // present only when published is true
  updatedAt: string          // ISO instant — the client's next watermark
}
```
**A row is included here regardless of its `contentStatus`.** A row that is DRAFT, in REVIEW, or
was unpublished after once being live still appears — with `published: false` and `payload: null`
— so a device that already synced it (back when it was PUBLISHED) can drop it, the same tombstone
role `isDeleted` plays for every other synced table. Never omit a row just because it isn't
currently published; the client's own logic is what decides whether to keep showing stale local
content, and it needs the `published: false` signal to know to stop.

**Errors:** `400` for a malformed `since` value.

---

## GET /api/client-config (public) and /api/admin/ai-task-flags (admin)

TASK-2701 Phase 4. Covers `ClientConfigController` and `AiTaskFlagController`. Independent of
the AI Admin Control Center's provider-level settings (`AI-ADMIN` isn't a separate doc — see
`system-design/06-ai-foundation.md`) — that config decides *which vendor/model* the backend
calls; this feed decides *which of the 9 `AiTaskId`s are switched on at all*, one flag per task.

### GET /api/client-config
**Purpose:** The single feed every client (mobile router, any future web client) reads to know
which AI tasks are currently enabled.
**Auth:** none — public, same reasoning as `/api/ai-content/sync`: this is read-only reference
data, not a place any secret or per-user state lives.
**Response:** `200 OK`
```
{ aiTasks: { "QUESTION_EXPLANATION": boolean, "QUESTION_HINT": boolean, ... } }
```
**Every one of the 9 registered `AiTaskId`s is always present**, whether or not an admin has ever
touched it — a task with no `ai_task_flags` row is reported as `false`, never omitted. This is
what makes "unknown means off" hold identically whether the gap is "never toggled by an admin"
or "not yet synced to an older client that predates a newly-added task." The mobile app caches
this response wholesale into `client_config_ai_tasks` on every reference sync
(`writeClientConfig()` in `mobile/src/sync/writeQuestions.ts`) and reads it locally
(`getLocalAiTaskFlags()` in `mobile/src/db/clientConfigLocal.ts`) before any AI surface even
queries its cached content — see `AiExplanationCard.tsx` for the pattern.

### GET /api/admin/ai-task-flags
**Purpose:** List every known task's current flag, for the AI Control Center's per-task toggle
section.
**Auth:** admin
**Response:** `200 OK`, `{ flags: AiTaskFlagView[] }` — exactly one entry per `AiTaskId`, in
enum-declaration order, synthesizing a disabled/version-0 view for any task with no row (same
rule as the public feed above).

### PUT /api/admin/ai-task-flags/{taskId}
**Purpose:** Enable or disable one task.
**Auth:** admin
**Request:** `{ enabled: boolean, expectedVersion: number }`
**Response:** `200 OK`, `AiTaskFlagView: { taskId, enabled, updatedAt, updatedByEmail, version }`
**A never-before-touched task's very first PUT still enforces optimistic locking on its next
call.** Creating the row is itself a version transition (0 → 1), not a one-time exemption from
the stale-version check — a real bug found and fixed during Phase 4 (Hibernate's `@Version` does
not bump on the row's initial INSERT, only on a later UPDATE; `AiTaskFlagService` now seeds
`version = 1` on the creating save so this holds).
**Errors:** `400` for an unknown `taskId`; `409` for a stale `expectedVersion`; `403` for a
non-admin caller (including `REVIEWER`, which this endpoint does not accept).

## Not yet built

- Any admin console page for the review queue — `admin/src/pages/AiContentReview.jsx` per
  `tasks/TASK-2701-on-device-and-hybrid-ai.md`'s phase table.
- A device-side dry-run/verification pass for Phase 4's cached-flag gating specifically (Phase
  3's on-device pass covered the sync+render path before this flag existed; Phase 4 is verified
  by the real integration test suite plus typecheck/lint, not by a fresh emulator run).
