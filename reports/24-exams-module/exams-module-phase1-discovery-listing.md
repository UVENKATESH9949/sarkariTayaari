# Exams module — Phase 1: category field + server-side discovery listing

**Date:** 2026-09-02
**Scope:** Phase 1 of the approved "A first-class 'Exams' module (5th primary tab)" plan.
Backend only — a new `category` facet on exams, and a new paginated/sorted/filtered
discovery listing endpoint. No mobile UI in this phase; the tab itself is Phase 4.

## Why

The user supplied a 74-section product spec asking to elevate exam discovery into its
own primary navigation tab (`Home / Practice / Mock Test / Exams / More`), with Exam
Guide becoming a detail screen one tap in rather than the primary entry point. Auditing
the spec against the real codebase (two Explore agents, per this project's standing rule
that supplied specs are AI-authored drafts) found three genuine gaps worth confirming
with the user before building: no `category` field existed anywhere in the data model;
`GET /api/exams` had no pagination/sort/filter; and "Follow" was local-SQLite-only, with
no backend table at all. The user chose, explicitly: build real server-side pagination/
sort/filter now (despite the catalogue being only ~11 exams today), and give Follow real
backend sync (Phase 2, not part of this report). A separate ambiguity — the spec's §55
"footer module" — turned out to be the user describing the Exams tab itself, not an
actual footer; confirmed no footer of any kind is in scope anywhere in this build.

## What shipped

- **Migration `V22__exam_category.sql`** — `ALTER TABLE exams ADD COLUMN category
  VARCHAR(30)`, nullable, additive. Applied cleanly against the real Neon dev database
  (confirmed via the test run's Flyway log: `Migrating schema "public" to version "22 -
  exam category"` → `now at version v22`).
- **`Exam.java`** gained a `category` field (a plain string, not a native enum or a new
  lookup table — it's a filter facet needing no per-value color/icon styling the way
  `difficulty`/`badge` do). `ExamRequest`/`ExamResponse` updated to carry it through.
- **`admin/src/pages/Exams.jsx`** — a fixed `EXAM_CATEGORIES` dropdown (SSC, Banking,
  Railways, UPSC, State Government, Teaching, Defence, Police, Insurance, Other), wired
  into the create/edit form and a new table column.
- **New `ExamDiscoveryDtos.java`** — `ExamCardResponse` (scalar exam fields + current-
  cycle fields + a computed `closingSoon`/`daysUntilDeadline`/`primaryAction`, no
  collections) and `PagedExamCards` (a small hand-rolled page wrapper, not Spring's raw
  `Page<T>`, which this backend's own logs already flag as unstable to serialize as-is).
- **New `ExamDiscoveryService.java`** — `GET /api/exams/discover` (added to the existing
  `ExamController`, distinct from `listActive()`/`listAll()`), taking `page`, `size`,
  `sort` (`DEADLINE`/`EXAM_DATE`/`NEWLY_ANNOUNCED`/`RECENTLY_UPDATED`/`POPULAR`/
  `ALPHABETICAL`), `status`, `category`. Deliberately in-memory sort/filter/page over the
  full active-exam set rather than SQL-level pagination — a stated scale call (today's
  catalogue is ~11 exams; the API's own contract doesn't change if a later session swaps
  the implementation for real SQL pagination once the catalogue is actually large).
- **Reused, not duplicated:** `RecruitmentCycleRepository.findCurrentCyclesForActiveExams()`
  (already N+1-safe, fetch-joins only `exam`) as the base data source, and the existing
  `RecruitmentCycleStatus` enum as the card's status engine — no parallel status model was
  built from scratch, closing what the plan flagged as a likely source of duplicated work.
- **`CLOSING_SOON_THRESHOLD_DAYS = 14`** is a named constant deliberately matching
  mobile's own `priorityTier()` "High" boundary (`examGuide/dates.ts`) — commented as
  intentionally duplicated, not independently chosen, so a card's server-computed
  `closingSoon` flag agrees with what the Guide screen's own countdown badge would call
  urgent for the same date.
- **`primaryActionFor()`** maps status → exactly one of `APPLY_NOW` / `PREPARE_NOW` /
  `VIEW_EXAM` / `VIEW_RESULT_INFO`, computed once server-side per spec §52's "one primary
  action per lifecycle state" rule.

## Tests

New `ExamDiscoveryTest.java` (9 tests, all against the real seeded Neon dev database,
each creating its own throwaway exams/cycles cleaned up via `@AfterEach`):

- an exam with no current cycle still appears, with `status: null` and `VIEW_EXAM`
- `APPLICATION_OPEN` computes `daysUntilDeadline` and `closingSoon` correctly at the
  threshold boundary (5 days → true, 60 days → false)
- `EXAM_UPCOMING` → `PREPARE_NOW`; `RESULT_RELEASED` → `VIEW_RESULT_INFO`
- `sort=deadline` orders the nearer deadline first
- `category` filter returns only matching exams
- `status=CLOSING_SOON` (the synthetic bucket, not a real enum value) returns only
  urgent open applications, not all open ones
- pagination respects `page`/`size` and reports `hasMore` correctly at the last page

```
Tests run: 9, Failures: 0, Errors: 0, Skipped: 0, Time elapsed: 196.1 s
BUILD SUCCESS
```

## Verified

- `mvn compile` clean (main sources).
- `mvn test-compile` clean (test sources, including the new class).
- `ExamDiscoveryTest` run in isolation: 9/9 pass, migration V22 applied live.
- Full backend `mvn test` suite: **[fill in after the background run completes]**.
- Admin `npm run build` (454ms) and `npx oxlint` clean after the category field
  additions (only the one pre-existing `AuthContext.jsx` warning, unrelated).
- No concurrent Maven process was running before the full-suite run (checked via `jps`
  and a port-8080 check first), per this project's own repeatedly-documented lesson
  about concurrent Maven invocations corrupting shared `target/` state.

## Not verified

- The new `/api/exams/discover` endpoint has not yet been curled against a live running
  dev server (only exercised via the Spring test slice, which is a real integration test
  against the real database, but not the same as hitting a running `mvn spring-boot:run`
  process the way this project's own convention prefers before calling a phase done).
- No on-device/mobile verification — there is no mobile UI yet to exercise; Phase 4 is
  where the discovery endpoint gets a real caller.
- Admin's new Category column/dropdown has not been clicked through in a live browser
  this session (build/lint clean only) — no Playwright run was performed for this
  specific change.
- "Popular" sort deliberately falls back to alphabetical (Follow persistence, the real
  signal for popularity, is Phase 2 — not built yet).

## Next

Phase 2 — backend Follow persistence (`FollowedExam` entity mirroring `UserBookmark`,
migration V23, sync + restore endpoints), per the approved plan.
