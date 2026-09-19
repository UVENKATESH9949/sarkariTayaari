# Web app: premium visual/responsive redesign pass

**Session date:** 2026-09-17. **Scope:** `web/` only — presentation and responsive layout.
No API, schema, auth, or backend change; no new functionality added to the two unbuilt
routes (Progress, Exams), per the brief's own explicit "don't add functionality for a visual
redesign" instruction and this project's `AI_RULES.md`.

## Requested

A general "make the web app premium and properly responsive" brief (mobile-app-identity
design system, mobile-first-to-desktop responsive philosophy, desktop side panels, breadcrumbs,
consistent loading/empty states, etc.), with an explicit process: audit first, then design
system, then shell, then components, then pages, then responsive validation.

## Audit (phase 1) — the real starting point was much better than a generic web app

Two parallel research passes (web codebase; mobile design system) found the architecture
already sound, not something to rebuild:

- **Colour/spacing/radius/shadow tokens are already shared with mobile** via
  `packages/core/src/design/` → `web/src/theme/applyTheme.ts`, which flattens the same
  palette objects mobile uses into CSS custom properties. No token work was needed.
- **Practice and Mock Test (TASK-2601 Phases 0-2) are fully built**, with a real shared
  question-renderer dispatcher (`QuestionBody`) ported from `packages/core`. Progress and
  Exams are deliberate `ComingSoon` stubs — real backend work (a lightweight progress-summary
  endpoint; exam discovery/follow), not a styling gap.
- **The shell already had a sensible single breakpoint** (1024px, sidebar vs. bottom bar),
  explicit-column grids at 768/1024/1600px, and a real footer.
- Real, disclosed rough edges found: several drill-down pages fell back to a bare
  `<p className="muted">Loading…</p>` instead of the shimmer skeleton three other screens
  already used; a few repeated `style={{ display: "flex", gap: ... }}` one-offs where a
  utility class would do; the two `ComingSoon` stub routes had no unique visual treatment; no
  breadcrumb/wayfinding existed for the drill-down flows; and the two most complex screens
  (Mock Test Engine, Practice Quiz) used none of a desktop viewport's extra width.

**Mobile's own design language was NOT ported wholesale** — it doesn't need to be. Two
corrections to my own starting assumptions, confirmed by reading the actual code rather than
recalling prior sessions: mobile has no custom font (system default) and no icon package
(Ionicons only) — Inter and the hand-written SVG icon set are **web-specific**, matching
`admin/`'s convention on purpose (the two dashboard-style surfaces), not a mobile import.
Difficulty-level colours are admin-content-driven on mobile (no fixed hex mapping to port).

## What shipped

**Design-system additions** (`web/src/styles/index.css`) — small, additive, no existing rule
changed: `.row`/`.mt-sm`/`.mt-md`/`.mt-lg`/`.mb-sm`/`.mb-lg` utility classes (replacing ~10
repeated inline `style={{...}}` spacing one-offs across `Settings.tsx`, `PracticeQuiz.tsx`,
`PracticeSummary.tsx`, `MockTestEngine.tsx`, `MockTestStart.tsx`, `MockTestResult.tsx`,
`ConfirmDialog.tsx`); `.breadcrumbs`/`.breadcrumb-*` (desktop-only, ≥48rem); `.cta-banner`
(a warmer, brand-tinted treatment for a banner that wants a click, vs. the existing neutral
`.notice`); `.coming-soon*` (a centred hero treatment for the two stub routes); three new
`LoadingState` skeleton variants (`rows`, `list`, `question`); and `.quiz-layout`/
`.quiz-sidebar` — the desktop side-panel grid, `minmax(0, 42rem)` question column + `18rem`
sticky sidebar at ≥64rem, degrading to plain document flow below it.

**New component**: `web/src/components/Breadcrumbs.tsx` — plain `<Link>`-based (none of the
pages it's added to are inside an active Mock Test session, so the existing
"leave this test?" guard doesn't need wiring here), an item with no reconstructable `to`
renders as plain text rather than a link to the wrong data (e.g. Mock Test Start only
receives `paperId`, not the `examCode` its own Papers list needs).

**`LoadingState.tsx`** gained `variant="rows"` (a `.stat-row` list inside one card — Subjects/
Topics/Levels/Mock Test Start), `variant="list"` (a stack of full-width cards — Mock Test's
paper list), and `variant="question"` (a skeleton question card — Practice Quiz's and Mock
Test Engine's first load), alongside the existing `variant="grid"`.

**Breadcrumbs wired into** the Practice and Mock Test drill-down pages (Subjects, Topics,
Levels, Summary; Papers, Start, Result) — deliberately **not** onto the quiz/test-taking
screens themselves, where the progress bar is already the "where am I" indicator and a row
of exit links next to an in-progress question would just be an invitation to lose your place.

**The flagship change — desktop side panels (the brief's own explicit example) on the two
most complex screens:**
- **Mock Test Engine**: the question-navigator legend+grid is now rendered from one shared
  JSX value (`navigatorContent`) into *either* the existing modal (unchanged, still what
  appears below 1024px behind the "Questions" button) *or* an always-visible sidebar at
  ≥1024px, where the button is hidden via CSS. Same state, same interactions
  (`goTo`/`isDraftAttempted`/`marked`), two places it can render — never both reachable at
  once for a given viewport.
- **Practice Quiz**: a new sidebar shows the session's exam/subject/topic/level context and a
  live progress readout (mirroring the progress bar above the question), reusing state
  already computed for the main column.

**`ComingSoon.tsx`** gained a `notFound` flag so the same component serves Progress/Exams
(phase pill + "isn't built yet" copy) and the 404 route (no phase pill, different copy) — the
404 call site previously would have inherited the wrong wording once the hero treatment was
added; caught before it shipped.

**`Home.tsx`**'s sign-in nudge became a brand-tinted `.cta-banner` with a real "Sign in"
button (`<Link to="/account">`) instead of a plain text-only `.notice`; the "still being
built" notice kept its neutral treatment (correctly — it's informational, not a call to
action).

## Verified

- `npx tsc --noEmit`: clean. `npx oxlint`: clean (0 findings). `npm run build`: clean
  (`vite build`, 388KB JS / 114KB gzip, 25KB CSS / 5KB gzip — up from the prior baseline as
  expected for genuinely new CSS/components, not a regression).
- **A real, on-device-style Playwright pass across five breakpoints (390/820/1024/1440/1920px),
  both light and dark theme, against the live shared backend** (a pre-existing dev instance
  on :8080 — confirmed already running by another process before this session touched
  anything; my own attempt to start a second one correctly failed on the port conflict and
  exited cleanly, so nothing was disturbed there) and a scratch `npm run dev` instance on
  :5174 (stopped and confirmed down at the end of the session). Walked the full real flow:
  Home → Practice exam list → Subjects → Topics → Levels → Quiz (answered, revealed) →
  Summary; Mock Test exam list → Papers → Start → Engine (a real 100-question SSC CGL Tier 1
  paper, all 100 navigator cells) → the modal navigator at phone width; Settings (light and
  dark); Account; the Progress/Exams/404 `ComingSoon` variants. **Zero browser console errors
  or page errors across the entire pass, at every breakpoint.**
- **The desktop sidebar layout was specifically checked at its worst case — exactly 1024px**,
  where the ideal combined width (42rem question column + 18rem sidebar + gap) exceeds the
  available content area before `--shell-max` grows at 1280px: the `minmax(0, 42rem)` grid
  track shrinks correctly, with no overflow and no awkward squeeze, confirmed by screenshot.
- **A real, disclosed finding from this same pass, not caused by this change**: building a
  100-question mock test attempt (`buildMockTestQuestions`, sampling across 4 sections) took
  **~35 real seconds** against the shared Neon dev database in one observed run, and a plain
  subject/topic drill-down page can take several real seconds too (`GET /api/exam-structures`
  alone measured at ~5s). This matches memory/STATUS.md's own prior documentation of Neon
  latency on this project and is unrelated to anything touched this session — flagged here
  because it's exactly the kind of delay the new `variant="question"`/`variant="rows"`/
  `variant="list"` skeletons now have to hold up over, and did, in this pass.
- Light-theme skeleton shimmer tones sit close to white (`--color-surface-elevated-2` /
  `--color-border-subtle` are both near-white in the light palette) and can read as nearly
  blank for a brief moment during a real, uncached load — a pre-existing characteristic of
  the shared skeleton-block tokens (same convention mobile's own skeleton uses), not
  something this session introduced or was asked to fix. Recorded as a known edge condition
  on REQ-WEB-012 rather than silently left unexplained.

## Not verified

- **No physical low-end device, no real Chrome/Firefox/Safari cross-browser pass** — Chromium
  via Playwright only, per this project's standing convention for browser verification.
- **The signed-in path** (uploading a completed session/attempt) was not exercised this
  session — the flow was walked signed-out throughout, consistent with how Phase 1/2 of
  TASK-2601 disclosed the same gap.
- **No deployed build was checked** — `web/` has never been deployed (per `memory/STATUS.md`);
  this was verified against the Vite dev server only.
- The mock-test-navigator-modal screenshot at phone width from the very first (mistimed)
  verification pass was not re-captured after fixing the script's wait logic, since the
  modal renders the exact same `navigatorContent` JSX already confirmed correct in the
  sidebar — same source, not a second implementation that could have drifted.

## Documents updated

- `qa/requirements/web.yaml`, `qa/scenarios/web.yaml`, `qa/test-cases/web.yaml`: three new
  requirements (**REQ-WEB-011** desktop side panels, **REQ-WEB-012** consistent loading
  states, **REQ-WEB-013** premium ComingSoon treatment), four new scenarios
  (**SCN-WEB-018..021**), four new test cases (**TC-WEB-019..022**) — all `ManualOnly`
  (no browser-test runner exists under `web/`), all `Not Executed` per this project's rule
  that a fresh case is never given an invented result. `qa/traceability/RTM.md` and
  `qa/reports/dashboard.md` regenerated: **115/224/245 → 118/228/249**.
- This report (`reports/33-web-premium-redesign/`); `memory/STATUS.md`'s resume point.

## Risks / assumptions

- The desktop sidebar pattern assumes a viewport ≥1024px genuinely has room for it — true at
  every width tested, including the 1024px boundary itself.
- Breadcrumb `to` targets are reconstructed from the current page's own query params; a step
  whose full params aren't available on the current page (Mock Test Start → Papers) renders
  as plain text rather than a link, by design — not a bug, but worth knowing if a future
  change wants that link to work (it would need `examCode` threaded through Mock Test Start's
  own URL, a small API-shape-adjacent change outside this session's scope).
