# Exam Guide — closing the coverage ledger, Phase E (diagnostic test)

**Requested:** the final phase of the coverage-ledger closure (see Phase A–D reports in
this folder for the overall plan and everything shipped before this). This report covers
**Phase E**: §21 "Diagnostic Test". **No backend changes at all this phase** — everything
composes from data and mechanisms that already existed after Epic L and Phases A–D.

## Design change from the plan, made deliberately and stated up front

The approved plan said to reuse Mock Test's `test.tsx` engine for the taking-shell. Once
building it, that engine turned out to be built entirely around `SyncedPaper`'s section/
duration/negative-marking model — forcing a synthetic paper shape onto a diagnostic (which
has no sections, no negative marking, and is untimed by design) would have meant more
adapter code than a dedicated screen. Built `app/diagnostic-test.tsx` as its own lightweight
screen instead: same underlying idea (a taking-shell + a results screen), reusing individual
pieces of established convention (the `Card`/`Button` primitives, the loading/empty-state
patterns) rather than the paper data structure itself.

Also deliberately untimed and silent on correct/incorrect per question — unlike Practice's
quiz, which gives immediate feedback. A diagnostic's job is to locate where a student
stands across the whole syllabus; showing all results together at the end (not each
question one right/wrong at a time) is a closer fit and a simpler build.

## What shipped

- **`diagnostic/buildDiagnosticSet.ts`** — composes a syllabus-weighted question set purely
  from existing local functions: `getPriorityTopics(examCode, 8)` (already used by
  `PreparationPlanCard`/the Prepare checklist, Epic L's existing ranking) for the topics,
  then `getPracticeQuestions(topicId, "all", examCode, mode)` (already hybrid-aware, already
  `ORDER BY RANDOM()`) for 3 questions per topic. No new backend endpoint, no new sync.
- **`app/diagnostic-test.tsx`** — a linear, untimed question set (~24 questions across 8
  topics), single-select, Previous/Next/Finish. On finish, folds each topic's result into
  the **same** `topicProgress` table an ordinary practice session updates, via the
  already-existing `recordTopicPractice()` — so a diagnostic's results sync and immediately
  feed the Prepare checklist (Phase C) through the mechanism that already exists, not a
  parallel progress model.
- **`app/diagnostic-result.tsx`** — per-topic breakdown sorted weakest-first, each topic
  labelled with the resulting mastery state (Strong/Practicing/Learning/Needs revision),
  with an explicit note that these results already updated Prepare.
- **`diagnostic_attempts`** local-only table (mobile migration `0015`) — records that an
  attempt happened (for a future "you've taken one before" decision), not the scoring
  itself, which lives in `topicProgress` as noted above.
- Entry point: a "Take a Diagnostic Test" card in the Guide screen's Prepare section,
  always available (not gated on "no prior signal" — simpler, and a student may reasonably
  want to retake one).

## Files changed

- Mobile only: `db/schema.ts`, `db/migrations/0015_diagnostic_attempts.sql` (+
  registration), `db/diagnosticAttempts.ts` (new), `diagnostic/buildDiagnosticSet.ts` (new),
  `app/diagnostic-test.tsx` (new), `app/diagnostic-result.tsx` (new), `app/exam-guide.tsx`,
  `app/_layout.tsx` (modified).

## Verified

- `npx tsc --noEmit` clean. `npx expo lint` at the exact pre-existing baseline (9 problems)
  — the new screens introduced zero new violations on their own; a couple of unused-import
  warnings were caught and fixed in the same pass.
- Backend fully unaffected by design — the full 126-test suite (already re-run after Phase
  D) covers no new surface here since none was added.
- Local migration `0015` follows the same guarded `CREATE TABLE IF NOT EXISTS` convention
  as `0011`–`0014`; nothing unguardable (no `ALTER TABLE`).

## Not verified

- **No on-device/emulator run** — the standing gap across all five phases this session.
  This one matters more than most: the diagnostic-taking flow (answer state across
  Previous/Next, the finish-and-score computation, the results screen) is exactly the kind
  of interactive, stateful UI that static analysis is weakest at catching bugs in.
- The `getPriorityTopics`/`getPracticeQuestions` composition has not been exercised against
  a real device's populated local database — only reasoned about against the existing,
  already-tested functions it calls.
- `hasTakenDiagnostic()` was written but is not yet called from anywhere (no "retake" vs.
  "take for the first time" copy distinction was built) — a small, honest loose end rather
  than a hidden one.

## Session summary — all five phases

This closes the phased plan approved at the start of this effort. Across Phases A–E:

- **One critical, previously-undetected bug fixed**: every Exam Guide mobile API call was
  doubling its `/api` prefix, meaning the entire feature has never worked on a real device
  across three prior "shipped" sessions (found and fixed in Phase B, verified live).
- **One real architectural finding**: a naive `@Scheduled` reminder job would have been
  silently non-functional on this project's actual scale-to-zero Cloud Run deployment;
  built as an externally-triggerable endpoint instead (Phase D).
- **Two real bugs found by testing against live/real data rather than trusting a clean
  compile**: the cycle-diff endpoint's "previous cycle" ordering (Phase B), and the demo
  seeder regression the new content-validation states would have caused (Phase B).
- **A genuinely clean full backend test suite obtained and re-confirmed after every
  phase** — 126 tests, 0 failures, 0 errors at the end — closing a gap the round-2 session
  explicitly flagged as never achieved.
- Backend migrations V18–V20 (Phase E added none); mobile local migrations 0014–0015.

**The one thing that has not changed across all five phases: no on-device or emulator run
has happened this session.** Every phase's own report says so. Given the Phase B discovery,
this is not a formality to skip — it is the single check most likely to surface what static
analysis and backend curl testing cannot.
