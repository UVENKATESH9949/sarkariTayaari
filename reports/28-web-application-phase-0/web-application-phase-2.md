# TASK-2601 — Student web application — Phase 2 (Mock Test)

**Session date:** 2026-09-12. **Status:** Done and verified end-to-end against real
production data.

## Context

This session was asked to continue TASK-2601's web work. `web/src/mocktest/` was found
already fully built and wired into `App.tsx` at session start — uncommitted, with no report,
no `tasks/TASK-2601-*.md` entry, and no `qa/` coverage recording it. This matches the
"concurrent/interrupted session" pattern `memory/STATUS.md` has documented more than once for
`mobile/`: real, working code with no accompanying documentation trail. Rather than re-plan or
rebuild it, this session read the existing code in full, verified it end-to-end against the
real backend, found and fixed one real bug, and closed out the documentation the code was
missing.

## What was already built

`web/src/mocktest/`: `MockTestExams.tsx`, `MockTestPapers.tsx`, `MockTestStart.tsx`,
`MockTestEngine.tsx`, `MockTestResult.tsx`, `mockTestApi.ts`, `attempt.ts`, `types.ts` — the
full exam picker → paper picker → pre-test briefing → timed engine → result scorecard flow,
routed at `/mock-test`, `/mock-test/papers`, `/mock-test/start`, `/mock-test/test`,
`/mock-test/result`. Built on `GET /api/exam-structures` plus `/mock-count`/`/mock-sample`,
exactly the endpoints the task doc's own Phase 2 section named, with no new backend work
needed. Scoring goes through the same shared `@sarkaritaiyaari/core/evaluation` module and the
same `answerDraft.ts`/`QuestionBody` renderer set Phase 1 built for Practice — the engine
supplies `revealed={false}` throughout, which is what makes it blind (no reveal until submit)
using the identical renderers Practice uses to reveal immediately.

Read in full detail: the countdown is driven by a fixed end-timestamp rather than a
decrementing counter (correct under a throttled/backgrounded tab); a completed attempt is held
in `sessionStorage` and, when signed in, uploaded via the same `POST /api/progress/sync` shape
mobile uses (silent-by-design on failure); and `ActiveSessionProvider.tsx` is a real, considered
port of mobile's tab-press interception to the two mechanisms a browser offers (in-app
navigation intercepted by `AppShell` with a styled dialog; tab close/refresh only reachable via
the browser's own native `beforeunload` prompt).

## The one real bug found and fixed

**The question-navigator's own Close button was unreachable on a real 100-question paper.**
`web/src/styles/index.css` already defines `.navigator-scroll` (`overflow-y: auto`, alongside a
capped `.navigator-panel { max-height: 85vh }`), with a comment stating this was already found
and fixed once: *"found by testing against a real 100-question SSC CGL paper, where the
uncapped panel spilled off both the top and bottom of the screen and made its own Close button
unreachable."* But `MockTestEngine.tsx`'s JSX never actually wrapped `.navigator-grid` in a
`.navigator-scroll` div — confirmed by grepping the whole `web/src` tree: the class existed only
in the stylesheet, referenced nowhere. The documented fix was never applied to the component
that needed it.

Reproduced independently, before reading the CSS comment: a Playwright script against a real
SSC CGL Tier 1 paper (100 questions) opened the navigator, and clicking its Close button timed
out after 30s with Playwright reporting the element "outside of the viewport" despite being
"visible, enabled and stable." Fixed with a one-line JSX change — wrapping the grid in the
already-defined `.navigator-scroll` div, no CSS change needed. Re-ran the same script
immediately after: completed cleanly end to end, Close button reachable.

## Verified

All checks run from `web/`, and against the real dev backend + Neon database (not mocked):

- `npx tsc --noEmit` — clean, before and after the fix.
- `npx oxlint` — zero problems, before and after the fix.
- `npm run build` — clean (364.45 kB JS / 108.77 kB gzipped, up from Phase 1's 96 kB, a
  modest and expected increase for a whole new feature area).
- **A full real attempt, driven end to end via a headless Playwright script** against the real
  backend on `localhost:8080` with the web dev server on `localhost:5174`:
  - 11 exams listed with mockable-paper counts; SSC CGL → its one paper ("Tier 1 (Computer
    Based Examination)", 100 questions, 60 min, +2/−0.5) → pre-test briefing (correct duration,
    marking scheme, honest per-section availability) → Start.
  - Confirmed **zero** reveal-styling elements (`.option-correct`/`.option-wrong`) present
    before any answer — blind mode holds.
  - Answered 5 real questions, marked the 2nd for review. Question Navigator: 100 cells,
    exactly 4 shown answered + 1 marked (the engine's precedence rule — marked overrides
    answered in the cell's displayed state — held correctly).
  - Submitted via the confirmation dialog (correctly named the answered count) → Result
    screen scored **−2.5** for 0 correct / 5 wrong under the real +2/−0.5 scheme — exact
    arithmetic match — with a correct by-subject breakdown and a full per-question review
    (real question text, the student's wrong answer, the correct answer, and the stored
    explanation, e.g. "Each number increases by 7: 21+7=28.").
  - Zero browser console errors.
- **Repeated at a 390px phone viewport**: no horizontal overflow at any of the exam list,
  briefing, or engine screens (`document.scrollWidth` stayed at 390 throughout); bottom tab
  bar and top account/settings icons both present; the navigator dialog — the specific
  regression fixed this session — rendered fully with its Close button reachable at this
  width too.
- Screenshots captured at both viewports, both confirming a premium, uncluttered layout
  consistent with the visual bar set earlier this session (real typography, icon set, card
  elevation, accent-bar nav).

## Not verified

- The signed-in upload path (`POST /api/progress/sync` via `uploadCompletedAttempt`) was not
  exercised against a real account this session — no disposable test account was created,
  matching Phase 1's identical disclosed gap for Practice sessions. Code matches the documented
  payload shape, not executed.
- The `beforeunload` tab-close/refresh guard could not be exercised — browsers deliberately
  suppress the native prompt under headless/automated control. The in-app navigation guard (the
  styled confirmation dialog in `AppShell`) was read and reasoned through, not clicked.
- Only SINGLE_CHOICE questions were exercised live (the real content sampled in the sections
  walked this session). Every other question type's scoring is already proven at the shared
  evaluator's unit-test level and, for Practice, against live data in Phase 1; the Mock Test
  engine reuses the identical renderer set with `revealed={false}`, so the residual risk here is
  low but not directly confirmed for this screen.
- No mobile emulator pass, no deploy of `web/` — unchanged standing gaps from Phase 0/1.

## Documentation updated

- `tasks/TASK-2601-student-web-application.md` — new "Phase 2 — Mock Test" section under
  Implementation status, with the full account above.
- `qa/requirements/questions.yaml` — `REQ-QUESTIONS-018` gained `Web` to its `system` list and
  a note that Mock Test on web has no fallback path (decision 2: online-only).
- `qa/requirements/web.yaml`, `qa/scenarios/web.yaml`, `qa/test-cases/web.yaml` — new
  `REQ-WEB-010`, `SCN-WEB-014/015/016`, `TC-WEB-015/016/017`. All new cases `Not Executed` per
  `AI_RULES.md` §3.21 (writing the case is the deliverable, not running it), with the manual
  verification performed this session recorded as evidence in each case's `remarks`, not as an
  invented `Executed` result. `TC-WEB-016` is written explicitly as a regression guard for the
  navigator bug found and fixed this phase. `scripts/qa/generate-reports.js` and
  `scripts/qa/generate-suites.js` were re-run: RTM 93/175/192 → **94/178/195**.
- `memory/STATUS.md` — resume-point entry added for this session.

## Next

Phase 3 (Progress, history, Revise — the phase needing real backend work: paged/filtered
history reads, a hydrated single-session/single-attempt fetch, a bookmarks read that returns
question content). Nothing blocks starting it. The `Progress` route currently renders a
"Phase 3" `ComingSoon` placeholder; `Exams` similarly awaits Phase 4.
