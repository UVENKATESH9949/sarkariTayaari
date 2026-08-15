# Offline-First Exam Prep App — Requirements Document

**Project:** SarkariTaiyaari Mobile (Offline-Sync Edition)
**Stack:** React Native (Expo, Expo Router) + SQLite (expo-sqlite + Drizzle ORM) + Spring Boot backend
**Doc version:** 1.0

---

## 1. Product Summary

A mobile app for SSC/IBPS/RRB exam prep that syncs a large question bank to local SQLite storage on first install, then works fully offline. Subsequent app opens perform delta sync — only pulling questions that changed since the last sync.

**Core principle:** Server is source of truth. Client is a synced read replica (+ locally queued write-backs for user progress/attempts).

---

## 2. Data Model (Reference — used across all sprints)

**Superseded by the Content Model Redesign (see Section 5) — kept below for the multi-language design, which is unchanged. The old flat `topic`/`exam_type` string columns on `questions` no longer exist; see Section 5 for the current shape.**

### Multi-language design (extensible — adding a new language requires no schema change)

Languages are normalized out into their own table, with question text/options/explanation held in a separate per-language translations table. Adding a new language (Telugu, Kannada, or any other) later is purely a data insert — no migration needed. English is the mandatory/root language for every question; other languages are added incrementally per question as translations become available.

### `languages` table (server + local)
| Field | Type | Notes |
|---|---|---|
| code | text | Primary key, e.g. `en`, `hi` |
| name | text | Display name, e.g. "English", "Hindi" |
| is_active | boolean | Lets a language be added but not yet shown to users until content is ready |

### `question_translations` table (server + local) — one row per question per language
| Field | Type | Notes |
|---|---|---|
| id | UUID/int | Primary key |
| question_id | UUID/int | FK → `questions.id` |
| language_code | text | FK → `languages.code` |
| question_text | text | |
| options | JSON | array of 4 options, in this language |
| explanation | text | |

**Sync note:** since delta sync is driven by `questions.updated_at`, adding/editing a translation (e.g. inserting a Telugu translation for an already-synced question) must also bump the parent `questions.updated_at` — otherwise delta sync would miss translation-only changes. This is handled at the write layer (whenever a translation is saved, touch the parent question's `updated_at`), so the sync query logic itself stays unchanged.

### `sync_meta` table (local only) — will collapse to a single global row once Phase 3 (mobile) lands
| Field | Type | Notes |
|---|---|---|
| exam_type | text | key — **superseded**: sync is no longer scoped per exam (Section 5), so this becomes a single-row table with no key when Phase 3 updates the mobile sync engine |
| last_synced_at | timestamp | |

### `user_attempts` table (local, syncs up to server)
| Field | Type | Notes |
|---|---|---|
| id | UUID | |
| question_id | UUID | |
| selected_answer | text | |
| is_correct | boolean | |
| attempted_at | timestamp | |
| synced | boolean | local write-back queue flag |

---

## VERSION 1.0 — MVP (Offline Sync + Practice Core)

**Goal:** Prove the offline-sync architecture works end-to-end with a real (if small) question set, and a user can practice questions offline.

### Sprint 1 — Backend Foundation (1 week)

- **TICKET-101**: Build `questions` / `languages` / `question_translations` schema from scratch (Spring Boot/Postgres migration) — ✅ done, see `reports/TICKET-101.md`
- **TICKET-106**: Build CRUD REST API for questions + translations (create/read/update/delete) — needed before sync can be tested, since there's no other way to get data into the database. Must be done before TICKET-102. — ✅ done, see `reports/TICKET-106.md`
  - `POST /api/questions` (create question + en/hi translations)
  - `GET /api/questions/{id}` (read one)
  - `PUT /api/questions/{id}` (update question)
  - `PUT /api/questions/{id}/translations/{lang}` (add/edit a translation)
  - `DELETE /api/questions/{id}` (soft delete — sets `is_deleted`, doesn't remove the row)
  - `GET /api/questions` (list/browse, for admin/manual use)
  - `POST /api/questions/bulk-import` (accepts an array of questions + translations, creates them all in one request — this is what TICKET-105 seeding will use)
  - `POST /api/questions/bulk-delete` (accepts a list of question IDs, soft-deletes them all — sets `is_deleted`, bumps `updated_at` so delta sync picks up the deletion)
  - (More bulk/admin operations can be added later as needed — this covers the two requested for now.)
- **TICKET-107**: Build a web-based Admin UI (separate React app in `admin/`) for managing questions through a browser instead of Postman:
  - Questions list page — paginated table, filter by exam type/topic/difficulty, checkboxes + "delete selected" (bulk delete)
  - Create question form — core fields + one or more language translations (English required)
  - Edit question page — update core fields, add/edit translations per language
  - Bulk import page — paste/upload JSON matching the bulk-import API shape
  - Requires enabling CORS on the backend for the admin app's origin — ✅ done (pending your visual browser confirmation), see `reports/TICKET-107.md`
- **TICKET-108**: Admin UI polish + bulk-import hardening (requested after using TICKET-107) — ✅ done, see `reports/TICKET-108.md`
  - Modern design refresh: sidebar nav, cards, badges, light/dark theme
  - Click a question row → detail modal (Edit / Delete / Close / ✕)
  - Topic / Exam Type / Language become dropdowns (with an "Other" escape hatch on Topic/Exam Type; Language is fetched live from `GET /api/languages`, a new endpoint)
  - Bulk import: Clear button, "View example" is read-only (no longer auto-fills the import box), file upload (.json) in addition to paste, a client-side analyser that checks the same rules the backend enforces plus data-quality checks (correct-answer format, duplicate detection)
- **TICKET-109**: Bulk import — move review before import, not after (feedback after using TICKET-108) — ✅ done, see `reports/TICKET-109.md`
  - Review/remove-from-batch now happens client-side, before any database write — removing a mistaken question is just a list edit, not a delete-from-DB action
  - After import: a simple summary ("Imported X of Y") plus a per-question reason for anything that failed — no separate DB-backed review/undo screen
  - Backend `bulk-import` changed from all-or-nothing to per-item: each question is saved independently, so one bad item no longer blocks the rest of the batch, and the response now includes a `failures` list (`{index, error}`) for anything that didn't make it in
- **TICKET-110**: Automated integration test suite for everything built so far (CRUD, bulk-import incl. partial-failure, bulk-delete, languages) — ✅ done, see `reports/TICKET-110.md`. Runs with `mvn test`; 11 tests, all passing; self-cleaning (hard-deletes its own test data from the real dev DB after each test, verified zero leftovers)
- **TICKET-102**: Build `GET /api/questions/sync?examType=X&since=<timestamp>` endpoint — returns paginated changed/new/deleted records — ✅ done, see `reports/TICKET-102-103-104.md`
- **TICKET-103**: Add pagination support to sync endpoint (page size 500, offset-based, capped at 1000) — ✅ done, same report
- **TICKET-104**: Automated integration tests for the sync endpoint (full sync `since=0`, delta sync, missing/invalid params, soft-deleted rows included, page size respected) — ✅ done, 6 tests passing, same report — note: automated JUnit tests instead of Postman, per the TICKET-110 decision
- **TICKET-105**: Seed database with a sample question set — ✅ done, see `reports/TICKET-105.md`. 100 bilingual (en/hi) questions across 6 topics, imported via the admin UI's bulk-import (self-generated content, not a real exam question bank — see report for caveats)

**Sprint 1 Definition of Done:** ✅ met — CRUD API can create/read/update/delete questions with translations; sync API returns correct paginated JSON for both full and delta requests, verified via automated tests (not Postman, per TICKET-110).

---

### Sprint 2 — Mobile App Scaffold (1 week)

- **TICKET-201**: Initialize Expo React Native project, folder structure, navigation — ✅ done, see `reports/TICKET-201.md`. Navigation uses **Expo Router**, not React Navigation as originally written — Expo SDK 56+ no longer supports importing `@react-navigation/*` directly in app code, Expo Router is now the standard.
- **TICKET-202**: Install and configure expo-sqlite + Drizzle ORM, define local schema matching server model (`questions`, `languages`, `question_translations`) — reversed from WatermelonDB (see Section 4, decision 1) — ✅ done, see `reports/TICKET-202.md`. Verified end-to-end on the Android emulator: migration ran, home screen queries both tables live and displays row counts on screen.
- **TICKET-203**: Build local `sync_meta` table and helper functions (get/set `last_synced_at`) — ✅ done, see `reports/TICKET-203.md`. Verified on-device via an actual emulator screenshot (adb screencap), not just logs — confirmed `getLastSyncedAt` returns null before first sync and the correct timestamp after `setLastSyncedAt`.
- **TICKET-204**: Build basic app shell — home screen, exam selection screen (static UI, no data yet) — ✅ done, see `reports/TICKET-204.md`. Home screen with "Start Practice" CTA; exam selection screen lists all 6 exam types, SSC_CGL enabled (matches actual seeded data), rest marked "Coming soon" and disabled. Verified end-to-end on emulator via adb screenshots: navigation, selection state, and the disabled state all confirmed visually.
- **TICKET-205**: Set up API client (axios/fetch wrapper with base URL config, error handling) — ✅ done, see `reports/TICKET-205.md`. `apiFetch` wrapper + typed `getLanguages`/`syncQuestions` functions; base URL auto-derived from Metro's dev host IP (via `expo-constants`) so it doesn't break when the dev machine's LAN IP changes, with an env-var override for later real deployments. Verified against the real running backend on-device (not mocked): languages, sync data, and the 400 error-handling path all confirmed via logcat.

**Sprint 2 DoD:** App builds and runs on emulator/device with empty local DB and navigable static screens. ✅ met — Sprint 2 complete (TICKET-201 through TICKET-205).

---

### Sprint 3 — Sync Engine (1.5 weeks)

- **TICKET-301**: Build "initial full sync" flow — paginated fetch loop, batch insert into SQLite inside transactions. Includes a **2-minute soft timeout**: if full sync hasn't completed by then, unlock app navigation with partial data and continue syncing remaining pages on a background thread while the app stays open — ✅ done, see `reports/TICKET-301.md`. `runInitialSync(examType, onProgress)` in `mobile/src/sync/initialSync.ts`. Verified end-to-end on-device against the real backend: 108 questions / 212 translations / 2 languages written correctly, and a re-run confirmed upsert idempotency (no duplicates). The 2-minute timeout branch itself couldn't be exercised with the current ~108-row dataset (completes in under a minute) — real validation of that path is deferred to TICKET-501 (load test with 10k+ questions).
- **TICKET-302**: Build sync progress UI (progress bar / percentage during first sync); after the 2-minute timeout, switch to a small non-blocking "syncing more content..." indicator instead of a full-screen blocker — ✅ done, see `reports/TICKET-302.md`. `SyncProvider`/`useSyncStatus` context wraps the app root; blocks navigation with `SyncProgressScreen` (progress bar + percentage) only while a first-time sync is genuinely running, skips it entirely on later opens (`sync_meta` already has a timestamp), and shows a small floating `SyncBanner` ("Syncing more content..." / error text) once unlocked but still finishing in the background. Verified on-device for both the "never synced" and "already synced" paths. Found and fixed a real gap while testing: the sync loop could reach "last page" and exit before ever reporting real progress counts, so a single-page dataset (today's ~108 rows) would jump straight from "Preparing..." to Home with no visible progress tick at all — fixed in `initialSync.ts` so a real progress tick always fires before completion.
- **TICKET-303**: Build "delta sync" flow — call sync API with stored `last_synced_at`, upsert changed rows, delete soft-deleted rows — ✅ done, see `reports/TICKET-303.md`. `runDeltaSync(examType)` in `mobile/src/sync/deltaSync.ts`; shares write logic with `initialSync.ts` via a new `writeQuestions.ts` helper module. Verified against real backend mutations (one question updated, one soft-deleted via the live API): delta sync correctly reported `upserted:1, deleted:1`, the updated field matched exactly, and the deleted question left zero rows behind (including its translations — no orphans).
- **TICKET-304**: Handle sync failure/retry — resume from last successful page on network drop (also covers resuming an interrupted initial sync if the app is closed before it finishes)
- **TICKET-305**: Trigger delta sync on app foreground/launch (skip if synced within last N minutes)
- **TICKET-306**: Add manual "pull to refresh" sync trigger on home screen
- **TICKET-307**: Partial-data guard — if user navigates to a topic/section not yet synced, show an inline "still syncing this section" state instead of an empty/error screen

**Sprint 3 DoD:** Fresh install performs full sync and populates local DB correctly; killing network mid-sync and resuming does not corrupt data; second app open only pulls deltas (verify via network inspector — payload size should be near-zero if nothing changed); if initial sync exceeds 2 minutes, user can browse already-synced content while the rest syncs in the background, with no crashes or empty-screen dead ends.

**Note:** "Background" here means sync continues while the app is open (foreground or briefly backgrounded) — not guaranteed OS-level background execution when the app is fully closed/minimized for a long time (iOS/Android both restrict this). If the app is closed mid-sync, it resumes via TICKET-304 on next open.

---

### Sprint 4 — Practice Flow (1 week)

**Superseded in part by Section 5 Phase 4** — the content model redesign replaced the single "question list screen" with a proper Exam → Subject → Topic → Level drill-down. Kept below for history/traceability; treat Phase 4 as the current source of truth for the browse UI.

- **TICKET-401**: ~~Build question list screen — query local SQLite filtered by exam_type/topic, rendered via FlatList/FlashList~~ → **superseded by Phase 4's Subject/Topic/Level drill-down** (same underlying local-SQLite-query idea, now spread across three screens instead of one flat list)
- **TICKET-402**: Build quiz/practice screen — show question, options, submit answer, reveal explanation — **still valid**, now reached via the Phase 4 drill-down (Level → Practice) instead of directly from a topic list
- **TICKET-403**: ~~Add topic/difficulty filter UI (queries SQLite with indexed WHERE clauses, not JS filtering)~~ → **superseded by Phase 4** — each drill-down screen (Subject/Topic/Level) *is* the filter now, so there's no separate filter UI to build
- **TICKET-404**: Store user attempts locally in `user_attempts` table on each answer submission — **still valid**, unaffected by the content model change
- **TICKET-405**: Basic offline mode banner/indicator (show when device has no network, confirm app still functions) — **still valid**, unaffected by the content model change

**Sprint 4 DoD:** User can browse, filter, and answer questions with zero network connection after initial sync; attempts are saved locally.

---

### Sprint 5 — QA, Performance, Release Prep (1 week)

- **TICKET-501**: Load test with 10,000+ seeded questions — verify no lag in list scroll, sync time acceptable
- **TICKET-502**: Test on low-end/throttled device or emulator (not just dev phone)
- **TICKET-503**: Add crash reporting (Sentry) and basic analytics events (sync started/completed, question attempted)
- **TICKET-504**: App icon, splash screen, basic branding polish
- **TICKET-505**: Build signed APK/AAB, internal testing track on Play Console
- **TICKET-506**: Recruit 10-20 beta testers (Telegram/coaching groups per earlier distribution plan), collect feedback

**Sprint 5 DoD:** v1.0 installable via Play Store internal testing link, tested on real low-end device, crash-free for core flows.

---

## VERSION 1.1 — Write-Back Sync + Progress

**Goal:** Sync user progress/attempts back to server so users don't lose history across devices.

- **TICKET-601**: Backend endpoint `POST /api/attempts/sync` — accepts batch of local attempts
- **TICKET-602**: Local write-queue — mark attempts `synced: false`, push in background when online
- **TICKET-603**: Conflict handling (unlikely here since attempts are append-only, not edited — mostly just dedupe by id)
- **TICKET-604**: User-facing progress screen (questions attempted, accuracy %, by topic)
- **TICKET-605**: Basic auth (so attempts are tied to a user, not anonymous device)

---

## VERSION 1.2 — Scale & Polish

**Goal:** Handle full question bank scale (20k-50k+ questions), add the differentiator features from BrainBlitz web (Exam Readiness Score, Persona).

- **TICKET-701**: Load full production question bank, verify sync/storage/scroll performance at scale
- **TICKET-702**: Port Exam Readiness Score logic to mobile (compute locally from `user_attempts`, or fetch from server)
- **TICKET-703**: Port Exam Persona feature
- **TICKET-704**: Add image support for questions/explanations with diagrams (lazy-loaded, cached separately from text sync)
- **TICKET-705**: Push notification setup (daily practice reminder — optional, evaluate need)
- **TICKET-706**: iOS build + TestFlight (after Android is stable — deferred per earlier plan)

---

## 3. Explicit Non-Goals for v1.0 (to avoid scope creep)

- No real-time push-triggered sync (app-open sync only)
- No two-way conflict resolution (questions are server-owned, read-only on client)
- No iOS build until Android v1.0 is validated with real users
- No images/diagrams in v1.0 (text-only questions first)
- No user accounts/login required for v1.0 (add in v1.1 with write-back sync)

---

## 4. Open Decisions — RESOLVED

1. ~~WatermelonDB vs plain expo-sqlite + Drizzle~~ → **Decided: WatermelonDB, later reversed to expo-sqlite + Drizzle** (Sprint 2/TICKET-202 — WatermelonDB requires a custom native build, leaving Expo Go entirely; expo-sqlite + Drizzle stays inside Expo Go with no native build step, and has first-class documented Expo support)
2. ~~Page size for sync pagination~~ → **Decided: 500**
3. ~~Which exam(s) to seed first~~ → **Decided: SSC CGL only** (expand to IBPS/RRB after pipeline is validated)

---

## 5. Content Model Redesign

**Trigger:** ~70% of the syllabus (Quant, Reasoning, English, GA/GS) is shared across every government exam (SSC CGL, SSC CHSL, IBPS PO/Clerk, RRB NTPC, RRB Group D) — only ~30% is exam-specific. The original schema tied every question to exactly one `exam_type`, which meant either duplicating shared content per exam or content silently not appearing for exams it should apply to. This section replaces the flat model in Section 2 with a normalized one designed around that insight.

### New shape

- **Subjects and Topics are global, not per-exam.** `subjects` (Quant, Reasoning, English, GA, Computer Knowledge, General Science) and `topics` (sub-topics within a subject — e.g. Percentages under Quant) are authored once and reused by every exam that needs them. There is no such thing as "SSC CGL's Quant" as a distinct row.
- **Exams are real data, not hardcoded strings** — an `exams` table (`code`, `name`, `image_url`, `is_active`, `display_order`), mirroring the pattern already used for `languages`. Adding a new exam later is a data insert, not a code change, in the backend, admin, and mobile alike.
- **A question belongs to one Topic but can be tagged to multiple Exams** — `questions.topic_id` (FK, replacing the old flat `topic` string) plus a `question_exam_types` many-to-many join table (replacing the old flat `exam_type` string). Content is authored once and tagged to every exam it's relevant to.
- **`questions.is_premium`** (boolean, default `false`) — added now, while the table is small and already being redesigned, as cheap insurance in case any content is paywalled later. No entitlement/access-control logic exists yet; this is just a reserved column.
- **Sync is no longer scoped by exam.** `GET /api/questions/sync` now takes no exam parameter — it always returns the entire question bank, paginated by `since`/`page`/`size`. The client syncs everything once and filters by exam locally (see Section 2's `sync_meta` note) — this means switching exams, following a new exam, or browsing "All Government Exams" never needs a network call after the first sync.
- **Image storage** — Cloudinary, via one generic upload endpoint (`POST /api/images`, multipart file → returns a URL). Not exam-specific; any entity that needs an image (exam cards today; question diagrams, profile pictures later) stores the returned URL. Requires real Cloudinary credentials in the gitignored `application-local.yml` (`cloudinary.cloud-name` / `api-key` / `api-secret`) — currently placeholders, upload will 500 until filled in.
- **Bulk import references Subject/Topic by name** (auto-created if new — content authors shouldn't need to pre-register a sub-topic) **and exam codes by code** (must already exist — exams are curated with images/display order, so an unknown code fails that item rather than silently creating a bare exam row). The direct single-question CRUD API (`CreateQuestionRequest`/`UpdateQuestionRequest`) still takes a resolved `topicId`, for the admin UI's cascading-picker flow (Phase 2).
- **Admin needs CRUD for everything now**, not just Questions: Exams, Subjects, Topics, and Languages (upgraded from read-only to full CRUD). Both Exams and Languages expose an active-only list (mobile-facing, unchanged contract) and an `/all` list (admin-facing, includes inactive rows) — same split pattern for both.

### Phased rollout

- **Phase 1 — Backend schema & API: ✅ done.** Migration (`V2__content_model_redesign.sql`), entities, repositories, DTOs, services, controllers for Exam/Subject/Topic; Language upgraded to full CRUD; Question CRUD/list/sync/bulk-import reworked to the new shape; Cloudinary wired in. 39 automated tests passing against the real Neon dev database (existing suite reworked + new `ExamCrudTest`/`SubjectCrudTest`/`TopicCrudTest`/expanded `LanguageControllerTest`), plus manual curl verification of every new endpoint. Full report: `reports/content-model-phase1-backend.md`.
- **Phase 2 — Admin UI: ✅ done (2026-08-14).** CRUD pages for Exams (with Cloudinary image upload)/Subjects/Topics/Languages; Question list and form reworked to the new model (Subject/Topic cascading pickers, multi-select exam tags, premium flag, A–D correct-answer dropdown); bulk-import validator and UI reworked to `subjectName`/`topicName`/`examCodes`. Full report: `reports/content-model-phase2-admin.md`.
  - **The admin app was not merely outdated — it was broken against the live API.** The questions list rendered `q.topic`/`q.examType` (both now absent, so the columns were blank for all 112 rows), the question form posted `topic`/`examType` where the backend expects `topicId`/`examCodes` (so creating a question could not succeed), and bulk import's analyser rejected correctly-shaped new-model JSON. Since bulk import is the only practical content-entry path, the content pipeline was blocked until this phase.
  - **Correct-answer entry became an A–D dropdown** showing each option's English text, closing the data-quality hole that produced the one malformed row (`correctAnswer: "12"`). The edit form detects such rows, matches the value back to a letter, and warns that saving will normalise it.
  - **Backend change:** `spring.servlet.multipart.max-file-size: 5MB` — Spring's 1MB default rejects ordinary exam artwork and fails as an unmapped 500.
  - **Verified in a real browser** against the live Neon-backed backend, including a full create round-trip driven through the form (112 → 113 questions, every field confirmed via the API, test row then soft-deleted) and a mixed-validity bulk-import batch that produced exactly the right per-item verdicts.
- **Phase 3 — Mobile: foundation rework — ✅ this slice done.** Local schema (`mobile/src/db/schema.ts`) reworked to mirror the backend exactly: new `exams`/`subjects`/`topics` tables plus `question_exams` (many-to-many, replacing the old flat `questions.exam_type` string); `questions` now carries `subject_id`/`topic_id` FKs instead of a flat `topic` string. `sync_meta` collapsed to a single global row (`key: "global"`) — sync is no longer scoped by exam, so there's exactly one "last synced at" timestamp for the whole app. Added a local-only `followed_exams` table (exam code + optional target date) for a future countdown feature, not wired to any UI yet.
  - **Migrations squashed**, not incrementally diffed: the two pre-redesign migrations were deleted and regenerated as one fresh baseline (`0000_happy_ser_duncan.sql`) rather than fighting `drizzle-kit generate`'s interactive rename prompts (it can't tell "renamed column" from "dropped + added column" non-interactively, and the shape changed too much for that distinction to matter anyway). Safe to do because the local SQLite DB is purely a synced read cache — no real user data lives there, and the app hasn't shipped.
  - **API layer**: `api/questions.ts`'s `QuestionResponse` type and `syncQuestions()` updated to the real shape (`subjectId`/`subjectName`/`topicId`/`topicName`/`examCodes`/`premium`, no more `examType` sync param); new `api/reference.ts` added for `GET /api/exams` / `/api/subjects` / `/api/topics`.
  - **Sync engine** (`initialSync.ts`/`deltaSync.ts`/`writeQuestions.ts`) reworked: a new `writeReferenceData()` upserts exams/subjects/topics before every sync (small dataset, no delta concept server-side, so it's simplest to just refetch-and-upsert the whole set every time); `upsertQuestion()` writes the new question shape and rebuilds each question's `question_exams` rows wholesale (delete-then-reinsert, since the server always sends the full `examCodes` list — simpler and just as correct as diffing); `SyncContext.tsx` no longer hardcodes `SSC_CGL`.
  - **Verified on-device, end-to-end**, with the backend and Metro both actually running (not just type-checked): cleared Expo Go's storage for a clean slate, confirmed the new baseline migration applies without error (no old-shape tables left behind to collide with it), then confirmed a real initial sync against the live Neon-backed backend correctly wrote all 112 real questions plus real exams/subjects/topics into the new local tables and recorded the global `sync_meta` row. Re-launched the app a second time (no storage clear) and confirmed it read that `sync_meta` row back correctly and skipped straight to Home instead of re-syncing.
  - **Real perf finding surfaced during this verification, not a regression from this change**: the first sync page took ~59 seconds for all 112 questions (confirmed via manual `curl` timing: 2 rows ≈ 2.9s, scaling roughly linearly) — almost certainly N+1-style lazy loading of translations/exam-codes per question against the remote Neon DB, compounded by real network latency to a cloud Postgres instance. Existing backend code, unrelated to the Phase 3 mobile changes, but worth a follow-up (e.g. `@EntityGraph`/join-fetch on the sync query) before this becomes the app's real first-run experience rather than a dev-only annoyance.
    - **✅ Fixed (2026-08-12).** Two changes: `hibernate.default_batch_fetch_size: 50` in `application.yml` (converts the per-question lazy loads for topic/subject/exams/translations/language from ~5 individual queries each into `WHERE id IN (...)` batches — the single biggest win, and applies app-wide, not just to sync), plus a `@Query` with `JOIN FETCH` for `topic`+`subject` specifically on `QuestionRepository.findByUpdatedAtAfter` (safe with pagination since both are `*-to-one`; the `*-to-many` associations — `exams`, `translations` — stay lazy and rely on the batch-fetch setting instead, since `JOIN FETCH`-ing a collection would multiply rows and break `LIMIT`/`OFFSET` pagination). Verified: full 112-question sync via `curl` timing went from ~59s to ~3.5s (~17x); response shape/pagination metadata (`totalElements`, `last`, per-question `subjectName`/`topicName`/`examCodes`/`translations`) unchanged; full backend test suite re-run against the real Neon DB, all passing (exit 0, no failures).
  - **✅ Follow-up done: mock contexts wired to real local data.** Added three more local-only tables — `practice_sessions`, `practice_session_results` (one row per answered question, an `order_index` column preserves question order on reload since SQLite gives no other ordering guarantee), and `bookmarks` — plus `db/practiceSessions.ts`/`db/bookmarks.ts`/`db/followedExams.ts` as the raw-query layer.
    - `SessionHistoryProvider`/`BookmarksProvider` (`mobile/src/practice/sessionHistory.tsx` / `bookmarks.tsx`) were rewritten to read from SQLite on mount and write through on every change, **keeping the exact same context API** (`addSession`/`getSession`/`clearSessions`, `isBookmarked`/`toggleBookmark`) so none of the consuming screens (Quiz, Summary, History, Progress, Revise, More) needed to change. Writes use an **optimistic-update pattern**: React state updates synchronously first (so Quiz's `addSession()` → immediate `router.replace("/practice/summary")` still works — Summary reads the new session from context state, not from a DB round-trip that hasn't finished yet), and the SQLite write happens in the background, errors just `console.warn`'d rather than surfaced (acceptable here — worst case on a write failure is that single item doesn't survive to the next app launch, not a crash or a silent data-integrity issue elsewhere).
    - The two hardcoded `MOCK_PAST_SESSIONS` are gone — a fresh install now genuinely starts at zero sessions/bookmarks, relying on the empty states already built for Progress/Revise rather than fake seeded history.
    - **`followed_exams` now wired to Home**: `db/followedExams.ts` adds `ensureExamFollowed()`, called from `SyncContext.tsx` right after a sync completes (or is confirmed already-complete) — since there's no "choose your exam" onboarding screen yet, it auto-follows the first exam (lowest display order) from the synced list, which today just means SSC_CGL, the only real exam. Home (`app/(tabs)/index.tsx`) now reads the followed exam's name via `getFollowedExam()` instead of a hardcoded string; streak and the readiness teaser percentage are still mock (unchanged scope).
    - **Verified on-device, end-to-end, across a real process kill** (not just a JS reload): cleared storage, let a fresh sync complete, confirmed Home showed "SSC CGL" from the real `followed_exams` row; played a full 4-question session (deliberately all wrong) and bookmarked one question; confirmed Progress/Revise picked up the new session and bookmark immediately (optimistic update working); then `am force-stop`'d the app (killing the JS process, not just navigating away) and relaunched — Progress still showed the same 4-questions/1-session/0% and Revise still showed the same bookmarked question, proving these came from SQLite and not from React state that happened to survive.
- **Phase 4 — Mobile: new screens**: being built page-by-page, UI first (with mock data, no backend/local-DB wiring) then full code for that page, before moving to the next — per an explicit request to design/see each page individually rather than all at once.
  - **Navigation shell**: 5-tab bottom bar — Home, Practice, Progress, Revise (bookmarks + wrong answers), More (settings/secondary) — ✅ done. Search intentionally has no tab (a search icon inside Practice instead, not a standalone destination). Built with `expo-router`'s `Tabs` + `@expo/vector-icons`; the old single `exam-selection` screen is retired — exam browsing moves into the Practice tab (not built yet).
  - **Home** — ✅ done (dashboard-style: streak, followed-exam summary, "Continue Practice" CTA → Practice tab, readiness-score teaser → Progress tab). All content is mock data. Verified on-device: renders correctly, both CTAs navigate to the correct tab, tab bar active-state highlighting confirmed for all 5 tabs.
  - **Practice (landing)** — ✅ done. A persistent (always-visible, non-scrolling) search bar at the top — real `TextInput`, no search logic wired yet, just present so the UI reads as complete; a visually distinct "All Government Exams" card; a 2-column grid of the 6 exam cards (SSC CGL enabled, rest "Coming soon" + disabled). Tapping a card shows a selection highlight + an inline "coming soon" note rather than navigating anywhere, since the Subject list screen doesn't exist yet. Verified on-device: layout, selection state, and the search input all confirmed (typing into it brings up the keyboard and renders text correctly, like a real input).
  - **Subject list** — ✅ done. Reached by real navigation now (Practice's exam cards actually push into this screen instead of showing a placeholder note) — `(tabs)/practice` became a nested Stack (`index`/`subjects`/`topics`) so the tab bar stays visible while drilling down. Shows the same 6 subjects regardless of which exam/"All Government Exams" was tapped — Subjects are genuinely shared, not per-exam, so this isn't a shortcut, it's correct behavior. Each subject has a distinct icon + accent color, a mock stats line, and a **real, working search bar** (filters the 6 subjects as you type — small enough dataset that a genuine filter costs nothing to build now, unlike Practice's decorative one). Tapping a subject navigates into Topics for real. Subject styling (name/icon/color/stats) extracted to `mobile/src/constants/subjects.ts`, shared with the Topics screen.
  - **Topic list** — ✅ done. Same pattern as Subject list, one level deeper: header = subject name, a real search bar (explicitly requested since a subject can hold many sub-topics — e.g. 9 for Quantitative Aptitude in the mock set), topic rows tinted with the parent subject's color for visual continuity through the hierarchy. Tapping a topic shows the same selection + "Level browsing coming soon" placeholder pattern, since Level list isn't built yet. Verified on-device: navigation in, live search filtering (typing "time" correctly narrows to just the 2 matching topics), the empty state ("No topics match..."), and selection state all confirmed.
  - **Level list** — ✅ done. Reached by real navigation from a Topic card (Topics also now navigates for real instead of showing a placeholder note). Explicit fix for a real UX concern: showing only Easy/Medium/Hard risked feeling like a dead end ("is that all there is?") — added an **"All Levels"** card at the top (mixed-difficulty, navy/distinct styling), mirroring the same "combined option alongside individual ones" pattern already used for "All Government Exams". Easy/Medium/Hard get conventional color coding (green/amber/red) and counts are derived from the topic's total so "All Levels" always sums exactly to the three below it, rather than showing mismatched numbers. Verified on-device: correct arithmetic (4+3+1=8 for Percentages), correct singular/plural question-count grammar, and the selection + "coming soon" pattern.
  - **Quiz** — ✅ done. The core screen of the app, reached by real navigation from a Level card (Levels also now navigates for real). Designed deliberately around real Indian government-exam-aspirant behavior, not generic quiz-app defaults:
    - **Language dropdown with search** (not just an EN/HI toggle — explicitly requested, since more languages get added over time) lets a user switch language mid-question and see the same question/options/explanation instantly. Mock data is intentionally bilingual-only (en/hi) with 9 more mock languages in the picker that have *no* content, so the "not yet translated — showing English" fallback is real, working behavior, not a hypothetical — this mirrors the real architecture (English is the mandatory root, other languages are added incrementally per question).
    - **Instant feedback, not exam-mode silence** — tapping an option immediately shows correct (green)/wrong (red) + reveals the explanation; no "Next" until answered, so practice can't be skimmed without attempting.
    - **Bookmark (star) and report-an-issue (flag)** icons, both per-question state, feeding the future Revise tab and building trust around content quality respectively.
    - Progress bar + "Question X of N"; last question's button becomes "Finish" → an inline "Session complete!" state (Summary/Review screens aren't built yet) with a way back to Topics, rather than a dead end.
    - Verified on-device, exhaustively: wrong-answer coloring, clean correct-answer coloring, bookmark/report toggling and correctly resetting per question, progress bar advancing, the language dropdown's search actually filtering, Hindi rendering real Devanagari translations correctly, the untranslated-language fallback note, and the full Finish → session-complete flow.
  - **Session history + Session Summary** — ✅ done, added as an explicit extension beyond the original plan: since Practice pulls random questions from the pool each time, the exact question set from a past session is otherwise unrecoverable once it's over. A shared `SessionHistoryProvider` (in-memory, capped at 50 sessions, mirrors the "auto-drop oldest" pattern) now records a real session — score, per-question right/wrong, exam/subject/topic/level context — every time Quiz's Finish button is pressed. This directly replaces the old placeholder "Session complete!" inline state.
    - **Session Summary** — score circle + accuracy % (color-coded: green ≥70%, amber 40–70%, red <40%), context line, and a full question-by-question right/wrong list with real question text. Actions: "View Session History" and "Back to Practice".
    - **Session History** — a PhonePe-transaction-style list, most recent first: score badge, topic/level + subject/exam context, a compact row of colored dots (one per question, green/red) for an at-a-glance pattern, and relative time ("1 min ago", "Yesterday", etc.). Seeded with 2 mock past sessions so it isn't empty on first look; a footer states the 50-session cap explicitly. This groundwork also directly sets up the future Revise tab (surfacing wrong answers) and Progress tab (accuracy trends) — both can now read from the same store instead of needing their own data model later.
    - Real persistence (writing this to the local SQLite DB instead of in-memory-only) is Phase 3 work, once the mobile app is wired to actual synced/local data — noted here so it isn't lost track of.
    - Verified on-device end-to-end: played a full 4-question session with a deliberate mix of right/wrong answers, confirmed the summary's score/color/per-question list exactly matched what was actually answered, and confirmed History showed that real session at the top with the correct dot pattern and time, above the two seeded mock sessions.
  - **Shared data layer extended** to support the remaining three tabs, all still in-memory/mock (real persistence stays Phase 3 work): `SessionHistoryProvider` gained a `clearSessions()` action and `QuestionResult` gained an `explanation` field (needed so Revise can show explanations for wrong answers, not just Summary); a new `BookmarksProvider` (`mobile/src/practice/bookmarks.tsx`) promotes bookmark state from Quiz-screen-local to app-wide, storing a full content **snapshot** per bookmark (question text/options/correct index/explanation/subject/topic/exam) rather than just an ID, since there's no local DB yet to re-fetch content by ID; a new `AppLanguageProvider` (`mobile/src/practice/appLanguage.tsx`) holds a single global default quiz language plus the shared `LANGUAGES` mock list (moved out of `quiz.tsx`); a new shared `LanguagePickerModal` component (`mobile/src/practice/LanguagePickerModal.tsx`) is now used by both Quiz and More instead of duplicating the modal UI. Quiz was rewired to consume all three (shared language list, `useBookmarks()` for its star toggle, `useAppLanguage().defaultLanguageCode` as its initial language, and `explanation` on every recorded `QuestionResult`).
  - **Progress** — ✅ done. Real computed stats from `useSessionHistory()`, no mock numbers: an Exam Readiness Score card (overall accuracy across every attempted question — the scoring-formula decision resolved simply, deferring anything more elaborate like recency-weighting or per-subject weighting to a future pass), "questions attempted"/"sessions completed" counters, and a subject-wise accuracy breakdown (reusing `SUBJECTS` icon/color metadata for visual continuity with Subject/Topic lists) that correctly shows "Not attempted yet" for subjects with zero recorded sessions. A footer link jumps to Session History. Verified on-device against real recorded sessions (13 questions across 2 sessions → 77% readiness, Quant 80%, Reasoning 75%, matching hand-computed expected values exactly) and again after clearing history (correctly resets to 0/0/0%).
  - **Revise** — ✅ done. A segmented Bookmarked/Wrong Answers toggle. Bookmarked reads straight from `useBookmarks()`. Wrong Answers is derived, not stored separately: iterates all sessions (most-recent-first) and takes the first occurrence of each wrong `questionId`, so retrying the same question later doesn't create duplicate revision entries. Each item is an expandable card (collapsed = question preview + subject/topic tag; expanded = full options with correct/wrong highlighting matching Quiz's own color language, plus the explanation); bookmarked cards get an inline "Remove bookmark" action. Both tabs have a distinct, encouraging empty state (no bookmarks yet vs. "no wrong answers yet — nice!"). Verified on-device: bookmarking a question in Quiz while it was displayed in Hindi correctly appeared in Revise with the Hindi text preserved (proving the snapshot approach works across languages); wrong-answer dedup verified against the 2 seeded mock sessions (produced exactly 3 entries, matching hand count); expand/collapse and the correct/wrong option coloring confirmed visually.
  - **More** — ✅ done. Preferences (default quiz language, reusing `LanguagePickerModal`, backed by `useAppLanguage()` — confirmed this actually changes Quiz's starting language on the next session, not just a cosmetic setting), Data (mock "Last synced: Never" placeholder + a real, working "Clear practice history" action gated behind a native destructive `Alert.alert` confirm, calling `useSessionHistory().clearSessions()`), About (static app name/version). Verified on-device: language picker selection persisted and was reflected in Quiz on next entry; clear-history confirm dialog showed the correct warning copy, and confirming it correctly zeroed out Progress while leaving Bookmarks untouched (per the dialog's own promise).
  - A dedicated **Review** screen (deeper than Summary's list — e.g. re-showing full explanations per wrong answer) is still a reasonable future addition but not built yet; Revise's expandable cards cover most of that need for now.
  - All of Phase 4's page-by-page mobile screens are now built and verified: Home, Practice landing, Subject/Topic/Level lists, Quiz, Session Summary/History, Progress, Revise, More. Per explicit instruction, next up is Phase 3 (wiring the mobile app to real local SQLite persistence instead of these in-memory mock contexts) — not started yet.

### Real-data migration note

The live Neon dev database had 112 rows at migration time: 108 real SSC_CGL seed questions (TICKET-105) + 3 legitimate leftover questions from earlier manual CRUD testing (Reasoning/English, tagged IBPS_PO/RRB_NTPC — kept, re-tagged into the new model) + 1 genuine leftover test artifact (`topic='Test'`, already soft-deleted — removed by the migration). All 108 SSC_CGL questions were backfilled into a placeholder "General" topic under their existing subject; real sub-topics will be authored incrementally as real content work begins.

### Phase 3 continued — Practice wired to real synced data (✅ done, 2026-08-12)

The last major gap from Phase 3: Practice's Subject/Topic/Level/Quiz screens were still running on hardcoded mock arrays (`constants/subjects.ts`'s fake question counts, `topics.tsx`'s `TOPICS_BY_SUBJECT`, and 4 hardcoded questions in `quiz.tsx`) even after sessions/bookmarks were wired to real SQLite. A mock test built on top of that would've been pointless, so this was next.

- **New query layer** (`mobile/src/db/practiceContent.ts`): `getSyncedExams()`, `getSubjectStats()`, `getTopicStats()`, `getDifficultyCounts()`, `getPracticeQuestions()` — all real Drizzle queries against the local `exams`/`subjects`/`topics`/`questions`/`question_exams`/`question_translations` tables, optionally scoped to a specific exam code (or unscoped for "All Government Exams"). `getPracticeQuestions()` shuffles via `ORDER BY RANDOM()` and returns full bilingual content ready for Quiz.
- **All 5 screens rewired**: `practice/index.tsx` now lists real synced exams instead of a hardcoded 6-exam grid with 5 fake "coming soon" entries; `subjects.tsx`/`topics.tsx`/`levels.tsx` show real question counts and disable (grey out, non-tappable) any subject/topic/level with zero matching questions instead of showing a misleading count; `quiz.tsx` loads real questions for the selected topic+difficulty+exam via a loading state (`ActivityIndicator`) and a defensive empty state, replacing its 4 hardcoded mock questions entirely. Fake per-row accuracy percentages were dropped from Subject/Topic rows (real per-subject accuracy already lives on Progress, computed from actual session history — showing a second, differently-sourced number on Practice's list rows would just invite the two to disagree).
- **Real content is visibly sparser than the old mock data, correctly so**: each subject currently has exactly **one** topic ("General") rather than the mock's 7-9 illustrative sub-topics, since real sub-topic authoring hasn't started — this is the same fact already called out in the migration note above, now visible in the actual UI instead of hidden behind mock data. Similarly, "Browse by exam" now shows only the one real exam (SSC CGL) instead of 6 mock cards.
- **Real bug found and fixed via this verification, not present in the old mock data**: one duplicate seed question had `correctAnswer` stored as the literal answer value (`"12"`) instead of a letter (`"A"`–`"D"`) like every other question — a genuine content data-quality inconsistency, not a client bug. Rather than patching that one row, `getPracticeQuestions()`'s letter→index resolution (`resolveCorrectIndex`) was made defensive: it tries the letter mapping first, and falls back to matching the value directly against the English options if that doesn't land in range — so the app is now robust to this whole class of inconsistency, not just the one row that happened to surface it. Caught by actually tapping through a real session and noticing the correct answer never highlighted green, not by code review.
- **Exam-scoping validated as a side effect of chasing what looked like a second bug**: browsing via the specific "SSC CGL" card showed slightly lower per-subject counts than browsing via "All Government Exams" (e.g. Reasoning 20 vs 22). Investigated thoroughly (checked for stale local data, duplicate subject rows, did a full clean re-sync) before finding the real explanation: those extra questions are the 3 leftover-test questions tagged `IBPS_PO`/`RRB_NTPC` from the migration note above — correctly excluded when scoped to SSC_CGL specifically, correctly included when browsing unscoped. Confirms `question_exams` filtering is working exactly as designed.
- **Verified on-device, end-to-end**: real exam list → real subject counts → real single "General" topic → real Easy/Medium/Hard counts (9/12/5, summing correctly to the real 26-question total) → a full 9-question real Quiz session played question-by-question with genuinely random ordering each run, correct/wrong highlighting confirmed against real explanations (e.g. "15% of 200 = 30" correctly highlighting option C), and the completed session correctly recorded and shown on Summary.

---

## 6. Mock Tests — New Navigation Pillar

**Status: ✅ built and verified end-to-end on-device (2026-08-13/14).** Planned and decided on 2026-08-12 (see below for the original discussion); built immediately after Practice was wired to real data, per the sequencing call made at planning time.

### Why this is a distinct feature, not a Practice variant

Practice (built, Phase 4) is browse-and-drill: no timer, instant right/wrong feedback per question, retry freely, no penalty for wrong answers. A **Mock Test** simulates the actual exam sitting — the thing aspirants are really training for — and needs to behave differently in ways that would corrupt Practice if bolted on: a countdown timer with auto-submit, no feedback until the whole test is submitted, negative marking, and a question-navigator grid for jumping between questions and marking them for review. Different enough to warrant its own tab and its own local data model rather than a mode flag on Practice.

### Decisions made (via explicit discussion, not assumed)

1. **Question composition: generated on-the-fly**, not curated fixed test sets. Each mock test is assembled at start-time from the locally-synced question pool, picking N questions per subject to match a per-exam **blueprint** (see below). Chosen over admin-authored fixed test sets because it needs zero new content-authoring and works immediately against whatever's already synced — the trade-off (attempts may repeat questions given the current ~112-question pool, and two attempts aren't a fixed, comparable paper) is accepted for v1. Revisit curated fixed sets once question volume is much higher and "retake this exact test and see if you improved" becomes a wanted feature.
2. **Navigation: Mock Test gets its own bottom tab**, replacing Revise as one of the app's core pillars. Tab bar becomes **Home · Practice · Mock Test · Progress · More** (still 5, per the earlier tab-bar agreement). Revise's functionality (Bookmarked questions + Wrong Answers) does not disappear — it moves onto **Home** as one or two summary sections/cards (e.g. "3 bookmarked questions" / "5 wrong answers to review", each with a "View all" link), reached via a pushed screen rather than a tab. The existing Revise screen's UI/logic (segmented Bookmarked/Wrong-Answers view, expandable cards) gets relocated, not rebuilt — it's already correct, it just needs a new route outside the tab bar (e.g. a stack screen reachable from Home) instead of `app/(tabs)/revise.tsx`.
3. **Negative marking: included from v1**, not deferred. Scored per the exam's blueprint (e.g. +2 correct / −0.5 wrong for SSC CGL), computed at submission. This is exactly the realism aspirants are anxious about in real exams, and changing how scores are computed/displayed later would be a bigger rework than including it now.

### Mock Test scope for v1

- **Blueprint per exam**: subject-wise question counts + total duration + marking scheme (marks correct / marks wrong). For v1, hardcoded in mobile code keyed by exam code — same pragmatic "derive in code, not in a DB table yet" pattern already used for Level's difficulty-split math. Example shape for SSC_CGL: 25 Quant + 25 Reasoning + 25 English + 25 GA, 60 minutes, +2/−0.5. Revisit as admin-managed data once there's more than one real exam with a real blueprint to justify the CRUD UI.
- **Timer**: countdown from the blueprint's duration, auto-submits the test at zero.
- **Test-taking screen**: select-and-move-on only — no instant correct/wrong feedback (that's Practice's job). A question-navigator grid shows answered / unanswered / marked-for-review state per question and lets the user jump directly to any of them. A "Mark for Review" action per question, separate from answering it. A persistent Submit action that warns if there are unanswered questions before confirming.
- **Result/Review screen**: overall score with negative marking shown explicitly (e.g. "142 / 200 — 71 correct, 12 wrong, 17 unattempted"), a subject-wise (section) breakdown, time taken vs. allotted, and a full per-question review list reusing the same expandable-card pattern already built for Revise/Summary.
- **Local data model (new tables, not yet created)**: `mock_test_attempts` + `mock_test_attempt_results`, structurally similar to `practice_sessions`/`practice_session_results` but kept **separate** rather than unified — a mock test attempt needs `durationSeconds`, `timeTakenSeconds`, `marksScored` (fractional, since negative marking isn't whole numbers), `markedForReview`, and a per-subject breakdown, none of which apply to a Practice session. Forcing one schema to cover both would mean a pile of nullable mock-test-only columns on every Practice row.

### Sequencing recommendation

Mock Test should draw from the **real** synced question pool, not the 4 hardcoded mock questions `quiz.tsx` still uses today — a "mock test" built on the same tiny hardcoded set as Practice's placeholder Quiz would undercut the entire point of simulating a real exam. Recommended order: (1) finish wiring Practice's screens (Subject/Topic/Level/Quiz) to the real locally-synced question data — already tracked as outstanding Phase 3 work — **then** (2) build Mock Test on top of that real data path, reusing as much of the sync/local-DB layer as possible. Flagging this dependency here so it's an explicit call, not something discovered mid-build; happy to reorder if there's a reason to build the Mock Test shell first against mock data and wire it to real data alongside Practice.

### Not yet decided / explicitly out of scope for v1

- Sectional-only mock tests (timing one subject alone) vs. full-paper only — not discussed yet, default assumption is full-paper first.
- Any cross-user comparison (percentile, rank, "X students attempted this") — requires user accounts, which are explicitly deferred to v1.1 (TICKET-605) in the existing roadmap. Not feasible before then regardless of Mock Test's own timeline.
- Retaking the *same* generated test to compare scores — not meaningful under the on-the-fly composition decision above (each attempt is freshly generated); revisit if/when curated fixed sets are added.

### Build summary

- **Navigation restructure** — tab bar became **Home · Practice · Mock Test · Progress · More**. Revise's screen (`app/(tabs)/revise.tsx`) moved to a root-level pushed screen (`app/revise.tsx`, registered as a `Stack.Screen` in the root `_layout.tsx`) rather than staying inside the `(tabs)` group with a hidden tab — this gives it a real back button and hides the tab bar while viewing it, matching how a "drill in for detail" screen should behave, rather than the more awkward `href: null` hidden-tab approach. It now takes an `initialTab` param so Home's two new summary cards ("Bookmarked" / "Wrong Answers", both reading real counts via `useBookmarks()`/a new shared `practice/wrongAnswers.ts` helper) can deep-link straight to the right segment.
- **Blueprint config** (`mobile/src/mockTest/blueprints.ts`): hardcoded per-exam pattern (subject-wise question counts, duration, marking scheme) keyed by exam code, exactly as planned. SSC_CGL: 25 Quant + 25 Reasoning + 25 English + 25 GA, 60 min, +2/−0.5.
- **New query/data layer** (`mobile/src/db/mockTest.ts`): `getSectionAvailability()` (real achievable counts per section, capped to what's actually synced — shown honestly on the Start screen rather than claiming the full blueprint target), `buildMockTestQuestions()` (assembles the shuffled real question set per section), `insertMockTestAttempt()`/`getMockTestAttempt()`/`loadMockTestAttempts()` against the new `mock_test_attempts`/`mock_test_attempt_results` tables (added to `db/schema.ts` exactly as planned, migration `0002_noisy_riptide.sql`).
- **Four screens built** under `app/(tabs)/mock-test/` (own nested Stack, mirroring Practice's pattern): landing (real synced exams with a blueprint), Start (real honest availability, e.g. "Only 81 of the usual 100 questions are available today", marking-scheme summary, instructions), the timed test-taking screen (countdown timer, no instant feedback, Mark for Review, a Question Navigator grid modal with answered/marked/current color-coding, Previous/Next, Exit and Submit confirmations), and Result (score with real negative marking applied, correct/wrong/unattempted counts, section-wise breakdown, full per-question review reusing the Revise/Summary expandable-card pattern).
- **Real bug found and fixed during verification**: submitting an attempt took ~7 seconds with no loading indicator, because `insertMockTestAttempt` awaited one `tx.insert(...)` per question sequentially (81+ round trips) — looked broken, wasn't. Diagnosed the same way as the earlier sync slowdown (temporary `console.log`s + `adb logcat`, confirmed it eventually resolved rather than hanging forever). Fixed by batching into a single `tx.insert(mockTestAttemptResults).values([...])` call plus adding a real "Submitting your test…" full-screen `ActivityIndicator` overlay so the wait (now much shorter) is never silent. Re-verified after the fix: submit-to-result-screen dropped to ~2-3 seconds.
- **Verified on-device, end-to-end**: landing → Start (real 81-of-100 availability matching actual synced per-subject counts) → a live timed test (countdown confirmed ticking, answering showed only a neutral "selected" state with zero right/wrong color, Mark for Review persisted through navigation, Question Navigator grid opened and correctly color-coded answered/marked/current, jumping via the grid worked, Submit confirmation showed accurate unanswered/marked counts) → Result screen showing correct negative-marking arithmetic (e.g. a single wrong answer correctly scored as `-0.5 / 162`) and the right question flagged wrong in the per-question review list.

---

## 7. Exam Structure Model — Stages, Papers, Sections (fully admin-managed)

**Status: design agreed 2026-08-15, backend in progress.** This section supersedes the hardcoded `mobile/src/mockTest/blueprints.ts` and the implicit "subjects are shown for every exam" behaviour in Practice.

### The gap this closes

The Content Model Redesign (Section 5) deliberately made Subjects and Topics **global**, which is still correct — ~70% of the syllabus is shared across exams. But it left **no relation between an exam and the subjects it actually covers**. The only path from an exam to a subject ran through content:

> Exam → `question_exam_types` → Question → Topic → Subject

That meant a subject "belonged to" an exam purely as a side effect of some question happening to be tagged to it. Three concrete consequences:

1. **Practice showed every subject for every exam.** `getSubjectStats()` returns all subjects and only scopes the *count* by exam, so SSC CGL listed Computer Knowledge and General Science — not part of its pattern.
2. **The relation already existed, hardcoded.** `blueprints.ts` encoded SSC_CGL → 4 subjects with target counts, in mobile TypeScript, **matched by subject name string**. Renaming a subject in the admin UI (a two-click operation since Phase 2) would silently empty a mock-test section in a feature that computes real scores.
3. **Only SSC_CGL had a blueprint**, so activating any other exam would have produced a Mock Test tab that cannot build a test.

### The model

Real government exams are not flat. UPSC has Prelims (2 papers, one qualifying), Mains (9 descriptive papers) and an Interview; SSC CGL Tier 2 has multiple papers with per-module marking; IBPS PO enforces **per-section timing**. Four levels cover all of them:

**Exam → Stage → Paper → Section → Subject(s)**

- **Stage** — Prelims / Mains / Interview, or Tier 1 / Tier 2. Ordered.
- **Paper** — the atomic timed sitting, and the unit a mock test is generated from.
- **Section** — a block within a paper, carrying its question count and optionally its own timer and marking.
- **Section → Subject is many-to-many** — UPSC's single "General Studies" section spans History, Polity, Geography, Economy and Science, while SSC's "Quantitative Aptitude" section maps to exactly one subject.

Two fields carry most of the domain weight:

- **`paper_sections.duration_minutes` nullable** — `NULL` means the section shares the paper's overall time (SSC); a value means the section is separately timed and enforced (IBPS).
- **`exam_papers.paper_type` → `paper_types.is_mockable`** — lets UPSC Mains be shown honestly as nine descriptive papers rather than having the app attempt to generate an MCQ test from them.

Marking inherits: `paper_sections.marks_correct`/`marks_wrong` are `NULL` by default and fall back to the paper's values; setting them overrides for that section (SSC CGL Tier 2 needs this).

### Nothing exam-domain lives in code

Everything an aspirant sees is admin-editable data, added at any time without a release:

| Was hardcoded | Now |
|---|---|
| `blueprints.ts` per-exam pattern | `exam_stages` / `exam_papers` / `paper_sections` / `section_subjects` |
| `"easy" \| "medium" \| "hard"` union in mobile types, UI labels/icons/colours, admin dropdown | `difficulty_levels` table (code, label, order, colour, icon, active) — `questions.difficulty` becomes an FK |
| `paper_type` as an enum | `paper_types` lookup table |
| `constants/subjects.ts` icon/colour keyed by subject **name** | `subjects.icon` / `color` / `color_bg` columns |
| No ordering at all on subjects/topics | `display_order` on both |

The backend already accepted any `difficulty` string (free-form `VARCHAR(20)`, no enum) — only the clients were rigid, so a value outside the three saved fine and then rendered nowhere. The FK closes that: typos become errors instead of invisible questions.

**The rule this places on the mobile app:** render whatever arrives. No exhaustive unions, no name-keyed lookup tables — colours and icons come from the row, with a neutral fallback. A section added next year is a data change, not a release.

### Deliberate boundary

App structure stays in code — the tab layout, the drill-down flow, the quiz mechanics. Those are product decisions, not exam data. "Nothing hardcoded" means **no exam-domain fact lives in code**, which keeps the model honest without turning the app into a CMS.

**Versioning:** `effective_from` and `version_label` on the stage from the start, since exam patterns genuinely change year to year (SSC CGL Tier 2 was restructured in 2022) and retrofitting would be the expensive path.

**Deferred:** per-section difficulty mixes (e.g. 30% easy / 50% medium / 20% hard). The schema extends to it with one more table; inventing it now would be guessing at a requirement.

### Phased rollout

- **Phase A — Schema & backend: ✅ done (2026-08-15).** Migration V3, entities, repositories, DTOs, services and controllers for stages/papers/sections plus difficulty levels and paper types; `questions.difficulty` promoted to a foreign key. 48 tests passing. Report: `reports/exam-structure-phase-a-backend.md`.
- **Phase B — Admin UI: ✅ done (2026-08-15).** Nested Stage → Paper → Section → Subjects editor at `/exams/:code/structure`, CRUD for difficulty levels and paper types, ordering/styling on subjects and topics, and the removal of the last hardcoded `DIFFICULTIES` list from the admin. Report: `reports/exam-structure-phase-b-admin.md`.
- **Phase C — Mobile: ✅ done (2026-08-15).** `blueprints.ts` deleted; structure, difficulty levels and subject styling all synced (local migration `0003`, new bulk endpoint `GET /api/exam-structures`). Sections resolve subjects by id rather than name; Practice is scoped to the real syllabus (SSC CGL now shows 4 subjects, not all 6) with a show-everything fallback for exams that have no structure yet; Mock Test lists papers and skips non-mockable ones. Verified on-device, including adding a difficulty level through the API alone and watching it appear with no code change. **Limitation:** per-section timers are displayed and summed but not individually enforced. Report: `reports/exam-structure-phase-c-mobile.md`.
- **Phase D — Exam Pattern screen (optional).** User-facing view of the full structure; nearly free once the data exists.

### Enterprise constraints applied

- **Speed** — the structure is a 4-level tree, which is exactly the shape that produced the earlier ~59s N+1 sync. Every FK is indexed, and the full-structure read uses join/batch fetch rather than lazy traversal. Reference data stays small enough for the existing "refetch and upsert the whole set" sync pattern.
- **Accuracy** — FK constraints on every relation; `UNIQUE` on `(exam_code, name)`, `(stage_id, name)`, `(paper_id, name)`; `questions.difficulty` promoted from free text to an FK (verified first: all 113 live rows hold clean `easy`/`medium`/`hard`). Structural children (`stage → paper → section`) cascade on delete because they are pure composition and meaningless alone; exams do **not** cascade into stages, so deleting an exam with a pattern fails loudly instead of silently discarding it.
- **Quality** — SSC CGL Tier 1 is seeded to reproduce the current hardcoded blueprint **exactly**, so mobile cannot regress; IBPS PO Prelims is seeded alongside it specifically to exercise per-section timing before the model is trusted. Integration tests cover the new endpoints and the marking-inheritance rules.
