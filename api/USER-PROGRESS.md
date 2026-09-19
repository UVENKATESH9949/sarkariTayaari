# User Progress API

Covers `ProgressController` (`/api/progress`), `BookmarkController` (`/api/bookmarks`),
`TopicProgressController` (`/api/topic-progress`), and `FollowedExamController`
(`/api/followed-exams`) — the endpoints that sync a signed-in student's own activity back
to the server. For the offline-first model these sit inside (what
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
| `FollowedExamController` | **last-write-wins** | Identical rule and reasoning to `BookmarkController` — an exam can be followed and unfollowed repeatedly, from more than one device. `(user, examCode)` in place of `(user, questionId)`; otherwise line-for-line the same pattern (synthetic id, `deleted` marker, never-travels-back-down tombstone). |

If you're adding a new synced field: append-only history (a session, an attempt, an event) wants
the `ProgressController` pattern; current mutable state per (user, X) wants the `Bookmark`/
`TopicProgress` pattern. Do not blend them.

## Per-question time (`timeMs`) — optional, and `null` never means zero

Both result shapes below carry an optional `timeMs` (milliseconds), added by migration
`V24__weakness_radar.sql` for [Weakness Radar](WEAKNESS-RADAR.md). Four things about it:

1. **It is optional in both directions.** Any client build older than that release omits it, and
   the columns (`user_practice_session_results.time_ms`,
   `user_mock_attempt_results.time_ms`) are nullable. `GET /api/progress` returns it, so a
   restore on a new device brings it back rather than resetting it.
2. **`null` means "not recorded", never "answered instantly".** Every row uploaded before the
   field existed has none. A reader that treated absence as a fast answer would manufacture a
   speed signal out of nothing.
3. **It now has one consumer, and one deliberate non-consumer.**
   [`USER-ANALYTICS.md`](USER-ANALYTICS.md) reports `averageTimeMs` per topic, subject and
   difficulty — **divided by the attempts that actually carry a time, never by all of them**,
   precisely because of rule 2. The Weakness Radar's *speed* component is still switched off:
   that one needs an expected-time benchmark to compare against, and none exists anywhere in this
   schema — an average is not a benchmark. See [`WEAKNESS-RADAR.md`](WEAKNESS-RADAR.md)'s "The
   absent speed signal".

   *(This bullet said "nothing consumes it yet" until TASK-2801 made that false; corrected in
   place per `AI_RULES.md` §6.)*
4. **Both clients capture it, as of TASK-2801.** `mobile/src/practice/useQuestionTimer.ts` and
   `web/src/questions/useQuestionTimer.ts` are deliberate mirrors — same cap, same accumulation
   across revisits, same null rule — so a minute measured in a browser means the same thing as a
   minute measured on a phone and the two can be averaged together. Each file records its own
   limitations of measuring display time. **`web/` captured nothing at all before that**, so every
   web answer given earlier is permanently unmeasured.

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

      // Session timing and exam context, added by V47 (TASK-2801). All four optional and
      // omitted by any client built before it; absent means "not recorded", never zero.
      // The device has recorded all four since Doc 2 §7 and simply never sent them, so a
      // practice session's real duration was lost on a device change and no server-side
      // study-time figure was possible. Returned on restore as well as accepted here.
      startedAt: ISO-8601 | null,
      durationMs: number | null,
      availableCount: number | null,  // questions OFFERED — may exceed totalCount when the
                                      // student finished early. NEVER a denominator.
      examCode: string | null,        // null for the "All Government Exams" shortcut

      examLabel: string | null,
      subjectName: string | null,
      topicName: string | null,
      levelLabel: string | null,
      correctCount: number,
      totalCount: number,
      results: [
        { orderIndex: number, questionId: uuid,
          selectedIndex: number | null,   // null since V26 (TASK-2301 Phase P2 Wave A) —
                                            // no single index for any of the six non-index types
          correctIndex: number | null,    // null for the same six types
          correct: boolean,
          timeMs: number | null,          // optional, added by V24 — see "Per-question time" below

          // Response model, added by V26 (TASK-2301 Phase P2 Wave A), extended by Wave B's four
          // new response shapes. All four fields optional — omitted by any client built before
          // V26, in which case the server defaults questionType to "SINGLE_CHOICE" and leaves
          // the other three null.
          questionType: string | null,     // "SINGLE_CHOICE", "MULTIPLE_CHOICE", "TRUE_FALSE",
                                             // "NUMERIC", "FILL_BLANK", "MATCH", "ORDERING", ...
          response: object | null,         // { selectedOptions: [0,2] } (MULTIPLE_CHOICE),
                                             // { selectedBoolean: true } (TRUE_FALSE),
                                             // { enteredValue: 42 } (NUMERIC, Phase P2 Wave B),
                                             // { enteredText: "New Delhi" } (FILL_BLANK, Wave B),
                                             // { mapping: { "L1": "R1" } } (MATCH, Wave B),
                                             // { order: ["I1","I2"] } (ORDERING, Wave B)
          outcome: string | null,          // "CORRECT" | "INCORRECT" | "UNATTEMPTED"
          scoreFraction: number | null }    // 0.0–1.0
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
          selectedIndex: number | null,   // null = left unattempted, or (since V26) any of the
                                            // six non-index types' answer
          correctIndex: number | null,    // null since V26 for the same six types
          markedForReview: boolean,
          timeMs: number | null,          // optional, added by V24 — see "Per-question time" below

          // Response model, added by V26 (TASK-2301 Phase P2 Wave A), extended by Wave B — same
          // shape and same defaulting-when-omitted rule as the practice results above.
          questionType: string | null,
          response: object | null,
          outcome: string | null,
          scoreFraction: number | null }
      ]
    }
  ]
}
```
Both top-level arrays default to empty if omitted.
**Response:**
```
{ "practiceSessionsStored": number, "mockAttemptsStored": number,
  "rejectedPracticeSessionIds": [string], "rejectedMockAttemptIds": [string] }
```
The two counts are rows processed (created **or** overwritten), not just newly-created rows. The
two arrays are almost always empty — see "Ownership" below.
**Errors:** 401 not signed in, 400 validation (missing `id`/`completedAt`/`startedAt`, missing
`questionId` on a result row).
**Business rules:** Write-once / upload-and-forget (see table above) — no timestamp comparison.
Re-sending the same `id` twice **replaces** that session/attempt and its result rows in place; it
does not append a duplicate. Result-row ids are derived as `{sessionOrAttemptId}:{orderIndex}`,
which is what makes a re-upload replace the same child rows rather than accumulate a second copy
of every answer.

**Ownership (V47 / TASK-2801) — an id that already belongs to another account is refused.**
Before this, the server checked only whether an id existed, not whose it was, and then set the
row's user to the caller: so uploading somebody else's id overwrote their session *and reassigned
it*. That was reachable by accident (mobile generated `session-<millis>` ids, which two students
can collide on) and deliberately (those ids are trivially guessable). Such an id is now **skipped
and named in `rejectedPracticeSessionIds` / `rejectedMockAttemptIds`**; the rest of the batch is
stored regardless, so one bad id never strands a whole history. A client that ignores those
fields simply keeps the row flagged unsynced and retries it. Mobile now generates UUIDs
(`mobile/src/db/ids.ts`), as `web/` already did, so this should never fire in practice.

**Classification snapshot.** On upload the server records, per answer, the topic/subject/
difficulty/PYQ flag the question carried at that moment. It is not part of the request or the
response — clients neither send nor receive it — but it is why a later retag of a question cannot
change what [USER-ANALYTICS.md](USER-ANALYTICS.md) reports about history already recorded.
**Consumers:** Mobile

### GET /api/progress
**Purpose:** Restore everything this user has, for rebuilding a fresh install or a new device.
**Auth:** user
**Request:** none
**Response:** `{ practiceSessions: [...], mockAttempts: [...] }` — same per-item shapes as the
sync request above, including `timeMs` where it was recorded and the four V47 practice-session
fields (`startedAt`/`durationMs`/`availableCount`/`examCode`), ordered by `completedAt`
descending. Those four travel back down as well as up deliberately: dropping them here would mean
a restore silently reset a session's real duration and exam to "unknown" on the new device, which
is the loss they were added to stop.
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

## FollowedExamController — `/api/followed-exams`

Mirrors `BookmarkController` line-for-line, entity and all — a followed exam carries no content
of its own beyond the exam code and the toggle state, since the exam itself is already on-device
from reference sync. Built for the Exams module (spec §5-15) to replace what had been a
local-SQLite-only "My Exams" list with no backend table at all.

### POST /api/followed-exams/sync
**Purpose:** Upload whatever follow/unfollow state changed locally since the last sync.
**Auth:** user
**Request:**
```
{
  exams: [
    { examCode: string, deleted: boolean, updatedAt: ISO-8601 timestamp }
  ]
}
```
`examCode` and `updatedAt` are required per row; `exams` defaults to empty if omitted.
**Response:** `{ "stored": number }` — count of rows actually **applied** (a stale row is
silently skipped and not counted, same as bookmarks).
**Errors:** 401, 400 validation (missing `examCode`/`updatedAt`).
**Business rules:** **Last-write-wins**, identical mechanics to `BookmarkController`: primary key
is the synthetic string `userId:examCode` (ADR-005 pattern); an incoming row is applied only if
its `updatedAt` is strictly after the server's stored value for that pair; `deleted: true` is a
tombstone marker, not a row deletion.
**Consumers:** Mobile

### GET /api/followed-exams
**Purpose:** Restore everything currently followed, for rebuilding a fresh install.
**Auth:** user
**Request:** none
**Response:** `{ exams: [ { examCode, deleted, updatedAt } ] }`.
**Errors:** 401.
**Business rules:** Only returns **active** (non-deleted) follows — tombstones exist server-side
to enforce last-write-wins but never travel back down, same as bookmarks.
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
