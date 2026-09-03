# Exam Guide — closing the coverage ledger, round 5: Phases F–I

**Requested:** the user pushed back on the ledger's §40 "Footer module — not started /
judged inapplicable" call, pointing out this app already has a reusable footer pattern
(the bottom action bar on Practice's quiz and Mock Test's test screen) and asking to
build it that way. Separately asked to complete the remaining ledger and to write test
cases for what's built, the same way prior rounds did. This report covers the resulting
four phases (F, G, H/H2, I) done in one continuous session.

## Phase F — Footer module (§40, most of §41/§72)

Researched the existing pattern directly (`practice/quiz.tsx`, `mock-test/test.tsx`)
rather than guessing: a `<View style={styles.footer}>` sibling placed after the
`<ScrollView>` inside a `flex: 1` screen container — `borderTopWidth`, `colors
.surfaceElevated` background, a `flexDirection: "row"` button pair, always rendered
(buttons disable rather than disappear so the layout never jumps). No shared `ui/Footer`
component exists anywhere — it's hand-rolled per screen.

Applied the same pattern to `mobile/src/app/exam-guide.tsx`: the previously inline "View
Official Notification" link and the header star ("Add to My Exams") became a persistent
bottom bar — secondary Follow/Following toggle, primary "View Official Notification"
(disabled, not hidden, when the cycle has no URL yet). This mirrors a familiar
"Save / Apply" job-listing pattern and gives the screen's two most useful actions a
place that survives scrolling, which the original judgment call missed by reading
"footer module" too literally as a web-page footer.

**Verified on-device:** footer renders and stays pinned while scrolling; the Follow
toggle round-tripped through the local `followed_exams` table (confirmed via direct
SQLite query before/after each tap — an even number of test taps had briefly made it
look broken before a single-tap check clarified it was working the whole time); "View
Official Notification" launches an external browser intent (confirmed via `dumpsys
activity` showing Chrome became the focused app).

## Phase G — Accessibility pass (§52)

Grepped current coverage across the newer Exam Guide screens: `exam-compare.tsx` (11
pressables, 2 a11y attributes), `diagnostic-test.tsx` (3 pressables, 1 attribute),
`diagnostic-result.tsx` (0 of either). Rather than patch each screen's individual
Pressables one at a time, found and fixed the actual root cause: the shared `ui/Button`
and `ui/Card`'s `CardRow`/`Card` (when given `onPress`) never set `accessibilityRole` at
all — a gap affecting every screen in the app that uses either, not just these newer
ones. Fixed once, in both shared components, plus the two spots where a `Pressable` is
used directly instead (`exam-compare.tsx`'s modal backdrop and exam-picker rows;
`diagnostic-test.tsx`'s radio option row, which had a role but no label).

## Phase H — small content/copy closures (no schema)

- **§31 Notification simplifier**: one line of framing text on the Guide screen stating
  it's a plain-language summary and to verify critical details at the source.
- **Q1 "How does this fit my personal plan?"**: a one-line note on the Guide screen
  reusing the exact urgency signal (`applicationEnd` within ~45 days) My Exams'
  recommendation heuristic already scores on, or a practice-history callout when no
  urgency applies — surfaced in prose on this screen rather than only reachable from a
  different one.
- **Q1 "What has appeared in previous years?"**: a short hint pointing at Syllabus &
  Practice, where the existing PYQ badge (`Asked in <year> · Shift <n>`) already lives —
  no new PYQ browser built, since none exists to link to and building one wasn't asked.
- **§73 weak-areas narrative**: `diagnostic-result.tsx` already computed a weakest-first
  per-topic list; added one sentence naming the single weakest topic/subject in prose
  above it.

## Phase H2 — exam overview text (migration V21)

**§1/§4 "What is this exam?"** was partial because no overview/description field existed
anywhere in the data model — confirmed by reading `RecruitmentCycle.java` directly.
Added a nullable `overview_text` column (migration **V21**, purely additive), wired
through `RecruitmentCycleRequest`/`Response`, `ExamGuideResponse`, the admin form (a new
textarea), and a short paragraph on the Guide screen shown only when present.

**A real near-miss caught and fixed on the mobile side.** `drizzle-kit generate` for the
matching local-cache column did not produce a minimal diff — its snapshot state doesn't
match this schema's real migration history, so it generated a **full `CREATE TABLE` for
every `exam_guide_*` table, `app_preferences`, and `diagnostic_attempts`, plus a stray
`practice_sessions` column add** — exactly the "generated migration needs hand-editing"
trap this project's own `memory/STATUS.md` already documents for index and column DDL.
Replaced it with the correct single `ALTER TABLE exam_guide_cycles ADD overview_text
text` before it ever shipped. It was still caught live on-device once, the hard way: a
stale Metro bundler cache served the *original* generated (broken) migration content on
one relaunch, producing the exact "Database migration failed" hard-gate screen this
project's docs describe, even though the `.sql` file on disk was already fixed. A full
`expo start --clear` + relaunch resolved it, and the corrected migration then ran
cleanly against this device's real, already-migrated (0011–0015) database — the
populated-database test case this project's own convention calls for, not just a fresh
install. Worth remembering: a Metro dev-server restart alone isn't always enough to
invalidate a stale bundled raw-asset (`.sql`) import — clearing the cache explicitly was
what fixed it here.

**Verified:** backend — new `overviewTextRoundTripsThroughUpdateAndAppearsInThePublicGuide`
test in `ExamGuideContentStatusTest`, full class green, `mvn compile` clean. Mobile —
`tsc`/`expo lint` clean (baseline unchanged), the field round-trips through the admin
form, and — after the cache-clear fix above — confirmed live on-device rendering nothing
for the existing demo cycle (correct, since no overview text is set) without breaking
migration on a real populated database.

## Phase I — the Review role (§36), by explicit choice

Asked which of four previously-deliberate scope calls (§36 review role, §50 Eligible
badge, §44 deeper offline caching, §47 cross-content search) to reopen this pass.
**Only §36 was selected**; the other three remain deferred, untouched.

Found while scoping: `Role` and `ContentStatus` are both plain `VARCHAR(20)` columns, not
native Postgres enum types (checked the actual migrations, not assumed) — so adding
`REVIEWER` and `REVIEW` needed **zero schema migration**, only new Java enum values.
Shipped the three-state workflow: DRAFT →(`submit-for-review`, ADMIN-only)→ REVIEW
→(`publish`, ADMIN or REVIEWER)→ PUBLISHED, or REVIEW →(`reject`, ADMIN or REVIEWER)→
DRAFT. `publish` still accepts DRAFT directly too, preserving the existing fast path (and
the demo seeder's own direct-to-PUBLISHED behavior) unchanged. ADMIN is a deliberate
superset of REVIEWER — a solo operator with no separate reviewer account isn't locked
out of publishing their own content — via a new `AuthService.requireReviewer` that
accepts either role, mirroring `requireAdmin`.

Admin UI: the single Draft/Published toggle became a small set of contextual buttons
(Submit for review / Publish / Send back to draft / Unpublish) showing only the actions
valid from the cycle's current state, plus a status badge; the direct-edit dropdown
gained the REVIEW option as an override path.

**A real cross-test-file collision found and fixed while adding shared REVIEWER/STUDENT
fixture helpers to `AbstractIntegrationTest`** (mirroring the existing ADMIN fixture
pattern exactly, for reuse by future tests): `EpicLIntelligenceTest.java` already had
its own private, differently-scoped `studentAuth(T)` helper (a per-test-run throwaway
student, not the shared fixture), and Java rejected the new inherited method as an
illegal visibility reduction. Renamed the shared base-class helper to
`sharedStudentAuth` rather than touching the existing, semantically-different local one.
Caught by running the full suite, not just the new test class in isolation — worth
noting since a change to a shared test base class can break any test file, not just the
one that motivated it.

**A related process note**: a `mvn test-compile` run in a second shell overlapped with
an already-running full `mvn test` sharing the same `target/` directory, and was stopped
and the full suite re-run cleanly rather than trusting a build that may have raced
against concurrent compilation — the same category of "don't run compile/spring-boot:run
alongside a live `mvn test`" risk this project's `memory/STATUS.md` already warns about,
just via a different pair of commands than the ones previously documented.

**Verified:** five new test methods in `ExamGuideContentStatusTest` (full DRAFT→REVIEW→
PUBLISHED→reject→resubmit→publish cycle, ADMIN-can-still-publish-directly-from-DRAFT,
role-gating rejecting a plain STUDENT token on all four transition endpoints, REVIEWER
correctly barred from `submit-for-review`); admin `npm run build` + `oxlint` clean. A
full, clean `mvn test` run afterward: **129 of 130 tests passed.** The one failure
(`BulkOperationsTest.bulkImport_reusesExistingSubjectAndTopicByName_doesNotDuplicate`, a
global `subjectRepository.count()` assertion against the real shared Neon dev database,
off by one) re-ran clean in isolation immediately after, confirming a flake/race against
other concurrent activity on the same shared database rather than a regression — nothing
this round touched bulk-import, subject, or topic code.

## Files changed this round

**Mobile:** `app/exam-guide.tsx`, `app/exam-compare.tsx`, `app/diagnostic-test.tsx`,
`app/diagnostic-result.tsx`, `ui/Button.tsx`, `ui/Card.tsx`, `api/examGuide.ts`,
`db/schema.ts`, `db/examGuideLocal.ts`, `sync/writeQuestions.ts`,
`db/migrations/0016_exam_guide_overview_text.sql` (hand-written, see above).

**Backend:** `entity/Role.java`, `entity/ContentStatus.java`, `entity/RecruitmentCycle
.java`, `service/AuthService.java`, `service/ExamGuideService.java`,
`controller/ExamGuideAdminController.java`, `dto/ExamGuideAdminDtos.java`,
`dto/ExamGuideDtos.java`, `db/migration/V21__exam_guide_overview_text.sql`,
`test/ExamGuideContentStatusTest.java`, `test/AbstractIntegrationTest.java`.

**Admin:** `src/api.js`, `src/pages/ExamGuide.jsx`.

## Admin console click-tested, and a real testing-methodology lesson found along the way

Minted a short-lived admin token via `AdminTokenMintRunner` (same safe, no-real-credentials
pattern used before) and drove the new 3-state workflow through Playwright against a
throwaway test cycle: Draft → Submit for review → Send back to draft → Submit for review
→ Publish (confirmed "Published" via polling) → deleted. Every transition's own network
request/response was also inspected directly, and the underlying database state was
cross-checked via curl at each step.

**A real lesson, not a bug, found while verifying this:** the first several click-test
attempts looked like a broken UI — clicking "Submit for review" appeared to leave the row
showing "Draft", clicking "Send back to draft" appeared to leave it on the button for the
*previous* state, and so on, consistently one step behind. Direct curl calls against the
same endpoints, and the full JUnit suite, both confirmed the backend transitions are
correct in every case. The actual cause: this project's admin dev server talks to a real,
remote, shared Neon database, and several back-to-back Playwright scripts firing at it in
quick succession, with short fixed `waitForTimeout` delays, were reading state before the
previous request's round trip had actually landed — a testing-harness patience problem, not
a rendering bug. Switching from a fixed sleep to polling for the expected badge text
resolved it immediately and gave an unambiguous, correct result. Recorded here since the
failure mode looked exactly like a real bug for several attempts before the actual cause
(test timing against a remote database, not app logic) became clear.

## Not verified

- §50/§44/§47 remain exactly as they were — deliberately not touched, not silently
  regressed either.
