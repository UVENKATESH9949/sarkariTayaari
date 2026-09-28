# Lesson videos

Video lessons and the teaching blueprints behind them. See
[`../system-design/02-database.md`](../system-design/02-database.md) for the tables
(`lesson_blueprints`, `lesson_videos`, migration V54).

## The two things, and why they are separate

A **blueprint** is what should be taught. A **video** is one rendered delivery of it.

The blueprint payload is the AI Video Studio's own Lesson JSON, stored verbatim:
`{ id, title, exam, subject, topic, language, scenes[] }`, where each scene is one of
`title | concept | example | formula | summary`. That schema is defined by a zod contract in the
studio repository and is read by both its renderer and its narration synthesis, so it is already
the real contract. This backend validates it shallowly (identity fields plus the scene vocabulary)
and does not re-implement the full zod schema — the studio validates deeply and refuses to render
a bad lesson; this refuses to *store* something that is not a lesson at all.

Keeping them separate is what lets the same teaching content later drive a text lesson, an
interactive lesson, or a device-rendered lesson without re-deciding what to teach.

## Two status fields, and they answer different questions

| Field | Question | Values |
|---|---|---|
| `status` | Does a playable file exist yet? | `QUEUED`, `PENDING_UPLOAD`, `UPLOADING`, `UPLOAD_FAILED`, `GENERATING`, `PROCESSING`, `READY`, `FAILED`, `ARCHIVED` |
| `contentStatus` | Has a human approved it? | `DRAFT`, `REVIEW`, `PUBLISHED` |

`PENDING_UPLOAD` / `UPLOADING` / `UPLOAD_FAILED` are the object-store leg, and they are separate
from `FAILED` on purpose: a render that never produced a file and a finished file that could not be
uploaded need different fixes — regenerate versus retry — and one value for both would make an
operator guess which they were looking at.

A video can be `READY` and still `DRAFT` — which is exactly what an admin needs in order to watch
it before students can. **`NOT_AVAILABLE` is deliberately not a status value**: the absence of a
row is what not-available means, and storing it would mean a row for every question that has no
video, which is nearly all of them. The read endpoints synthesise `available: false` instead.

## Attaching a file and publishing it are two steps

**Publishing is what uploads the video to the object store.** Attaching a file does not.

```
Admin attaches the MP4    ->  bytes staged in `lesson_video_uploads`, row is PENDING_UPLOAD / DRAFT
Admin watches it          ->  streamed from staging (staff only, see /stream below)
Admin accepts & publishes ->  bytes uploaded to Cloudinary, then READY / PUBLISHED, staging row dropped
Upload fails              ->  UPLOAD_FAILED + `errorMessage`, still DRAFT, file kept, retryable
```

Why staged in the database rather than on disk: Cloud Run's filesystem is ephemeral and its
instances scale to zero, so a file attached on one request can be gone before the request that
reviews it. It is bounded — a video is capped at 20MB and a staged row lives only until the video
is published or deleted.

**The upload runs outside a transaction** (see `LessonVideoPublisher`). If it shared one with the
row updates around it, a storage failure would mark that transaction rollback-only and take the
failure record down with it — leaving an admin looking at a row with no error, no attempt count,
and no way to tell a failure from a publish that never ran.

**Publishing is idempotent.** A video whose file is already stored is not re-uploaded, so pressing
Accept twice cannot produce two Cloudinary assets. The object key is derived from the video id and
`contentVersion` and the store overwrites rather than appends, so even a retry after an upload that
had secretly succeeded lands on the same object.

**A video is never published without a file behind it.** The upload runs first and the row only
becomes `PUBLISHED` once the bytes are genuinely stored — the reverse order is the failure a
student would meet as a play button that does nothing.

## Student endpoints

All three require a signed-in user (`requireUser`). This departs from the rest of the content-sync
surface, which is public so a signed-out device can sync (ADR-009) — but video is
entitlement-gated and expensive to serve, and since V51 an account is required to use the app, so
there is no signed-out student to serve.

Video metadata is fetched **on demand per question or topic and is deliberately NOT part of
reference sync**. Putting it in the sync feed would make every device download metadata for every
video whether or not it ever watches one, which is the opposite of what this product wants on a
rural connection.

### `GET /api/lesson-videos/catalog`

Query: `subjectId` (optional), `language` (default `en`), `level`, `quality`.

Every **published** topic video, in one call. This is what the mobile AI Videos browse screen
reads, and it exists because the per-topic endpoint below is the wrong shape for a browse screen:
SSC CGL alone has 61 topics, and asking about each separately is 61 round trips on a connection
this product assumes is slow.

```json
{ "items": [
  { "topicId": "…", "subjectId": "…", "videoId": "…", "contentVersion": 1,
    "durationSeconds": 126, "sizeBytes": 8696996, "languageCode": "en",
    "teachingLevel": "STANDARD", "quality": "STANDARD", "checksumSha256": "…",
    "requiresPremium": false, "entitled": true,
    "playbackPath": "/api/lesson-videos/…/stream" }
] }
```

**The response is sparse — a topic with no video is simply absent.** That absence is what the app
renders its "no explanation video available yet" state from, so no topic is ever hidden for lack of
a video. Sending a row per topic-without-a-video would make the response scale with the syllabus
instead of with the content.

**No topic or subject names.** The app already holds the whole exam/subject/topic tree from
reference sync; a name here would be a second copy that can go stale, and the two disagreeing is
how a video ends up labelled with a topic's old name.

**Nothing Cloudinary-shaped is returned** — no public id, no storage key, no signed URL.
`playbackPath` is a path on this backend, so entitlement stays enforceable and the object store
stays an implementation detail the app never learns.

`subjectId` is optional from day one so that, if the published set ever outgrows one response,
narrowing it is a parameter rather than a contract change.

**Consumers:** Mobile (AI Videos).

### `GET /api/topics/{topicId}/lesson-video`
### `GET /api/questions/{questionId}/lesson-video`

Query: `language` (default `en`), `level` (default `STANDARD`), `quality` (default `STANDARD`).

**The question endpoint falls back to the topic lesson.** It looks for a video made for that exact
question first, then for that question's topic. This is not a shortcut: the studio produces topic
lessons and has no concept of a question, so without the fallback the feature would have no
content at all. `resolvedVia` says which was found, so a client never claims a topic lesson was
made for one specific question.

```json
{
  "available": true,
  "videoId": "…",
  "status": "READY",
  "resolvedVia": "TOPIC",
  "contentVersion": 1,
  "durationSeconds": 126,
  "sizeBytes": 8700000,
  "quality": "STANDARD",
  "languageCode": "en",
  "teachingLevel": "STANDARD",
  "checksumSha256": "…",
  "requiresPremium": false,
  "entitled": true,
  "playbackPath": "/api/lesson-videos/…/stream"
}
```

Nothing found returns the same shape with `available: false` and nulls — **not** a 404. A topic or
question that does not exist *is* a 404.

`playbackPath` is a path on this backend, never a storage URL. That is what keeps entitlement
enforceable.

### `GET /api/lesson-videos/{videoId}/stream`

One endpoint, **two outcomes**, because the two storage backends differ:

| Storage | Response |
|---|---|
| `local` | **200** with the bytes, `Accept-Ranges: bytes`, `Cache-Control: private, max-age=86400`. Returns a `Resource`, so Spring supplies byte-range handling — which is what lets a player seek and lets a partial download resume |
| `cloudinary` | **302** to a signed, short-lived Cloudinary URL, with `Cache-Control: no-store` |

The redirect exists because proxying every 9MB lesson through the backend would double egress and
put real memory pressure on a service sized for JSON. **A redirect is not a weaker door:** the URL
is minted only after the caller has passed every check below, and `no-store` stops a shared cache
handing it to the next person.

Enforced here, in this order, on **both** paths:
- Not published and caller is not staff → **404** (deliberately not 403, so ids are not probeable)
- Not `READY` or no stored file → 404
- `requiresPremium` and caller lacks the `AI_VIDEO` capability → **403**

> **Client note:** with the Cloudinary provider a client must follow the redirect. Standard HTTP
> clients do. This has **not yet been confirmed** for `expo-file-system`'s downloader on a device —
> it is the first thing to check on the device pass. If it turns out not to follow redirects, the
> fallback is to return the URL in the body instead of a 302; nothing else would change.

**This same endpoint is also the streaming path.** A student can play a lesson immediately,
without downloading first, by pointing `expo-video`'s player directly at this URL with a bearer
header (`{ uri, headers: { Authorization: ... } }`) — a native media player, not a file
downloader, requests it. This is deliberately **not** a second endpoint: publication and
entitlement are enforced exactly once, the same way, for both streaming and downloading. Verified
on-device against local storage (byte-range requests, `Accept-Ranges: bytes`); the Cloudinary
redirect-following question above applies here too and is unconfirmed for a native player as well
as for `expo-file-system`.

**Consumers:** Mobile.

## Admin endpoints

`/api/admin/lesson-videos` — `GET` list (reviewer), `POST` upload (admin, multipart),
`PUT /{id}/submit-for-review` (admin), `PUT /{id}/publish` (reviewer),
`PUT /{id}/unpublish` (reviewer), `PUT /{id}/reject` (reviewer, body `{reason}`),
`POST /{id}/retry-upload` (admin), `DELETE /{id}` (admin).

`PUT /{id}/publish` **uploads the file to the object store and then publishes**, in that order.
It answers **400** (not 500) when the upload fails: nothing is broken, the file is still attached,
and the next move is Retry upload.

`POST /{id}/retry-upload` re-runs a failed upload from the staged file. It is separate from publish
because they answer different questions — retry fixes a transfer, publish decides the content is
good — so clearing a backlog of failed uploads does not mean re-approving each one. It leaves
`contentStatus` alone.

The admin list and every admin response also carry `uploadAttempts`, `lastUploadAttemptAt` and
`hasStagedFile`, so an operator can tell a first attempt that has not run from a fifth that keeps
failing.

`POST` takes `file` plus `topicId` **or** `questionId` (exactly one), and optional `blueprintId`,
`language`, `level`, `quality`, `premium`, `durationSeconds`. Upload is how a video rendered by
the studio enters the product — the studio has no API and renders through its own CLI, so an
upload is the integration point rather than a call.

Validation on upload: 20MB ceiling (real studio lessons are 7–9MB), and an **MP4 magic-byte check
on the actual bytes** rather than the declared content type. Re-uploading for the same owner
creates a **new `contentVersion`, never an overwrite** — a device holding the old file has no way
to notice a silent swap.

`durationSeconds` on upload is a hint, not the final word: when the object store measures the file
itself (Cloudinary does, while ingesting it) the measured value replaces it. A store that reports
nothing leaves whatever was supplied, so a blank never overwrites a real value.

`/api/admin/lesson-blueprints` — `GET` list/`GET /{id}` (reviewer), `POST` create (admin),
`PUT /{id}/publish` and `/unpublish` (reviewer), `DELETE /{id}` (admin). `POST` body carries the
studio Lesson JSON as `payload`.

**Consumers:** Admin.

## Storage and entitlement

`storage_key` is an opaque key, **not a URL**. Every other asset in this schema stores a public
Cloudinary `secure_url` on the row; that is wrong for video, because a premium video behind a
public guessable URL is not gated at all. Keys are resolved to bytes by `VideoStorage` at serve
time.

Two implementations, chosen by `app.video-storage.provider`:

| Value | Behaviour |
|---|---|
| `local` (default) | Writes under `app.video-storage.local-path` (default `./var`). Correct for development and a single long-lived host. **Wrong on Cloud Run**, whose filesystem is ephemeral and whose instances scale to zero — a video written on one request can be gone by the next. The default only because it needs no credentials, so a fresh checkout works |
| `cloudinary` | The object store this project already uses for images and ingested PDFs. **No new credentials and no new vendor** — it reuses the existing account. This is the one to use in any real deployment |

Cloudinary assets are uploaded as **`type: authenticated`, not the default `upload`**. An
`upload`-type asset is served from a public URL anyone who has it can pass on, which would make a
premium video ungated in practice. An `authenticated` asset cannot be fetched without a signature
produced with the API secret.

**The honest limit on expiry:** delivery uses `privateDownload`, which carries an `expires_at`
(`app.video-storage.url-ttl-seconds`, default 1 hour). Time-limited delivery is not available on
every Cloudinary plan; if the account rejects it, this falls back to a signed `authenticated` URL,
which is unguessable but **does not expire once issued**. That fallback is logged at WARN, so a
deployment never silently believes its links expire when they do not.

Because a downloaded lesson is cached on the device and played offline, a short-lived URL is a
good fit: it is used once per device, immediately, and then never again.

Entitlement goes through `EntitlementService.has(user, Capability.AI_VIDEO)`. There is no
subscription system in this project (`questions.is_premium` has existed since V2 and is read by
nothing), so this is the seam rather than the mechanism: today the answer comes from
`app.entitlements.ai-video-open-to-all` (default `true`), and staff always hold every capability
so a reviewer can watch an unpublished video. When real entitlements exist, only that class
changes.
