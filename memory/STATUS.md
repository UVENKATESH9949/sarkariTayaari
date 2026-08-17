# Project Status — Resume Point

**Last updated:** 2026-08-17. Accounts + progress sync (v1.1) shipped, bookmark sync shipped, offline indicator shipped. The product-facing feature set for V1.0/V1.1 is essentially complete; what's left is Sprint 5 (QA/perf/release prep) — see `reports/TICKET-STATUS.md`.

This file exists so any future session (or teammate) can pick up exactly where things stopped, without re-reading the entire `offline-exam-app-requirements.md` history. Update this file every time work pauses for more than a few minutes, or at the end of a work session.

**Related, newer files worth knowing about:** `reports/TICKET-STATUS.md` (every ticket ever, one file, with status), `reports/architecture-decisions.md` (ADRs), `reports/open-questions.md` (consolidated open business/technical decisions). This file stays the single "where do I resume" entry point; those three hold the detail so this one doesn't have to.

## Right now — no work in progress

**Accounts, progress sync, and bookmark sync are all built and tested. The offline connectivity indicator is built.** Nothing is mid-flight. Nothing from today's session has been committed to git yet — that hasn't been requested.

### What's done and verified (most recent first)

- **Bookmark sync** — no report yet (see `reports/TICKET-STATUS.md`, "This session"). Bookmarks (add/remove) now sync across devices for signed-in users, resolved by last-write-wins on a timestamp — the first per-user data type in this project that isn't append-only, so it needed real conflict resolution instead of just an idempotent upload.
  - Backend: `V7__user_bookmarks.sql`, `UserBookmark` entity, `BookmarkService`, `BookmarkController`, 5 passing integration tests against the real Neon DB.
  - **Real bug hit and fixed:** a JPA `@IdClass` composite primary key (`user_id` + `question_id`) caused genuine 500 errors under test (Hibernate's `isNew()` entity-state detection misbehaves for a derived composite id). Switched to a synthetic string id (`userId:questionId`), matching the existing convention already used for `user_practice_session_results` — see `reports/architecture-decisions.md` ADR-005.
  - **Real bug hit and fixed, unrelated to the app itself:** editing a migration file *after* it had already been applied once during testing caused a Flyway checksum-mismatch error on every subsequent boot. Fixed by connecting directly to the dev Postgres instance (a throwaway JDBC one-off, since `psql` isn't installed) and reverting the bad migration application, then letting Flyway re-apply the corrected file cleanly.
  - Mobile: `bookmarks` table gained `isDeleted`/`isSynced`/`updatedAt` columns (tombstone soft-delete, not a hard delete, so an offline removal still has something to upload later). The generated Drizzle migration needed a manual fix — `updated_at NOT NULL` with no default would fail on any device with existing bookmark rows.
  - Wired into `authContext.tsx` (full sync on sign-in, upload-only flush on backgrounding/sign-out) and `BookmarksProvider` — which had the *exact same* staleness bug fixed for session history months ago (never re-read after a restore); fixed the same way, with `progressVersion` in its effect deps.

- **Offline connectivity indicator — closes TICKET-405.** No report yet. `NetworkStatusContext` wraps `@react-native-community/netinfo`; a persistent, calm top banner ("You're offline — using downloaded content") shows only while genuinely offline. `SyncContext.refresh()` now returns immediately without attempting a network call while offline (previously it would attempt and then report a confusing "sync failed" for a fully-expected condition), and fires an immediate forced sync the moment connectivity returns rather than waiting for the next scheduled check.
  - **Real detour:** verifying this required a live-reloadable build, and the emulator turned out to be running a stale, fully-disconnected **release** APK the whole time (JS bundle baked in, no Metro connection at all) — every earlier "verification" in the same sitting had actually been checking a dev-client bundle that later got silently replaced. Built a debug dev-client via `npx expo run:android` (~24 min native build) to get real verification back. Worth remembering: if on-device verification ever looks like it's "not picking up changes," check `dumpsys package <app> | grep -i debuggable` and whether `assets/index.android.bundle` exists in the installed APK before assuming the code is wrong.

- **Practice screen redesign** — the 2-column exam grid was replaced with a single-column list (matching every other list in the app), the previously-decorative search box now actually filters, and each row shows a real "X questions synced" subtitle instead of just a name.
  - **Regression fixed along the way:** the TICKET-941 animation wrapper (`FadeInItem`) had silently broken the grid's `width: "48%"` sizing, because the wrapper — not the card — became the grid's direct child. `FadeInItem` now takes a `style` prop so layout stays on the right node; this is a real, easy-to-repeat trap for any future wrapper component.

- **Motion system extended to Home and Progress** — both had shipped with plain `Pressable` and a raw-width progress bar even after TICKET-941 landed elsewhere. Now use `PressableScale`/`AnimatedProgressBar` like every other screen.

- **Accounts + progress sync (v1.1, TICKET-601–605)** — see git commits "Add user accounts and token auth (step 1)", "Add progress upload and restore (step 2)", "Add accounts and progress backup (step 3)". No dedicated report file. Opaque revocable bearer tokens (not JWT — see ADR-001); practice sessions and mock attempts upload/restore correctly, verified via a real device wipe.
  - **Two real bugs found and fixed** while building this: `GET /api/auth/me` 500'd for every valid token (a `LazyInitializationException` on `UserToken.user`, since `open-in-view: false`) — fixed with a join-fetch query. And `login()` was timing-unsafe (only hashed a password when the user existed) — fixed with a dummy-hash comparison so failure timing is identical either way.

- **Documentation reorganized.** `reports/` split into sprint/phase subfolders (`01-sprint-1-backend-foundation/` through `05-exam-structure-model/`), plus `TICKET-STATUS.md` (every ticket, one file), `architecture-decisions.md` (8 ADRs), and `open-questions.md` (consolidated TBDs). A `sdlc-documentation.md` was briefly created at the project root, found to be ~80% a restatement of `offline-exam-app-requirements.md`/`preparation-os-requirements.md` in a different shape, and deleted — only its genuinely new content (the ADRs and gaps list) survived, in the two files just named. A `reports/SESSION-LOG.md` was also briefly created duplicating *this file*, and was deleted the same way once this file was rediscovered.

- **Exam ↔ Subject syllabus made explicit** — full report: `reports/exam-subject-syllabus.md`. The many-to-many already existed, but **only as a derivation through paper sections**, so an exam had no syllabus until someone authored its full pattern — SSC CHSL was active with zero subjects and Practice showed all seven for it.
  - New `exam_subjects` table (migration `V4`, backfilled from sections). The two mappings now answer different questions and both are kept: `exam_subjects` = what the exam covers (Practice browsing); `section_subjects` = what a section draws from (mock-test selection).
  - **They can't diverge:** saving a section auto-adds its subjects to the syllabus, so the syllabus is always a superset. Admins can also add syllabus subjects directly, which is what makes a pattern-free exam possible.
  - `GET/PUT /api/exams/{code}/subjects`; `SubjectResponse` gained `examCodes` (reverse view); `/api/exam-structures` carries `syllabusSubjects` for mobile sync (local migration `0005`).
  - Admin: a **Syllabus** card on the exam structure page, and an **Exams** column on the Subjects list.
  - Verified: `Quantitative Aptitude -> IBPS_PO, SSC_CGL, SSC_CHSL`. SSC CHSL was given a 4-subject syllabus **without any stage/paper/section**, and the app now shows exactly those four instead of all seven. 48 tests pass, SSC CGL unchanged (26/20/15/21).
  - **Data note:** SSC CHSL's syllabus was set to Quant/Reasoning/English/GA during verification — correct for the real exam, but adjust in the admin if you'd rather it differ.

- **Delta sync — content delivery closed** — full report: `reports/delta-sync.md`. `runDeltaSync()` had been fully built since TICKET-303 and **never called anywhere**, so a device that finished its first sync never received anything again.
  - **TICKET-305**: delta sync now runs on launch and on foreground, reporting through `isRefreshing` rather than `status` so it never raises the blocking progress screen. A 15-minute staleness window guards the automatic triggers.
  - **TICKET-306**: pull-to-refresh on Home, forced so it bypasses that window.
  - **TICKET-304**: `sync_meta` gained `resume_page`/`resume_started_at` (migration `0004`); an interrupted initial sync resumes from the next unwritten page.
  - **Correctness bug fixed:** both syncs recorded the watermark *after* finishing, so anything edited mid-sync fell into the gap and was never picked up again. They now record the sync's **start** time.
  - **Stale-screen fix found during verification:** data reached SQLite but mounted screens kept showing old values, because tab/stack state is preserved and they only queried on mount. `SyncContext` now exposes a `syncVersion` counter that Practice/Subjects/Topics/Levels/Mock Test include in their effect deps.
  - **Verified with storage intact**: a difficulty level added through the API appeared after pull-to-refresh; deleting it server-side removed it again; and the specific stale case (screen mounted *before* the change) now updates correctly.
  - **Not independently exercised:** the launch/foreground triggers (they share the verified `refresh()` path) and TICKET-304's resume under a real interruption.

- **Exam Structure Phase C — Mobile** — full report: `reports/exam-structure-phase-c-mobile.md`. `mobile/src/mockTest/blueprints.ts` is **deleted**; exam patterns, difficulty levels and subject styling are all synced data now.
  - Local schema gained the structure tables plus `difficulty_levels`/`paper_types` (migration `0003`). New backend endpoint `GET /api/exam-structures` returns every active exam's structure in one request. Structure is **replaced wholesale** each sync so server-side deletions don't leave orphans; subjects/topics stay upserts because questions reference them.
  - **Sections resolve subjects by id, not name** — renaming a subject can no longer silently empty a mock-test section.
  - **Practice is scoped to the real syllabus**: SSC CGL now shows 4 subjects instead of all 6. An exam with no structure falls back to showing everything rather than an empty screen.
  - Mock Test lists **papers** (not exams) and skips non-mockable ones.
  - Verified on-device via `uiautomator` text dumps. **The decisive test:** a difficulty level created through the API only appeared in the app after a re-sync, correctly ordered and styled, with no code change — then deleted again.
  - **Known limitation:** per-section timers are not enforced. The total duration is correct and section limits are displayed, but the test runs one overall countdown. True sectional enforcement needs section locking and auto-advance.

- **Exam Structure Phase B — Admin UI** — full report: `reports/exam-structure-phase-b-admin.md`. A nested **Stage → Paper → Section → Subjects** editor at `/exams/:code/structure` (reached from a Structure action on each Exams row), plus CRUD pages for **Difficulty Levels** (with colour/icon and a live preview badge) and **Paper Types** (with the mock-testable flag).
  - Sections show **"shares paper"** vs their own minutes, and marking shows the resolved value with an **"inherited"** note — both invisible in the raw data otherwise. The section form uses the paper's values as placeholders so the fallback is obvious while editing.
  - Subjects gained display order/icon/colours; topics gained display order (and `TopicService` now actually orders by it — both lists were previously unordered).
  - **`DIFFICULTIES` is gone from the admin.** The questions filter, question form and bulk-import validator all read live levels from the API, and the difficulty badge takes its colour from the level row instead of a hardcoded class map.
  - Verified in a real browser: both seeded structures render correctly (including IBPS's per-section 20-minute timers), and a full create round-trip driven through the editor produced `UI Verify Section 20 25 min +2 / −0.5 inherited`, with the delete cascade confirmed via the API. No leftovers.

- **Exam Structure Phase A — schema + backend** — full report: `reports/exam-structure-phase-a-backend.md`. Closes a real modelling gap: there was **no relation between an exam and the subjects it covers**, so Practice listed every subject for every exam, and the relation that did exist was hardcoded in `mobile/src/mockTest/blueprints.ts` **keyed by subject name** — meaning a rename in the admin UI would silently empty a mock-test section. The model is now **Exam → Stage → Paper → Section → Subject(s)**, handling UPSC-style multi-stage exams, qualifying and descriptive papers, and IBPS-style per-section timing.
  - Migration V3 adds `difficulty_levels`, `paper_types`, `exam_stages`, `exam_papers`, `paper_sections`, `section_subjects`, plus ordering/styling columns on subjects and topics, and promotes `questions.difficulty` from a free-form string to a **foreign key** (checked first: all 113 rows were clean).
  - **Nothing exam-domain is hardcoded any more** — patterns, difficulty levels, paper types, subject icons/colours and ordering are all admin-editable data. App structure (tabs, drill-down, quiz mechanics) deliberately stays in code.
  - Marking inheritance (section falls back to paper) is resolved **server-side** and returned as `effectiveMarksCorrect`/`effectiveMarksWrong`, so no client reimplements the rule.
  - Seeded SSC CGL Tier 1 to reproduce the old hardcoded blueprint exactly, and IBPS PO Prelims to exercise sectional timing.
  - **48 tests pass** (35 existing unchanged + 13 new). Verified live: runtime add of a stage/paper/sections via the API, cascade delete with zero orphans, and a clean 400 on an unknown difficulty.

- **Phase 2 — Admin UI rework** — full report: `reports/content-model-phase2-admin.md`. The admin app had been left behind by the Phase 1 backend redesign and was **actively broken**, not just outdated: the questions list rendered fields that no longer exist (blank columns for all 112 rows), the question form posted `topic`/`examType` where the backend now expects `topicId`/`examCodes` (so creating a question could not succeed at all), and bulk import's validator rejected correctly-shaped new-model JSON. Since bulk import is the only practical content-entry path, the content pipeline was blocked.
  - New CRUD pages for **Exams** (with Cloudinary image upload, active toggle, display order), **Subjects**, **Topics**, **Languages** (upgraded from read-only), behind a grouped sidebar.
  - **Questions list and form** reworked: real Subject/Topic/exam-code columns, dropdown filters fed from live data, cascading Subject → Topic pickers, multi-select exam tags, premium flag, and the 1+N save flow (metadata `PUT`, then one `PUT` per translation language).
  - **Correct answer became an A–D dropdown** showing each option's text — this closes the data-quality hole that produced the one malformed row (`correctAnswer: "12"`). The edit form detects such rows and normalises them on save.
  - **Bulk import** validator reworked to `subjectName`/`topicName`/`examCodes`, and it now validates exam codes against the real exam list.
  - Backend: `spring.servlet.multipart.max-file-size: 5MB` (the 1MB default rejects ordinary exam artwork and fails as an unmapped 500).
- **Mock Test feature** — landing, Start screen with honest per-section availability, timed test-taking screen, Result screen with real negative marking. A ~7s silent submit was diagnosed and fixed via batched inserts plus a loading overlay.
- **Navigation restructure** — tab bar is **Home · Practice · Mock Test · Progress · More**. Revise moved to a root-level pushed screen reached from Home.
- **Practice wired to real synced data** — Subject/Topic/Level/Quiz all read from local SQLite.
- **Backend sync N+1 perf fix** — full sync went from ~59s to ~3.5s.

## Next up (in recommended order)

*(Cleaned up 2026-08-17 — this section previously had two overlapping, partly-stale numbered lists merged together. Rewritten as one, current as of today.)*

1. **Confirm whether the admin console has any authentication at all.** Not verified either way — it manages real content and image uploads, so this is the single highest-priority open question. See `reports/open-questions.md`.
2. **Rotate the Cloudinary secret** that was briefly exposed in git history earlier in the project (already scrubbed from history; rotation is the only fully safe remediation left).
3. **Sprint 5 — QA, performance, release prep (TICKET-501–506).** Nothing in it has been started: load test at 10k+ questions, low-end device testing, crash reporting/analytics, a real signed release build, beta recruitment. This is the real next block of work on the shipped product, ahead of anything below.
4. **Decide production hosting** (cloud provider + database strategy — the backend currently only runs on a developer laptop).
5. **Reconcile TICKET-702/703 (port BrainBlitz's Readiness Score/Persona) against the Future Vision doc's Epic C (Preparation Twin & Readiness v2)** — very likely the same feature described in two different documents; building both independently would duplicate work.
6. **Author real content.** The whole pipeline works end to end — admin authoring → backend → delta sync → device. Real sub-topics per subject are the remaining bottleneck; every subject still has exactly one topic called "General".
7. **Define structures for the other exams.** SSC_CHSL is active with no structure (its Mock Test can't be built, and Practice falls back to all subjects). Several exams exist but are inactive, which is why mobile mainly shows SSC CGL and IBPS PO.
8. **Optional now-cheap wins:** enforce per-section timers in Mock Test (needs section locking + auto-advance), and Phase D's Exam Pattern screen (the whole tree is already synced locally).
9. **Only after Sprint 5**, start on the Future Vision epics — in the order that document itself recommends: A → B → C → D (the dependent "coach" line), since C and D both need real signal that only exists once A and B are producing it.

## Deferred / known leftovers

- **The `memory/` folder restructure** — splitting `offline-exam-app-requirements.md` (now very large) into focused topic pages here. Explicitly deferred by the user's own instruction ("STATUS.md now, split later").
- **Test artifacts in the live Neon DB**: `Automated Test Subject`, `Automated Test Topic`, and an `AUTOMATED_TEST` exam left behind by the Phase 1 backend test suite. Harmless, but they show up in every admin dropdown.
- **Two test PNGs in Cloudinary** from verifying the upload path — deletable from the dashboard.
- `dumpResume*.xml` / `dump*.xml` files in the project root and `mobile/` are leftover `uiautomator` UI dumps from device debugging, not project artifacts.

## Security note

The Cloudinary `api-secret` was briefly written into `application-local.yml.example` (the shared template) rather than the gitignored `application-local.yml`. It has been moved and the template restored to placeholders. This project root is not a git repository so it was never committed, but **rotating that secret in the Cloudinary dashboard is still worth doing.**

## Environment notes (recurring, worth knowing up front)

- **Config changes need a backend restart.** `mvn spring-boot:run` has no live reload here — edits to `application.yml` or `application-local.yml` do nothing until the process is killed and restarted. This cost real time when the Cloudinary credentials appeared not to work.
- **The admin app must be served from `http://localhost:5173` exactly** — CORS is pinned to that single origin, and `127.0.0.1:5173` counts as a different one.
- **Playwright + Chromium are installed** and are the fastest way to verify admin pages: load the page, capture console errors and failed requests, screenshot. Global install, so scripts need `$env:NODE_PATH = (npm root -g)` to resolve `require("playwright")`.
- **Do not redirect `adb exec-out screencap -p` through PowerShell** — it corrupts the binary with a BOM. Use `adb shell screencap -p /sdcard/x.png` then `adb pull`.
- **LAN IP changes frequently** — always re-check `ipconfig` before constructing the `exp://<ip>:8081` deep link; a stale IP causes either a bundling hang or a real Expo Go crash.
- **Backend and Metro both crash unprompted sometimes** with no visible error — always check both (`:8080/api/health`, `:8081/status`) before assuming they're still running.
- **Emulator cold-boot can get stuck on a black screen** even after `sys.boot_completed=1`. Fix: `adb reboot` and wait for a *second* `sys.boot_completed=1`, then give it a few extra seconds.
- **Deep-linking via `am start -a android.intent.action.VIEW -d "exp://..."` can silently no-op** right after a fresh boot/unlock — retry with the package name appended (`... "exp://<ip>:8081" host.exp.exponent`).
- **Expo Go's floating dev-menu bubble** overlaps the Mock Test screen's Question Navigator button. Dev-mode-only artifact, not a real app bug.
- **uiautomator dump before tapping** — coordinate-guessing from screenshots repeatedly fails due to scale mismatches. Always dump and grep for exact `bounds`.
