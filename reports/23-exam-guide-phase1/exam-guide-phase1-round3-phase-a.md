# Exam Guide — closing the coverage ledger, Phase A (wiring & polish)

**Requested:** close every remaining gap in the published "Exam Guide Coverage Ledger"
artifact (76 spec sections audited, 23 not started / 12 partial after round 2), including
the large net-new subsystems. Scoped into phases (see the approved plan) so each is
independently shippable; this report covers **Phase A — wiring/polish, no schema changes**.

## What shipped

- **"Add to My Exams" toggle on the Guide screen itself** (§5/§50) — a star toggle next to
  the exam name in `exam-guide.tsx`, reading/writing the same `followed_exams` rows
  `my-exams.tsx` already uses (`isExamFollowed`/`followExam`/`unfollowExam` from
  `db/followedExams.ts`). Previously the only way to follow an exam was from My Exams;
  now the Guide screen and My Exams both reflect the same state.
- **Practice/mock progress surfaced on the Guide screen** (§64) — a new "Your Progress"
  card showing practice accuracy (from `useSessionHistory()`, filtered by `examCode` —
  the same 50-most-recent-sessions source Home already reads) and mock test attempts/best
  score (from the existing `getMockAttemptSummary(examCode)` in `db/mockTest.ts`, not a
  new query). Renders nothing when there's no history for this exam yet, matching this
  screen's existing "only show what's real" convention.
- **Home page integration** (§38): a deadline-countdown card (nearest upcoming date across
  `applicationEnd` and all `importantDates`, using the same priority-tier colour coding the
  Guide screen uses) and an "Explore Exams" link to My Exams. Both new.
- **Shared date/priority util extracted**: `mobile/src/examGuide/dates.ts`
  (`daysUntil`/`formatDate`/`priorityTier`), moved out of `exam-guide.tsx` so Home's new
  countdown card computes the same tiers the same way instead of a second implementation.

## Two things found already done, not "not started" as the ledger says

The ledger (published same day as round 2) is stale on two rows — the actual code in the
working tree has moved past what it describes:

- **§5's "Check eligibility" CTA already exists** (`exam-guide.tsx`'s "Check My
  Eligibility" button, wired to `/eligibility-checker`) — the ledger still lists it as
  missing. No action needed; noting it so the ledger can be corrected when republished.
- **§2's "syllabus/PYQ CTA" is already reachable**, just not by a direct same-screen link:
  the Prepare section's existing "Syllabus & Practice" button opens `/practice/subjects` →
  choosing a subject opens `/practice/topics`, which already renders PYQ trend chips per
  topic (Epic L). A dedicated exam-level "PYQ trends" shortcut isn't buildable without
  picking a subject first (topics.tsx requires `subjectId`), so this is judged adequately
  closed via the existing two-tap path rather than worth a new aggregate screen.

## Explicitly not done in this phase, and why

- **"Set reminder" per date** — left as a gap, not a stub button. Reminders need push
  infrastructure that doesn't exist anywhere in this app yet (confirmed by grep before
  planning — zero hits for `push`/`fcm`/`expo-notifications`). That's Phase D of the
  approved plan, not this one.
- **"Eligible" badge on the Guide/My Exams screens** (part of §50) — **deliberately not
  built this phase**, discovered while implementing, not assumed up front. Computing it
  needs a persisted date-of-birth + category somewhere; there is no user-profile field for
  either anywhere in this app (checked `account.tsx` — no DOB/category field exists), and
  `eligibility-checker.tsx`'s verdict is computed from screen-local state that's thrown
  away when the screen closes. Adding a durable DOB/category field is a schema decision
  (local + likely server-synced, since eligibility should hold across devices), which this
  phase's own scope ("no schema changes") explicitly excludes. Flagging for the next
  session to decide where that field belongs, rather than bolting it onto the
  device-only, explicitly-not-account-data `app_preferences` table, which its own doc
  comment says is for device settings, not personal data.
- **§57 product metrics rollup** — stays partial, as flagged in the plan before starting.
  The events this feature emits are Sentry breadcrumbs, not backend-stored rows; there is
  no Sentry API/org access in this environment to build a dashboard from. Not attempted.
- **Full accessibility audit (§52)** — every element added this phase has explicit
  `accessibilityRole`/`accessibilityLabel`. A full pass would also touch the shared
  `Card`/`CardRow`/`PressableScale` primitives (neither sets accessibility props when
  `onPress` is supplied — confirmed by reading `ui/Card.tsx`), which are used everywhere in
  the app, not just Exam Guide screens — out of this task's scope per "don't refactor
  unrelated code." No manual screen-reader (TalkBack) walkthrough was performed; that would
  need a real device/emulator session.

## Files changed

- New: `mobile/src/examGuide/dates.ts`
- Modified: `mobile/src/app/exam-guide.tsx`, `mobile/src/app/(tabs)/index.tsx`

## Verified

- `npx tsc --noEmit`: clean.
- `npx expo lint`: **9 problems (8 errors, 1 warning) — exactly the pre-existing baseline**,
  confirmed by diff against the documented baseline list. One new violation was introduced
  and fixed during this pass: the Home countdown effect's early-return synchronous
  `setState` tripped `react-hooks/set-state-in-effect`. Fixed with the same pattern this
  codebase already used for the identical shape in `PreparationPlanCard.tsx` — store the
  loaded value keyed to the id it was loaded for, derive the rendered value by comparing
  to the current id, so there's no synchronous `setState` in the effect body and (as a
  side effect of the same fix) switching the followed exam can no longer flash the
  previous exam's deadline while the new fetch is in flight.

## Not verified

- **No on-device/emulator run.** All four Exam Guide screens plus Home render from static
  analysis and reasoning about existing, already-tested data functions
  (`isExamFollowed`/`followExam`/`getMockAttemptSummary`/`useSessionHistory`), not from
  actually opening the app. Worth a real emulator pass before this ships, per this
  project's own standing rule that a clean compile has repeatedly missed real bugs here.
- The Home deadline card's `getExamGuide` call is a second live fetch per Home mount
  (in addition to the Guide screen's own) — no caching between them yet. Not a regression
  from this phase (the Guide screen already fetches independently), but worth keeping in
  mind: Phase B's offline cache will make both read from the same local table instead.

## Next

Phase B (offline cache for Exam Guide, search, "what's changed this cycle", content
draft/published states) — schema migration V18. Continuing per the approved plan.
