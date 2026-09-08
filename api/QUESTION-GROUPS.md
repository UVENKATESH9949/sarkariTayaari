# Question Groups & Media API

Covers `QuestionGroupController` (`/api/question-groups`) and `QuestionMediaController`
(`/api/question-media`) — TASK-2301 Phase P3, shared content. See
[QUESTIONS.md](QUESTIONS.md) for the `questions` endpoints these two extend
(`questionGroupId`/`groupOrder`/`media` on `QuestionResponse`, group-aware Mock Test assembly on
`/mock-sample`).

A **question group** is a passage, dataset, or shared image/map that several questions refer to
at once (e.g. a reading-comprehension passage with 4 questions below it). A question joins a
group via its own `questionGroupId`/`groupOrder` fields (see `QUESTIONS.md`'s
`CreateQuestionRequest`/`UpdateQuestionRequest`) — nothing here creates that link from the group
side. **Question media** (`question_media`) attaches an already-uploaded (`POST /api/images`)
file to either a question or a group, never both — it only records ownership of a URL that
already exists.

All admin-only endpoints below require `Authorization: Bearer <token>` for a user whose role is
`ADMIN`. Endpoints marked "none" are deliberately public.

---

## QuestionGroupController — `/api/question-groups`

### POST /api/question-groups
**Purpose:** Create a shared group (admin content authoring).
**Auth:** admin
**Request:**
```
{
  groupType: string,             // "PASSAGE" | "DATA_INTERPRETATION" | "IMAGE" | "MAP" —
                                   // validated against the QuestionGroupType enum at the
                                   // service layer, not a DB CHECK constraint (same defence
                                   // question_types/QuestionTypeCode already uses).
  translations: [                // optional — a group can be created empty and filled in later
    { languageCode: string, passageText: string | null }
  ]
}
```
**Response:** `201 Created`, body = `QuestionGroupResponse` (see shape below).
**Errors:** 401, 403, 400 unknown `groupType`, 400 unknown `languageCode` in `translations`.
**Consumers:** Admin

### GET /api/question-groups/{id}
**Purpose:** Fetch one group by id (admin CRUD read).
**Auth:** admin
**Request:** none
**Response:** `QuestionGroupResponse`.
**Errors:** 401, 403, 404 unknown id (including a soft-deleted one).
**Consumers:** Admin

### GET /api/question-groups
**Purpose:** Paginated list for the admin Question Groups screen and the question form's group
picker.
**Auth:** admin
**Request:** standard Spring `Pageable` params (`page`, `size`, `sort`).
**Response:** Spring `Page<QuestionGroupResponse>`.
**Errors:** 401, 403.
**Business rules:** Does not exclude soft-deleted rows.
**Consumers:** Admin

### GET /api/question-groups/sync
**Purpose:** The delta-sync endpoint mobile devices use to catch up on group content. Deliberately
a **separate** paged endpoint rather than embedding a group's content inside every child
question's own sync row — embedding would re-download the same shared passage once per question
that references it, on every single sync page.
**Auth:** none (deliberately public — same reasoning as `QuestionController.sync`)
**Request:** query params, all optional: `since` (ISO-8601 timestamp, omitted/blank/`"0"` means
everything), `page` (default 0), `size` (default 500).
**Response:** Spring `Page<QuestionGroupResponse>` (same page shape as `/api/questions/sync`).
**Business rules:** Soft-deleted groups are included (tombstones), not filtered out. The mobile
client (`writeQuestionGroups()` in `mobile/src/sync/writeQuestions.ts`) syncs groups as part of
`writeReferenceData()`, **before** the question-page loop — a question's `questionGroupId` can
only resolve locally once its group has already landed.
**Consumers:** Mobile

### PUT /api/question-groups/{id}
**Purpose:** Update a group's type.
**Auth:** admin
**Request:** `{ groupType: string }`.
**Response:** `QuestionGroupResponse`.
**Errors:** 401, 403, 404 unknown id, 400 unknown `groupType`.
**Business rules:** Bumps `updatedAt` — visible to the next delta sync.
**Consumers:** Admin

### PUT /api/question-groups/{id}/translations/{lang}
**Purpose:** Create or replace one language's passage text for a group.
**Auth:** admin
**Request:** `{ passageText: string | null }`.
**Response:** `QuestionGroupResponse` (full group, all languages).
**Errors:** 401, 403, 404 unknown group id, 400 unknown language code.
**Business rules:** Bumps `updatedAt`.
**Consumers:** Admin

### DELETE /api/question-groups/{id}
**Purpose:** Soft-delete a group.
**Auth:** admin
**Request:** none
**Response:** `204 No Content`.
**Errors:** 401, 403, 404 unknown id.
**Business rules:** **Does NOT cascade to member questions** — a group being retired doesn't mean
its questions stop being valid standalone content; they simply keep a `questionGroupId` pointing
at a now-deleted group; the renderer's own group lookup already handles a "not found" group
group as "render no passage above this question" (`db/questionGroups.ts`'s
`getQuestionGroupContent` returns null). Sets `deleted=true` and bumps `updatedAt`, same
tombstone mechanism as questions.
**Consumers:** Admin

---

## `QuestionGroupResponse` shape (returned by every read/write above)

```
{
  id: uuid,
  groupType: string,
  updatedAt: ISO-8601 timestamp,
  deleted: boolean,
  translations: [
    { languageCode: string, passageText: string | null }
  ],
  media: [
    { id: uuid, mediaType: "IMAGE" | "MAP", url: string, mimeType: string | null, displayOrder: int }
  ]
}
```

---

## QuestionMediaController — `/api/question-media`

### POST /api/question-media
**Purpose:** Attach an already-uploaded file to exactly one owner — a question or a group.
**Auth:** admin
**Request:**
```
{
  questionId: uuid | null,        // exactly one of questionId/questionGroupId must be set —
  questionGroupId: uuid | null,   // both null or both set is a 400 (hasQuestion == hasGroup check)
  mediaType: string,              // "IMAGE" | "MAP"
  url: string,                    // the Cloudinary secure_url from POST /api/images — this
                                    // endpoint does not upload anything itself
  mimeType: string | null,
  displayOrder: int | null         // defaults to 0 if omitted
}
```
**Response:** `201 Created`, body = `QuestionMediaResponse`: `{ id, mediaType, url, mimeType,
displayOrder }`.
**Errors:** 401, 403, 400 if neither or both of `questionId`/`questionGroupId` are set, 400
unknown `mediaType`, 400 blank `url`, 404 unknown `questionId`/`questionGroupId`.
**Business rules:** Bumps the **owner's** `updatedAt` (the question's or the group's) — media has
no sync endpoint of its own, it rides along on whichever row owns it, exactly like a
translation's edit already bumps its question's `updatedAt`.
**Consumers:** Admin

### DELETE /api/question-media/{id}
**Purpose:** Remove a media attachment (not the underlying Cloudinary file — this only stops
referencing it).
**Auth:** admin
**Request:** none
**Response:** `204 No Content`.
**Errors:** 401, 403, 404 unknown id.
**Business rules:** Soft-deletes and bumps the owner's `updatedAt`, same reasoning as create.
**Consumers:** Admin

---

## Mobile: local pre-download, not just a URL

A synced `question_media` row's `url` is a live Cloudinary link — rendering directly from it
would make grouped/media content online-only, contradicting this app's offline-first design.
`mobile/src/sync/mediaDownload.ts`'s `downloadPendingMedia()` (called at the end of both
`initialSync.ts` and `deltaSync.ts`, after the question-page loop) downloads each new/changed
asset into the app's own document directory via `expo-file-system`'s `File`/`Directory`/`Paths`
API (not the older flat-function API — this package's SDK 57 build replaced it), recording
`localUri`/`downloadedAt` on the local row. The renderer (`questionRenderer/GroupContent.tsx`)
reads `localUri` when present, falling back to the live `url` only for an asset that hasn't
finished downloading yet — the same local-or-live pattern `data/hybridSource.ts` already
establishes for questions themselves. A stale local file (the owner's media row was replaced or
removed) is cleaned up via `deleteLocalMediaFiles`/`deleteMediaFileAtUri` in
`mobile/src/sync/writeQuestions.ts`, so local storage doesn't grow unbounded — but a device that
never opens the app again after a group/media row's owner is soft-deleted server-side has no
trigger to clean that one file up; this is a known, disclosed gap, not a leak this phase fully
closes.
