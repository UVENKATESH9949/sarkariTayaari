# User Progress API

Covers `ProgressController` (`/api/progress`), `BookmarkController` (`/api/bookmarks`), and
`TopicProgressController` (`/api/topic-progress`) — the three endpoints that sync a signed-in
student's own activity back to the server. For the offline-first model these sit inside (what
works with no internet, when a sync actually runs), see
[system-design/03-how-data-flows.md](../system-design/03-how-data-flows.md); for the schema
these write to, see [system-design/02-database.md](../system-design/02-database.md).

Every endpoint here requires `Authorization: Bearer <token>` for a signed-in user (checked by
`AuthService.requireUser` — a missing/invalid/expired token is 401). There is no admin variant
and no path parameter for a user id anywhere in this file: the acting user always comes from the
token, never from the request body, so one account cannot read or write another's data by
supplying an id.

## Write-once vs last-write-wins — read this before changing any client here

These three endpoints do **not** all use the same conflict-resolution rule, and getting this
wrong in a future client change silently breaks sync (see
`system-design/05-why-its-built-this-way.md`, "Why bookmark sync needed its own rule"):

| Endpoint | Model | Rule |
|---|---|---|
| `ProgressController` (practice sessions, mock attempts) | **write-once / upload-and-forget** | A session/attempt is created once, finished, and never edited again. The device's own id is reused on every upload. Re-uploading the same id **overwrites** (via JPA `merge`) rather than duplicating — safe to retry blindly, no timestamp comparison happens. |
| `BookmarkController` | **last-write-wins** | The same question can be bookmarked and un-bookmarked repeatedly, from more than one device. Every incoming row is applied only if its `updatedAt` is strictly newer than what the server already has for that `(user, question)` pair. Un-bookmarking is a **marker** (`deleted: true`), not a row deletion — the row stays server-side forever so a later restore can't make a removed bookmark silently reappear. |
| `TopicProgressController` | **last-write-wins**, with an added state-machine guard | Same newer-`updatedAt`-wins rule as bookmarks, since mastery is mutable per-topic state, not an event log. On top of that, a state transition can additionally be **rejected** even when the timestamp is newer, if it's an illegal move (see below) — something bookmarks have no equivalent of. |

If you're adding a new synced field: append-only history (a session, an attempt, an event) wants
the `ProgressController` pattern; current mutable state per (user, X) wants the `Bookmark`/
`TopicProgress` pattern. Do not blend them.

---

## ProgressController — `/api/progress`

### POST /api/progress/sync
**Purpose:** Upload practice sessions and mock attempts the device hasn't sent yet.
**Auth:** user
**Request:**
```
{
  practiceSessions: [
    {
      id: string,                    // required — device-generated, reused on retry
      completedAt: ISO-8601 timestamp,  // required
      examLabel: string | null,
      subjectName: string | null,
      topicName: string | null,
      levelLabel: string | null,
      correctCount: number,
      totalCount: number,
      results: [
        { orderIndex: number, questionId: uuid, selectedIndex: number, correctIndex: number, correct: boolean }
      ]
    }
  ],
  mockAttempts: [
    {
      id: string,                    // required
      examCode: string | null,
      examLabel: string | null,
      startedAt: ISO-8601 timestamp,   // required
      completedAt: ISO-8601 timestamp, // required
      durationSeconds: number,
      timeTakenSeconds: number,
      marksCorrect: decimal,
      marksWrong: decimal,
      totalMarksScored: decimal,
      correctCount: number,
      wrongCount: number,
      unattemptedCount: number,
      totalQuestions: number,
      results: [
        { orderIndex: number, subjectName: string | null, questionId: uuid,
          selectedIndex: number | null,   // null = left unattempted
          correctIndex: number, markedForReview: boolean }
      ]
    }
  ]
}
```
Both top-level arrays default to empty if omitted.
**Response:** `{ "practiceSessionsStored": number, "mockAttemptsStored": number }` — counts of
rows processed (created **or** overwritten), not just newly-created rows.
**Errors:** 401 not signed in, 400 validation (missing `id`/`completedAt`/`startedAt`, missing
`questionId` on a result row).
**Business rules:** Write-once / upload-and-forget (see table above) — no timestamp comparison,
no rejection path. Re-sending the same `id` twice **replaces** that session/attempt and its
result rows in place; it does not append a duplicate. Result-row ids are derived as
`{sessionOrAttemptId}:{orderIndex}`, which is what makes a re-upload replace the same child rows
rather than accumulate a second copy of every answer.
**Consumers:** Mobile

### GET /api/progress
**Purpose:** Restore everything this user has, for rebuilding a fresh install or a new device.
**Auth:** user
**Request:** none
**Response:** `{ practiceSessions: [...], mockAttempts: [...] }` — same per-item shapes as the
sync request above, ordered by `completedAt` descending.
**Errors:** 401.
**Business rules:** Returns full history, unfiltered — there is no pagination or date-range
param on this endpoint today.
**Consumers:** Mobile

---

## BookmarkController — `/api/bookmarks`

A bookmark carries no content of its own beyond the question id and the toggle state — the
question text is already on-device from content sync, so only `questionId`, `deleted`, and
`updatedAt` travel.

### POST /api/bookmarks/sync
**Purpose:** Upload whatever bookmark state changed locally since the last sync.
**Auth:** user
**Request:**
```
{
  bookmarks: [
    { questionId: uuid, deleted: boolean, updatedAt: ISO-8601 timestamp }
  ]
}
```
`questionId` and `updatedAt` are required per row; `bookmarks` defaults to empty if omitted.
**Response:** `{ "stored": number }` — count of rows actually **applied** (see below; a stale row
is silently skipped and not counted).
**Errors:** 401, 400 validation (missing `questionId`/`updatedAt`).
**Business rules:** **Last-write-wins.** Each incoming row is compared against the server's
current row for that `(user, questionId)` pair (primary key is the synthetic string
`userId:questionId` — see ADR-005 in `reports/architecture-decisions.md`). If the incoming
`updatedAt` is not strictly after the stored one, the row is silently ignored — it is not an
error, it's just a stale or duplicate retry. `deleted: true` is a marker meaning "un-bookmarked,"
not a row deletion — the row persists server-side so a later restore can't resurrect a removal
the server never learned about.
**Consumers:** Mobile

### GET /api/bookmarks
**Purpose:** Restore everything currently bookmarked, for rebuilding a fresh install.
**Auth:** user
**Request:** none
**Response:** `{ bookmarks: [ { questionId, deleted, updatedAt } ] }`.
**Errors:** 401.
**Business rules:** Only returns **active** (non-deleted) bookmarks — `deleted: true` tombstones
exist in the database to enforce last-write-wins on future syncs, but they never travel back down
to a client. A client should never expect to see `deleted: true` in a restore response.
**Consumers:** Mobile

---

## TopicProgressController — `/api/topic-progress`

Per-topic mastery sync (Epic L / TICKET-2105). Modelled on `BookmarkController`, not
`ProgressController` — mastery is mutable state per `(user, topic)`, not an append-only event.
The device computes the state and the aggregates locally (it holds the per-question practice
detail the server never sees); the server's job is to store the result and reject the
transitions/values that would corrupt it, not to re-derive them.

### POST /api/topic-progress/sync
**Purpose:** Upload whatever per-topic mastery changed locally since the last sync.
**Auth:** user
**Request:**
```
{
  topics: [
    {
      topicId: uuid,                     // required
      state: string,                      // required — NOT_STARTED | LEARNING | PRACTICING | MASTERED | NEEDS_REVISION
      accuracyPercent: decimal | null,    // 0-100
      attemptedCount: number,             // >= 0
      correctCount: number,               // >= 0
      totalTimeMs: number,                // >= 0
      lastPracticedAt: ISO-8601 timestamp | null,
      updatedAt: ISO-8601 timestamp        // required
    }
  ]
}
```
**Response:** `{ "stored": number, "rejected": number }` — deliberately two counts, not one, so a
client sending stale or illegal data can notice instead of assuming everything it sent landed.
**Errors:** 401. Bad rows are **not** HTTP errors — they count against `rejected` in the 200
response body instead (see below); a bean-validation failure on the request shape itself, e.g. a
non-numeric field, is still a 400.
**Business rules:** Last-write-wins by `updatedAt` per `(user, topic)`, same mechanism as
bookmarks — a row whose `updatedAt` is not strictly after the stored one is silently skipped (not
counted in either `stored` or `rejected`). On top of that, three additional checks can put a row
into `rejected` instead of applying it:
- `state` isn't one of the five known values.
- `topicId` doesn't reference a topic the server knows about (deleted server-side, or an invented
  id) — one bad topic does not block the rest of the batch from being stored.
- `correctCount > attemptedCount` (also enforced by a DB `CHECK` constraint, but caught here
  first so one bad row doesn't abort the whole transaction and lose every other row in the same
  upload).
- A state **transition** that isn't legal for the state machine is also rejected even when the
  timestamp is newer — see the table below. This is the one case in this file where "newer
  timestamp" is not sufficient to win.

**The state machine** (`TopicProgressState.canTransitionTo`):
- Every state may move to any other state **except**: nothing may move back to `NOT_STARTED`
  once left (a stale device replaying an old snapshot is the assumed cause, and last-write-wins
  can't catch that if the device's own clock is also stale — practice history is not meant to be
  erasable by a sync), and `NEEDS_REVISION` is reachable **only** from `MASTERED` (arriving there
  from `LEARNING` would assert a regression that never actually happened).
**Consumers:** Mobile

### GET /api/topic-progress
**Purpose:** Restore everything the server holds for this student's per-topic mastery, for
rebuilding a fresh install.
**Auth:** user
**Request:** none
**Response:**
```
{
  topics: [
    {
      topicId: uuid, topicName: string, subjectId: uuid, subjectName: string,
      state: string, accuracyPercent: decimal | null,
      attemptedCount: number, correctCount: number, totalTimeMs: number,
      lastPracticedAt: ISO-8601 timestamp | null, updatedAt: ISO-8601 timestamp
    }
  ]
}
```
**Errors:** 401.
**Business rules:** Carries `topicName`/`subjectId`/`subjectName` alongside the raw ids — a fresh
install has no local topic-id-to-name mapping yet at the point restore runs (content sync hasn't
necessarily finished), so this endpoint denormalises rather than assuming the client can join
locally.
**Consumers:** Mobile
