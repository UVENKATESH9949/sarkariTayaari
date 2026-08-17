# Ticket Status — every ticket, one file

**Last updated:** 2026-08-17
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
| Sprint 5 — QA/Perf/Release | 501–506 | 0 | 0 | 6 |
| V1.1 — Accounts + Progress Sync | 601–605 | 5 | 0 | 0 |
| V1.2 — Scale & Polish | 701–706 | 0 | 1 | 5 |
| Content Model Redesign (801–810 + 2 un-ticketed phases) | — | 4 phases | 0 | 0 |
| Exam Structure Model | 901–936 | 34 | 0 | 0 |
| Mock Test Engine (un-ticketed) | — | 1 | 0 | 0 |
| Motion System (941) | 941 | 1 | 0 | 0 |
| Bookmark Sync + Offline Indicator (this session, unticketed) | — | 2 | 0 | 0 |
| **Current product total** | | **~74** | **1** | **11** |
| Future Vision — Personal Preparation OS | 1001–2003 (11 epics) | 0 | 0 | 63 |

**Bottom line: the shipped product is essentially feature-complete for V1.0/V1.1. What's left before it's release-ready is entirely Sprint 5 (QA/perf/release prep) — nothing there has been started. The Future Vision document (63 tickets) hasn't been touched at all, by design — it's explicitly a draft awaiting a greenlight.**

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

**Nothing in this sprint has been started.** This is the real next block of work on the shipped product before it can go to real users.

| Ticket | Task | Status |
|---|---|---|
| 501 | Load test with 10,000+ seeded questions | ⬜ Not started — real content is ~113 questions today |
| 502 | Test on low-end/throttled device | ⬜ Not started |
| 503 | Crash reporting (Sentry) + basic analytics events | ⬜ Not started |
| 504 | App icon, splash screen, branding polish | ⬜ Status unverified — not confirmed either way this pass |
| 505 | Signed APK/AAB, Play Console internal testing track | ⬜ Not started — debug-signed only |
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
| 701 | Load full production question bank (20k–50k+) | ⬜ Not started |
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
