# AI Videos integration — studio in-repo, publish-uploads-to-Cloudinary, and a student-facing module

**Date:** 2026-09-28
**Migration:** backend **V55**. No mobile migration.
**Scope doc:** a supplied three-operation brief (migrate the AI Video Generation project,
integrate Cloudinary on accept, replace the mobile Exams module with AI Videos).

---

## The audit came first, and three of the brief's premises were wrong

Per `AI_RULES.md` §4, the brief was checked against the real codebase before any code changed.

| The brief asked for | What was actually there |
|---|---|
| Migrate the AI Videos Admin page | **It already existed**: `admin/src/pages/AiVideos.jsx`, 446 lines, shipped in `75905af`. The source project has no admin page at all — `C:\AIVideos\library/` is a read-only static HTML browser with no auth and no accept action |
| Migrate the AI video generation APIs/services | **There are none.** The studio has no API and no server. Generation is `lessons/<id>.json` → PowerShell/SAPI narration → headless-Chromium Remotion render → `output/<id>.mp4`, driven by npm scripts. The automated LLM pipeline was designed and deliberately shelved (`docs/web-studio-plan.SUPERSEDED.md`) |
| Integrate Cloudinary | **Already integrated.** `CloudinaryVideoStorage.java` does `type: authenticated` upload, signed expiring delivery, 302 redirect delivery, delete, and public-id derivation, selected by `app.video-storage.provider=cloudinary` |
| Store Cloudinary metadata (public id, URL, duration, format, size, status, topic) | Almost all of it already existed on `lesson_videos` (V54). The one genuinely missing piece was that **duration was typed in by hand** and Cloudinary's own measurement was logged then discarded |

**What that means for Operation 1:** a Chromium + ffmpeg + Windows-TTS render toolchain cannot be
moved into a Java/Spring backend or a React admin bundle. Attempting it would be a rewrite, not a
migration. The owner chose to bring the studio into the repository as its own folder instead —
one repo, same command-line workflow.

**What that means for Operation 2:** the real gap was never *whether* Cloudinary was wired up. It
was **when** it uploaded, and what happened when it failed.

### The defect the audit found

`LessonVideoService.upload` called `storage.store(...)` inside a `@Transactional` method. If
Cloudinary threw, the whole transaction rolled back — so there was **no row, no failure record,
and nothing to retry**. An admin would see a video that looked untouched, with no way to tell a
failed upload from one that never ran. This project has hit that exact shape twice before
(`DocumentStoreService`, the ingestion scan).

---

## Decisions taken by the owner before implementing

| # | Question | Chosen |
|---|---|---|
| 1 | When should Cloudinary upload happen? | **Only on Accept** — the literal reading of the brief |
| 2 | What to do with the studio? | **Copy it into the repo** as `studio/`, still command-line |
| 3 | The Exams tab? | **AI Videos takes the tab slot; Exams moves to Home** |
| 4 | Delivery? | All three operations in one pass |

**Decision 1 was flagged as having a real problem and was reaffirmed, so it was built.** The
problem: if nothing is uploaded until Accept, the reviewer has nowhere to watch the video from —
and on Cloud Run there is no durable local disk to stage it on, because the filesystem is
ephemeral and instances scale to zero. A reviewer accepting a video they cannot watch is not a
review.

**Resolved with a database staging table rather than by weakening the decision.** An attached file
lands in `lesson_video_uploads` (V55), the reviewer streams it from there through the backend, and
accepting promotes the bytes to Cloudinary. It is bounded — a video is capped at 20MB and a staged
row lives only until the video is published or deleted.

---

## What shipped

### Backend — V55 and the publish flow

```
Admin attaches the MP4    ->  staged in lesson_video_uploads; row PENDING_UPLOAD / DRAFT
Admin watches it          ->  streamed from staging (staff only)
Admin accepts & publishes ->  uploaded to Cloudinary, then READY / PUBLISHED, staging row dropped
Upload fails              ->  UPLOAD_FAILED + errorMessage + attempt count, still DRAFT, file kept
Admin retries             ->  re-uploads from staging; one object, never a duplicate
```

**`LessonVideoPublisher` is a new class and drives transactions by hand.** The usual fix for "do
not call storage inside a transaction" is separate beans, because a `@Transactional` method called
from inside the same bean goes straight through the proxy and does nothing.
`TransactionTemplate` is used instead so the boundaries are **visible in the code** rather than
depending on which object a call happens to travel through — a property this codebase has already
lost time to twice. The sequence is: claim the attempt and commit, upload outside any transaction,
commit the outcome. Each step is durable before the next begins.

**Idempotency is structural, not a flag.** The object key is derived from the video id and
`contentVersion`, and the store overwrites rather than appends — so a retry after an upload that
had secretly succeeded lands on the same object. A video already stored is reported as such
without the store being touched at all, so pressing Accept twice cannot produce two assets.

**A video is never published without a file behind it.** Upload runs first; the row becomes
`PUBLISHED` only once the bytes are genuinely stored. The reverse order is the failure a student
meets as a play button that does nothing.

**Three new `status` values** — `PENDING_UPLOAD`, `UPLOADING`, `UPLOAD_FAILED` — deliberately
distinct from `FAILED`. A render that never produced a file and a finished file that could not be
uploaded need different fixes (regenerate versus retry), and one value for both would make an
operator guess. The column is a plain `VARCHAR` with no CHECK, so adding values cost nothing —
the same property V52 relied on for `study_tasks.source`.

**`VideoStorage.store` now returns `StoredObject` instead of the key.** Cloudinary measures the
video while ingesting it, and that was being logged and thrown away; duration now comes from the
store when the store knows it. A store that reports nothing leaves whatever the admin supplied, so
a blank never overwrites a real value.

**New read: `GET /api/lesson-videos/catalog`.** Every published topic video in one call, optionally
narrowed by subject. The per-topic endpoint is right for the quiz card, which asks about one
question, and wrong for a browse screen: SSC CGL alone has 61 topics. The response is **sparse** —
a topic with no video is simply absent, and that absence is what the app renders its empty state
from. It carries no topic or subject *names* (the app already holds the syllabus; a second copy
could go stale) and nothing Cloudinary-shaped (no public id, no storage key, no signed URL).

### Admin

- **A real preview player.** Before this, "review" meant reading a metadata table and pressing
  Publish on a file nobody had seen. The blob URL is revoked on unmount, or every preview leaks
  8MB for the life of the page.
- **Publish became "Accept & publish"**, and its gate was fixed. It had been
  `disabled={video.status !== "READY"}` — which under the new flow would have **deadlocked the
  entire feature**, since accepting the video is what makes it READY.
- **Retry upload**, shown only on `UPLOAD_FAILED`.
- A storage row and an attempt count, so a first attempt that has not run is distinguishable from
  a fifth that keeps failing; plus a plain-English gloss per status, because `PENDING_UPLOAD`
  reads like a failure when it is the normal state of every unaccepted video.

### Mobile

- **New tab: AI Videos**, in the slot Exams held. `ai-videos/index.tsx` lists the active exam's
  real subjects; `ai-videos/subject.tsx` lists that subject's topics.
- **Exams is kept as a route with `href: null`** — the same treatment Progress already has. Home,
  More, the daily plan and the AI Videos empty state all still push to it, so the calendar,
  comparison, eligibility and discovery screens are untouched and reachable. Deleting the route
  would have broken every one of those.
- **Home gains an Exams row** and its "AI Videos — Coming soon" placeholder became a real link.
- `data/lessonVideoCatalog.ts` — cached per account and exam, stale-while-revalidate. **A failed
  refresh never replaces a usable saved list with an error**, the rule that makes a cache an
  improvement rather than a new way to show nothing. Cleared on sign-out, because every entry
  carries a per-user `entitled` flag.
- **Registered `lesson-video` in the root Stack.** It never was, so its header showed the raw
  route name — a cosmetic gap flagged in `STATUS.md` that mattered little when the only way in was
  a card inside a quiz, and matters now that AI Videos opens it constantly. The screen replaces the
  title with the topic's own name.

**No second subject/topic hierarchy was created.** The screens call `getSubjectStats` and
`getTopicStats` — the same reads Practice uses — so AI Videos and Practice cannot disagree about
what an exam contains. **Every topic is listed whether or not it has a video**; one without says
"No explanation video available yet", with no chevron, so the row reads as information rather than
a button that does nothing.

### Studio

Copied to `studio/` (64 files, 437KB) excluding `node_modules`, `output/`, generated narration
WAVs and `.env` — all of which the studio's own `.gitignore` already excludes. **Not** added to
the root npm workspaces: it is already a workspace root of its own (`apps/*`, `packages/*`), and
nesting one inside another makes npm resolve the two sets against each other. It stays an
independent npm project, exactly as `mobile/` and `admin/` already are.

---

## Verified

| Check | Result |
|---|---|
| Backend `mvn compile` / `test-compile` | Clean |
| `LessonVideoTest` (17), `LessonVideoRulesTest` (13), `LessonVideoUploadFailureTest` (3), `VideoStorageSelectionTest` (2) | **35/35, BUILD SUCCESS**, against the real Neon dev database |
| `packages/core` `tsc` | Clean |
| Mobile `tsc --noEmit` | Clean |
| Mobile `expo lint` | **Exactly the pre-existing 7-problem baseline** (6 errors + 1 warning), none in any touched file |
| Admin `npm run build` | Clean |
| Admin `oxlint` | Exactly the pre-existing baseline (1 warning, untouched file) |
| QA YAML | All three files parse; RTM regenerated → **198/367/407** |
| Secrets audit | No Cloudinary/API secret in `admin/src`, `mobile/src`, `web/src`, `packages/core/src`, or the studio copy. `application-local.yml` confirmed gitignored. No `.mp4`, `.wav` or `node_modules` would be committed from `studio/` |

**`LessonVideoUploadFailureTest` is the test that earns its keep.** It overrides `VideoStorage`
with an in-memory store that can be told to fail — the only way to provoke the behaviour the
rebuild exists for, since the local filesystem does not fail on demand and breaking real Cloudinary
credentials is not a test. It proves: a refused upload leaves `UPLOAD_FAILED` with an error, an
attempt count and the staged file intact while staying `DRAFT`; a retry then stores it; and the
store ends up holding **exactly one object** despite two upload calls.

### Three real bugs found while building, none by reading

1. **A record accessor collision.** `Attempt.alreadyStored()` as a static factory clashed with the
   record component accessor of the same name — a compile error, and the same trap
   `AICredentialStatus.valid()` hit before it became `ok()`. Renamed to `nothingToUpload()`.
2. **The admin Publish button would have deadlocked the feature** (see above).
3. **Two new lint violations of my own**, both `set-state-in-effect`, fixed rather than suppressed
   — with the keyed-loaded-state pattern plus an inline async IIFE, because the rule flags a
   memoized callback invoked with a chained `.catch()` at the call site even when the callee
   touches no state before its first `await`. This project documented that exact shape once before.

---

## ⚠️ Not verified

1. **No device or emulator pass.** The AI Videos screens typecheck and lint clean and nobody has
   seen them render. `TC-LESSONVIDEO-025` and `TC-LESSONVIDEO-026` exist for exactly this, both
   `Not Executed`. **This is the largest gap in the work**, and given this project's history of
   clean compiles hiding real bugs, it is the first thing to do next.
2. **No real Cloudinary upload has ever run.** There are no Cloudinary credentials on this machine
   (placeholders only), so the whole publish path is proven against a local store and an in-memory
   fake. What is genuinely unproven: that a real Cloudinary upload returns the `duration` this code
   now reads, and whether this account's plan supports time-limited delivery.
   `TC-LESSONVIDEO-019` already existed for that and stays `Not Executed`.
3. **Migration V55 has not been applied to any database.** It is written and reviewed; no Flyway
   run has executed it. The `ALTER TABLE ... ADD COLUMN` pair and the backfill are
   straightforward, but that is reasoning, not a green run.
4. **The admin preview player has not been opened in a browser.** It builds and lints clean; the
   blob-URL fetch and the `<video>` element have not been watched working.
5. **The studio has not been run from its new location.** The files were copied and nothing about
   them changed, but `npm install` and a render have not been executed under `studio/`.
6. **Nothing is committed.**

---

## Deliberately not done

- **No LLM-driven auto-generation.** The studio shelved it on purpose, rendering cannot run on
  Cloud Run, and the brief's own rule against implementing features outside its three operations
  covers it.
- **No adaptive bitrate / HLS / quality variants / thumbnails.** The brief asks for the
  architecture not to *prevent* them, which it does not: `quality` is already a column and part of
  the uniqueness key, so a LOW variant is a new row rather than a schema change. Building them now
  would be scope the brief itself excludes.
- **No Cloudinary public-id column.** It is derived from `storage_key` by dropping `.mp4`, which is
  what stops the row and the asset drifting apart. Storing it twice would create a second source of
  truth for the same fact.
- **No offline download for AI Videos browse.** The per-question card's download path is untouched
  and still works; wiring it into the browse screen was not asked for.
