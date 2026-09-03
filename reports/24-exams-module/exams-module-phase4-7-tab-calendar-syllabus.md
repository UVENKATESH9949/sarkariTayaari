# Exams module — Phases 4-7: the Exams tab, Exam Calendar, Syllabus & Trends, integration

**Date:** 2026-09-03
**Scope:** Phases 4-7 of the approved "A first-class 'Exams' module (5th primary tab)"
plan — the mobile-facing half of this build, on top of Phase 1 (backend discovery
listing) and Phase 2/3 (backend + mobile Follow sync), both reported separately.

## Phase 4 — the Exams tab itself

- **A 5th primary tab** registered in `(tabs)/_layout.tsx`: `Home / Practice / Mock Test
  / Exams / More` — `TabHref` (the tab-switch-guard's destination type) extended to
  include `/exams`; `nav.exams` added to both `en.ts` and `te.ts`.
- **New `app/(tabs)/exams.tsx`** — search box, a segmented row (All/My Exams/
  Applications Open/Upcoming), a category-chip row (built from whatever categories are
  actually present in the fetched page, not a hardcoded list), a sort-chip row (Deadline/
  Exam Date/Newly Announced/A-Z), and five sections built from one fetched page: Closing
  Soon, Applications Open, Recommended For You, Upcoming, All Exams.
- **Real server-side sort/category/pagination, client-side segment/search on top of
  it** — a stated architecture choice, not a shortcut: a sort or category change issues
  a real `GET /api/exams/discover` call with those params (both already covered by
  `ExamDiscoveryTest`); the top segmented tabs and search box filter the already-fetched
  page instead, because the backend's `status` param covers exactly one
  `RecruitmentCycleStatus` (or the synthetic `CLOSING_SOON` bucket) at a time and has no
  "multiple statuses" mode for what "Applications Open" needs — issuing a second network
  call per segment tap would buy nothing at an ~11-exam catalogue and still couldn't
  express that filter server-side as a single param anyway.
- **New `examsModule/ExamCard.tsx`** — one card component reused by every section:
  status pill (colour keyed to closing-soon/open/result-ish/none), the primary-action
  button (Apply Now/Prepare Now/View Exam/View Result Info, from
  `examsModule/statusLabels.ts`), a deadline-or-exam-date `StatPill`, a vacancy-count
  `StatPill`, a demo-content note when `demo: true`, and the Follow star (reusing
  `db/followedExams.ts` from Phase 3 — the same soft-delete/upsert functions, not a
  parallel toggle).
- **"Recommended For You"** reuses the exact heuristic `my-exams.tsx` already
  established (urgency + subject-overlap with practice history), adapted to run over
  this screen's already-fetched cards — simpler than the original in one respect: the
  discovery card already carries `closingSoon` computed server-side, so no second guide
  fetch is needed just to get urgency (the original screen needed that fetch because its
  raw `ExamResponse` data didn't carry cycle state at all).
- **New `api/examDiscovery.ts`** — the typed client for `GET /api/exams/discover`.

## Phase 5 — Exam Calendar

- **New `app/exam-calendar.tsx`**, reached from a calendar icon on the Exams tab's
  header. My Exams/All Exams toggle; merges every relevant exam's `ImportantDate` rows
  (via the existing `getExamGuideHybrid` per exam code — Phase B's offline cache, one
  `Promise.all` over a small exam-code list, not a new bulk endpoint or local query) into
  one chronological list, grouped by month, each row tappable into that exam's Guide.

## Phase 6 — Syllabus & Trends (the original ask this whole build grew out of)

- Exam Guide's **"Syllabus & Practice" button renamed "Syllabus & Trends"**, now opening
  a real overview screen instead of jumping straight into Practice.
- **New `app/syllabus-trends.tsx`** — Subject → Topic → Sub-topic (a sub-topic is a
  topic whose `parentId` is another topic in the same subject, nested visually under
  it), each collapsible per subject. Every topic row shows the admin-curated weightage,
  PYQ trend direction, computed priority, and mastery — reusing the exact same
  `getTopicInsights`/`TopicInsightChips` (`WeightageChip`/`TrendChip`/`PriorityChip`/
  `MasteryChip`) that `(tabs)/practice/topics.tsx` already uses and this session found
  already covers everything the plan asked for. **No new intelligence model was built**
  — this screen is a second, exam-wide *view* over Epic L's existing per-subject data,
  not a competing computation.
- Tapping any topic or sub-topic opens the same `/practice/levels` screen every other
  entry point in the app already uses, via the same `examCode`/`subjectName`/`topicId`/
  `topicName` params — no new Practice implementation, no question duplication.

## Phase 7 — integration + analytics

- Home's "Explore Exams" row now points at `/exams` (the new tab) instead of
  `/my-exams` — a small call made during implementation per the plan's own Architecture
  Decision #7, which explicitly left this unspecified. `more.tsx`'s "My Exams" entry is
  untouched, still pointing at `my-exams.tsx`, which stays reachable exactly as before.
- New analytics events via the existing `trackEvent` breadcrumb helper: `exam_module_
  opened`, `exam_search_used` (debounced 600ms, not per keystroke), `exam_filter_used`,
  `exam_sort_used`, `exam_card_opened`, `exam_calendar_opened`, `syllabus_trends_opened`,
  `syllabus_topic_opened`.

## Three real `react-hooks/set-state-in-effect` violations found and fixed, same pass

Introduced while building the two new data-loading screens (`exams.tsx`,
`exam-calendar.tsx`), and fixed with the exact pattern this codebase already established
in `PreparationPlanCard.tsx`: store the loaded result keyed to the exact inputs it was
loaded for (`{key, ...data}`), and derive "is this stale / still loading" by comparing
that key to the current inputs, rather than calling `setState` synchronously at the top
of an effect body to reset to a loading state. One of the three additionally needed the
async work wrapped in an inline `(async () => {...})()` IIFE rather than calling a
`useCallback`-memoized function directly with `.catch()` chained onto the call site —
the linter flags the latter shape even when the callee's own synchronous prefix (before
its first `await`) touches no state, apparently by call-site pattern rather than deep
call-graph analysis. `expo lint` confirmed back at the exact pre-existing baseline (9
problems: 8 errors, 1 warning) after each fix.

## Verified

- Mobile `tsc --noEmit` clean throughout every phase.
- Mobile `expo lint` at the exact pre-existing baseline (9 problems) after every fix.
- Admin `npm run build` (613ms) and `npx oxlint` clean (only the one pre-existing
  `AuthContext.jsx` warning, unrelated) — no admin changes this phase, re-checked anyway
  since enough time had passed since Phase 1.
- **Full backend `mvn test` suite: 144 tests, 0 failures, 0 errors, BUILD SUCCESS** (see
  the Phase 2/3 report for the two real-world interruptions — a concurrent-Maven race
  and a multi-hour network drop during an unattended stretch — that were caught and
  recovered from before trusting this result).
- **On-device, live against the real backend** (Android emulator `emulator-5554`,
  `mvn spring-boot:run` on `localhost:8080`, confirmed reachable via the emulator's
  `10.0.2.2` alias):
  - `GET /api/exams/discover` curled directly: 12 total exams, SSC_CGL's real seeded
    demo cycle returns `status: APPLICATION_OPEN`, `daysUntilDeadline: 229`,
    `closingSoon: false` (correctly under the 14-day threshold), `primaryAction:
    APPLY_NOW`, `demo: true` — matches the live seeded data exactly.
  - `status=CLOSING_SOON` correctly returns zero results (no exam is currently within
    the urgency window on this real data) — the synthetic-bucket filter works, and
    correctly returns nothing rather than something wrong.
  - The Exams tab itself, tapped live on the emulator (confirmed via `uiautomator`
    text dump, not a screenshot — this session's screenshots were intermittently stale,
    the same known glitch this project's own docs already flag): rendered a proper
    `ErrorState` ("Couldn't load exams" / "Try Again") while the backend was still
    occupied by the test suite, with no crash — confirming the screen degrades
    correctly rather than white-screening when the network genuinely isn't there yet.

## Full on-device verification, against the live backend (continued same session)

Once the backend dev server came up, the entire build was exercised live on the
emulator, signed in as the real `demo@sarkaritaiyaari.app` account:

- **A real orphaned-data bug found and fixed before verifying further.** The Exams tab's
  first live render showed a card for "Urgent Exam" that shouldn't exist — traced to
  `ExamDiscoveryTest`'s own throwaway fixture (`DISC_<runId>_URGENT`), left behind
  because its `@AfterEach` cleanup never ran: this session had twice killed a mid-run
  `mvn test` process (the concurrent-Maven race and the multi-hour network stall, both
  described in the Phase 2/3 report), and this particular test happened to be executing
  at one of those kill points. Confirmed via a live curl that exactly one exam code
  matched the `DISC_` test-fixture pattern, removed it (and confirmed no orphaned
  `recruitment_cycles` row survived either — that one *had* been cleaned up correctly)
  via a throwaway JDBC one-off against the real dev database, the same technique this
  project's own history already used once before for a similar direct fix. Re-verified
  clean afterward: exactly the 12 real exams, no test artifacts.
- **The Exams tab's full happy path**, confirmed via `uiautomator` text dumps (this
  session's screenshots were intermittently stale — a known glitch, not a real issue;
  dumps are unaffected): SSC CGL's real seeded demo cycle renders correctly under both
  "Applications Open" and "Recommended For You" — status pill, "Apply by" date, vacancy
  count, the "Demo content" note, the POPULAR badge — while IBPS PO/IBPS Clerk correctly
  show "No active cycle" / "View Exam". The category chip row correctly disappeared once
  the orphaned exam (the only one with a category set) was removed, since no real exam
  has had a category assigned via the admin console yet — confirms the chip row's
  "only show what's actually present" logic works in both directions.
- **Follow sync, both directions, confirmed against the real backend** (not just local
  SQLite): followed IBPS PO on-device, backed the app out (the existing backgrounding
  flush), and confirmed via a direct authenticated `GET /api/followed-exams` curl that it
  had arrived server-side. Followed IBPS Clerk the same way — confirmed too. Unfollowed
  both — confirmed each tombstone correctly removed them from the restore response
  (tombstones "stay server-side and never travel back down," working as designed).
  Also incidentally confirmed the *pre-existing* local SSC_CGL follow (created before
  this session's migration existed) was itself picked up and uploaded automatically —
  real evidence the migration's "mark existing rows unsynced" backfill works correctly
  on a device with real prior state, not just in a fresh-install test. Restored the demo
  account to its original single-follow (SSC_CGL) state afterward.
- **Exam Calendar**, opened live: My Exams scope correctly showed SSC CGL's six real
  Important Dates, grouped by month (March through August 2027) in the right order,
  correctly titled ("Notification released", "Application opens/closes", "Correction
  window", "Admit card released", "Tier 1 examination", "Tier 1 result", "Answer key
  released").
- **Syllabus & Trends**, opened live from the renamed Exam Guide button: "4 subjects ·
  89 topics" header; Quantitative Aptitude expanded to 28 real topics (Trigonometry,
  Geometry, Number System, Mensuration, etc.) each showing real curated weightage
  ("1.2% of paper" etc.), real PYQ trend ("Rising"/"Falling"), and real priority band
  ("High priority"/"Medium priority") — Epic L's actual computed data, not placeholders.
- **The full loop closed correctly**: tapping "Trigonometry" navigated into the existing
  Practice → Levels screen scoped to that exact topic ("Choose a level", Easy/Medium/
  Hard) — confirming Syllabus & Trends is a real second view over the same data and
  content Practice already uses, not a parallel implementation.

## Not verified

- No physical device — emulator only, per this project's standing rule.
- The "Load more" pagination button (only rendered when `hasMore` is true) was not
  exercised on-device — at today's ~11-exam catalogue with `PAGE_SIZE=100`, `hasMore` is
  always false in practice; its correctness rests on `ExamDiscoveryTest`'s pagination
  test, not a live device check.
- The sort-chip and category-chip re-fetch behavior was confirmed via the underlying
  endpoint (curled directly with each param) and via code review of the effect wiring,
  but tapping each individual chip on-device to watch the list visibly reorder was not
  separately screen-recorded — reasonable given the same effect path already fetches
  correctly on initial mount and the params are unit-tested server-side.
