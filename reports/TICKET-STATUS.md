# Ticket Status — every ticket, one file

**Last updated:** 2026-08-24
**Purpose:** answer "where are we" in one place, without opening five different documents.

**Legend**

| Symbol | Meaning |
|---|---|
| ✅ | Done and verified |
| 🔵 | Done, but with a known verification gap (implementation exists, one specific scenario wasn't exercised) |
| ⚠️ | Partially done |
| ⬜ | Not started |

## Top-line summary

| Group | Tickets | Done | Partial | Not started |
|---|---|---|---|---|
| Sprint 1 — Backend Foundation | 101–110 | 10 | 0 | 0 |
| Sprint 2 — Mobile Scaffold | 201–205 | 5 | 0 | 0 |
| Sprint 3 — Sync Engine | 301–307 | 7 | 0 | 0 |
| Sprint 4 — Practice Flow | 401–405 | 5 | 0 | 0 |
| Sprint 5 — QA/Perf/Release | 501–506 | 2 | 1 | 3 |
| V1.1 — Accounts + Progress Sync | 601–605 | 5 | 0 | 0 |
| V1.2 — Scale & Polish | 701–706 | 0 | 2 | 4 |
| Content Model Redesign (801–810 + 2 un-ticketed phases) | — | 4 phases | 0 | 0 |
| Exam Structure Model | 901–936 | 34 | 0 | 0 |
| Mock Test Engine (un-ticketed) | — | 1 | 0 | 0 |
| Motion System (941) | 941 | 1 | 0 | 0 |
| Bookmark Sync + Offline Indicator (this session, unticketed) | — | 2 | 0 | 0 |
| Admin Authentication (this session, unticketed) | — | 1 | 0 | 0 |
| Non-Blocking Startup + Hybrid Online/Local Sync (this session, unticketed) | — | 1 | 0 | 0 |
| Cloud Run Backend Deployment (unticketed) | — | 1 | 0 | 0 |
| GitHub Actions APK Builds (unticketed; also moves TICKET-505 to partial) | — | 1 | 0 | 0 |
| Black + Blue Dark Theme (this session, unticketed) | — | 1 | 0 | 0 |
| Resilient Initial Sync (this session, unticketed) | — | 1 | 0 | 0 |
| Practice/Mock Test Exit Guard (this session, unticketed) | — | 1 | 0 | 0 |
| **Current product total** | | **~83** | **2** | **8** |
| Future Vision — Personal Preparation OS | 1001–2003 (11 epics) | 0 | 0 | 63 |

**Bottom line: the shipped product is essentially feature-complete for V1.0/V1.1. What's left before it's release-ready is entirely Sprint 5 (QA/perf/release prep), where 501 and 503 are done and 505 is now half done — a real upload keystore and a signed-build pipeline exist; Play Console does not. Still untouched in Sprint 5: low-end device testing (502), branding confirmation (504), and beta recruitment (506). The Future Vision document (63 tickets) hasn't been touched at all, by design — it's explicitly a draft awaiting a greenlight.**

---

## Sprint 1 — Backend Foundation

| Ticket | Task | Status | Report |
|---|---|---|---|
| — | Backend framework scaffold (Spring Boot 3.3.4, Java 21, package layout) | ✅ | [01-sprint-1-backend-foundation/00-backend-framework-setup.md](./01-sprint-1-backend-foundation/00-backend-framework-setup.md) |
| 101 | `questions`/`languages`/`question_translations` schema | ✅ | [TICKET-101.md](./01-sprint-1-backend-foundation/TICKET-101.md) |
| 102 | `GET /api/questions/sync` endpoint | ✅ | [TICKET-102-103-104.md](./01-sprint-1-backend-foundation/TICKET-102-103-104.md) |
| 103 | Sync pagination (page size 500, capped at 1000) | ✅ | same report |
| 104 | Automated integration tests for sync endpoint | ✅ | same report |
| 105 | Seed 100 bilingual sample questions | ✅ | [TICKET-105.md](./01-sprint-1-backend-foundation/TICKET-105.md) |
| 106 | CRUD REST API for questions + translations, bulk import/delete | ✅ | [TICKET-106.md](./01-sprint-1-backend-foundation/TICKET-106.md) |
| 107 | Admin UI v1 (React, list/create/edit/bulk-import) | ✅ | [TICKET-107.md](./01-sprint-1-backend-foundation/TICKET-107.md) |
| 108 | Admin UI polish + bulk-import hardening | ✅ | [TICKET-108.md](./01-sprint-1-backend-foundation/TICKET-108.md) |
| 109 | Bulk import — review before import, per-item failure handling | ✅ | [TICKET-109.md](./01-sprint-1-backend-foundation/TICKET-109.md) |
| 110 | Automated integration test suite (self-cleaning against real dev DB) | ✅ | [TICKET-110.md](./01-sprint-1-backend-foundation/TICKET-110.md) |

## Sprint 2 — Mobile Scaffold

| Ticket | Task | Status | Report |
|---|---|---|---|
| 201 | Expo React Native init, Expo Router navigation | ✅ | [TICKET-201.md](./02-sprint-2-mobile-scaffold/TICKET-201.md) |
| 202 | expo-sqlite + Drizzle ORM, local schema | ✅ | [TICKET-202.md](./02-sprint-2-mobile-scaffold/TICKET-202.md) |
| 203 | Local `sync_meta` table + helpers | ✅ | [TICKET-203.md](./02-sprint-2-mobile-scaffold/TICKET-203.md) |
| 204 | Basic app shell (home + exam selection, static) | ✅ | [TICKET-204.md](./02-sprint-2-mobile-scaffold/TICKET-204.md) |
| 205 | API client wrapper (`apiFetch`, typed endpoints) | ✅ | [TICKET-205.md](./02-sprint-2-mobile-scaffold/TICKET-205.md) |

## Sprint 3 — Sync Engine

| Ticket | Task | Status | Report |
|---|---|---|---|
| 301 | Initial full-sync flow, 2-min soft timeout | ✅ | [TICKET-301.md](./03-sprint-3-sync-engine/TICKET-301.md) |
| 302 | Sync progress UI (blocking bar → background banner) | ✅ | [TICKET-302.md](./03-sprint-3-sync-engine/TICKET-302.md) |
| 303 | Delta sync flow (upsert changed, delete soft-deleted) | ✅ | [TICKET-303.md](./03-sprint-3-sync-engine/TICKET-303.md) |
| 304 | Resume an interrupted sync from last committed page | 🔵 | [delta-sync.md](./03-sprint-3-sync-engine/delta-sync.md) — implemented (`resume_page`/`resume_started_at`, migration 0004); the real mid-sync-network-drop scenario was never fault-injected/exercised |
| 305 | Trigger delta sync on foreground/launch | ✅ | same report |
| 306 | Manual pull-to-refresh | ✅ | same report |
| 307 | Partial-data guard for sections not yet synced | ✅ | **no dedicated report** — confirmed by reading `db/mockTest.ts`'s `getSectionAvailability()` + the Mock Test Start screen directly (2026-08-17); `delta-sync.md` (2026-08-15) still listed this as outstanding at the time it was written |

## Sprint 4 — Practice Flow

Now documented — see [04-content-model-redesign/content-model-phase3-mobile-foundation.md](./04-content-model-redesign/content-model-phase3-mobile-foundation.md), which absorbed most of this sprint, and [06-bookmark-sync-and-offline-indicator/offline-indicator.md](./06-bookmark-sync-and-offline-indicator/offline-indicator.md) for 405.

| Ticket | Task | Status | Report |
|---|---|---|---|
| 401 | Question list screen, filtered by exam/topic | ✅ (superseded) | [content-model-phase3-mobile-foundation.md](./04-content-model-redesign/content-model-phase3-mobile-foundation.md) — absorbed into the Content Model Redesign's Subject→Topic→Level drill-down, not built as originally scoped |
| 402 | Quiz/practice screen (show, submit, reveal explanation) | ✅ | [content-model-phase4-mobile-screens.md](./04-content-model-redesign/content-model-phase4-mobile-screens.md) |
| 403 | Topic/difficulty filter UI | ✅ (superseded) | [content-model-phase3-mobile-foundation.md](./04-content-model-redesign/content-model-phase3-mobile-foundation.md) — each drill-down screen (Subject/Topic/Level) *is* the filter now |
| 404 | Store user attempts locally | ✅ | [content-model-phase4-mobile-screens.md](./04-content-model-redesign/content-model-phase4-mobile-screens.md) — `practice_sessions`/`practice_session_results` |
| 405 | Basic offline mode banner/indicator | ✅ **(this session, 2026-08-17)** | [06-bookmark-sync-and-offline-indicator/offline-indicator.md](./06-bookmark-sync-and-offline-indicator/offline-indicator.md) |

## Sprint 5 — QA, Performance, Release Prep

**501 and 503 are done.** This is the real next block of work on the shipped product before it can go to real users.

| Ticket | Task | Status | Report |
|---|---|---|---|
| 501 | Load test with 10,000+ seeded questions | 🔵 Done, real bugs found and fixed; full-sync timing improved but not fully optimized — see report | [12-load-test-data-seeding/load-test-data-seeding.md](./12-load-test-data-seeding/load-test-data-seeding.md) |
| 502 | Test on low-end/throttled device | ⬜ Not started | |
| 503 | Crash reporting (Sentry) + basic analytics events | 🔵 Done, real crash upload not yet verified live — see report | [11-crash-reporting-and-analytics/crash-reporting-and-analytics.md](./11-crash-reporting-and-analytics/crash-reporting-and-analytics.md) |
| 504 | App icon, splash screen, branding polish | ⬜ Status unverified — not confirmed either way this pass |
| 505 | Signed APK/AAB, Play Console internal testing track | ⚠️ Partial — the **signing** half is done and now proven on GitHub: run #4 (2026-08-24) completed successfully and produced a real signed APK artifact. The **Play Console** half is still untouched: no AAB (`bundleRelease`), no developer account, no internal track, no Play App Signing. | [15-github-actions-apk-builds/github-actions-apk-builds.md](./15-github-actions-apk-builds/github-actions-apk-builds.md) |
| 506 | Recruit 10–20 beta testers (Telegram/coaching groups) | ⬜ Not started — the "earlier distribution plan" it references isn't in any available document |

## V1.1 — Write-Back Sync + Progress

Now documented — see [08-v1.1-accounts-and-progress-sync/accounts-and-progress-sync.md](./08-v1.1-accounts-and-progress-sync/accounts-and-progress-sync.md).

| Ticket | Task | Status |
|---|---|---|
| 601 | Backend endpoint to accept a batch of local attempts | ✅ — now `POST /api/progress/sync`, superseding the originally-planned `/api/attempts/sync` shape |
| 602 | Local write-queue (`isSynced` flag, push in background) | ✅ |
| 603 | Conflict handling (dedupe by id — attempts are append-only) | ✅ |
| 604 | User-facing progress screen | ✅ — the Progress tab |
| 605 | Basic auth (tie attempts to a user, not an anonymous device) | ✅ |

## V1.2 — Scale & Polish

| Ticket | Task | Status |
|---|---|---|
| 701 | Load full production question bank (20k–50k+) | ⚠️ Partial — the *volume* target is met (~37,900 questions, 2026-08-19 load test), but it's synthetic/templated load-test content (see TICKET-501), not real editorial/licensed production content. The scale is proven; the content itself still needs authoring. |
| 702 | Port BrainBlitz's Exam Readiness Score to mobile | ⬜ Not started — likely the same feature as the Future Vision doc's Epic C (Preparation Twin & Readiness v2); not yet reconciled as one piece of work, see `reports/open-questions.md` |
| 703 | Port BrainBlitz's Exam Persona feature | ⬜ Not started |
| 704 | Image support for questions/explanations with diagrams | ⚠️ Partial — Cloudinary image upload exists (used for exam card art), but question-body diagram support specifically is untouched |
| 705 | Push notification setup | ⬜ Not started |
| 706 | iOS build + TestFlight | ⬜ Not started |

## Content Model Redesign

| Phase | Task | Status | Report |
|---|---|---|---|
| Phase 1 | Backend schema/API rework (flat topic/exam_type → normalized Exam/Subject/Topic) | ✅ | [content-model-phase1-backend.md](./04-content-model-redesign/content-model-phase1-backend.md) |
| Phase 2 (801–810) | Admin UI rework onto the new content model | ✅ | [content-model-phase2-admin.md](./04-content-model-redesign/content-model-phase2-admin.md) |
| Phase 3 | Mobile foundation (local schema rework) + Practice wired to real synced data | ✅ | [content-model-phase3-mobile-foundation.md](./04-content-model-redesign/content-model-phase3-mobile-foundation.md) |
| Phase 4 | 11 real mobile screens (Home, Practice landing, Subject/Topic/Level, Quiz, Session Summary/History, Progress, Revise, More) | ✅ | [content-model-phase4-mobile-screens.md](./04-content-model-redesign/content-model-phase4-mobile-screens.md) |

## Exam Structure Model

| Phase | Task | Status | Report |
|---|---|---|---|
| Phase A (901–908) | Schema & backend (Exam→Stage→Paper→Section→Subject, difficulty levels, paper types) | ✅ | [exam-structure-phase-a-backend.md](./05-exam-structure-model/exam-structure-phase-a-backend.md) |
| Phase B (911–916) | Admin UI (nested structure editor) | ✅ | [exam-structure-phase-b-admin.md](./05-exam-structure-model/exam-structure-phase-b-admin.md) |
| Phase C (921–928) | Mobile (structure sync, Practice scoped to real syllabus) | ✅ | [exam-structure-phase-c-mobile.md](./05-exam-structure-model/exam-structure-phase-c-mobile.md) |
| Syllabus (931–936) | Explicit `exam_subjects` mapping, separate from `section_subjects` | ✅ | [exam-subject-syllabus.md](./05-exam-structure-model/exam-subject-syllabus.md) |
| Phase D | Exam Pattern screen (user-facing view of the structure) | ⬜ Not started — explicitly marked optional/deferred |

## Mock Test Engine (un-ticketed)

Now documented — see [07-mock-test-engine/mock-test-engine.md](./07-mock-test-engine/mock-test-engine.md).

| Task | Status |
|---|---|
| Blueprint config, on-the-fly question generation, negative marking | ✅ |
| Four screens: landing, Start (with real availability), timed test-taking, Result | ✅ |
| Batched result insert (fixed a real ~7s submit-time bug) | ✅ |

## Motion System

| Ticket | Task | Status | Report |
|---|---|---|---|
| 941 | Shared animation tokens, press feedback, staggered list entrance, stack transitions | ✅ | [09-motion-system-and-ui-polish/motion-system-and-ui-polish.md](./09-motion-system-and-ui-polish/motion-system-and-ui-polish.md) |

## This session (2026-08-17) — no ticket numbers assigned yet

| Task | Status | Report |
|---|---|---|
| Bookmark sync (backend: migration/entity/service/controller/tests; mobile: schema/api/sync logic/wiring) | ✅ backend; 🔵 mobile (never verified live on-device) | [06-bookmark-sync-and-offline-indicator/bookmark-sync.md](./06-bookmark-sync-and-offline-indicator/bookmark-sync.md) |
| Offline connectivity indicator (`NetworkStatusContext`, `OfflineBanner`, sync suppression while offline, reconnect catch-up) | ✅ — closes out TICKET-405 above | [06-bookmark-sync-and-offline-indicator/offline-indicator.md](./06-bookmark-sync-and-offline-indicator/offline-indicator.md) |
| Practice screen redesign (exam grid regression fix, list redesign, live search, question-count subtitles) | ✅ | [09-motion-system-and-ui-polish/motion-system-and-ui-polish.md](./09-motion-system-and-ui-polish/motion-system-and-ui-polish.md) |
| Motion system extended to Home + Progress screens | ✅ | same report |
| Reports folder reorganized + this file created | ✅ | this file |

## This session (2026-08-18) — no ticket numbers assigned yet

| Task | Status | Report |
|---|---|---|
| Admin authentication — role-based accounts, `requireAdmin()` on every content-management endpoint, bootstrap + admin-invites-admin flow, admin console login | ✅ | [10-admin-authentication/admin-auth.md](./10-admin-authentication/admin-auth.md) |
| Crash reporting + basic analytics (TICKET-503) — Sentry wired up with a real DSN, breadcrumb-based event tracking, error capture at existing catch sites | ✅ done, confirmed live — a real test event was seen landing in the Sentry dashboard after a native rebuild | [11-crash-reporting-and-analytics/crash-reporting-and-analytics.md](./11-crash-reporting-and-analytics/crash-reporting-and-analytics.md) |

## This session (2026-08-19) — no ticket numbers assigned yet

| Task | Status | Report |
|---|---|---|
| Load-test data seeding (TICKET-501) — 11 active exams, ~37,900 questions (round 2, pushed toward V1.2's 20k-50k target), a real demo account with practice/mock history (350 sessions/85 attempts); found and fixed 4 backend + 1 mobile performance bug along the way | 🔵 done, full-sync timing improved but not fully optimized | [12-load-test-data-seeding/load-test-data-seeding.md](./12-load-test-data-seeding/load-test-data-seeding.md) |
| Non-blocking startup + hybrid online/local data layer (user-provided spec) — the blocking first-sync screen is gone, Practice/Mock Test read live from the backend while sync is still running (full Mock Test parity, including live-sampled timed attempts), real sync status in More/Settings | ✅ done, verified live on-device at both live-mode and post-sync-completion | [13-hybrid-online-sync/hybrid-online-sync.md](./13-hybrid-online-sync/hybrid-online-sync.md) |

## This session (2026-08-20 / 2026-08-21) — no ticket numbers assigned yet

| Task | Status | Report |
|---|---|---|
| Backend deployed to Google Cloud Run — configurable CORS origins, `${PORT:8080}`, Artifact Registry + Cloud Build image, Secret Manager, scale-to-zero with `--max-instances=3` | ✅ done, verified live (`/api/health` UP, `/api/questions/live` serving 35,958 real questions from Neon) | [14-cloud-run-deployment/cloud-run-deployment.md](./14-cloud-run-deployment/cloud-run-deployment.md) |
| Security: plaintext admin credentials in a public repo became exploitable the moment the backend went public — confirmed by a real login returning ADMIN, then closed by demoting the account and issuing a new admin | ✅ remediated and verified (old account now returns STUDENT; new admin confirmed ADMIN) | same report |
| Android release APK rebuilt against the deployed HTTPS backend | ⚠️ in progress — two builds failed on a ninja "manifest still dirty" loop caused by OneDrive syncing files mid-build; resolved by building from a non-OneDrive workspace. **Superseded by the GitHub Actions workflow below**, which builds on a Linux runner where OneDrive cannot interfere. | same report |
| Signed APK builds via GitHub Actions — real RSA-4096 upload keystore, an Expo config plugin so the signing survives `expo prebuild`, `versionCode` from `run_number`, artifact on `main` / permanent Release on a `v*` tag, and an `apksigner` signer-fingerprint check that makes shipping a debug-signed APK impossible. Moves TICKET-505 to partial. | 🔵 built and verified locally end to end at the time — **since proven on GitHub for real, see the 2026-08-24 session below** | [15-github-actions-apk-builds/github-actions-apk-builds.md](./15-github-actions-apk-builds/github-actions-apk-builds.md) |

## This session (2026-08-24) — no ticket numbers assigned yet

| Task | Status | Report |
|---|---|---|
| Black + Blue Dark Theme — new semantic token structure (`surface*` vs. `text.onAccent*` kept deliberately separate to avoid a light→dark collision bug), re-skinned `Card`/`Button`/`Skeleton`/`EmptyState`/`ErrorState` and every screen, approved via a demo Artifact before any code changed | ✅ done, verified on-device via emulator screenshots after each fixed bug (light-gray screen backgrounds; a status-bar overlap on Home/Progress/More) | [16-black-blue-dark-theme/black-blue-dark-theme.md](./16-black-blue-dark-theme/black-blue-dark-theme.md) |
| Resilient initial sync — `runInitialSyncUntilDone()` retries indefinitely with exponential backoff instead of stranding the user on a transient backend 500; floating `SyncBanner` deleted, replaced by a real percentage bar on More | ✅ done, verified against the real deployed Cloud Run backend — observed retrying through real intermittent failures and completing; **root cause (likely Cloud Run OOM, no `--memory` flag + Hibernate batch size 500) diagnosed but not fixed server-side** — this is a resilience fix, not a root-cause fix | [17-resilient-initial-sync/resilient-initial-sync.md](./17-resilient-initial-sync/resilient-initial-sync.md) |
| Practice/Mock Test exit guard — Mock Test restructured into Exam Selection → Mock List (matches Practice's flow); a "Leave this test?" confirmation guards a tab switch mid-quiz/mid-test and resets the abandoned module back to its home screen | ✅ done, verified end-to-end on-device across four iterations of a real bug each (see report) — `router.dismissAll()`/`dismissTo()` never worked in this expo-router version, a `key`-based remount didn't reset parent-owned navigation state, a navigation race stole tab focus back, and a stale `screenListeners` closure read outdated session state | [18-practice-mock-test-exit-guard/practice-mock-test-exit-guard.md](./18-practice-mock-test-exit-guard/practice-mock-test-exit-guard.md) |
| GitHub Actions APK workflow's first real run on GitHub — run #4, triggered by the push containing the three rows above | ✅ succeeded: `completed`/`success`, ~16 minutes, produced a real signed artifact `sarkaritaiyaari-1.0.0-1004-8c5140e.apk` (57 MB). Confirmed via the GitHub Actions REST API, not assumed. Resolves the "workflow has never run on GitHub" gap in `reports/15-github-actions-apk-builds/`; does not close TICKET-505's Play Console half | [15-github-actions-apk-builds/github-actions-apk-builds.md](./15-github-actions-apk-builds/github-actions-apk-builds.md) (Update — 2026-08-24 section) |

## This session (2026-08-27) — no ticket numbers assigned yet

| Task | Status | Report |
|---|---|---|
| Exam difficulty + editorial badge, end to end — `exams.difficulty` reuses the existing `difficulty_levels` table rather than a second vocabulary, `exams.badge` FKs a new seeded `exam_badges` lookup, both curated from the admin exam form and resolved at render time on mobile; the exam icon box now also renders an admin-uploaded image (`imageUrl` was already synced but no screen had ever read it) | ✅ done — 10/10 `ExamCrudTest` pass (incl. 4 new: round-trip, blank-clears, and both reject paths), V11 applied to the real Neon DB (schema at v11), `/api/exam-badges` and the new `/api/exams` fields confirmed by curl. **Mobile side not verified on-device** | none — folded into this row and commit `eac8f32` |
| Redesign surface-ladder correction — cards moved from `#0D1117` on `#05070A` (near-black on black, the real reason every screen read as "dull") onto the reference design's `#12161F` on `#0A0D14`; reverted three earlier changes that had gone *against* the supplied spec (over-bright icon boxes, a red progress bar, and a glow shadow Android painted as an opaque band behind the card's rounded corners) | ✅ done, tsc + lint clean | same commit |
| Two supplied requirement docs (performance; Exam Intelligence) audited and reconciled into the project's own docs rather than kept as competing plans — 7 premises of the performance doc **refuted** with evidence; the Exam Intelligence doc's ~70% overlap mapped onto existing Epics A/B/C/D/F, its genuinely-new material becoming **Epic L (2101–2109)**; two false claims in `preparation-os-requirements.md`'s own §3 corrected | ✅ docs only, no code | `offline-exam-app-requirements.md` §9, `preparation-os-requirements.md` v1.1 §18 |
| Startup gate rework — waits on reference data with a hard 5s ceiling instead of the full question sync; smoothed monotonic progress bar (capped at 95% pre-release, no fabricated question counts); `LIMIT` on the previously-unbounded practice query; double-tap guard on quiz Finish; stale `SyncContext` comment corrected | 🔵 done, **verified on-device on a fresh AVD** — gate releases on `reference data ready` before any question page is written; the **offline lockout was reproduced and is fixed** (ceiling fired mid-retry-loop, and `OfflineNoDataNotice` — previously unreachable on a cold first launch — then rendered); a 9-question quiz completed; three taps on Finish produced exactly **1** session. Known gaps: gate duration not precisely timed, bar smoothness never visually assessed, tested in Expo Go not a release build, `LIMIT` boundary unexercised while the ~500-question pool caps topics at 29 | [19-startup-gate-and-query-limits/startup-gate-and-query-limits.md](./19-startup-gate-and-query-limits/startup-gate-and-query-limits.md) |
| Real bug found by this session's own testing: `releaseGate` fired once per question page (the release conditions are re-evaluated every tick and `phase` stays `"questions"`), logging the release line 3× and making the log useless as evidence of which condition won. No user-visible effect — React bails on the unchanged state | ✅ fixed with a `gateReleased` ref guard; re-run logged it exactly once | same report |
| §9 Phases 2/3/5 — `loadSessions` N+1 collapsed to two queries (runs at startup for every user) with `MAX_SESSIONS` finally applied as a real `LIMIT`; migration `0011` adds 6 indexes and drops 1 redundant; Revise/Summary/mock-test Result virtualized to `FlatList`; remaining per-row `await` loops converted to bulk statements | 🔵 done, verified on-device — 12 migrations replay cleanly from a wiped install, quiz + Summary scroll end to end, Revise renders 8 items with working expansion and its empty state. **`mock-test/result.tsx` never opened on-device** (needs a completed mock attempt). Phase 4 (Mock Test facade) not started; Phase 6 (lift the pool) now unblocked | [19-startup-gate-and-query-limits/startup-gate-and-query-limits.md](./19-startup-gate-and-query-limits/startup-gate-and-query-limits.md) |
| §9 Phase 4 — new `data/mockTestAccess.ts` facade mirroring `practiceData.ts`; all four Mock Test screens stop carrying `mode === "local" ? fromSqlite() : fromApi()` inline and no longer import both a SQLite and an HTTP module. Also revived `resetStructureCache`, which was dead code despite its own comment — the live structure snapshot had never been invalidated for the process lifetime | ✅ done, verified on-device end to end (exam list → papers → start → running test → submit → result), **which also closed Phase 3's outstanding gap: `mock-test/result.tsx` virtualization is now confirmed** (25 cards + reachable footer). Partial: `practiceData.ts` shares the structure cache without going through the facade | [19-startup-gate-and-query-limits/startup-gate-and-query-limits.md](./19-startup-gate-and-query-limits/startup-gate-and-query-limits.md) |
| §9 Phase 6 — temporary question pool lifted (`app.question-pool.temporary-enabled: false`); full 37,884-question bank now served and synced. **The requested "assign same questions to every query" interim hack was deliberately not built** — measurement showed the pool was the entire cause of the empty screens (107/108 topics have questions once lifted; the one gap is the `Automated Test Topic` fixture), so no query had to stop honouring its scoping | ✅ done, verified end to end — 76 pages @ ~2.7s/page server-side (≈203s, matches the ~236s in report 12), but **invisible to the user**: gate released on reference data before any question page existed, app navigated normally while pages 5–23 downloaded, sync finished `37884/37884`, 136-question quiz loaded clean, zero Metro errors. Gaps: emulator only (not low-end hardware), and the 76-page sync was never interrupted by an app kill | [19-startup-gate-and-query-limits/startup-gate-and-query-limits.md](./19-startup-gate-and-query-limits/startup-gate-and-query-limits.md) |
| Real bug found by testing: a bare `DROP INDEX` in migration `0011` **bricked the app** — `Database migration failed`, and migration failure is a hard gate in `app/_layout.tsx`. drizzle-kit generates index DDL with no existence guards | ✅ fixed — hand-edited to `IF EXISTS`/`IF NOT EXISTS` throughout, re-verified by replaying all 12 migrations from a wiped install. **Treat generated index migrations as needing this hand-edit by default.** A related near-miss (a generated `UNIQUE` index on `subjects(name)`, which could fail permanently on a device holding a duplicate) was caught by reasoning and downgraded to a plain index | same report |
| Exam difficulty/badge/image — **mobile side now verified on-device** (was the outstanding gap on the row above): SSC CGL rendered a POPULAR badge, a "Medium level" pill using `difficulty_levels`' own synced icon, and an admin-uploaded image in its icon box; SSC CHSL with neither set correctly rendered one pill and no badge | ✅ done and verified | same report ("Verified", incidental findings) |

---

## Future Vision — "Personal Preparation OS" (nothing started)

Full detail lives in `preparation-os-requirements.md`. Summarized here only to keep the total ticket count honest — every single one of these 63 tickets is **⬜ not started**, by design (the source document's own status is "draft — feasibility/priority not yet decided").

| Epic | Tickets | Feasibility |
|---|---|---|
| A — Weakness Radar & Mistake Book | 1001–1007 | 🟢 Low |
| B — Intelligent Revision Engine | 1101–1105 | 🟡 Medium |
| C — Preparation Twin & Readiness v2 | 1201–1205 | 🟡 Medium |
| D — Daily Mission & AI Coach | 1301–1306 | 🟡 v1 / 🟠 v2 |
| E — 5-Minute Prep Sessions | 1401–1403 | 🟢 Low |
| F — PYQ Intelligence & Question DNA | 1501–1506 | 🟡 v1 / 🔴 v2 |
| G — Current Affairs Engine | 1601–1605 | 🟡 v1 / 🟠 v2 |
| H — Multimodal Study (Audio/Voice/Scanner) | 1701–1725 | 🟠–🔴 |
| I — Motivation & Social | 1801–1805 | 🟡–🟠 |
| J — Exam Logistics (Calendar/Eligibility/Application) | 1901–1906 | 🟡 |
| K — Regional-Language Depth | 2001–2003 | 🟢–🟡 |
| **L — Exam Intelligence Foundations** (added 2026-08-27, **phase 0** — Epics A/C/D/F all depend on it) | 2101–2109 | 🟡 Medium |

### Epic L progress (the only Future Vision work started)

| Ticket | Status | Notes |
|---|---|---|
| TICKET-2101 `exam_topics` map | 🔵 backend + admin UI done | Migration V12, `ExamTopic` entity, `GET`/`PUT /api/exams/{code}/topics`, plus a Topic map card + modal in `ExamStructure.jsx` with per-topic weightage. **No mobile, zero curated data, admin UI not click-tested.** Synthetic id per ADR-005 (an `@IdClass` composite broke `user_bookmarks` with real 500s) |
| TICKET-2102 topic hierarchy | 🔵 backend + admin UI done | `topics.parent_id` self-FK — one recursive relation instead of the spec's four Chapter/Topic/SubTopic/Concept tables, since depth varies per subject. Cycle + cross-subject parent validation in the service (a FK/CHECK can't express either); `Topics.jsx` gained a Parent select that excludes the topic's own descendants |
| TICKET-2103 `topic_prerequisites` | 🔵 backend + admin UI done | DAG with reachability-based cycle detection of any length; null vs. empty list distinguishes "leave unchanged" from "clear"; `Topics.jsx` gained a Prerequisites checkbox grid |
| Admin UI real bug: an API import silently shadowed by a same-named `useState` setter in `ExamStructure.jsx`, so `saveTopicMap` called the state setter and **would never have persisted anything** | ✅ fixed (aliased to `saveExamTopicsApi`) — caught only by `oxlint`'s "imported but never used"; a build and a manual glance both pass it | same report |
| Doc bug: `memory/STATUS.md` listed `admin@sarkaritaiyaari.app` as the working admin in **three places**, but it was demoted to `STUDENT` during the Cloud Run credential remediation | ✅ corrected in all three — verified by driving the real login (returns `role: STUDENT`; console shows "is signed in but is not an admin account"). This is why the new admin UI could not be click-tested | same report |
| TICKET-2104 PYQ provenance | ⬜ not started | |
| TICKET-2105 `user_topic_progress` | ⬜ not started | Prerequisite for Epics A/C/D |
| TICKET-2106 trend/priority + algorithm versioning | ⬜ not started | |
| TICKET-2107 admin priority override | ⬜ not started | |
| TICKET-2108 real pattern versioning | ⬜ not started | `UNIQUE(exam_code, name)` on `exam_stages` currently blocks two versions of a stage |
| TICKET-2109 server-side dedup | ⬜ not started | |

Full report: [20-epic-l-topic-model/epic-l-topic-model.md](./20-epic-l-topic-model/epic-l-topic-model.md). **90/90 backend tests pass** (8 new), V12 applied to the dev DB, two real bugs found by running the tests (a `TransactionRequiredException` on a derived delete, and an FK violation in teardown that errored all 8 tests).
