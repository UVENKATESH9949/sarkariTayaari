# Project Status — Resume Point

**Last updated:** 2026-09-03 — see **"Session of 2026-09-03 — A first-class 'Exams' module
shipped end to end (7 phases): discovery listing, real Follow sync, the 5th tab, Exam
Calendar, Syllabus & Trends"** immediately below for the current state; everything after
it is earlier history, kept for context.

## Session of 2026-09-03 — A first-class "Exams" module shipped end to end (7 phases): discovery listing, real Follow sync, the 5th tab, Exam Calendar, Syllabus & Trends

**Requested:** a 74-section product spec asking to elevate exam discovery into its own
primary navigation tab (`Home / Practice / Mock Test / Exams / More`), with Exam Guide
becoming a detail screen one tap in rather than the primary entry point — the same
session that originally asked for "one dedicated syllabus page, subject-wise/topic-wise,
showing weightage." Audited the spec against the real codebase first (two Explore
agents), then planned via `EnterPlanMode` (approved) before any code changed. Three
explicit user decisions shaped the build: no footer of any kind (the spec's §55 "footer
module" turned out to just be a misdescription of the Exams tab itself); **build real
server-side pagination/sort/filter now**, despite the ~11-exam catalogue; and **give
Follow real backend sync** (it had been local-SQLite-only, with zero backend table —
confirmed by grepping the whole backend). After the plan was approved, the user said to
run for as long as needed without asking again ("no need any permission... complete the
entire tickets... use the emulator... work up to 9:00-9:30 without stopping"), so all
seven phases shipped in one continuous, autonomous session. Reports:
`reports/24-exams-module/` (three files — Phase 1; Phase 2/3; Phase 4-7).

**Phase 1 (backend) — a `category` field and a real discovery listing.** Migration
`V22`: `exams.category` (nullable, admin-editable via a fixed dropdown — SSC/Banking/
Railways/UPSC/etc.). New `GET /api/exams/discover` (`ExamDiscoveryService`,
`ExamDiscoveryDtos`) — page/size/sort/status/category, reusing the already-N+1-safe
`findCurrentCyclesForActiveExams()` and the existing `RecruitmentCycleStatus` enum as
the status engine rather than building a parallel one. A stated scale decision, not a
shortcut: sort/filter/page happen in Java over the full active-exam set (today ~11
exams), not in SQL — the API's own contract doesn't change if a later session swaps the
implementation once the catalogue is actually large. New `ExamDiscoveryTest` (9 tests:
sort orders, category filter, the synthetic `CLOSING_SOON` status bucket, pagination
boundaries) — all against real seeded fixture data, all passing.

**Phase 2/3 — real Follow persistence, backend and mobile.** Migration `V23`:
`followed_exams` (userId:examCode synthetic id, `is_deleted` tombstone, `updated_at`
last-write-wins) — `FollowedExam`/`FollowedExamService`/`FollowedExamController` mirror
`UserBookmark`/`BookmarkService`/`BookmarkController` line-for-line, including the exact
same batched-existence-check optimization. Mobile: local migration `0017` adds the same
three sync columns to the local `followed_exams` table (hand-written, following the
`0007` bookmarks-migration precedent — SQLite has no `ADD COLUMN IF NOT EXISTS`, so
existing rows are backfilled and marked unsynced); `followExam()`/`unfollowExam()`
became upsert/soft-delete; new `sync/followedExamSync.ts` mirrors `bookmarkSync.ts`
(simpler, since a followed exam has no content of its own to reconstruct); wired into
all three of `authContext.tsx`'s existing sync call sites, each independently
error-caught so a new/unreachable endpoint can't abort progress or bookmark sync.

**A real bug found by running the new test, not by review.** `FollowedExamSyncTest`'s
own fixture data used a literal prefix plus a full `UUID.randomUUID()` as a test exam
code (~47 characters) — `exams.code` is `VARCHAR(30)` in the real schema, so the very
first run produced four live `DataIntegrityViolationException` 500s, not a compile or
logic problem. Fixed by shortening the test's unique suffix to 8 hex characters,
matching `ExamDiscoveryTest`'s own `runId` pattern. Re-ran clean: 5/5.

**Two real environmental incidents this session, both caught and recovered correctly —
worth remembering for any future long unattended run.** (1) A `mvn test-compile` was run
in a second shell while a full `mvn test` was still executing in the first — the exact
concurrent-Maven trap this file already documented once before. Caught via `jps`/process
inspection before trusting the result (the interrupted run had only completed 7 of ~20
classes); killed both processes and re-ran clean. (2) The session was left unattended for
several hours; the machine's network dropped during that window, producing a ~7-hour
`HikariPool` connection stall and a real `UnknownHostException`, which surfaced as three
`SocketTimeoutException`/connection-type failures (not assertion failures) in an
otherwise-clean run. Recognized as environmental rather than code contamination by the
distinctive error types, confirmed the network was actually back (`nslookup`), and
re-ran clean a fourth time: **144 tests, 0 failures, 0 errors, BUILD SUCCESS.**

**Phase 4 — the Exams tab.** Registered as the 5th primary tab. New `app/(tabs)/
exams.tsx`: search, a segmented row (All/My Exams/Applications Open/Upcoming — client-
side, since the backend's `status` param covers exactly one status/bucket at a time and
a second network call per tab tap would buy nothing at this catalogue size), a
category-chip row built only from categories actually present in the data, a sort-chip
row that does issue a real `GET /api/exams/discover` call per change, and five sections
(Closing Soon/Applications Open/Recommended For You/Upcoming/All Exams) built from one
fetched page. New shared `examsModule/ExamCard.tsx` (status pill, primary-action button,
deadline/vacancy stat pills, the Follow star, a demo-content note) and `examsModule/
statusLabels.ts`. "Recommended For You" reuses `my-exams.tsx`'s exact urgency+subject-
overlap heuristic, simplified slightly since the discovery card already carries
`closingSoon` computed server-side.

**Phase 5 — Exam Calendar.** New `app/exam-calendar.tsx`, reached from the Exams tab's
header: every followed-or-all exam's Important Dates merged, sorted, and grouped by
month — reuses the existing per-exam `getExamGuideHybrid` hybrid read (Phase B's
offline cache from an earlier session) rather than a new bulk endpoint or local query.

**Phase 6 — Syllabus & Trends, the screen this whole build started from.** Exam Guide's
"Syllabus & Practice" button renamed **"Syllabus & Trends"**, now opening a real
overview instead of jumping straight into Practice. New `app/syllabus-trends.tsx`:
Subject → Topic → Sub-topic, each row showing the admin-curated weightage, PYQ trend,
computed priority, and mastery — by reusing the exact same `getTopicInsights`/
`TopicInsightChips` that `(tabs)/practice/topics.tsx` already uses, not a new
intelligence model. Tapping any topic opens the same `/practice/levels` screen every
other entry point in the app already uses.

**Phase 7 — integration + analytics.** Home's "Explore Exams" row now points at the new
Exams tab instead of `/my-exams` (which stays reachable from More, untouched, per the
plan's own Architecture Decision #7). Eight new `trackEvent` breadcrumbs across the new
screens (`exam_module_opened`, `exam_search_used` debounced 600ms, `exam_filter_used`,
`exam_sort_used`, `exam_card_opened`, `exam_calendar_opened`, `syllabus_trends_opened`,
`syllabus_topic_opened`).

**Three real `react-hooks/set-state-in-effect` violations found and fixed while
building the two new data-loading screens**, using the exact keyed-loaded-state pattern
`PreparationPlanCard` already established (store `{key, ...data}`, derive "stale/still
loading" by comparing the key to current inputs, rather than a synchronous `setState`
at the top of an effect body). One needed the async work wrapped in an inline IIFE
rather than calling a `useCallback`-memoized function directly with `.catch()` chained
at the call site — the linter flags that call shape even when the callee's own
synchronous prefix touches no state.

**A second real, previously-undetected bug found and fixed on-device, not by
review — orphaned test data appeared in the real UI.** The Exams tab's first live
render showed a card for "Urgent Exam" that had no business existing — traced to
`ExamDiscoveryTest`'s own throwaway fixture, left behind because its cleanup never ran
when this session killed two mid-run `mvn test` processes (the two environmental
incidents above). Found and removed via a direct, scoped JDBC one-off against the real
dev database (same technique this project's history already used once before), then
reconfirmed clean.

**Full on-device verification against the live backend** (Android emulator
`emulator-5554`, `mvn spring-boot:run` on `localhost:8080`, signed in as the real
`demo@sarkaritaiyaari.app` account) — not just a clean compile: the Exams tab's real
cards (SSC CGL's actual seeded demo cycle, IBPS PO/Clerk's correct "No active cycle"
state); **Follow sync confirmed in both directions against the real backend** via direct
authenticated curls (followed IBPS PO and IBPS Clerk on-device, backgrounded the app,
confirmed server-side arrival each time; unfollowed both, confirmed each tombstone
correctly stopped being returned); Exam Calendar showing SSC CGL's six real dates
grouped by month in the right order; Syllabus & Trends showing Quantitative Aptitude's
28 real topics with real weightage/trend/priority; and the full loop closing correctly —
tapping "Trigonometry" opened the real Practice → Levels screen scoped to that topic.
The demo account was restored to its original single-follow (SSC_CGL) state afterward.

**Verified, summarized:** backend `mvn compile`/`mvn test` clean (144/144, after the two
environmental-incident reruns above); mobile `tsc --noEmit` clean and `expo lint` at the
exact pre-existing baseline (9 problems) throughout every phase; admin `npm run build`/
`oxlint` clean. Full detail, including the two environmental incidents and both real
bugs, is in the three Phase reports under `reports/24-exams-module/`.

**Not verified:** no physical device (emulator only, per standing project rule); the
pagination "Load more" affordance (never triggered at today's catalogue size — its
correctness rests on `ExamDiscoveryTest`'s server-side test, not a live device check);
individual sort/category chip taps were confirmed via direct endpoint curls and code
review rather than a full on-device tap-through of every chip.

**Next:** author real category values for the existing 11 exams via the admin console
(currently all `null` — the category chip row has no reason to appear yet); consider
whether "Recommended For You"'s heuristic needs revisiting once more than one exam has
real Guide content to differentiate against (same honest limitation `my-exams.tsx`
already flagged); the Eligible badge and cross-exam preparation-overlap % remain
deliberately deferred, unchanged from prior sessions.


## Session of 2026-09-02 (6) — Exam Guide ledger closure: footer corrected, accessibility fixed at the root, a Review role shipped

**Requested:** the user pushed back on the ledger's "§40 Footer module — not started / judged
inapplicable" call, correctly pointing out this app already has a reusable footer pattern (the
bottom action bar on Practice's quiz and Mock Test screens) the earlier judgment missed by
reading "footer" as a web-page footer. Also asked to close the remaining ledger and write test
coverage for what's built, the same way prior rounds did. Full report:
`reports/23-exam-guide-phase1/exam-guide-phase1-round5-phases-f-to-i.md`. Planned first (via
`EnterPlanMode`), including an `AskUserQuestion` on which of four previously-deliberate scope
calls to reopen — only §36 (a Review role) was selected; §50 (Eligible badge), §44 (deeper
offline caching) and §47 (cross-content search) stay deferred, untouched.

**Phase F — Footer module (§40, closes §41/§72 too).** Researched the real pattern directly
(`practice/quiz.tsx`, `mock-test/test.tsx`): a `View` sibling after the `ScrollView` inside a
`flex: 1` container, border-top + elevated background, buttons that disable rather than
disappear. Applied to `exam-guide.tsx`: Follow/Following (secondary) + View Official
Notification (primary, disabled not hidden without a URL). Verified live: pinned through
scrolling, follow toggle round-tripped through the local DB, notification link launches a real
Chrome intent (confirmed via `dumpsys activity`).

**Phase G — Accessibility (§52).** Found the real root cause instead of patching screens one at
a time: the shared `ui/Button` and `Card`/`CardRow` never set `accessibilityRole` at all —
missing on every screen in the app that uses either, not just the newer Exam Guide ones. Fixed
once in both shared components, plus two direct-`Pressable` spots.

**Phase H/H2 — small copy closures + one migration (V21).** A notification-simplifier framing
line, a personal-plan-fit note (reusing My Exams' own urgency signal), a PYQ hint, and a
weak-areas narrative sentence on the diagnostic results screen. Added a genuinely new
`overview_text` field (§1/§4 "What is this exam?") — nullable, additive, wired through the
admin form and the Guide screen.

**A real near-miss, caught before and after shipping.** `drizzle-kit generate` for the matching
local-cache column produced a **full `CREATE TABLE` for every already-existing `exam_guide_*`
table** instead of a minimal diff (its snapshot state doesn't match this schema's real
migration history) — replaced with the correct single `ALTER TABLE` before committing. It still
bit once, live: a **stale Metro bundler cache served the original broken migration** on one app
relaunch, producing the exact "Database migration failed" hard-gate this project's own docs
warn about, even though the `.sql` file on disk was already fixed. A full `expo start --clear`
resolved it, and the corrected migration then ran cleanly against this device's real,
already-migrated (0011–0015) database — not just a fresh install.

**Phase I — a REVIEWER role and a real three-state workflow (§36).** Checked before assuming a
migration was needed: both `Role` and `ContentStatus` are plain `VARCHAR(20)` columns, not
native Postgres enums, so `REVIEWER`/`REVIEW` needed zero schema change. Shipped DRAFT
→(submit-for-review, ADMIN-only)→ REVIEW →(publish, ADMIN or REVIEWER)→ PUBLISHED, or REVIEW
→(reject, ADMIN or REVIEWER)→ DRAFT — `publish` still accepts DRAFT directly too, so the
existing fast path and the demo seeder are unaffected. ADMIN is a deliberate superset of
REVIEWER (no chicken-and-egg lockout when no separate reviewer account exists). Admin UI: the
single toggle became contextual Submit-for-review/Publish/Send-back-to-draft/Unpublish buttons.

**A real cross-test-file collision found while adding shared REVIEWER/STUDENT test fixtures to
`AbstractIntegrationTest`** (mirroring the existing ADMIN pattern): `EpicLIntelligenceTest.java`
already had its own private, differently-scoped `studentAuth(T)` helper, and Java rejected the
new inherited method as an illegal visibility reduction. Renamed the shared helper to
`sharedStudentAuth` rather than touching the pre-existing, semantically different local one —
caught only by running the **full** suite, not the new test class alone.

**A process near-miss, same category as one already documented in this file.** A `mvn
test-compile` run in a second shell overlapped with an already-running full `mvn test` sharing
the same `target/` directory. Stopped both and re-ran the full suite cleanly from a single shell
rather than trust a build that may have raced against concurrent compilation.

**Verified:** mobile — `tsc`/`expo lint` clean at the exact pre-existing baseline (one genuine
new violation, an unescaped quote in the new PYQ hint text, found and fixed the same pass); all
Phase F/G/H changes confirmed live on-device after the cache-clear fix. Backend — five new test
methods in `ExamGuideContentStatusTest` (full three-state cycle, admin-can-still-publish-
directly-from-draft, role-gating against a plain STUDENT token on all four transition
endpoints, REVIEWER correctly barred from authoring/submit-for-review); `mvn compile` clean;
admin `npm run build` + `oxlint` clean. **Full suite: 129 of 130 pass.** The one failure
(`BulkOperationsTest.bulkImport_reusesExistingSubjectAndTopicByName_doesNotDuplicate`, a global
`subjectRepository.count()` assertion against the real shared Neon dev database, off by one)
re-ran clean in isolation immediately after — confirmed a flake/race against other concurrent
activity on the same shared database, not a regression from anything this session touched (no
bulk-import/subject/topic code was changed).

**Ledger updated in place** (same artifact URL): §40/§31/§36/§41/§52/§72/§73 all moved to done;
several Q1/AX/AC breakdown rows closed too (PYQ link, personal-plan note, footer, accessible,
weak-areas narrative); headline moved from 55/76 to 62/76. §44/§47/§50/§57/§75 remain exactly as
they were — deliberately deferred, not silently regressed.

**Admin console click-tested afterward**, via a minted `AdminTokenMintRunner` token: the full
Draft→Review→Draft→Review→Published cycle on a throwaway test cycle, then deleted. Found a real
testing-methodology trap along the way, not an app bug: the first several attempts looked
exactly like a broken UI (each click appeared to leave the badge one step behind), which turned
out to be short fixed `waitForTimeout` delays reading state before the previous request's round
trip to the real remote Neon database had landed — switching to polling for the expected badge
text resolved it immediately. Worth remembering next time a quick browser-driven check against
this database looks flaky. §50/§44/§47 untouched by choice.


## Session of 2026-09-02 (5) — Exam Guide round 3, on-device verification: one real bug fixed, one false alarm self-corrected

**Requested:** "launch emulator and check current changes and continue with next task... you can
directyl proceed dont wait for my approval" — round 3 (Phases A–E, previous session) shipped
entirely without ever running on a device, the standing gap every one of its five phase reports
flagged. Full report: `reports/23-exam-guide-phase1/exam-guide-phase1-round4-device-verification.md`
(includes the in-place correction described below, not rewritten away).

**Verified working, as built:** Home's deadline card/Explore Exams/Focus Next/readiness card;
the Exam Guide screen's progress card and reminder bells (confirmed absent signed-out, present
signed-in — checked by actually signing into the existing `demo@sarkaritaiyaari.app` account);
a full reminder create → verify via `GET /api/reminders` → delete round trip; My Exams'
Following/Recommended/Explore sections, search filter, and follow/unfollow (round-tripped live);
Compare Exams' picker and empty-cycle fallback; the Eligibility Checker's date validation and a
real age computation; and a full Diagnostic Test run from start to a working results screen.

**Bug found and fixed:** `exam-compare.tsx`'s empty-cycle note read "SSC CHSL **has** a
current recruitment cycle configured yet," missing "doesn't" — said the opposite of what it
meant. Fixed and confirmed live via Fast Refresh.

**A second finding was made, investigated further, and turned out to be a false alarm — worth
recording precisely because of how it was caught.** Tapping "Take a Diagnostic Test" for SSC CGL
produced "Question 1 of 1" instead of ~24. An on-device SQLite query against the emulator's local
database showed SSC CGL's #1 priority topic (Blood Relations) with **zero** locally-tagged
questions, and the same pattern across all 11 exams — which read exactly like a systemic Epic L
bug (curated priority computed independently of real question coverage), and was reported as one
mid-session. **Checking the same query against the live backend (not the device) showed every
exam's top-8 priority topics have healthy real coverage (56–366 questions each) — no live bug.**
The actual cause: **this specific, reused emulator's local database is a frozen snapshot from
before the question pool was lifted (2026-08-27)** — all 460 of its locally-synced questions have
`updated_at` timestamps between 2026-08-04 and 2026-08-18, while the live backend has 35,958.
Delta sync (which only fetches rows changed since a watermark) cannot backfill a gap like this by
design, which is why "Sync Now" kept advancing the watermark without the local question count ever
moving. This is a property of this one device's history, not a bug in the sync mechanism, the
backend, or Epic L's formula — see the report's own "Correction" section for the full chain of
evidence.

**Kept anyway, reframed honestly:** `buildDiagnosticSet.ts` (mobile) now checks the top 30
priority topics instead of 8 and keeps the first 8 that actually returned questions, and
`PreparePlanService.getPreparePlan` (backend) now filters out topics with zero question coverage
before building the checklist, reusing `countByTopicForExam` (an existing `TopicIntelligenceService`
scoring input). Both are correct, harmless defensive behavior — a topic with no available
questions should never be surfaced as practicable, whatever the reason — but neither is fixing a
confirmed live bug; the live data never needed either filter to produce a good result. Backend
change verified via `PreparePlanAndCareerPostTest` (5 tests) and a full `mvn test` regression run
(all green) before the dev server was restarted with it; confirmed live afterward via
`curl .../prepare-plan` — the response is well-formed and unaffected, exactly as expected once the
premise turned out to be false.

**Not fixed, and now correctly scoped:** Home's "Focus next" card still reads the same unfiltered
`getPriorityTopics` list, so on a device in this same stuck state it could still recommend an
unpracticable topic — but this is only reachable by the same stale-sync condition, not a live
data problem. **The more important open question this surfaced:** could a real user's device get
stuck the same way (an old install whose original full sync predates 2026-08-27, delta-syncing
ever since with no way to detect or self-heal the gap)? Not investigated this session — flagged
for one that can look at sync correctness broadly, not just this feature.

**Process notes worth keeping:** pulling a live SQLite DB off the emulator via
`adb shell run-as <pkg> cat <path>` through a normal shell redirect **silently corrupts the file**
(CRLF translation) — the file size shifts and sqlite3 reports "database disk image is malformed."
`adb exec-out run-as <pkg> cat <path>` is binary-safe and worked correctly; needed `MSYS_NO_PATHCONV=1`
in front of both variants for the remote path to survive Git Bash's path mangling. And the
substantive one: **an on-device data query is evidence about that device, not about the live
system** — the same check against the actual backend (a curl to the real endpoint) reversed the
conclusion entirely. Worth checking the live source of truth before writing up a "systemic" finding
from local state alone, even when the local evidence looks compelling.


**Correction to a claim this file has repeated for several sessions.** It has said that a deployed Cloud Run instance restarting from a build lacking the applied migrations "fails Flyway validation and will not start", and treated that as the project's single most time-sensitive item. **That is not true for this situation, and it was tested rather than assumed.** Flyway's `ignoreFutureMigrations` defaults to `true`, and V11–V16 are *future* migrations relative to the deployed build (they sort above its highest local version), so Flyway logs a warning and proceeds. Direct evidence: on 2026-08-31, with the database at **v16** and the deployed build at roughly **v10**, the Cloud Run service **cold-started successfully** (a 29-second cold start, then `{"status":"UP"}`). The "will not start" failure mode belongs to a *missing intermediate* migration, not a newer one. Pushing is still worth doing promptly — but it is not the emergency this file claimed.

**Previously, 2026-08-24. Three things shipped that session and were pushed to `main`**: a full black+blue dark theme across the whole app (`reports/16-black-blue-dark-theme/`), a fix for initial sync silently failing partway through — it now retries indefinitely with backoff instead of stranding the user (`reports/17-resilient-initial-sync/`), and a Practice/Mock Test navigation overhaul — Mock Test now goes through an Exam Selection step like Practice does, and switching tabs mid-quiz/mid-test shows a "Leave this test?" confirmation that correctly resets the abandoned module (`reports/18-practice-mock-test-exit-guard/`). **That push also triggered the GitHub Actions APK workflow's first-ever successful run on GitHub** (run #4, `8c5140e`) — it produced a real signed artifact, `sarkaritaiyaari-1.0.0-1004-8c5140e.apk`, confirmed via the Actions API. The user is now checking that build on their own physical device and separately reported "some issues with latest changes" to discuss later — not yet triaged as of this update. Previously, on 2026-08-21: **Signed Android APKs are now built by GitHub Actions** — a real upload keystore exists, an Expo config plugin makes the signing survive `expo prebuild`, `versionCode` comes from the CI run number, and the build fails if the finished APK's signer certificate doesn't match the upload key. Push to `main` gives a 30-day artifact; a `v*` tag gives a permanent GitHub Release. See `reports/15-github-actions-apk-builds/github-actions-apk-builds.md` and `ANDROID-BUILDS.md`. This closes half of TICKET-505 (signing) and leaves the other half (Play Console) open. Earlier the same day: **the backend was deployed and went live on Google Cloud Run** — `https://sarkaritaiyaari-backend-815653276881.asia-south1.run.app` — closing the "decide production hosting" item that had sat open for the whole project. It serves the existing Neon database, so all ~36,000 questions and real accounts are live. **One urgent open item came out of it: the admin credentials recorded in this file are published in a public GitHub repo and now unlock a publicly reachable backend — confirmed exploitable, not theoretical, and not yet remediated.** See `reports/14-cloud-run-deployment/cloud-run-deployment.md`. Previously, four things shipped across the prior session (spanning 2026-08-18 to 2026-08-20): admin authentication, crash reporting + basic analytics (TICKET-503), load-test data seeding (TICKET-501), and a non-blocking startup + hybrid online/local data layer (from a user-provided spec, no ticket number). The load-test work found and fixed 4 real backend performance bugs plus a 5th, client-side one caught via actual on-device emulator testing; TICKET-503 went further than "built" — a real crash-report event was confirmed landing in the Sentry dashboard. The hybrid-sync work found and fixed two more real bugs via on-device testing: a sync-progress banner that silently blocked tab-bar taps once it became visible during a long first sync, and a whole screen (Practice's exam list) that got missed in the first wiring pass. Accounts + progress sync (v1.1), bookmark sync, and the offline indicator all shipped previously. The product-facing feature set for V1.0/V1.1 is essentially complete; what's left is the rest of Sprint 5 (QA/perf/release prep) — see `reports/TICKET-STATUS.md`.

This file exists so any future session (or teammate) can pick up exactly where things stopped, without re-reading the entire `offline-exam-app-requirements.md` history. Update this file every time work pauses for more than a few minutes, or at the end of a work session.

**Related, newer files worth knowing about:** `reports/TICKET-STATUS.md` (every ticket ever, one file, with status), `reports/architecture-decisions.md` (ADRs), `reports/open-questions.md` (consolidated open business/technical decisions). This file stays the single "where do I resume" entry point; those three hold the detail so this one doesn't have to.
## Session of 2026-09-01/02 (4) — Exam Guide coverage-ledger closure, all 5 phases: summary

All five phases of the approved plan are now complete (Phase A–E reports and their own
detailed STATUS entries are below this one). Headline results, for anyone resuming later:

- **One critical, previously-undetected bug fixed**: every Exam Guide mobile API call
  doubled its `/api` prefix (`api/examGuide.ts`), so the entire feature has never worked on
  a real device across three prior "shipped" sessions — curl-verified (404 → 200) and fixed
  in Phase B. This is the single most important finding of the session.
- **One real architectural finding, fixed before it shipped wrong**: a naive `@Scheduled`
  reminder job (Phase D) would have been silently non-functional on this project's actual
  Cloud Run scale-to-zero deployment. Built as an externally-triggerable endpoint instead
  (`POST /api/admin/reminders/dispatch`, meant for Cloud Scheduler).
- **Two more real bugs found by testing against live/real data, not trusting a clean
  compile**: the §30 cycle-diff endpoint's "previous cycle" ordering was backwards for the
  seeded demo data (Phase B); the demo seeder would have silently unpublished itself the
  moment content-validation states shipped, undetected until a live curl caught it (Phase
  B).
- **A genuinely clean full backend test suite, obtained and reconfirmed after every single
  phase**: 126 tests, 0 failures, 0 errors at the end — closing a gap the round-2 session
  explicitly flagged as never achieved. New test classes: `ExamGuideContentStatusTest`,
  `PreparePlanAndCareerPostTest`, `ReminderTest`.
- Backend migrations V18 (content status) → V20 (reminders); mobile local migrations
  0014 (offline cache + career posts) and 0015 (diagnostic attempts).
- Every ledger item originally "not started" that could reasonably ship without inventing
  new product scope now has *something* real behind it — §8 reminders, §21 diagnostic
  test, §22 roadmap-as-Prepare, §25/§26 career info, §27 comparison, §28 recommendation,
  §30 what's-changed, §36 content states, §44 partial offline cache, §47 scoped search.

**The one thing that did NOT change across all five phases: no on-device or emulator run
happened this session.** Every phase's report says so explicitly. Given the Phase B
discovery, this is the highest-value next action for anyone resuming — not optional
polish. See the coverage-ledger artifact (republished with this session's changes) for the
section-by-section detail, and `reports/23-exam-guide-phase1/exam-guide-phase1-round3-
phase-{a,b,c,d,e}.md` for the full account of each phase.

## Session of 2026-09-01/02 (4), Phase D — reminders / push notifications

Report: `reports/23-exam-guide-phase1/exam-guide-phase1-round3-phase-d.md`. Migration
**V20**. This was the phase flagged in advance as adding a genuinely new capability, and
it surfaced a real architectural decision worth remembering:

**A `@Scheduled` job would not have worked in this project's actual deployment.** The
backend runs on Cloud Run with `--max-instances=3` and scale-to-zero — an in-process timer
only fires while some instance happens to be alive, which on a scale-to-zero service with
no other traffic can be never. Building the obvious "poll every 15 minutes" approach would
have looked correct in local dev and been silently dead in production. Fixed by exposing
dispatch as `POST /api/admin/reminders/dispatch`, an explicit admin-token-protected
endpoint meant to be triggered by an external scheduler (Cloud Scheduler is the intended
production trigger — one more piece of one-time `gcloud` setup this session can't
provision, same category as the existing GitHub Actions repository variables).

**Shipped:** `push_tokens` (Expo push token per user, upsert-on-(user,token)) and
`user_reminders` tables; full create/list/cancel with ownership checks; dispatch via
Expo's push HTTP API using the JDK's own `HttpClient` (no new backend dependency). Mobile:
`expo-notifications` installed, permission request + token registration wired into sign-in
(non-blocking — a slow/denied registration can't delay sign-in), a bell icon per Important
Date with a same-day/1-day/3-day lead-time choice via a plain `Alert.alert` (no new
settings screen, no schema change needed on the mobile side).

**A real infrastructure gap found and documented, not hidden:** this app has no
`eas.json`/`extra.eas.projectId` anywhere (checked via `npx expo config --json`), so
`Notifications.getExpoPushTokenAsync()` will throw and silently no-op today — permission
can be granted but no real token ever reaches the backend until an EAS project is
provisioned (`eas init`), a one-time setup this session couldn't do. Documented in the
code's own comment, not swept under the rug.

**Verified end-to-end against Expo's real live push service, not mocked:** registered a
syntactically-valid fake token, created an already-due reminder, triggered dispatch with a
minted admin token, and confirmed in the backend log that Expo's actual API was called and
correctly responded `DeviceNotRegistered`; the dispatch summary accurately reported
`{"dueCount":1,"sentCount":0,"failedCount":1}`, and the reminder was confirmed `sent: true`
afterward. New `ReminderTest.java` (6 tests, all passing). Mobile `tsc`/`expo lint` at
baseline throughout.

**Not verified:** still no on-device/emulator run — the standing gap across every phase,
and the one this phase needed most (a real permission prompt and a real device token can't
be exercised by curl). Cloud Scheduler itself was not provisioned.

**Next:** Phase E (§21 diagnostic test, migration V21) — the last phase in the plan.

## Session of 2026-09-01/02 (4), Phase C — roadmap-as-Prepare, career info, comparison, recommendation

Report: `reports/23-exam-guide-phase1/exam-guide-phase1-round3-phase-c.md`. Migration
**V19**. No schema surprises this phase, but real, verified new functionality:

- **§22 Roadmap** built as a Prepare-section enhancement (not a new "Roadmap" module —
  extends the earlier Doc 1 audit's finding, doesn't reopen it). New
  `GET /api/exams/{code}/prepare-plan`, derived entirely from Epic L's already-computed
  topic priority/prerequisite/mastery data — no new tables. Verified against real SSC_CGL
  data: 61 topics correctly ordered by `finalPriority` descending, **exactly one**
  `recommended: true` (counted, not eyeballed). Prepare's two static buttons became a real
  ordered checklist with mastery icons and a "Next up" badge, tapping through to Practice
  scoped to that topic. Deliberately live-only, not cached — per-user and cheap to refetch.
- **§25/§26 Career info & growth** — new `exam_career_posts` table, **exam-scoped, not
  cycle-scoped** (posts don't reset every recruitment round). Appended to the existing
  combined guide response per §59's convention; full admin CRUD; a 9th offline-cache table
  added to migration `0014` (safe to extend — it had executed nowhere yet this session).
  Known, stated limitation: rides on the cycle gate, so an exam with no current published
  cycle shows no career info either.
- **§27 Exam comparison** — new screen `exam-compare.tsx`, capped at exactly two exams (a
  stated scope decision — mobile width, not enough exams yet to justify more). Reads
  through Phase B's hybrid facade, so it works offline once both exams are cached.
- **§28 Recommendation** — a client-side heuristic on My Exams (urgency + subject overlap
  with practice history), no new endpoint, no ML. Honest limitation: with only one exam
  having real Guide content right now, the urgency signal can't yet show real variety.
- **Real bugs found via curl against real data, not synthetic fixtures, again** — the same
  discipline that caught Phase B's chronology bug: none this phase, but the full career-
  post lifecycle (create → appears in guide → delete → gone) was verified end to end with
  a minted admin token, not just unit-tested.

**Verified:** backend `mvn compile` clean; every new endpoint curled against live seeded
data (see above); mobile `tsc`/`expo lint` at the exact pre-existing baseline throughout —
two more `set-state-in-effect` violations introduced and fixed with the same
keyed-loaded-state pattern `PreparationPlanCard` established; admin `npm run build`/
`oxlint` clean. New backend test `PreparePlanAndCareerPostTest.java`.

**Not verified:** still no on-device/emulator run — same standing gap as A and B, and the
one that mattered most so far (Phase B's `/api` prefix bug). The two-exam comparison
picker's real tap interaction and the recommendation heuristic's real-world differentiation
(only one exam has content to differentiate against) are both unexercised.

**Next:** Phase D (§8 Reminders — new push-notification capability, migration V20) and
Phase E (§21 diagnostic test, migration V21). Phase D specifically adds a user-facing
permission prompt and a new outbound network dependency — worth a check-in before starting
it, not just proceeding on the original plan's momentum.

## Session of 2026-09-01 (4), Phase B — offline cache, search, cycle-diff, content states

**The most important thing found this phase: the entire Exam Guide mobile feature has never
worked on a real device or emulator, across all three prior sessions that "shipped" it.**
`mobile/src/api/examGuide.ts` prefixed all four of its endpoint paths with `/api/...`, but
`API_BASE_URL` already ends in `/api` (confirmed against `api/reference.ts`'s `getExams()`,
which is extensively on-device-tested and correctly has no such prefix) — so every Exam
Guide request was actually hitting `.../api/api/exams/...`, a guaranteed 404. Verified
directly: curled both forms against a live backend, old path 404s, fixed path 200s. This is
exactly why every prior session's report said "not verified on a real device" — nobody ever
opened the screen; verification was always `curl` against the backend's own route directly,
which is correctly `/api/exams/...` from Spring's side. Fixed in `api/examGuide.ts`; grepped
the rest of `mobile/src/` for the same mistake, found nowhere else.

Report: `reports/23-exam-guide-phase1/exam-guide-phase1-round3-phase-b.md`. Shipped:

- **Offline cache for the Exam Guide screens (§44)** — 8 new local tables (mobile migration
  `0014`, pure guarded `CREATE TABLE`), `writeExamGuides()` folded into the ordinary
  reference sync (one combined request, full-replace on success, same pattern
  `writeExamStructures` uses), a hybrid facade (`data/examGuideData.ts`) so
  `exam-guide.tsx`/`eligibility-checker.tsx`/Home's countdown card read local-or-live
  exactly like every other hybrid function in this app. Deliberately NOT cached: past-cycle
  history and the §30 diff below — genuinely offline, those stay unavailable.
- **Search (§47)** — scoped to filtering My Exams' Explore list, not a cross-content engine.
- **"What's changed this cycle" (§30)** — new endpoint diffing a cycle against the exam's
  previous published one. **A real bug found by testing against real seeded data, not a
  synthetic fixture**: "previous" was first ordered by `createdAt`, but the demo seeder
  inserts its current cycle *before* its past one, so a live curl against real SSC_CGL data
  returned `hasPrevious: false` when it should have found the 2026 cycle. Fixed by ordering
  on real-world chronology (`applicationStart` → `notificationDate` → `examStart`) instead;
  re-verified against the same live data afterward — correctly reports 15 real changes.
- **Content-validation states (§36)** — `DRAFT`/`PUBLISHED` on `recruitment_cycles`
  (migration **V18**), deliberately two states not the spec's three (one admin role, no
  reviewer to hand `REVIEW` to). **A real regression caught before shipping**: the demo
  seeder builds cycles directly, not through the DTOs that default to the new field, so
  without a fix the seeded demo guide would have vanished from every public read the moment
  this migration ran. Fixed by explicitly publishing both seeded cycles. Admin gained a
  publish/unpublish toggle and a content-status field.
- **Backend test coverage — a real pre-existing gap closed.** No test file for any part of
  the Exam Guide model existed before this session (confirmed by listing the test
  directory) despite V17 shipping two sessions ago. New `ExamGuideContentStatusTest.java`
  (3 tests) covers this phase's new behavior plus the draft/current/public-read interaction
  that had never been exercised at all.
- **Obtained the genuinely clean full `mvn test` run** the round-2 session flagged as never
  achieved (undermined then by running `spring-boot:run` in the same shell as `mvn test`).
  This time, from a shell confirmed not running the dev server first: **115 tests across 18
  classes, 0 failures, 0 errors.**

**Verified:** backend `mvn compile`/`mvn test` (115/115); every new/changed endpoint hit
directly with curl against a real running instance including the `/api` bug reproduction
and fix, the diff endpoint before/after the chronology fix, and a draft cycle 404ing from
the public guide until published. Mobile `tsc`/`expo lint` at the exact pre-existing
baseline throughout. Admin `npm run build`/`oxlint` clean.

**Not verified — the one that matters most:** still no on-device/emulator run of the mobile
app. Given the `/api` bug just found, this is not optional polish — it's the check that
would have caught three sessions' worth of a completely non-functional feature. Also
unverified: local migration `0014` against a real (especially populated) SQLite database,
and the admin's new publish/unpublish UI in an actual browser (no Playwright available this
session — covered only by the backend JUnit test hitting the same endpoints).

**Next:** Phase C (§22 roadmap-as-Prepare-enhancement, §25–28 career info/comparison/
recommendation), migration V19 — continuing in the same session per the approved plan.

## Session of 2026-09-01 (4) — Exam Guide coverage-ledger closure, Phase A (wiring & polish)

**Requested:** close every remaining gap in the published "Exam Guide Coverage Ledger"
artifact (23 not-started + 12 partial of 76 sections), including the large net-new
subsystems (diagnostic test, roadmap, career info/comparison/recommendation, reminders).
Given the size, planned first (via Explore agents + a Plan file, approved by the user)
into 5 phases — **A: wiring/polish, B: offline cache + search + cycle-diff + content
states (V18), C: roadmap-as-Prepare-enhancement + career/comparison/recommendation (V19),
D: reminders/push (V20, new mobile capability), E: diagnostic test (V21)** — each ending
in its own report + this file's update, same rhythm as every prior Exam Guide session.
This entry covers **Phase A only**; report:
`reports/23-exam-guide-phase1/exam-guide-phase1-round3-phase-a.md`.

**Key research finding before planning, worth remembering:** grepped the whole repo for
push-notification infra (`fcm|push|expo-notifications|PushToken`) — **zero hits anywhere**,
backend or mobile. Reminders (Phase D) is a from-scratch capability, not a wiring task.
Also: no content-approval-state pattern (draft/review/published) exists anywhere in the
backend either — Phase B's content-validation work is likewise from scratch.

**Phase A shipped:**
- "Add to My Exams" follow/unfollow toggle directly on the Guide screen (previously only
  reachable from My Exams) — same `followed_exams` rows, both screens now agree.
- A "Your Progress" card on the Guide screen: practice accuracy and mock-test best
  score/attempts **for this specific exam**, entirely from existing data functions
  (`useSessionHistory()` filtered by `examCode`, `getMockAttemptSummary`) — no new queries.
- Home: a deadline-countdown card for the followed exam, and an "Explore Exams" link to
  My Exams. New shared `mobile/src/examGuide/dates.ts` so Home and the Guide screen
  compute the same priority tiers the same way.
- **Found two ledger rows already stale** — the working tree had moved past what the
  published ledger describes: §5's "Check eligibility" CTA and §2's syllabus/PYQ CTA path
  both already existed. Noted for the ledger's next republish rather than rebuilt.
- **Deliberately deferred, discovered mid-implementation, not assumed up front:** the
  "Eligible" badge (part of §50) needs a persisted date-of-birth + category, and **no user
  profile field for either exists anywhere in this app** (checked `account.tsx`) —
  `eligibility-checker.tsx`'s verdict is computed from screen-local state that's thrown
  away on close. Adding one is a schema decision this phase's "no schema changes" scope
  explicitly excludes; flagged for a future phase rather than hacked into the
  device-only, explicitly-not-account-data `app_preferences` table.

**A real lint violation introduced and fixed the same pass:** Home's new deadline effect's
early-return `setState` tripped `react-hooks/set-state-in-effect`. Fixed with the exact
pattern this codebase already used for the identical shape in `PreparationPlanCard.tsx` —
store the loaded value keyed to the id it was loaded for, derive the rendered value by
comparing to the current id. Same fix incidentally closes the same latent bug
`PreparationPlanCard` had already found and fixed: switching the followed exam could
otherwise flash the *previous* exam's deadline while the new fetch was in flight.

**Verified:** `tsc --noEmit` clean; `expo lint` back to the exact pre-existing baseline (9
problems: 8 errors, 1 warning) after the fix above. **Not verified: no on-device/emulator
run this phase** — all reasoning is from reading the existing, already-tested data
functions this phase composes, not from opening the app. Worth an emulator pass before
this ships, per this project's standing rule that a clean compile has repeatedly missed
real bugs here.

**Next:** Phase B (offline cache for the four Exam Guide screens, search on My Exams,
"what's changed this cycle" diff, draft/published states on `recruitment_cycles` —
migration V18). Continuing per the approved plan in the same session.

## Session of 2026-09-01 (3) — Exam Guide round 2: closed the highest-value gaps from the coverage audit

**Requested:** "continue with remaining phases and remaining tickets" — after the coverage
ledger artifact (76 sections mapped, published this same day) showed 48 of 76 partial or
not-started. Worked through the highest-value gaps in full rather than spreading thin
across everything; report: `reports/23-exam-guide-phase1/exam-guide-phase1-round2.md`.

**Shipped, all verified against the live backend:**

- **Navigation (§39/§41/§65/§72) — the gap flagged as most worth fixing first.** Progress is no
  longer a primary tab (`href: null`, route/data untouched); access is now Home's existing
  readiness card + a new More → Progress row.
- **Eligibility Checker (§9)** — new screen, computes age against min/max + category
  relaxation from data the Guide already had; qualification is a self-declared checkbox
  (backend field is free text), always shows the required disclaimer.
- **My Exams + Exam Discovery (§29/§47/§48)** — new screen. `followed_exams` was never
  actually single-exam (PK is `examCode`); added plural `getFollowedExams()`/
  `unfollowExam()` alongside the existing single-exam query without touching Home's or
  PreparationPlanCard's call sites.
- **Notification History (§63/§37)** — new public endpoint + screen; past cycles were
  already kept, never deleted — nothing could read them until now. Verified against a
  real second (past) demo cycle, not just the empty case; the seeder now creates it by
  default.
- **Source attribution surfaced (§32)** — every date/document/fee/eligibility fact now
  carries `sourceId`; the Guide screen shows a tappable "Source: ..." line per section.
- **Practice/Mock links (§23/§24) + difficulty/badge pills + priority tiers (§67,
  Today/Critical/High/Upcoming/Later) + per-step official URLs (§12) + 5 analytics events
  (§56) + an accessibility pass on every new screen's Pressables (§52, partial).**

**A real bug found and fixed:** `MultipleBagFetchException` on the sync-all query — two
collection fetch-joins in one JPQL query, the exact mistake an earlier comment on
`ExamStageRepository` warns against. Caught by calling the endpoint, not trusting the
compile. Fixed the same way that precedent does: fetch-join only the exam, batch-fetch
the rest.

**Verified:** clean `mvn compile` throughout; every new/changed endpoint hit directly with
curl (empty and populated cases); mobile `tsc` clean and `expo lint` held at the
pre-existing 9 throughout (two new violations introduced and fixed same-pass: a
`set-state-in-effect` and an unescaped apostrophe). The coverage ledger artifact was
updated in place (same URL) — 17 sections and 10 acceptance-criteria items upgraded.

**[RESOLVED 2026-09-01, later the same day] The clean full backend regression suite gap is
closed.** With no other Maven/Spring process running (confirmed via `jps`/`netstat` first),
`mvn test` was re-run end to end against the real Neon database with the full uncommitted
Epic L + Exam Guide changeset in place: **111 tests, 0 failures, 0 errors, `BUILD SUCCESS`**,
~23.5 minutes. All 16 existing test classes passed, `EpicLIntelligenceTest` included (21
tests, the longest single class at ~400s).

**Caveat found while checking this, not previously called out: there is no dedicated
automated test class for the Doc 1 Exam Guide feature** (`recruitment_cycles`,
`eligibility_rules`, `important_dates`, `document_requirements`, `application_steps`,
`fee_rules`, etc. — migration V17). None of the 16 test classes cover it; its only
verification anywhere is the curl checks described in the session above and in
`reports/23-exam-guide-phase1/`. The 111/111 green result says the rest of the backend
didn't regress from that work landing — it says nothing about the Exam Guide endpoints
themselves being correct beyond what curl already checked.

**Still genuinely unstarted, unchanged:** Diagnostic test, Reminders (needs push
infrastructure that doesn't exist yet), Career info/comparison, "What's Changed" diffing,
content-validation workflow, full offline caching, Search. New Doc 1 screens
(eligibility-checker, my-exams, exam-guide-history) stay English-only — stated
explicitly, not left inconsistent.

## Session of 2026-09-01 (2) — Exam Guide Phase 1: backend, admin, mobile (Doc 1)

**Requested:** continue with the second document ("Doc 1" — the large new Exam Guide /
Exam Intelligence feature), deferred from the earlier Doc 2 session. Decision already
taken then: build it all, seed demo content **labelled as demo in the UI itself**.

Report: `reports/23-exam-guide-phase1/`.

### Doc 1's own audit — what was wrong before writing code

- **Assumes a Roadmap module that doesn't exist.** §22/§71/§72 reference it repeatedly; the
  app's tabs are Home/Practice/Mock Test/Progress/More. Not invented to satisfy the doc.
- **§40's "Footer Module" is a web pattern** for an app with only a bottom tab bar. Not built.
- **Phase 2 (§16–§19: pattern, syllabus, trends, difficulty) is already ~70% built** by Epic
  L and V11. Reused, not duplicated — Doc 1's own §59/§70 says not to rebuild what exists.
- Phase 1 itself (discovery/overview/status/dates/eligibility/documents/fees/how-to-apply)
  was genuine greenfield: `exams` had 5 columns before this, no cycle/date/fee/document
  table existed at all.

### What shipped

**Backend** — migration `V17`: `recruitment_cycles` (admin-set `is_current`, one per exam
via a partial unique index; persistent `is_demo` flag — not a seeding note, a permanent
badge), `exam_sources`, `eligibility_rules` (1:1 per cycle), `important_dates`,
`document_requirements` + `user_document_status` (synthetic id per **ADR-005**, not
`@IdClass`), `application_steps`, `application_mistakes`, `fee_rules`. Public
`GET /api/exams/{code}/guide` (404 when no current cycle — the normal state for 10/11
exams) and `GET /api/exam-guides` (sync-all); full admin CRUD; a demo seeder for one SSC
CGL "2027 (Demo)" cycle, gated the same two-lock way as Epic L's synthetic seeder
(admin token + `app.exam-guide.demo-seed-enabled=true`, default false).

**Admin** — `pages/ExamGuide.jsx` (cycle picker + eligibility/dates/documents/steps/
mistakes/fees, all CRUD) and `pages/ExamSources.jsx`, reached via a new "Guide" button on
the Exams list.

**Mobile** — `app/exam-guide.tsx`, reached by tapping the exam card on Home. Status pill,
countdown, quick facts, dates timeline, eligibility with the required official-source
disclaimer, a tap-to-cycle document checklist (signed-in only), how-to-apply steps,
mistakes, fees, and a demo banner that cannot be hidden. **Scope decision, stated rather
than hidden: live-fetch only, no local SQLite cache/sync pipeline this pass** — unlike
every other reference type in the app. Cost: no offline access yet (spec §44 unmet).

### Two real bugs found and fixed

1. **`MultipleBagFetchException`** on the very query my own earlier comment (on
   `ExamStageRepository`) warned against — two collection fetch-joins in one JPQL query.
   Caught by actually calling the sync-all endpoint rather than trusting a clean compile.
   Fixed by fetch-joining only the exam and batch-fetching the five child lists.
2. **Pre-existing, not introduced this session: `javac` on this Windows machine was never
   told to read source files as UTF-8**, so `pom.xml` had no `sourceEncoding` set and
   javac fell back to Cp1252. Any em dash in a STRING LITERAL (not a comment) compiled
   into three wrong codepoints and round-tripped through JDBC as visible mojibake. This
   was already live in shipped code — `AuthService.java`'s "Session expired — please sign
   in again" (a real 401 body real users could see) and two `TopicIntelligenceService`
   override-validation messages. Fixed with one `pom.xml` property; no source file needed
   editing since the em dash was always correct UTF-8 on disk.

### Verified

Backend `mvn compile`/`clean compile` clean; full existing test suite reported complete,
exit 0. Live curl checks: anonymous `GET .../guide` returns the full nested payload with
`demo: true`; sync-all works after the fetch-join fix; an exam with no cycle 404s (mobile's
empty-state path); the document-status write 401s with no token; em dashes render clean
after the encoding fix + purge/reseed. Admin `npm run build` clean, `oxlint` unchanged.
Mobile `tsc` clean; `expo lint` back to the pre-existing 9 after fixing one
`set-state-in-effect` violation I introduced (split a combined load-and-setState function
into a pure fetch plus a separate retry handler).

**Not verified:** the admin pages in an actual browser, and the mobile screen on a real
device/emulator — no browser-automation tool was available this session. Both are
exercised solely through their real, working backend API surface via curl, not through
the UI itself. Metro and the backend dev server were left running (not restarted a third
time) since the user was mid-way through their own device check of the earlier Doc 2 work.

### Next

Doc 1 Phase 2 (trends/difficulty/where-to-start) is already ~70% covered by Epic L — what
remains there is presentation, not data model. Phases 3– 4 (eligibility checker,
diagnostic test, My Exams/reminders, notification simplifier, comparison) are genuinely
unstarted. The mobile offline-cache gap (§44) is the most likely thing to bite first if
Exam Guide content needs to work without a network.

## Session of 2026-09-01 — Doc 2 build improvements: network toast, session lifecycle, quiz navigation, light theme, zoom, Telugu

**Requested:** two documents were supplied — one of build improvements ("Doc 2"), one a large new
Exam Guide feature ("Doc 1"). The user chose: **Doc 2 first**, theme toggle **included now**, and
Doc 1 later with **visibly-labelled demo content**. Doc 2 is done; **Doc 1 has not been started.**

Report: `reports/22-build-improvements-theme-zoom-i18n/`.

### Audit first — three of Doc 2's premises were wrong

Following the standing rule for AI-authored specs in this project. Doc 2 was right about §1,
§2, §3, §6, §7, §9 and §11 (mechanisms found and recorded in the report), and wrong about:

- **§8** — Progress/history/exam-progress already counted questions. The real problem it missed is
  that `total_count` meant BOTH "answered" and "offered", which was only correct while answering
  everything was mandatory. **§7 and §8 are therefore one change**; shipping early-finishing alone
  would have silently corrupted every accuracy figure in the app (8 read sites + SQLite + the sync
  payload + the backend entity + Epic L's `CHECK (correct_count <= attempted_count)`).
- **§10** — the app was dark-only *by design*, with 496 `colors.*` references across **43** files
  inside 38 module-level `StyleSheet.create` calls. Far larger than the doc implies.
- **§5** — not implemented as written, deliberately. A 90s idle timer now collapses navigation
  depth but explicitly does NOT clear an active session: nothing is persisted until a quiz is
  finished, so clearing "temporary question state" would destroy the unsaved work of anyone who
  took a phone call — which §5's own acceptance criterion forbids.

### What shipped

| § | What |
|---|---|
| 1 | `OfflineBanner` → `NetworkStatusToast`. The provider now tracks an **edge**, not a level — that is the whole fix; a component rendering from a level has nothing to time. 3.5s, green "Back online", handles flapping/first-reading/backgrounding |
| 2 | `useActiveTestBackGuard`. **One `BackHandler` listener covers button AND gesture because `app.json` sets `predictiveBackGestureEnabled: false`** — a real dependency, commented in the hook |
| 3 | `useEffect(() => endSession, [])` in quiz and mock test. The flag was set on load and cleared only on completion, so backing out left it set all the way to Practice Home |
| 4 | `backBehavior="initialRoute"`. The reported back-traversal was **tab history**, not leaked state |
| 5 | `useStaleStackReset` — 90s, navigation depth only, on re-entry (a background timer would pop whatever the user was looking at, since `dismissAll()` resolves against the focused stack) |
| 6–8 | Quiz rewritten around `answers` as the single source of truth. Previous/Next, finish from the first answered question, `total_count` = answered, new local-only `available_count` = offered, `results` covers only answered questions (otherwise skipped ones flood Revise as "wrong") |
| 9+10 | **One** refactor across 43 files. Style sheets became `buildStyles({ colors }: Theme) => ...` factories — destructuring means all 496 token references are **unchanged**, which is what makes the diff readable. Zoom is applied centrally in `useThemedStyles` (174 `fontSize` sites, impossible to forget), text only, capped at 130% |
| 11–13 | `src/i18n/` with ~250 strings. **`te` is typed as `en`'s shape, so missing keys are a build error** — coverage is compiler-enforced. New `app/settings.tsx` for all three preferences |

Migration `0013`: `app_preferences` (device-local, not synced, not cleared on sign-out) plus
`practice_sessions.available_count`.

### Verified

`tsc` **clean**. `expo lint` **9 problems, all pre-existing** (baseline 11; nothing new).
Migration `0013` tested against a **populated** pre-0013 SQLite database — rows survive
byte-identical, `available_count` is NULL not 0, `app_preferences` upserts without clobbering
siblings. All 39 style factories confirmed module-level (the `WeakMap` cache depends on it).
**Backend untouched, 0 files changed.**

Three lint errors I introduced and fixed, two of them real bugs: reading a **ref during render**
to gate the back guard in both quiz and test (now reads the `finishing`/`submitting` state set in
the same statement), and `levels.tsx` calling a palette factory three times per row inside a
`useMemo` missing `colors`.

### Still not verified — unchanged from before, and now larger

**The app has still never been launched.** The light theme is 43 files of colour changes that only
a screen can confirm, and the Telugu wording has not been reviewed by a native speaker (keys and
coverage are correct; phrasing is not vouched for). Two screens are permanently English by
necessity: the pre-migration "Setting up local database..." and "Database migration failed", which
render before any provider mounts because the language preference lives in the database whose
migration has not finished.

### Next

**Doc 1 — Exam Guide.** Not started. Its own audit found that it assumes a **Roadmap module that
does not exist**, calls for a **web-style footer** in an app with a bottom tab bar, and does not
know that its **Phase 2 is already ~70% built** by Epic L and V11. Phase 1 is genuinely greenfield:
~11 tables, ~11 admin screens, ~15 endpoints. Decision already taken: build it all and seed content
**labelled as demo in the UI itself**, so nothing unverified can ever look official.

## Session of 2026-08-31 — Epic L completed (TICKET-2104–2109), seeded, and admin click-tested

**Requested:** "complete those all tickets with fake data … including mobile also. after
completing just inform me i will check in emulator." So the synthetic data is a deliverable, and
the mobile side is in scope.

**Epic L is now complete** — all nine tickets. The six that were open (2104–2109) are done on the
backend and admin side, and mobile consumes the model.

Report: `reports/21-epic-l-intelligence-and-pyq/`.

### What shipped

| Ticket | What |
|---|---|
| **2104** PYQ provenance | V13. `is_pyq`/`pyq_year`/`pyq_shift`/`source_paper_id`/`question_number`/`source_url`. One shared applier across create/update/bulk-import |
| **2105** per-topic mastery | V14. `user_topic_progress`, last-write-wins like bookmarks, with a real state machine. **Unblocks Epics A, C and D** |
| **2106** trend + priority | V15. Algorithm-versioned, inputs stored as JSONB for §67 auditability |
| **2107** admin override | Three separate priority columns per §66, with a CHECK asserting the precedence rule |
| **2108** real pattern versioning | V16. Two versions of a stage can finally coexist; `effective_to` plus one resolution function |
| **2109** server-side dedup | V13. Fingerprint against the **whole bank**, records the pair, never deletes |

**Mobile (local migration `0012`)** — Practice → Topics now groups topics under their parent, has
a **By priority / Syllabus order** toggle, and shows per-topic chips for priority band, mastery
state, PYQ trend and paper weightage, plus a "Best after: …" prerequisite hint. Home gained a
**Focus next** card. The quiz shows an **"Asked in 2023 · Shift 2"** badge. Finishing a quiz
updates that topic's mastery, which syncs and restores across devices.

### Synthetic curation data — seeded, deterministic, reversible

`SyntheticCurationService`, behind **two** gates: an admin token *and*
`app.epic-l.synthetic-seed-enabled` (default false, set true only in the gitignored
`application-local.yml`).

Seeded: **61** topic parents, **97** prerequisite edges, **595** topic-map rows across 11 exams
(weightages normalised to sum 100 per exam), **8,962** questions tagged as PYQs across 2019–2024,
intelligence recomputed for 12 exams, 2 admin overrides per exam.

Every choice derives from an MD5 of the row's own UUID rather than an RNG, so re-running is
identical and idempotent (a second run reported 0 rows added for every pass). Years are skewed
per topic so trends genuinely vary — **32 RISING / 24 FALLING / 5 STABLE** on SSC CGL. A uniform
draw would have made every topic STABLE and left TICKET-2106 looking correct while untested.

**Reversal:** `POST /api/admin/synthetic-curation/purge`. PYQ rows are removed *precisely* via a
`synthetic://epic-l-demo` marker in `source_url`. The curation tables have no provenance column,
so those are cleared wholesale — the purge report says so out loud, and `exam_subjects` is left
intact because it was derived from real questions rather than invented.

### The admin console has now been click-tested in a browser — the first time ever

That gap had been open because of **access**, not effort: the only working admin's password is
deliberately not in this public repo, and the account the docs named is a demoted `STUDENT`.

Closed with `AdminTokenMintRunner` — mints a **45-minute** token for the *existing ADMIN-role test
fixture* (`automated-test-admin@sarkaritaiyaari.internal`, already recorded here as a harmless
artifact). No human's credentials involved, no password created or stored, revocable via
`EPIC_L_MINT_TOKEN=revoke`, and env-var gated so it is invisible to `mvn test` and CI.

Playwright confirmed: 61 intelligence rows render; the three priority columns are visibly distinct
(`system 36.25 / override 90.00 / final 90.00`); client-side validation fires; **the override
persisted across a full page reload** — the exact check the previous session's shadowed-import bug
would have failed; clearing an override restores the computed value; the PYQ year field is
disabled until the box is ticked; PYQ badges and topic parents/prerequisites all render; **zero
console errors**.

### Real bugs found and fixed this session

1. **A percent sign in a SQL comment threw at runtime.** A Java text block passed through
   `.formatted(...)` read "the first ~45% of each subject" as an octal format directive (`% o`)
   and threw `IllegalFormatConversionException`. Rewritten with plain concatenation, so no
   comment edit can break a query.
2. **The priority formula did not do what its own weights claimed.** Found by reading real seeded
   output. Computed weightage arrived as ~0.5 on a 0–100 scale, so weightage contributed under a
   point while trend contributed thirty — the ranking was effectively trend-only despite
   weightage carrying the largest weight. Normalised, and **`ALGORITHM_VERSION` bumped to `v2`**
   rather than edited in place, which is precisely what per-row versioning exists for. Top SSC
   CGL score went 45.89 → 91.98.
3. **`backfillDetection` loaded the whole question bank into memory** — `findAll()` over ~37,900
   entities to read two columns; the request never returned. Now one set-based SQL statement.
   Fourth time this codebase has fixed this same shape.
4. **Override carry-forward could resurrect a cleared override** across algorithm versions.
5. **Synthetic override seeding was not idempotent** (a recompute carries overrides forward, so
   each run added two more).

### Found by running it, not reading it

**The live question bank contains 2,189 duplicate fingerprint groups.** Expected, given the
~35,700 templated load-test questions — but nothing in the project could detect it before
TICKET-2109. 1,000 edges are recorded so far (the scan caps per run); the rest need further runs.

### Backend deploys are now automated, working, and Epic L is LIVE

**First successful automated backend deploy: run #11, commit `8d5af31`, 2026-08-31.**
Verified against the live service immediately afterwards:

```
/api/health                          -> {"status":"UP"}
/api/exam-badges                     -> 200   (was 404 - V11, shipped 2026-08-27)
/api/exams                           -> now carries "difficulty" and "badge"
/api/exams/SSC_CGL/topic-intelligence -> 200, algorithm v2, 61 topics,
                                         1827 PYQ appearances,
                                         32 RISING / 24 FALLING / 5 STABLE,
                                         2 overrides with systemPriority preserved
                                         (36.25 and 39.69 beside overrides of 90.0)
```

So the four-day-old V11 gap is closed and all of Epic L is serving from Cloud Run.

#### It took eleven runs, and what that cost was worth recording

Five distinct failures. Only ONE was a real infrastructure problem:

| # | Failure | Whose |
|---|---|---|
| 1 | Repository variables not set | expected, by design |
| 2 | Missing `roles/iam.workloadIdentityUser` binding | real - the setup script had no `set -e`, so its failure scrolled past |
| 3 | `setup-gcloud` step, which was never needed | mine |
| 4 | Credential check asked `gcloud auth list`, empty under WIF by design | mine |
| 5 | Unguarded `gcloud artifacts docker tags add` | mine |

**The generalisable lesson: three of the five were not the operation failing - they were an
unguarded non-zero exit destroying the evidence of what actually happened.** Under GitHub's
default `bash -e`:

- `VAR=$(cmd)` aborts the step *at the assignment* if `cmd` exits non-zero, discarding both
  the exit code and stderr. This is what made runs #7-#10 fail with no annotation at all.
- A trailing command that fails kills the step after everything meaningful has already
  succeeded - the `tags add` case, where the image was built and pushed correctly.

`gcloud builds submit` compounds it by exiting 1 when it merely cannot *stream* the build
log (needs project Viewer), while the build itself succeeds. Its exit code describes gcloud's
ability to watch the build, not the build.

**Rule now written into the workflow: every command either handles its own failure or is
explicitly tolerated, and decisions are made from the artifact's real state (`builds
describe`, `run services describe`) rather than a tool's exit code.**

Also worth knowing for future debugging: **workflow logs need repo-admin auth to download,
but `::error::` annotations are readable through the public API** (`/check-runs/{id}/annotations`).
That is the channel to push diagnostics into - it is how failure #2 was identified.

### Why deploys weren't automated before

`.github/workflows/backend-deploy.yml` deploys the backend on every push to `main` that
touches `backend/**`. **This closes a structural gap that had been silently hiding shipped
features from real devices.**

The APK has been built automatically since 2026-08-21. The backend never was — deployed
once by hand, from the owner's *personal* laptop (this work laptop has restrictions and has
no `gcloud` or `docker` installed, verified 2026-08-31). So every backend change since
2026-08-27 was live in the repo and absent from production, and nobody could see it because
all testing ran on the emulator, which points at a *local* backend.

Measured on 2026-08-31, against the live service, before the workflow existed:

```
GET /api/exam-badges   ->  404          (V11, shipped 2026-08-27)
GET /api/exams         ->  no "difficulty" / "badge" fields
```

So the exam difficulty/badge feature had been invisible on real devices for four days, and
the emulator could never have revealed it. **When a feature "works on the emulator but not
on a device", check whether the backend was ever deployed before looking anywhere else.**

**One-time setup is still required** and has to be done from a machine with `gcloud`
(personal laptop, or Cloud Shell in a browser — needs nothing installed). Two repository
*Variables*: `GCP_WORKLOAD_IDENTITY_PROVIDER` and `GCP_DEPLOY_SERVICE_ACCOUNT`. Full
walkthrough in `DEPLOYMENT.md` → "Automated deploys". Until then the workflow fails fast
and prints exactly what is missing — that first failure is by design, not a broken build.

Keyless (Workload Identity Federation) is the documented path rather than a
service-account key, specifically because this repo is public.

### The deployment consequence that blocked device testing (RESOLVED 2026-08-31)

The deployed Cloud Run backend still runs pre-V13 code. It starts fine (see the correction at the
top of this file), but **it does not have the new endpoints** — `GET /api/exams/{code}/topic-intelligence`
returns **404**, verified by curl on 2026-08-31.

That matters because the GitHub Actions APK bakes in
`EXPO_PUBLIC_API_BASE_URL=https://sarkaritaiyaari-backend-815653276881.asia-south1.run.app/api`
(`.github/workflows/android-build.yml`). So **an APK from CI will show none of the new Epic L
features until Cloud Run is redeployed with this code** — the topic chips render as absent (which
the mobile code handles deliberately), and topic-progress sync 404s.

A related regression was found and fixed while checking this: `uploadPendingTopicProgress` sat
inside the full-sync `Promise.all` alongside progress and bookmarks, so a 404 from the new
endpoint would have **aborted the whole sign-in sync** and skipped restoring practice history and
bookmarks. Now caught per-call — mastery is additive, history is not.

### What is NOT verified

- **The mobile app has not been launched.** `npx tsc --noEmit` is clean, `expo lint` adds no
  new problems, and local migration `0012` was verified against a *populated* pre-0012 SQLite
  database (existing rows preserved, `is_pyq` defaults to 0 not NULL, all 9 guarded statements
  re-runnable) - but no screen has rendered on an emulator or device yet. The backend it needs
  is now live, so a fresh APK should show everything.
- **Local migration `0012` has never executed.** Riskiest item here: SQLite has no
  `ADD COLUMN IF NOT EXISTS`, so its five ADD COLUMN statements are unguardable, and a failed
  migration is a hard gate that stops the app starting. All CREATE statements *are* guarded.
- `PreparationPlanCard` renders nothing unless an exam is followed — by design, worth knowing
  before concluding it is broken.
- The 2,189 duplicate groups are recorded but unreviewed.
- Emulator/browser only; no low-end physical device.

## Session of 2026-08-27 — performance suite, question pool lifted, Epic L started

**Six commits, none pushed** (`ecd6faf`, `bea1175`, `0000c41`, `8dd5e5a`, `c1eb952`, plus `eac8f32` from the preceding session). Working tree clean.

**⚠️ Push is time-sensitive.** `eac8f32` carries migration **V11** and `0000c41` carries **V12**, and *both are already applied to the shared Neon database*. Any deployed Cloud Run instance that restarts from a build lacking them fails Flyway validation (`Detected applied migration not resolved locally`) and will not start.

### 1. Two supplied requirement docs, reconciled rather than executed

Both were AI-authored and the user asked for mistakes to be flagged. Both had real ones.

- **`offline-exam-app-requirements.md` §9** (new) — the performance doc's premises were audited; **seven were refuted**: no 2–3 minute blocking sync (a first sync was ~9 HTTP requests against a ~500-question pool), only the first launch was gated, Home shows no sync UI, sync was already batched and resumable, delta sync already worked server-side, `writeQuestions`' bulk insert was already fixed, and `MAX_SYNC_PAGE_SIZE` is 1000 not 500. Its one legitimate complaint — the blocking first-launch gate — is what got fixed.
- **`preparation-os-requirements.md` v1.1 §18** — the "Exam Intelligence" doc re-specified ~70% of existing Epics A/B/C/D/F and told us to create six tables that already exist. Its layers are mapped onto those epics; only genuinely new material became **Epic L (TICKET-2101–2109)**. Two false claims in that doc's *own* §3 were corrected (it asserted topic-level exam relevance already had an answer, and that Epics A/B/C needed no new capture — mock results carry no topic at all).

### 2. §9 performance work — all six phases done, verified on-device

Report: `reports/19-startup-gate-and-query-limits/`.

- **Startup gate reworked.** It waited for the *entire* question sync; it now waits only on **reference data** (8 small requests, all the shell renders from) with a hard **5-second ceiling** enforced independently of sync state. Questions stream in behind the open app.
- **That ceiling fixed a shipped lockout by construction.** A first launch with no network previously stranded the user forever (the retry wrapper rewrites failures as `"syncing"`, which never satisfied the old release condition). Reproduced in airplane mode; `OfflineNoDataNotice` — unreachable on a cold first launch until now — then rendered.
- **`getPracticeQuestions` had no `LIMIT`.** With `ORDER BY RANDOM()` plus an `inArray` binding one parameter per match, that was a latent SQLite *crash*, not a slow query — masked entirely by the question pool.
- **`loadSessions` was 1+N sequential queries** (51 round trips) on the critical path at every app start, since `SessionHistoryProvider` mounts above the whole tab tree. Now two queries; `MAX_SESSIONS` finally applied as a real `LIMIT`.
- Six indexes added, one redundant dropped (mobile migration `0011`); Revise / practice Summary / mock-test Result virtualized; new `data/mockTestAccess.ts` facade so no Mock Test screen imports both a SQLite and an HTTP module; remaining per-row `await` loops bulked; double-tap guard on quiz Finish.
- **`resetStructureCache` was dead code** despite a comment saying to call it — the live structure snapshot was never invalidated for the process lifetime. Now dropped on a mode change. *Partial:* `practiceData.ts` shares that cache without going through the facade.

**Bugs found by testing, not reading:** `releaseGate` fired once per question page (made the log useless as evidence of which condition won); and **a bare `DROP INDEX` in migration `0011` bricked the app outright** — a failed migration is a hard gate in `_layout.tsx`. **Lesson: drizzle-kit generates index DDL with no existence guards; treat every generated index migration as needing hand-editing to `IF EXISTS` / `IF NOT EXISTS`.** A related near-miss was caught by reasoning: the first generated version made `subjects(name)` UNIQUE, which could have failed permanently on any device holding a duplicate.

### 3. Question pool lifted — full 37,884-question bank

`app.question-pool.temporary-enabled: false`. **The requested "assign the same questions to every query" interim hack was deliberately NOT built**, because measurement showed it was unnecessary: with the pool lifted, **107 of 108 topics have questions** (151–458 each), all 11 exams have 3,392–12,203, each difficulty level ~12k. The one empty topic is the `Automated Test Topic` fixture. So no query had to stop honouring its scoping and the §7 Phase C syllabus scoping stays intact.

A full sync is **76 pages at ~2.7s/page server-side (~203s)** — consistent with the ~236s in `reports/12-load-test-data-seeding/` — and that cost is now **invisible**: on a fresh install the gate released on reference data before a single question page was written, Practice was navigated normally while pages 5–23 downloaded, sync finished `37884/37884`, and a 136-question quiz loaded clean.

### 4. Epic L started — the topic model (TICKET-2101/2102/2103)

Report: `reports/20-epic-l-topic-model/`. Migration **V12**, additive only. **90/90 backend tests pass** (8 new).

- **`exam_topics`** — closes the biggest structural gap: `exam_subjects` maps exam↔*subject*, so no per-exam topic attribute could be stored at all. Its `weightage_percent` is the admin's curated figure, deliberately **not** the field TICKET-2106 will derive from PYQs (§66 requires the two to stay distinguishable). Synthetic `"examCode:topicId"` id per **ADR-005** — an `@IdClass` composite broke `user_bookmarks` with real 500s.
- **`topics.parent_id`** — one self-reference instead of the spec's four Chapter/Topic/SubTopic/Concept tables, because depth varies per subject and a fixed ladder forces empty levels.
- **`topic_prerequisites`** — the DAG Epic D's sequencing needs.
- Service validates what constraints cannot: hierarchy cycles of any length, cross-subject parents, prerequisite cycles of any length via reachability. Null prerequisite list = "leave unchanged", empty = "clear".
- **Admin UI built too**: `Topics.jsx` gained a Parent select (excluding the topic's own descendants) and a Prerequisites grid; `ExamStructure.jsx` gained a Topic map card + modal with per-topic weightage validated 0–100.

**Bugs found:** a derived `deleteByExamCode` threw `TransactionRequiredException` from a non-transactional caller (`SimpleJpaRepository` only wraps its own CRUD methods) — it worked inside the transactional service, so code reading would never have caught it; neither new table cascades from `topics`, so teardown hit an FK violation that errored all 8 tests; and in the admin UI **an API import was silently shadowed by a same-named `useState` setter**, so `saveTopicMap` called the state setter and would have persisted nothing while appearing to work — caught only by `oxlint`'s "imported but never used".

### What is NOT verified

- **The new admin UI has never been clicked through in a browser.** It builds clean and lint is at baseline, but the shadowing bug above is precisely what a build and lint pass miss, so **the save path in particular needs exercising.** Blocked because `admin@sarkaritaiyaari.app` — which this file listed as the working admin in three places — is a **demoted `STUDENT`** account (verified by driving the real login). The working admin is `venkatesh9949.u@gmail.com`; its password is deliberately not recorded here.
- **Epic L has zero curated data.** No exam has a topic map, no topic has a parent or prerequisite. Downstream Epic L computation has nothing to work from yet.
- Startup-gate duration was never precisely timed, and the progress bar's smoothness was never visually assessed (the gate is now too short to screenshot).
- Emulator only, never a low-end physical device. The 76-page sync was never interrupted by an app kill.

### Remaining in §9 (small)

The materialized per-exam question-count table (`getSyncedExams` still full-scans `question_exams ⋈ questions` on two tab mounts — more costly now at 37,884 rows); making mode resolution a non-hook; and `practiceData.ts` sharing the structure cache outside the facade.

## Earlier history (pre-2026-08-27) — kept for context

Everything below predates the session above. Where the two disagree, the section above is current.

## Right now (as of 2026-08-24) — waiting on user feedback from a physical device

**Android APK builds are automated via GitHub Actions and have now run successfully on GitHub** — run #1 (2026-08-21) failed on missing repository secrets as described below, but by run #4 (2026-08-24, commit `8c5140e`) all four secrets were in place and the build completed end to end: checkout, JDK 17, Node 20, npm ci, plugin checks, typecheck, keystore decode, `expo prebuild`, `assembleRelease`, the `apksigner` signer-fingerprint check, and artifact upload all passed for real on the Linux runner, producing `sarkaritaiyaari-1.0.0-1004-8c5140e.apk` (57 MB). Confirmed via the GitHub Actions REST API, not assumed from the push succeeding. **The user is installing this build on their own physical device now and will report back** — this has not yet been confirmed to actually install/run correctly outside the emulator. Run #1's original failure history: it got through 12 of 13 steps and then failed after 23m15s inside `:app:packageRelease` with `keystore password was incorrect` / `BadPaddingException`, because three of the four repository secrets were empty or missing (a missing GitHub secret expands to an empty string rather than erroring). The upload keystore lives at `C:\dev\keystores\sarkaritaiyaari-upload.jks` (alias `upload`, RSA 4096, valid to 2054-01-06, SHA-256 `90:37:06:A2:…:68:83`) — **it exists in exactly one place and is still not backed up; losing it means no existing install can ever be updated.** Its password is deliberately not recorded in this repo, which is public.

**The user separately said "i have some issues with latest changes" (referring to the dark theme / sync fix / exit-guard work below) and asked to discuss it later** — not yet raised in detail or triaged as of this update. Treat this as the first thing to ask about when resuming.

**Three things shipped and were pushed to `main` this session** (commit `8c5140e`, same push that triggered the successful build above): a full black+blue dark theme (`reports/16-black-blue-dark-theme/`); a resilient-initial-sync fix, retrying indefinitely with backoff instead of stranding the user on a transient backend 500 (`reports/17-resilient-initial-sync/`); and a Practice/Mock Test exit-guard feature — Mock Test restructured into Exam Selection → Mock List matching Practice's shape, plus a "Leave this test?" confirmation on a mid-session tab switch (`reports/18-practice-mock-test-exit-guard/`). All three were verified on the Android emulator before pushing (see each report's own Verified section) — the pending user feedback above is from their own separate physical-device check, not a contradiction of that on-device emulator verification.

**The backend is deployed to Google Cloud Run and verified live** (`https://sarkaritaiyaari-backend-815653276881.asia-south1.run.app`) — `/api/health` returns UP and `/api/questions/live` serves real bilingual content from the same Neon database dev uses, 35,958 non-deleted questions. Region `asia-south1`, project `sarkaritayaari`, scale-to-zero with `--max-instances=3`, secrets in Secret Manager. **The exposed-credentials problem this created has been remediated**: `admin@sarkaritaiyaari.app` was demoted to STUDENT via SQL and its tokens deleted (verified — it now logs in as STUDENT, not ADMIN), and a new admin `venkatesh9949.u@gmail.com` was created and verified. That published password still authenticates as a *student*, which is worth cleaning up but is no longer a content risk. **Two backend code changes are in the working tree, uncommitted**: `CorsConfig` now reads `app.cors.allowed-origins` (was hardcoded to localhost:5173) and `server.port` is `${PORT:8080}`. The 78-test suite has NOT been re-run against them — `application-local.yml` doesn't exist on this machine, so the tests can't reach a database. **Admin authentication is built, tested (71/71 backend tests pass), and verified live.** **Crash reporting + basic analytics is fully working and confirmed end-to-end** — a real Sentry project exists, its DSN is set in `mobile/.env.local`, and a real test event was seen landing in the Sentry dashboard after a native rebuild (the first attempt silently failed because the installed APK predated Sentry; fixed, see `reports/11-crash-reporting-and-analytics/`). **Load-test data seeding is done and now verified on-device, at two scales**: 11 active exams, ~37,900 questions (pushed further per user request, toward V1.2's 20k-50k target), a real demo account (`demo@sarkaritaiyaari.app` / `Demo@1234`) with 350 practice sessions + 85 mock attempts. **The app no longer blocks on first-ever sync** — it opens immediately and reads live from the backend (full Mock Test parity, including live-sampled timed attempts) until sync finishes, then switches to local SQLite seamlessly; real sync status now lives in More/Settings instead of a hardcoded "Never". See `reports/13-hybrid-online-sync/hybrid-online-sync.md`. Admin login: `admin@sarkaritaiyaari.app` / `Admin@12345`. An Android emulator (AVD name `emulator`) is currently running with a freshly-native-rebuilt dev client installed, Metro (`expo start --dev-client`) running in the background, and `adb reverse` set up for ports 8081/8080 — reuse this instead of rebuilding if more on-device testing is wanted. The backend was restarted this session to pick up the new `/live`/`/counts`/`/mock-count`/`/mock-sample` endpoints — running via `mvn spring-boot:run` from `backend/`. Nothing from this session has been committed to git yet — that hasn't been requested (four earlier commits from 2026-08-18/19 were already pushed by the user manually).

### What's done and verified (most recent first)

- **Practice/Mock Test exit guard + Mock Test navigation restructuring (2026-08-24, un-ticketed).** Full report: `reports/18-practice-mock-test-exit-guard/practice-mock-test-exit-guard.md`. User asked for Mock Test to follow Practice's flow shape (it previously skipped straight to a flat list of every mockable paper across every exam) and for a "Leave this test?" confirmation before a tab switch abandons an in-progress quiz or mock test.
  - **Files:** new `mobile/src/practice/activeSessionContext.tsx` (shared active-session Context, following the existing `SyncContext`/`authContext` pattern), new `mobile/src/app/(tabs)/mock-test/papers.tsx` (per-exam mock list), rewritten `mock-test/index.tsx` (now Exam Selection), `mock-test/_layout.tsx`, `(tabs)/_layout.tsx` (the `tabPress` guard), `practice/quiz.tsx`, `mock-test/test.tsx`.
  - **Four real bugs found via on-device testing, not code review**, each looking like a fix until re-tested: `router.dismissAll()`/`dismissTo()` never actually worked in this expo-router version (57.0.11) regardless of call site — logs an "unhandled action" error and does nothing; a `<Stack key={...}>` remount didn't reset anything either, since nested-navigator state is owned by the *parent* Tabs navigator, not the child component; the eventual working fix (a plain `router.replace()` to the module's own first screen, called from inside the owning screen) then raced against the tab bar's own navigation call and stole focus back to the wrong tab, fixed by having the tab bar hand off the destination via a ref instead of navigating itself; and a stale `screenListeners` closure could read outdated session state, fixed by reading a ref kept in sync on every state change instead.
  - **Verified:** full click-through on the Android emulator — Exam Selection → per-exam Mock List → Test Details → live test; the dialog's exact copy and Stay/Leave behavior; Leave correctly lands on the tab the user actually tapped (not silently redirected); revisiting the abandoned module afterward shows its home screen with fresh state (confirmed via a different generated question and a reset timer, not just visually); identical behavior confirmed for Practice; browsing with no active session triggers no dialog. `tsc --noEmit` clean.
  - **Gaps:** only tab-switch abandonment is guarded — neither Practice's header back-arrow nor Mock Test's Android hardware back button intercepts an active session (deliberate scope decision, not an oversight). The abandoned module's back-stack isn't fully cleared, only its current screen is replaced (a pre-existing imperfection in a pattern this codebase already used elsewhere, not a new regression). **The user reported "some issues with latest changes" immediately after this shipped — not yet identified or triaged.**

- **Resilient initial sync (2026-08-24, un-ticketed).** Full report: `reports/17-resilient-initial-sync/resilient-initial-sync.md`. Real production bug, reported by the user with screenshots: initial sync against the deployed Cloud Run backend was failing intermittently around 500 questions in with a 500 error, leaving the user stuck; they also explicitly wanted the floating sync-status buttons gone entirely in favor of a percentage bar on More.
  - `runInitialSyncUntilDone()` (`mobile/src/sync/initialSync.ts`) retries indefinitely with exponential backoff (2s→30s cap), reusing the existing per-page checkpoint so a retry resumes rather than restarts; a failed attempt is remapped to a "syncing" progress tick instead of a terminal error. `SyncBanner.tsx` deleted; More's Data section now shows a real `{percent}% · {synced}/{total}` bar.
  - **Verified against the real deployed backend**: observed the sync hit real intermittent failures, retry with visibly increasing backoff in the Metro log, and complete; the More screen's percentage bar held steady (didn't reset or error) through the failed attempts.
  - **Root cause diagnosed, not fixed**: likely Cloud Run OOM (no explicit `--memory` allocation, combined with Hibernate's `default_batch_fetch_size: 500`) — plausible from the config and failure pattern, but never confirmed against an actual memory graph or crash log, and the backend itself was not changed. This is a client-side resilience fix; the server-side gap is now tracked in `reports/open-questions.md`.

- **Black + blue dark theme (2026-08-24, un-ticketed).** Full report: `reports/16-black-blue-dark-theme/black-blue-dark-theme.md`. Supersedes a light-theme redesign shipped earlier the same overall session that the user reviewed on-device and rejected as insufficient ("I want a VISIBLE, MAJOR, COMPLETE visual transformation"). Approved via a one-page demo Artifact before any production code changed.
  - New token structure in `mobile/src/ui/theme.ts` deliberately keeps `surface*` (card/background colors) and `text.onAccent*` (text/icons painted on a dark or filled surface) as **separate** token families — the previous light-theme pass had collapsed an equivalent pair into one `neutral[0]` value, which a straight dark-value swap would have made invisible (white text on a now-white-turned-dark card). `Card`/`Button`/`Skeleton`/`EmptyState`/`ErrorState` re-skinned; every screen converted.
  - **Two real bugs found only by looking at actual device screenshots**, not caught by `tsc`/lint: screens rendered light-gray overall despite dark cards, because no navigator-level background (`contentStyle`/`sceneStyle`) had ever been set; and "Welcome back" overlapping the status-bar clock on Home/Progress/More, caused by an earlier `headerShown: false` fix silently removing the native header's implicit safe-area padding — fixed with `useSafeAreaInsets()` on just those three screens.
  - **Verified** via on-device emulator screenshots after each fix, and the demo Artifact was reviewed and explicitly approved by the user before implementation began.
  - **Gap, not yet confirmed either way:** `/revise` appeared to still show the old light theme in one screenshot taken later in the session, but that same testing session also had confirmed stale-screencap glitches (fixed by toggling the display off/on) — this specific observation was never re-checked with that same reliable method before the emulator was closed. Flagged as unconfirmed, not as a fixed or a known-broken screen.

- **GitHub Actions APK builds (2026-08-21, closes half of TICKET-505).** Full report: `reports/15-github-actions-apk-builds/github-actions-apk-builds.md`. User asked for a repeatable, self-serve APK build instead of one driven by an AI session each time; after reviewing the landscape of approaches they chose GitHub Actions. Signed APK on push to `main` (30-day artifact) and on a `v*` tag (permanent GitHub Release), plus a manual run with a chooseable backend URL.
  - **Files:** `.github/workflows/android-build.yml` (16 steps), `mobile/plugins/withReleaseSigning.js` (Expo config plugin — the load-bearing piece), `mobile/app.config.js` (dynamic `versionCode`, registers the plugin), `mobile/scripts/check-release-signing-plugin.js` (+ `npm run check:signing`), `ANDROID-BUILDS.md`, and README/CI-section updates. Keystore generated outside the repo at `C:\dev\keystores\`.
  - **Why a config plugin:** `android/` is regenerated by `expo prebuild`, and Expo's SDK 57 template hardcodes `signingConfig signingConfigs.debug` while — unlike bare React Native — providing no property-driven release config to hook into. Found by reading the generated `build.gradle` rather than assuming the familiar `MYAPP_UPLOAD_STORE_FILE` pattern applied; that assumption would have produced a debug-signed APK and a green build.
  - **Bugs found:** the template finding above; `npm ci` failing with `ENOTEMPTY` on a Gradle cache left inside `node_modules`; a Gradle daemon JVM crash on this machine's memory limits; and two defects in my own first workflow draft (`gh release create` rejects `--notes` with `--generate-notes`; `--notes-start-tag` can't work on a depth-1 shallow checkout). Also corrected a false "typecheck is clean" claim I made after reading `$?` from the wrong end of a pipeline.
  - **Verified:** 7/7 plugin checks; YAML parses with the expected 16 steps; `tsc --noEmit` genuinely clean; `expo config` resolves `versionCode` from env (1042, fallback 1); `expo prebuild --clean` regenerates `android/` with the patch applied and the debug buildType untouched; `gradlew :app:signingReport` resolves the release variant to the upload keystore with a matching SHA-256 (and to the debug key, with a loud warning, when the properties are absent); and the `apksigner` fingerprint tripwire accepts our key and rejects a foreign one. The `keytool`/`apksigner` digest equivalence was proven by hashing the exported DER certificate rather than assumed.
  - **Gaps (as of 2026-08-21):** the workflow has never run on GitHub (JDK 17 vs local 21, runner `apksigner` discovery, cache keys and `gh release` behaviour all unproven); no full `assembleRelease` ever completed with the upload key; the four secrets aren't added; the keystore isn't backed up; no AAB, no Play upload, no per-ABI split, no Play App Signing; Sentry source maps still unuploaded; nothing committed.
  - **Update (2026-08-24):** the four secrets have since been added and the workflow ran successfully on GitHub for the first time — run #4 (`8c5140e`), `completed`/`success`, ~16 minutes, produced a real signed artifact `sarkaritaiyaari-1.0.0-1004-8c5140e.apk` (57 MB), confirmed via the Actions API. This resolves the "workflow has never run on GitHub" gap. Still open: the keystore is still not backed up, still no AAB/Play upload/Play App Signing, and the produced APK has not yet been confirmed to install/run on a real physical device (the user is checking this now). See `reports/15-github-actions-apk-builds/github-actions-apk-builds.md`'s own 2026-08-24 update section.

- **Backend deployed to Google Cloud Run (2026-08-20/21, un-ticketed).** Full report: `reports/14-cloud-run-deployment/cloud-run-deployment.md`. Closes the long-standing "decide production hosting" item. Project `sarkaritayaari` (note: spelled differently from the Java package `sarkaritaiyaari`), region `asia-south1`, image in Artifact Registry `backend-repo` built by Cloud Build (120.5 MB, 2m22s), secrets `db-password`/`cloudinary-secret` in Secret Manager, `--allow-unauthenticated --max-instances=3`, scale-to-zero. Reuses the existing Neon DB by explicit decision, so prod and dev share one database.
  - **Two code changes required first**: `CorsConfig` was hardcoded to `http://localhost:5173`, which would have broken any deployed admin site at the browser before a request ever reached a controller — now `app.cors.allowed-origins` / `APP_CORS_ALLOWED_ORIGINS`. And `server.port` is now `${PORT:8080}`, since Cloud Run injects `PORT` and 8080 only worked by coincidence.
  - **Four real problems found, three fixed**: (1) `DEPLOYMENT.md` claimed billing was linked — it wasn't; a billing account existed but the *project* was never attached to it, which is why `gcloud services enable` had silently done nothing and left no error the user noticed; (2) `--set-secrets` does not grant `roles/secretmanager.secretAccessor` to the runtime service account, a failure that surfaces as a startup crash looking like a DB problem — granted pre-emptively; (3) **a real security exposure the deployment itself created** — this file's plaintext credentials are in a public GitHub repo (confirmed via the GitHub API), and publishing the backend made them a working key to a reachable door; confirmed exploitable by an actual login returning role ADMIN, then remediated by SQL demotion; (4) `DEPLOYMENT.md`'s step 6 is wrong — repointing the apps needs no code change, both already read env vars.
  - **Verified**: `/api/health` 200 UP; `/api/questions/live` 200 with `totalElements: 35958` proving it genuinely reached Neon; Hindi content confirmed intact by decoding raw response bytes as UTF-8 (the terminal was mangling the display, not the server); new admin account created and independently confirmed to hold ADMIN; billing/APIs/image digest/IAM binding each re-queried rather than trusted from exit codes.
  - **Honest gaps**: the CORS change has never been exercised by a real cross-origin browser request; the 78-test suite was not re-run (no DB credentials on this machine); nothing is committed to git; `/downloads` APK hosting is effectively dead on Cloud Run's ephemeral, scale-to-zero filesystem; no custom domain and no backend CI/CD — deploys are manual `gcloud` commands.

- **Non-blocking startup + hybrid online/local data layer (2026-08-20, un-ticketed — from a user-provided spec).** Full report: `reports/13-hybrid-online-sync/hybrid-online-sync.md`. The app previously blocked its entire UI behind a full-screen spinner on a device's first-ever sync; the user's spec asked for this to never happen, plus screens to read live from the backend while sync is still catching up, with real status visible (not blocking) in More/Settings. Two decisions confirmed with the user before building: (1) full hybrid data-repository, not the simpler "progressive local-only" alternative, and (2) Mock Test also gets full live parity (a real timed attempt can start and run entirely live pre-sync), not just exam/paper browsing.
  - Backend: 4 new public endpoints on `QuestionController`/`QuestionService` — `/live` (filterable browsing), `/counts` (grouped counts, needed a new `QuestionRepositoryCustom` CriteriaQuery fragment reusing the existing `QuestionSpecifications` predicate), `/mock-count`/`/mock-sample` (Mock Test's "N random questions across a set of subjects" query, ported from the local SQLite version using `cb.function("random", ...)`).
  - Mobile: the blocking `SyncProgressScreen` is deleted; `SyncContext`'s first-ever sync now fires non-blocking, exactly like delta sync already did. New `mobile/src/data/` hybrid layer (`hybridSource.ts`'s `useHybridMode()` plus hybrid equivalents of every `db/practiceContent.ts`/`db/examStructure.ts`/`db/mockTest.ts` function) — local mode delegates unchanged to the existing local functions, live mode fetches+reshapes to the identical type, so screens only need a 3-line change each. More/Settings' "Last synced: Never" (previously hardcoded, never actually wired to `SyncContext`) now shows real syncing/completed/failed/never-synced states with a working Sync Now/Retry button.
  - **Two real bugs found via actual on-device testing, not code review**: (1) the sync-progress banner, now visible during a real multi-minute first sync for the first time ever, overlapped the bottom tab bar and silently ate every tap meant for it — confirmed via `uiautomator` bounds overlap, fixed with `pointerEvents="none"` plus repositioning; (2) `practice/index.tsx` (the exam-list landing screen) was missed in the first wiring pass and still showed an empty "not synced" state in live mode despite the backend working correctly — found by testing on a real device, not by inspection.
  - **Real verification**: new `LiveQuestionsTest.java` (7 tests) + full existing suite re-run, 78/78 pass. `tsc`/`eslint` clean (mobile). On the Android emulator: fresh install opened immediately with no blocking screen; Practice's exam list showed full correct counts while sync was genuinely only 75-91% done; a real Mock Test attempt was started and run live (countdown timer, live-sampled 100-question set) before sync finished; killed-and-relaunched mid-sync resumed correctly; once sync hit 100%, Practice switched to local data with no visible glitch; More screen showed the real completed state.
  - **Honest gaps**: the genuinely-offline-and-never-synced empty state (`OfflineNoDataNotice`) was verified via code review, not directly exercised on-device — this emulator image blocks even loopback/Metro traffic when there's no OS-validated network, making a clean "airplane mode from fresh install" test impractical here; worth a direct check on a physical device. The sync banner's tab-bar-clearing offset is a fixed heuristic, not computed from the real tab bar height.

- **Load-test data seeding (TICKET-501).** Full report: `reports/12-load-test-data-seeding/load-test-data-seeding.md`. Expanded beyond the ticket's literal wording per explicit user direction: populate every module (exams, questions, practice history, mock history) with realistic volume, not just hit a question count.
  - 11 active exams (4 existing-but-inactive ones turned on, 5 new real exams added: UPSC CSE, SSC MTS, SSC GD, RBI Assistant, LIC AAO — new `scripts/seed-more-exam-structures.ps1`), each with a working mockable paper.
  - ~14,000 questions (11,900 new + 113 original), generated via new `scripts/generate-load-test-questions.js` — templated/programmatic (randomized math with computed answers, fixed-family reasoning puzzles, curated real-fact banks for GK/Science/Computer Knowledge), genuinely bilingual EN/HI, tagged to real exam syllabuses read live. Every created id recorded in `scripts/load-test-seed-manifest.json` for future cleanup.
  - A real, lasting demo account (`demo@sarkaritaiyaari.app` / `Demo@1234`) with 100 practice sessions + 25 mock attempts, uploaded via the real `POST /api/progress/sync` (new `scripts/generate-demo-history.js`) — not a raw DB insert.
  - **Four real backend performance bugs found and fixed, not just papered over**: (1) `QuestionService.bulkImport()` did 8-10 DB round trips per question with no caching — fixed with request-scoped lookup caching + batched flushing, **~48x faster** (2.4s/question → ~0.045s/question); (2) `ProgressService.upload()` called `save()` per row on client-assigned-id entities, which silently forces a `merge()` (existence-check `SELECT`) every time — fixed by checking existence once up front and calling `persist()` directly for the normal (new) case; (3) `default_batch_fetch_size` (50) was sized for the old ~112-question dataset, not this one — raised to 500 (matching the sync page size), cutting a full sync from ~198s to ~118s; (4) `BookmarkService.upload()`, audited as a follow-up after finding the same pattern twice — its per-row existence check is genuinely needed for last-write-wins conflict resolution (unlike #2), but doubled up with `save()`'s own `merge()` check for brand-new bookmarks; fixed the same way.
  - **The remaining ~118s sync cost was profiled, not left as a guess**: SQL debug logging on one real sync page showed exactly 4 queries (main page + eager topic/subject join, a `COUNT(*)`, and two batched exam/translation lookups) — confirms the N+1 pattern is genuinely gone; the remaining time is real Neon network latency across 4 necessary round trips. One further optimization exists (drop the `COUNT(*)` via `Page`→`Slice`) but was checked and correctly *not* done blind — `mobile/src/sync/initialSync.ts` uses `totalElements` for its progress-bar percentage, so this needs a mobile-side change too, not just a backend one.
  - **Real verification**: all four fixes confirmed against the existing test suite (`BulkOperationsTest`, `QuestionCrudTest`, `SyncEndpointTest`, `DifficultyLevelTest`, `ProgressSyncTest`, `BookmarkSyncTest` — including the specific retry-idempotency and last-write-wins conflict tests these changes touch — plus a final full 71-test suite run, all green); 11,900 questions created with 0 failures; a sample spot-checked directly for correct answers and genuine (not English-duplicated) Hindi text; demo account restore confirmed via a real `GET /api/progress` call; a real measured full-sync timing before and after the fix.
  - **On-device emulator testing was then done** (an Android AVD launched in this session, connected to Metro + this backend). It found a real, previously-invisible **5th bug — client-side this time**: `mobile/src/sync/writeQuestions.ts`'s per-question `upsertQuestion()` awaited ~7 individual SQLite statements per row in a loop (same "one insert per row" anti-pattern this file's own comment already blamed for an earlier mock-test bug, just never fixed here) — at 500 questions/page that hung the sync indefinitely. Fixed with a batched `upsertQuestionsBatch()` (bulk delete+reinsert for join/leaf tables, bulk `excluded.*` upsert for `questions` itself); both `initialSync.ts` and `deltaSync.ts` updated. Verified live: a real 14,000+-question delta sync completed in under a minute post-fix, Practice/Mock Test showed correct per-exam data, and signing into the demo account restored its exact history (71% readiness, 1,157 questions, 100 sessions) on-device. `tsc`/`eslint` clean; no mobile test suite exists to run.
  - **Round 2 (2026-08-19, same day) — pushed further per explicit user request**, toward V1.2's TICKET-701 target of 20k-50k+ questions: re-ran both scripts with roughly doubled targets. Added **23,800 more questions** (0 failures) for a live total of **37,884**, and **250 more practice sessions + 60 more mock attempts** for the demo account (now 350/85 total, confirmed via a real server-side restore call). Found and fixed a real bug in the process: `generate-load-test-questions.js`'s manifest write was a plain overwrite, not a merge — fixed to merge/dedupe against any existing manifest so re-running never loses the previous run's cleanup-tracking ids (now correctly tracks all 35,700 generated ids across both rounds).
  - **Re-verified the mobile fix at ~2.7x its original scale**: re-foregrounded the same emulator app after the 15-min staleness window, triggering a real delta sync of the 23,800 changed rows — completed cleanly with no crash or hang, confirming `upsertQuestionsBatch()` holds up well beyond the scale it was originally fixed at. Practice tab showed correct live counts after (SSC CGL 10,174, IBPS PO 12,186, etc.). A server-side timed full pass covered all 37,884 questions across 76 pages in 235.9s, consistent scaling from round 1 (117.6s/28 pages) — no regression at the larger volume.
  - **Honest gaps**: the 5 newly-added exam patterns are based on general knowledge, not a freshly-checked official notification — same caveat the original seed script already carries. The `Page`→`Slice` sync optimization remains a scoped-out follow-up, not attempted. The demo account's *round-2* history restore wasn't re-verified directly on-device (only via the server-side script check) — the emulator's sign-out button stopped responding to scripted taps partway through that check, and it wasn't pursued further since the underlying sync mechanism was already re-verified independently.

- **Crash reporting + basic analytics (TICKET-503).** Full report: `reports/11-crash-reporting-and-analytics/crash-reporting-and-analytics.md`; design rationale: ADR-010. Nothing like this existed before — confirmed by grepping the whole mobile app, not assumed. Per explicit user direction: Sentry for crashes (wired against a placeholder — no DSN, so nothing uploads yet), basic analytics as Sentry breadcrumbs rather than a dedicated analytics platform (no new vendor/account needed).
  - `@sentry/react-native` installed via `npx expo install` (resolved `~7.11.0` for this project's Expo 57.0.11/RN 0.86.2/React 19.2.3 pins — not hand-picked). `Sentry.init()` at module scope in `_layout.tsx`, `Sentry.wrap(RootLayout)` for a real error boundary. New `mobile/src/telemetry/analytics.ts` (`trackEvent`, `captureError`, `useScreenViewTracking`).
  - Breadcrumbs added for screen views (all 17 screens, via one hook), sign-up/sign-in/sign-out, practice-session/mock-attempt completion, and bookmark add/remove — each added at the point the underlying fact actually happens (e.g. inside `insertSession()`), not scattered across UI button handlers.
  - **A real, previously-fully-silent bug fixed along the way**: `SyncContext.tsx`'s initial-sync failure path was a bare `catch {}` with no error variable at all — the only place in the whole sync system where a failure left zero record beyond a UI string. Now captures the real error.
  - **Deliberately not done, and documented as such**: the `app.json` Sentry config plugin's org/project/auth-token (needs a real Sentry project — only affects dashboard stack-trace readability, not whether crashes are captured), session replay, performance tracing, and `sendDefaultPii` (this project has no stated privacy policy yet — enabling those ahead of one would be backwards).
  - **Real verification, not just written down**: `npx expo install` succeeded with no conflicts; `tsc --noEmit` clean; a forced Android bundle compile against Metro's raw HTTP endpoint returned 200 with a genuine ~6.6MB/158k-line bundle confirmed (by string search) to contain `Sentry.init`/`RootLayout`/the wrapped export. `expo lint` ran for the **first time ever in this project** (no ESLint config existed before) and surfaced 16 pre-existing errors — confirmed by diff inspection to be entirely in files this ticket never touched, flagged as an honest incidental finding, not fixed (out of scope) and not hidden.
  - **Honest gaps**: no Sentry account exists, so no real crash has ever actually uploaded — this is proven-correct wiring, not a proven-working pipeline. No on-device/emulator click-through was performed (none was available in this environment); `expo start --web` failed on a pre-existing, unrelated `expo-sqlite`/wasm bundling limitation, so verification fell back to the native Android bundle check instead, per the plan's own stated fallback.

- **Admin authentication — closes the #1 "Next up" item below.** Full report: `reports/10-admin-authentication/admin-auth.md`; design rationale: ADR-009 in `reports/architecture-decisions.md`. The admin console and every content-management backend endpoint had **zero authentication** — confirmed by reading the code directly, not assumed. Fixed with role-based accounts (`users.role`: `STUDENT`/`ADMIN`) reusing the existing opaque-token infrastructure (ADR-001), not a second auth system.
  - Backend: `Role` enum, migration `V8__admin_roles.sql`, `AuthService.requireAdmin()`, a new `ForbiddenException` (403 — the codebase's first, since nothing before this needed to distinguish "not signed in" from "signed in but not permitted"). Nine controllers (Questions, Exams, Subjects, Topics, Languages, Difficulty Levels, Paper Types, Exam Structure, Image Upload) now require an admin token on every mutation and admin-only read.
  - **The mobile app's unauthenticated sync reads were deliberately kept public** — verified against `mobile/src/api/reference.ts` and `mobile/src/db/schema.ts` before locking anything down, not guessed at. Getting this wrong would have broken the shipped app for every signed-out student.
  - First admin via a new `AdminBootstrapRunner` (startup, config-driven, idempotent); further admins via `POST /api/auth/admin/register` (admin-only, no token handed back — the new admin signs in themselves).
  - Admin frontend: `AuthContext` + `Login` page + a route gate in `App.jsx`; `api.js`'s `request()` now attaches the bearer token to every call.
  - **Real verification, not just tests**: cleared all admin users from the dev DB, restarted the backend, watched `AdminBootstrapRunner` actually create one from config, restarted again and confirmed no duplicate. Then `curl`'d a protected endpoint with no token (401), a real student's token (403), and the bootstrapped admin's token (201) — the literal gap, closed and proven. Then drove the actual admin UI with Playwright: login, wrong-password error, successful login, reload-persists-session, sign-out, and one real content mutation (create an exam) confirmed to carry the bearer token and persist server-side. Every test artifact created during verification was deleted afterward; the dev DB was left with zero admin users on purpose (see "Deferred / known leftovers").
  - 71 backend integration tests pass (0 failures) — the 13 existing CRUD/structure/bulk/sync test classes all needed their fixture calls updated to authenticate as admin, plus a new `AdminAuthTest`.
  - **Honest gaps**: no admin-console UI yet for inviting another admin (the endpoint exists, has to be called directly); a genuinely *expired* token's UI recovery was never waited out (only revocation was tested); still one flat `ADMIN` role, no finer permissions.

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

- **Documentation reorganized, then backfilled.** `reports/` split into sprint/phase subfolders (`01-sprint-1-backend-foundation/` through `09-motion-system-and-ui-polish/`), plus `TICKET-STATUS.md` (every ticket, one file), `architecture-decisions.md` (8 ADRs), and `open-questions.md` (consolidated TBDs). A `sdlc-documentation.md` was briefly created at the project root, found to be ~80% a restatement of `offline-exam-app-requirements.md`/`preparation-os-requirements.md` in a different shape, and deleted — only its genuinely new content (the ADRs and gaps list) survived, in the two files just named. A `reports/SESSION-LOG.md` was also briefly created duplicating *this file*, and was deleted the same way once this file was rediscovered. Six previously-undocumented shipped features then got real, detailed reports written for them, matching the depth of the Sprint 1–3/Exam Structure Model reports: bookmark sync, the offline indicator, the Content Model Redesign's mobile Phases 3–4, the Mock Test engine, V1.1 accounts/progress sync, and the motion system (plus its exam-grid regression and fix). Every one of them includes an honest "what wasn't verified" section rather than claiming more than was actually proven.

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

*(Updated 2026-08-24 — the APK pipeline is now actually live on GitHub, which closes most of the old #1; renumbered, and three new items added from this session's work.)*

### ⚠️ Inserted 2026-08-27 — takes precedence over the numbered list below

**0a. [DONE 2026-08-27 — see the session section at the top] Rework the first-launch gate per the decided design, which also fixes a shipped lockout bug.** Design decided by the user 2026-08-27 and recorded in `offline-exam-app-requirements.md` §9.5: **keep** the `PreparingApp` screen and its animation, but (i) gate on **reference data only** — 8 small requests — instead of the full question sync, moving questions to background work covered by the existing `useHybridMode()` live fallback; (ii) enforce a **hard 5-second ceiling** independent of sync state; (iii) release earlier whenever the gated work finishes earlier; (iv) advance the bar smoothly and monotonically, never hitting 100% before release, and **never** printing a synthetic "N / M questions" count beside a time-smoothed bar (real figures stay on More).

The 5-second ceiling fixes the following **shipped correctness bug** by construction. Found by code audit on 2026-08-27 (not reproduced on-device yet — see the honest gap note). On a **first ever launch with no network**, the user is locked out permanently:

- `FirstLaunchGate` (`mobile/src/app/_layout.tsx`) renders `PreparingApp` instead of the navigator while `firstLaunchSyncActive` is true.
- The initial-sync branch in `SyncContext.tsx` never checks connectivity (unlike `refresh()`, which returns early when offline).
- `runInitialSyncUntilDone` retries forever and its wrapper rewrites every `"error"` into a `"syncing"` tick; `"syncing"` never satisfies the release condition (`"completed" || "partial"`), so the gate never opens.
- The 2-minute soft timeout cannot rescue it — `deadline` is recomputed on every retry attempt, and its `!result.last` guard is dead code while the bank fits in one page.

Net effect: `PreparingApp` at 0% forever, no way into the app, no way to reach More's Retry. This directly contradicts `NetworkStatusContext`'s own stated principle ("nothing here should ever block on connectivity") and makes `OfflineNoDataNotice` unreachable on a cold first launch. Also fix `SyncContext.tsx`'s header comment, which still claims neither sync blocks navigation — true after `c1ca170`, false since `FirstLaunchGate` was reintroduced in `4f51124`.

**0b. [DONE 2026-08-27 — pool lifted after the prerequisites landed] Do not lift the temporary question pool until the `LIMIT` and startup fixes land.** The decision has been taken to lift it, but `getPracticeQuestions` (`mobile/src/db/practiceContent.ts`) has **no `LIMIT`** — it runs `ORDER BY RANDOM()` over every match, then builds an `inArray` with one bind parameter per matched question. Past SQLite's variable limit that is a crash. Lifting the pool first would also make the first-launch gate hold users for 76 pages instead of 1, and put thousands of non-virtualized cards in Revise/Summary. Required order and the full bottleneck list: `offline-exam-app-requirements.md` §9.

1. **Ask the user what "some issues with latest changes" means** (their own words, said right after the dark theme / sync fix / exit-guard push, before any detail was given) — this is the literal next conversational step, not a background task.
2. **Confirm whether `sarkaritaiyaari-1.0.0-1004-8c5140e.apk` actually installs and runs correctly on the user's real physical device** — the GitHub Actions build succeeded and was verified via the API, but a real device install/run has not yet been confirmed by anyone.
3. **Back up `C:\dev\keystores\sarkaritaiyaari-upload.jks` and its password** to a password manager plus one other place — still not done, and still **the single most irreversible item in the project**, since losing it means no existing install can ever be updated. The pipeline itself is no longer blocked on this (it already ran successfully once), but the keystore's single-location risk hasn't changed.
4. **Re-check whether `/revise` is actually still on the old light theme.** One on-device screenshot suggested it might be, but that same testing session also had confirmed stale-screencap glitches — this specific observation was never re-verified with the reliable screen-off/on-toggle method before the emulator closed. Quick to check, currently just a flagged unknown.
5. **Decide whether the Cloud Run backend needs an explicit `--memory` allocation.** Likely root cause of the mid-sync 500s that `reports/17-resilient-initial-sync/` worked around from the mobile side only — the backend itself was never changed, so the underlying failure condition (if it really is OOM) is still there, just now invisible to the user instead of fatal.
6. **Rotate the Cloudinary secret** that was briefly exposed in git history earlier in the project (already scrubbed from history; rotation is the only fully safe remediation left).
7. **If sync speed still matters, redesign the mobile progress bar to not need `totalElements`, then drop the sync endpoint's `COUNT(*)` query** (`Page` → `Slice`). Identified and deliberately not done blind — `mobile/src/sync/initialSync.ts` depends on the count for its percentage display, so this is a two-sided change, not a quick backend swap.
8. **Rest of Sprint 5 — QA, performance, release prep (TICKET-502, 504–506).** Low-end device testing, beta recruitment, confirm app icon/splash status. TICKET-501 (load test) is done, and TICKET-505's signing half is now proven on GitHub (see item 2) — what remains of 505 is Play Console specifically: an AAB (`bundleRelease`, not just an APK), a Play developer account, the internal testing track, and **turning on Play App Signing**, which demotes the keystore to a mere upload key and makes losing it a reset rather than a dead end.
9. **Follow-ups from the Cloud Run deployment** (the hosting decision itself is now DONE — see `reports/14-cloud-run-deployment/`): re-run the 78-test backend suite against the two uncommitted config changes on a machine that has `application-local.yml`; commit those changes; scrub the plaintext credentials out of this file, since it lives in a public repo; decide whether prod should get its own Neon database rather than sharing dev's; replace the now-dead `/downloads` APK hosting; and consider a custom domain plus a real deploy pipeline (the `Jenkinsfile` builds artefacts but has no deploy stage).
10. **Reconcile TICKET-702/703 (port BrainBlitz's Readiness Score/Persona) against the Future Vision doc's Epic C (Preparation Twin & Readiness v2)** — very likely the same feature described in two different documents; building both independently would duplicate work.
11. **Author real content to replace the load-test filler.** The pipeline works end to end and has 108 real sub-topics to file questions under (note: the admin credential this item used to cite is stale — see "Deferred / known leftovers") — but the ~14,000 questions currently in the database are templated/synthetic (see `reports/12-load-test-data-seeding/`), not editorially authored or licensed content.
12. **Optional now-cheap wins:** enforce per-section timers in Mock Test (needs section locking + auto-advance), Phase D's Exam Pattern screen (the whole tree is already synced locally), an admin-console screen for `POST /api/auth/admin/register` (the endpoint exists and is tested; there's no UI for it yet), and the 16 pre-existing lint errors `expo lint` surfaced in an earlier session (none introduced by any ticket, all still unfixed).
13. **Only after Sprint 5**, start on the Future Vision epics — in the order that document itself recommends: A → B → C → D (the dependent "coach" line), since C and D both need real signal that only exists once A and B are producing it.

## Deferred / known leftovers

- **The `memory/` folder restructure** — splitting `offline-exam-app-requirements.md` (now very large) into focused topic pages here. Explicitly deferred by the user's own instruction ("STATUS.md now, split later").
- **Test artifacts in the live Neon DB**: `Automated Test Subject`, `Automated Test Topic`, and an `AUTOMATED_TEST` exam left behind by the Phase 1 backend test suite, plus an `ADMIN`-role `automated-test-admin@sarkaritaiyaari.internal` fixture from the admin-auth test suite. Harmless, same category as always. As of 2026-08-19, also ~2,071 soft-deleted questions from load-test dry runs (60 + 1,800 + a handful from unrelated test-suite runs) — same harmless category, matches existing precedent.
- **Real, lasting accounts now exist and should be treated as real credentials, not test junk**: a demo student account with a full practice/mock history (`demo@sarkaritaiyaari.app` / `Demo@1234`, for signing into a phone to see the app populated).
  - **Correction (2026-08-27): `admin@sarkaritaiyaari.app` is NOT an admin account, and this file listed it as one in three places (with its password written inline — worth scrubbing separately, since this repo is public).** It was demoted to `STUDENT` during the Cloud Run credential remediation (the security note further up says so) but the "lasting accounts" and "Next up #11" entries were never updated. Verified the hard way: logging in through the admin console returns `role: STUDENT` and the UI shows *"admin@sarkaritaiyaari.app is signed in but is not an admin account."* The working admin is `venkatesh9949.u@gmail.com`, **whose password is deliberately not recorded here** — this repo is public. Anyone needing admin access has to ask the owner or bootstrap a fresh admin via `AdminBootstrapRunner`'s config. Cost a real detour this session; don't repeat it.
- **Two test PNGs in Cloudinary** from verifying the upload path — deletable from the dashboard.
- `dumpResume*.xml` / `dump*.xml` files in the project root and `mobile/` are leftover `uiautomator` UI dumps from device debugging, not project artifacts.
- **`scripts/load-test-seed-manifest.json`** records the id of every one of the ~35,700 load-test-generated questions (11,900 round 1 + 23,800 round 2, correctly merged, not overwritten), for bulk-deleting them later via `POST /api/questions/bulk-delete` once real content replaces them.
- Also from the `mobile/` UI dumps note above: several `dump*.xml`/screenshot files from this session's device-driven verification live under the session's temp scratchpad, not the project itself — nothing to clean up in the repo.

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
