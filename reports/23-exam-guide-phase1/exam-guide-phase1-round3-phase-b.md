# Exam Guide — closing the coverage ledger, Phase B (offline cache, search, cycle-diff, content states)

**Requested:** continuation of the coverage-ledger closure (see `exam-guide-phase1-round3-phase-a.md` for
Phase A and the overall plan). This report covers **Phase B**: offline caching for the Exam
Guide screens (§44), search on My Exams (§47), "what's changed this cycle" (§30), and
draft/published content-validation states (§36). Schema: backend migration **V18**, mobile
local migration **0014**.

## The most important thing found this phase: the entire Exam Guide mobile feature has never worked on a real device or emulator

`mobile/src/api/examGuide.ts` prefixed every one of its four endpoint paths with `/api/...`
(e.g. `` `/api/exams/${examCode}/guide` ``). `API_BASE_URL` (`mobile/src/api/config.ts`)
**already ends in `/api`** — confirmed against `api/reference.ts`'s `getExams()`, which is
core to the whole app and has been extensively on-device-tested, and which correctly calls
`apiFetch("/exams")` with **no** `/api` prefix. Every Exam Guide network call was therefore
requesting `.../api/api/exams/...` — a guaranteed 404 against the real backend.

Verified directly, not just reasoned about: started the backend and curled both forms —

```
GET /api/api/exams/SSC_CGL/guide  -> 404   (what the app was actually requesting)
GET /api/exams/SSC_CGL/guide      -> 200   (the correct path, after the fix)
```

This explains, in full, why every prior Exam Guide session's own report carried an honest
"not verified: mobile screen on a real device/emulator" caveat — nobody ever actually opened
the screen, and backend verification was always done with `curl` against the server's own
route (`/api/exams/...`, which is correct from Spring's perspective), never through the
mobile client's constructed URL. Fixed by removing the redundant `/api` prefix from all four
paths in `api/examGuide.ts`. Grepped the rest of `mobile/src/` for the same mistake — none
found; it was isolated to this one file.

## What shipped

### Offline cache for the Exam Guide screens (§44)
- Backend: no changes needed — `GET /api/exam-guides` (sync-all) already existed and had
  already been fixed for the `MultipleBagFetchException` bug in an earlier session.
- Mobile: 8 new local tables (migration `0014_exam_guide_offline_cache.sql`, pure
  `CREATE TABLE IF NOT EXISTS`, no `ALTER TABLE`): `exam_guide_cycles`,
  `exam_guide_eligibility`, `exam_guide_dates`, `exam_guide_documents`, `exam_guide_steps`,
  `exam_guide_mistakes`, `exam_guide_fees`, `exam_guide_sources`. Every child table is keyed
  by `exam_code`, not the backend's `recruitment_cycle_id` — only each exam's current,
  published cycle is ever synced (never history), so there is exactly one cycle per exam
  locally, which is what makes a wholesale delete+reinsert on every sync safe, the same
  pattern `writeExamStructures` already established.
- `writeExamGuides()` (`sync/writeQuestions.ts`) runs as part of the ordinary reference-data
  sync pass (alongside exam structures and topic intelligence), one combined request, full
  table replace on success — an exam whose cycle is unpublished or deleted server-side
  disappears from the offline cache too, not just fails to update.
- `db/examGuideLocal.ts` reassembles the cached rows back into the exact `ExamGuide` shape
  the live API returns; `data/examGuideData.ts` is the hybrid facade
  (`getExamGuideHybrid(examCode, mode)`) following the same `local`/`live`/`unavailable`
  branching every other hybrid function in this app already uses. `exam-guide.tsx`,
  `eligibility-checker.tsx`, and Home's new deadline-countdown card (Phase A) all switched
  to it.
- **Deliberate scope boundary, stated rather than hidden:** `exam-guide-history.tsx` (past
  cycles) and the §30 diff below stay live-only. The offline cache only ever holds the
  current cycle, so there is nothing to browse offline for history by construction — this
  is a real, known gap for a genuinely offline device, not an oversight.

### Search (§47)
Scoped to filtering My Exams' Explore list (`TextInput` + inline filter, same pattern
`practice/index.tsx` already uses) — not a cross-content search engine. No existing search
component to build on, and a ~15-exam catalogue doesn't justify inventing one.

### "What's changed this cycle" (§30)
- Backend: `GET /api/exams/{examCode}/recruitment-cycles/{cycleId}/changes-from-previous` —
  a field-level diff (dates, vacancy count, eligibility age range, fee-by-category) against
  the exam's previous published cycle.
- **A real bug found by testing against the actual seeded demo data, not just a synthetic
  fixture:** "previous cycle" was first implemented as "the most recent other published
  cycle with an earlier `createdAt`" — but the demo seeder inserts its current 2027 cycle
  *before* its past 2026 cycle (`seedPastCycle` runs after the current cycle is saved), so
  `createdAt` ordering had current and past backwards. A live curl against the real SSC_CGL
  demo data returned `hasPrevious: false` where it should have found the 2026 cycle. Fixed
  by ordering on real-world chronology instead — `applicationStart`, falling back to
  `notificationDate` then `examStart` — which is what "previous" actually means to a
  student, not database insertion order. Re-verified against the same live demo data
  afterward: correctly reports 15 real changes against "2026 (Demo, past)".
- Mobile: `getChangesFromPrevious` added to `api/examGuide.ts`; a collapsible "What's
  changed this cycle" section on `exam-guide.tsx`, fetched lazily only when tapped open.

### Content-validation states (§36)
- Backend: `ContentStatus` enum (`DRAFT`/`PUBLISHED`) — **two states, not the spec's three**
  (no `REVIEW`). This project has exactly one admin role; adding a reviewer role is a
  separate, bigger decision (touches `Role`/auth) not requested here. New `content_status`
  column on `recruitment_cycles` (migration V18), gating the whole cycle tree at once since
  eligibility/dates/documents/fees/steps/mistakes are all its children. Existing rows
  backfilled to `PUBLISHED` (they were already live); new rows default to `DRAFT` in the
  Java entity. Public reads (`ExamGuideController`, sync-all, and the notification-history
  endpoint) now only ever see `PUBLISHED` cycles — a draft cycle behaves exactly like "no
  current cycle configured," the same empty state the feature already had. Two new admin
  endpoints, `PUT /api/recruitment-cycles/{id}/publish` and `.../unpublish`.
- **A real regression caught before it shipped, not after:** `ExamGuideDemoSeeder`
  constructs its `RecruitmentCycle` rows directly (not through the request/response DTOs
  that pick up the new field), so with no fix it would have created the demo cycle as
  `DRAFT` by the new entity default — silently vanishing the entire seeded demo guide from
  every public/mobile read that has depended on it since Phase 1. Fixed by explicitly
  setting `PUBLISHED` in the seeder for both the current and past demo cycles.
- Admin: `ExamGuide.jsx` gained a "Content status" field on the cycle form and a one-click
  Published/Draft toggle button in the cycle list (calls the new publish/unpublish
  endpoints directly, no full-form resubmit needed).

## Backend test coverage — a real gap closed, not just this phase's own features tested

**No test file for any part of the Exam Guide model (V17, the whole of Phase 1) existed
before this session** — confirmed by listing `backend/src/test/`. New
`ExamGuideContentStatusTest.java` (3 tests) covers both this phase's new behavior AND the
pre-existing draft/current/public-read interaction that had never been exercised by an
automated test: a new cycle defaults to draft and is invisible to public reads until
published; an update that doesn't mention `contentStatus` leaves it unchanged (doesn't
silently unpublish a live cycle on an unrelated edit); the diff endpoint's chronology-based
ordering.

**Obtained the genuinely clean full `mvn test` run that the round-2 session flagged as never
achieved** (three attempts that session were each undermined by running `spring-boot:run` in
the same shell/`target/` directory as `mvn test`). This time: **115 tests across 18 classes,
0 failures, 0 errors**, run from a shell not also running the dev server, confirmed by
checking `netstat` for a listener on 8080 before starting.

## Files changed

- Backend: `V18__exam_guide_content_status.sql` (new); `entity/ContentStatus.java` (new);
  `entity/RecruitmentCycle.java`, `repository/RecruitmentCycleRepository.java`,
  `dto/ExamGuideAdminDtos.java`, `dto/ExamGuideDtos.java`, `service/ExamGuideService.java`,
  `service/ExamGuideDemoSeeder.java`, `controller/ExamGuideController.java`,
  `controller/ExamGuideAdminController.java` (modified). New test:
  `ExamGuideContentStatusTest.java`.
- Admin: `src/api.js`, `src/pages/ExamGuide.jsx` (modified).
- Mobile: `db/schema.ts`, `db/migrations/0014_exam_guide_offline_cache.sql` (+ registration
  in `migrations.js`/`meta/_journal.json`), `db/examGuideLocal.ts` (new),
  `data/examGuideData.ts` (new), `sync/writeQuestions.ts`, `api/examGuide.ts` (the `/api`
  prefix fix + two new functions), `app/exam-guide.tsx`, `app/eligibility-checker.tsx`,
  `app/my-exams.tsx`, `app/(tabs)/index.tsx` (modified).

## Verified

- Backend: clean `mvn compile`; full `mvn test` — 115/115 passing (see above). Every new/
  changed endpoint hit directly with curl against a real running instance: the `/api/api/`
  double-prefix bug reproduced and the fix confirmed (404 → 200); sync-all and single-guide
  reads return the real seeded demo data; the diff endpoint verified against real data both
  before the chronology fix (wrong: `hasPrevious: false`) and after (right: 15 real changes
  against "2026 (Demo, past)"); a draft cycle 404s from the public guide endpoint until
  published, per the JUnit test.
- Mobile: `npx tsc --noEmit` clean; `npx expo lint` at the exact pre-existing baseline (9
  problems: 8 errors, 1 warning) throughout.
- Admin: `npm run build` clean; `oxlint` unchanged (one pre-existing, unrelated warning).

## Not verified

- **No on-device/emulator run of the mobile app.** This is the item that matters most here:
  the `/api` prefix bug means literally nothing in the Exam Guide mobile UI has been
  confirmed working end-to-end from an actual device across three sessions of "shipped"
  work — this session fixes the bug and adds substantial new code on top of it, all
  reasoned through static analysis and the live curl checks above, not an actual app launch.
  Per this project's own standing rule (a clean compile has repeatedly missed real bugs
  here — this exact session is a case in point), an emulator pass before this ships
  anywhere that matters is the single most valuable next check, not optional polish.
- Local migration `0014` has never executed against a real (especially a populated,
  pre-migration) SQLite database — only reasoned about against the hand-edit conventions
  documented in `0011`–`0013`. All statements are guarded `CREATE TABLE IF NOT EXISTS`/
  `CREATE INDEX IF NOT EXISTS`, so the specific unguardable-`ALTER TABLE` failure mode this
  project has hit before doesn't apply here — but that's an argument from the SQL's shape,
  not a test run.
- Admin's new publish/unpublish button and content-status field were not click-tested in a
  browser (no Playwright/browser-automation available this session) — covered only by the
  backend JUnit test exercising the same endpoints it calls.
- `exam-guide-history.tsx` and the §30 diff endpoint remain live-only by design (see the
  offline-cache scope boundary above) — genuinely offline, they show nothing, which is a
  real, stated limitation for a fully offline device, not yet solved.

## Next

Phase C (§22 roadmap-as-Prepare-enhancement, §25/26/27/28 career info/comparison/
recommendation) — migration V19. Continuing per the approved plan.
