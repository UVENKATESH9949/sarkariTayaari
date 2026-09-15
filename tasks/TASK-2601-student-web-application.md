# TASK-2601 — Student-facing web application

## Objective

Build a fourth system, `web/` — a student-facing web application that brings the mobile
app's features to the browser, working from phone-browser width up to desktop, reading
live from the existing backend rather than maintaining a local database. It is a sibling
to `mobile/`, not a replacement: the phone app keeps the offline guarantee, and the web
app serves the students who will not install an APK.

---

## Decisions already taken

All five were taken by the project owner in the scoping session of 2026-09-11, before any
code was written, per `AI_RULES.md` §5.2. They are recorded here so a later session does
not silently re-litigate them.

| # | Decision | Chosen | Rejected |
|---|---|---|---|
| 1 | Feature scope | **Full parity with mobile, delivered in phases** | Core-loop-only; discovery-led |
| 2 | Offline support | **Online-only** — no local database, no sync engine, no migrations | PWA offline mirror; offline-capable from day one |
| 3 | Screen sizes | **Responsive, phone browsers included** | Desktop/tablet only; desktop-first |
| 4 | Implementation | **A new React web app in `web/`** | Running the existing Expo app via `react-native-web`; a spike-then-decide phase |
| 5 | Shared logic | **A shared package via npm workspaces** | Copy + parity scripts; direct path-alias imports from `mobile/` |

### Why decision 4 went against the cheaper option

`mobile/package.json:37` already carries `react-native-web@~0.21.0`, `mobile/package.json:53`
already defines `"web": "expo start --web"`, and `mobile/app.json:23-26` already declares
`"web": { "output": "static" }`. Running the existing app in a browser was therefore a real
option that would have avoided rebuilding ~30 screens. It was rejected because:

- Decision 3 (phone browsers) is the case `react-native-web` serves worst. A no-install web
  app exists to reach students on low-end Android over patchy mobile data; that is precisely
  where a large react-native-web bundle is most costly.
- Decision 2 (online-only) fights the existing architecture. Every content screen branches on
  `useHybridMode()` (`mobile/src/data/hybridSource.ts`), a tri-state derived from local
  SQLite sync state that does not exist in a browser.
- Coupling risk: the Android app has real users. Sharing one screen tree means a
  web-only layout change can regress the shipped APK.

Neither `expo start --web` nor a `web` build has ever actually been run in this project. The
above is reasoning from configuration and dependencies, not from an observed build. If a
future session wants to revisit this, that is the gap to close first.

---

## Research this plan is grounded in

Four parallel research passes over the real code, 2026-09-11. Findings that materially shape
the plan:

**The backend needs far less work than expected.** The live endpoints built for the hybrid
online/local layer (`reports/13-hybrid-online-sync/`) already cover the browsing and
practice half of the app, publicly and with no auth: `GET /api/questions/live`,
`/api/questions/counts`, `/api/questions/mock-count`, `/api/questions/mock-sample`,
`/api/question-groups/sync`, `/api/question-types`. Exams, exam structure, exam guide,
prepare-plan, topic intelligence and exam discovery are all already reachable too.
`/mock-sample` is already group-aware, so passage-grouped questions are never split.

**`mobile/src/api/` is portable almost verbatim.** It uses global `fetch`, attaches
`Authorization: Bearer <token>` explicitly per call rather than via an interceptor, and has
no React, no `react-native`, and no `__DEV__`. The single Expo dependency in the whole
folder is `mobile/src/api/config.ts` (~15 lines) importing `expo-constants` to derive a
base URL.

**Three modules are genuinely dependency-free TypeScript** — verified, not assumed:
`mobile/src/evaluation/` (both files contain **zero** `import` statements),
`mobile/src/intelligence/topicHealth.ts` and `types.ts`, plus the `i18n` catalogues and
`mobile/src/ui/theme.ts` / `palettes.ts`. These are the extraction targets for decision 5.

**The scoring rules already exist twice and a third copy is the main long-term risk.**
`mobile/src/evaluation/questionEvaluator.ts` mirrors the backend's `evaluation` package;
`mobile/src/intelligence/topicHealth.ts` mirrors `TopicHealthService.java`. Only the second
pair is guarded, by `scripts/check-topic-health-parity.js`. There is **no test runner on any
JavaScript side of this project** — the TypeScript evaluator is, in its own header's words,
verified by reading. See "The opportunity this creates" below.

**The real backend gap is history.** `GET /api/progress` returns a user's entire practice and
mock history — every session, every attempt, every nested per-question row — unpaginated and
unfiltered. That is correct as a one-time restore into a phone's SQLite; it is unusable as
the data source for a browser screen. `memory/STATUS.md` records the demo account at 350
practice sessions and 85 mock attempts.

**Four things the server stores without enough content to render.** Bookmarks
(`GET /api/bookmarks` returns `questionId`/`deleted`/`updatedAt` only), practice and mock
history (answers but no question text — mobile rebuilds it from its local bank), question
group content, and diagnostic attempts (`mobile/src/db/diagnosticAttempts.ts` — **no server
representation at all**).

**Interop is safe.** All four user-data channels (progress, bookmarks, followed exams, topic
progress) are idempotent and keyed on client-generated ids or last-write-wins timestamps, so
a student using web and phone on the same account merges correctly rather than clobbering.

### Traps this plan must respect

- **`supportedTypes` defaults to `SINGLE_CHOICE`.** Omit the parameter on `/questions/live`
  or `/questions/sync` and the client silently receives only single-choice questions and
  looks empty or broken. `mobile/src/evaluation/supportedQuestionTypes.ts` is the list to
  send; it moves into the shared package.
- **CORS is pinned to exact origins and has never been exercised by a real cross-origin
  browser request.** `CorsConfig` binds `app.cors.allowed-origins`, defaulting to
  `http://localhost:5173` only. A new origin needs `APP_CORS_ALLOWED_ORIGINS` updated and,
  on Cloud Run, a new revision. `127.0.0.1` is a different origin from `localhost`.
- **`GET /api/exams/{code}/weakness-radar` writes.** It recomputes and persists when stale.
  A router prefetch, a service worker, or a React StrictMode double-invoke will trigger real
  work. Never prefetch it.
- **An `Authorization` header that is present but invalid returns 401, while no header at all
  is treated as anonymous** (`ExamGuideController.tryResolveUser()`). A signed-out web client
  must send no header, not an empty or stale one.
- **No rate limiting exists anywhere in the backend.** Publishing a browser client against
  public, CORS-enabled, unauthenticated content endpoints widens a scraping and cost surface
  on a scale-to-zero Cloud Run service with `--max-instances=3`.
- **No API versioning.** From this task onward a breaking backend change breaks two student
  clients at once, not one.

### The opportunity this creates

Decision 5 requires a package that both `mobile/` and `web/` consume. That package will hold
the TypeScript question evaluator — which today has no automated test of any kind, while its
Java counterpart is asserted by `QuestionEvaluatorsTest` against
`sample-data/question-evaluator-fixtures.json`. Adding a test runner to the shared package
lets the **same fixture file** drive both sides. This closes a long-standing verification gap
as a side effect of work we are doing anyway, and it is the first automated JavaScript test
in this repo. Phase 0 must not skip it.

---

## Requirements

- A new `web/` application, online-only, responsive from ~360px phone-browser width upward.
- Conventions follow `admin/` (this project's proven web stack), not new inventions: Vite,
  React 19, `react-router-dom`, oxlint, plain CSS with custom properties, no UI framework,
  no state-management library, a single API module.
- `web/` is written in **TypeScript** (unlike `admin/`, which is plain JS) — required to
  consume the shared package and to keep the typed-translations guarantee.
- A shared workspace package is the single source of truth for: the question evaluator, the
  topic-health algorithm, the API client, translation catalogues, and design tokens.
- `mobile/` consumes that package instead of its own copies, and continues to build, typecheck
  and lint exactly as before.
- The web app interoperates with the same accounts and the same server-side records as the
  phone app — a student may use both.
- Every phase adds manual QA coverage in `qa/` and automates what is automatable, per
  `AI_RULES.md` §3.21.

## Acceptance criteria

- A student can sign up, sign in and sign out on the web, and their practice history,
  bookmarks, followed exams and topic mastery are the same records the phone app reads.
- Every feature area listed in "Phases" below is reachable and functional in a browser.
- The app is usable at phone-browser width with no horizontal scrolling and no clipped
  controls, verified in a real browser at a real viewport size — not inferred from CSS.
- All question types the mobile app renders, render and score identically on the web, proven
  by the shared fixture file passing against the shared evaluator.
- `npm run build` and `npm run lint` are clean in `web/`; `npx tsc --noEmit` is clean.
- `mobile/`'s typecheck, lint and build are unchanged from their pre-extraction baselines.
- `scripts/check-topic-health-parity.js` still passes after the algorithm moves.
- The deployed backend answers a real cross-origin preflight from the real web origin.

---

## Affected systems

| System | Why |
|---|---|
| **`web/`** (new) | The application itself. |
| **shared package** (new) | Evaluator, topic health, API client, i18n catalogues, design tokens. |
| **`mobile/`** | Its copies of the above are replaced by imports. No feature change intended. |
| **`backend/`** | New paged/hydrated read endpoints (Phase 3), diagnostic persistence (Phase 5), CORS origin config, `api/*.md` updates. |
| **`admin/`** | Untouched. It stays plain JavaScript and does not consume the shared package. |
| repo root | npm workspaces; `scripts/check-topic-health-parity.js` path updates; `qa/`. |

## Affected modules

- New: `web/`, `packages/core/` (name to be settled in Phase 0).
- `mobile/src/evaluation/`, `mobile/src/intelligence/topicHealth.ts` + `types.ts`,
  `mobile/src/i18n/en.ts` + `te.ts` + `counts.ts`, `mobile/src/ui/theme.ts` + `palettes.ts`,
  `mobile/src/api/*` — all become re-exports of or imports from the shared package.
- `backend/.../controller/ProgressController.java` and its service/DTO layer (Phase 3).
- `scripts/check-topic-health-parity.js` — hardcodes `mobile/src/intelligence/topicHealth.ts`
  at line 32 and will break on extraction.

---

## Phases

Each phase ends with: the code, its `qa/` coverage, an automated test where a runner exists,
a `reports/<NN-topic>/` writeup, and a `memory/STATUS.md` resume-point update. No phase is
"done" on a clean compile alone — `AI_RULES.md` §3.13.

### Phase 0 — Foundation, and proving the risky parts first

The phase that de-risks everything after it. Deliberately ends with something deployed.

- npm workspaces at the repo root; extract the shared package; point `mobile/` at it.
- Add a test runner (Vitest) to the shared package and run
  `sample-data/question-evaluator-fixtures.json` against the TypeScript evaluator — the gap
  described above.
- Update `scripts/check-topic-health-parity.js` for the new path; confirm it still passes.
- Re-run `mobile/`'s typecheck, lint and a real build to prove the Expo/Metro bundler is
  happy with a workspace layout. **This is the single most likely thing to go wrong in this
  phase.**
- Scaffold `web/`: Vite, React 19, TypeScript, `react-router-dom`, oxlint.
- App shell and responsive navigation. Note the mobile app's 5-tab bar and its `More` tab do
  not survive translation — web needs a sidebar-or-header at desktop width collapsing to
  something appropriate on a phone, and `More` dissolves into that navigation.
- Design-system primitives, copying the mobile components' **prop shapes** so the two apps
  stay conceptually aligned: `Button`, `Card`, `Badge`, `EmptyState`, `ErrorState`,
  `Skeleton`, `StatPill`, dialog. Themed via CSS custom properties fed from the shared
  tokens, with `data-theme` for light/dark and a root variable for the text-zoom ladder —
  porting the concept, not mobile's `WeakMap`-cached `useThemedStyles` machinery, which is a
  React Native optimisation with no web equivalent.
- i18n provider over the shared catalogues, persisted to `localStorage`.
- Auth: sign up, sign in, sign out, token storage, `Bearer` header, and 401 handling
  (`admin/src/api.js`'s `setOnUnauthorized` inversion is the pattern to follow).
- CORS spike and a real deployment of the shell, proving a genuine cross-origin request from
  the real web origin to a real backend.

**Exit:** a deployed, themed, responsive, signed-in-capable shell with no features; mobile
provably unregressed; the evaluator under automated test for the first time.

### Phase 1 — Practice

The core study loop and the largest single rendering job.

- Screens: exam picker, subjects, topics, difficulty levels, quiz, summary. A minimal Home
  dashboard, enriched in later phases.
- All question types: single choice, multiple choice, true/false, numeric, fill-blank, match,
  ordering, assertion-reason, statement-combination, and passage/data-interpretation groups
  with media. Assertion-reason and statement-combination reuse the single-choice renderer, so
  the renderer count is lower than the type count.
- Match and ordering were deliberately built tap-driven on mobile, not drag-driven — there is
  no gesture-library dependency to replace. Web may use drag, but tap must keep working for
  touch.
- Data: `/questions/live`, `/questions/counts`, `/question-groups/sync`. Scoring from the
  shared evaluator. **Send `supportedTypes` on every call.**
- Media is a live third-party Cloudinary fetch on web; the phone's pre-download has no browser
  equivalent. Content Security Policy must allow it.

**Blocked on the open decision below** — what happens to a signed-out student's session.

### Phase 2 — Mock Test

- Screens: exam picker, paper list, pre-test briefing, the timed test engine, the result
  scorecard.
- The test engine is the most behaviour-heavy screen in the app: countdown with auto-submit,
  no feedback until submit, mark-for-review, clear-answer, a question-navigator grid, and
  per-question language switching.
- Data: `/questions/mock-count`, `/questions/mock-sample`, `/exam-structures`.
- Browser-specific work with no mobile equivalent: a tab close or refresh mid-test. Mobile
  guards this with a hardware-back interceptor; web has only `beforeunload`, which cannot
  show a custom dialog. Decide and document the behaviour rather than letting it be accidental.

### Phase 3 — Progress, history and revision — and the backend work

The phase that needs real backend changes.

- Backend: paged and filtered history reads, a single-session and single-attempt fetch, and
  hydrated responses that carry enough question content for a browser to render a review
  without a local question bank. `GET /api/progress` stays as-is for the mobile restore path.
- Backend: a bookmarks read that returns question content, not just ids.
- Screens: Progress (readiness, per-subject accuracy), practice history, session summary from
  history, Revise (bookmarks and wrong answers).
- `api/USER-PROGRESS.md` and `api/*.md` updated in the same change, per `AI_RULES.md` §5.

### Phase 4 — Exams discovery and Exam Guide

The largest feature area by screen count, and almost entirely already served by existing
endpoints.

- Screens: Exams discovery, Exam Guide, My Exams, Exam Calendar, Compare Exams, Eligibility
  Checker, Notification History, Syllabus & Trends.
- Data: `/exams/discover`, `/exams/{code}/guide`, `/exam-guides`, the cycle history and
  changes-from-previous reads, `/exams/{code}/prepare-plan`, `/exams/{code}/topic-intelligence`,
  `/followed-exams`.
- **Reminders are the one genuine feature gap.** Mobile uses Expo push
  (`mobile/src/notifications/pushRegistration.ts`), which is a different mechanism from Web
  Push entirely — and is already a silent no-op on mobile today for want of an EAS project id.
  Web reminders are explicitly out of scope for this task; the Important Dates UI ships
  without the bell.

### Phase 5 — Preparation intelligence and diagnostic

- Screens: Preparation Radar, radar topic detail, diagnostic test, diagnostic result.
- The radar's signed-in path works against the existing endpoint. Its signed-out path computes
  locally from SQLite attempt history and has no browser equivalent — acceptable, because a
  signed-out web student has no attempt history to compute from.
- `/radar-topic` currently receives its whole payload as a JSON-serialised route parameter.
  That is acceptable in a native stack and unacceptable in a URL bar; web must address topics
  by id and fetch.
- Backend: diagnostic attempts need server persistence — they exist only on-device today.
  New migration.

### Phase 6 — Parity closeout

- Account and settings screens; theme, app language, quiz language (the two are deliberately
  separate on mobile and must stay separate), text zoom.
- Accessibility pass — the thing a web app is judged on and a native app is not.
- Performance on a low-end phone browser: bundle size, code splitting, first paint.
- Translation coverage. Note the inconsistency being inherited: the older mobile screens are
  fully translated, while everything from the Exam Guide era onward hardcodes English. Decide
  whether web matches mobile's inconsistency or fixes it.
- SEO and shareable URLs, to whatever extent a client-rendered SPA allows. Server-side
  rendering is explicitly not in scope; see "Out of scope".

---

## API changes

| Phase | Change |
|---|---|
| 3 | Paged/filtered practice and mock history reads; single-session and single-attempt fetch; hydrated bookmarks. |
| 5 | Diagnostic attempt persistence. |
| any | Possibly a public single-question read — `GET /api/questions/{id}` is admin-only today, so a web deep link to one question has no endpoint. |

`api/*.md` is updated in the same change as the code, never deferred.

## Database changes

None until Phase 5, which adds diagnostic-attempt persistence. Phase 3's endpoints are new
reads over existing tables. Any migration is a new `V{n}__*.sql` — never an edit to one that
has run.

## UI changes

A new web application, ~28-30 routes. No mobile screens change. No admin pages change.

## Dependencies

- Nothing blocks Phase 0.
- Phase 1 is blocked on the open decision below.
- Phase 3's screens are blocked on Phase 3's backend work.
- A deployment target and its origin must be settled during Phase 0 for the CORS spike.

---

## Open decision — needed before Phase 1

**What happens to a signed-out student on the web?**

`mobile/src/practice/authContext.tsx` states the principle plainly: *"Accounts are entirely
optional. The app works signed out exactly as before."* That works on a phone because
everything lands in local SQLite. An online-only browser has nowhere to put a practice
session, a bookmark, or a history entry for a user with no account.

Options: require sign-in for anything that produces a record; let signed-out users practise
with results held only for the current visit and prompt them to sign in to keep it; or
introduce browser storage for signed-out users, which reopens a piece of decision 2.

**Recommendation:** the middle one — browse and practise freely, hold the session in memory
plus `localStorage` for the visit, and prompt to sign in to keep history. It preserves
mobile's "accounts are optional" stance without building a sync engine. Needs confirming
before Phase 1 starts.

---

## Risks

| Risk | Mitigation |
|---|---|
| **Workspace extraction breaks the Expo/Metro bundler.** The known friction point of monorepos, and `mobile/` is a shipped app with real users. | Phase 0 does the extraction first and proves a real mobile build before any web feature exists. If it cannot be made to work, fall back to decision 5's rejected option (copy + parity scripts) rather than pushing on. |
| **The scoring mirror drifts three ways.** | The shared package makes it one copy, and Phase 0 puts it under automated test against the same fixtures Java uses. |
| **CORS fails in a real browser.** Never verified against a real cross-origin request. | An explicit Phase 0 spike against a real deployed backend, not a localhost assumption. |
| **A public browser client widens the scraping/cost surface** on a scale-to-zero service with no rate limiting. | Out of scope to fix here, but raise it in `reports/open-questions.md` rather than leave it unsaid. |
| **Two student clients, no API versioning.** A breaking change now breaks both. | Note it in `api/README.md`; treat every Phase 3/5 endpoint as additive. |
| **Web and mobile UIs drift** as features land on one and not the other. | Shared package for logic; documented prop-shape parity for components; parity is a review item, not an aspiration. |
| **A 365-day bearer token in `localStorage`** is a materially larger XSS blast radius for a public student app than for the internal admin console. | Make it a deliberate, documented Phase 0 decision, not an inherited default. |

## Testing requirements

- `web/`: `npm run build`, `npm run lint` (oxlint), `npx tsc --noEmit`.
- shared package: Vitest, including the evaluator fixtures.
- `mobile/`: `npx tsc --noEmit`, `npx expo lint` — both held at their exact pre-existing
  baselines, and a real build after the extraction.
- `backend/`: `mvn compile` and the relevant test classes for Phases 3 and 5; the full suite
  before those phases close.
- `scripts/check-topic-health-parity.js` passes.
- **Real browser verification each phase** — a clean build has repeatedly missed real bugs in
  this project. At minimum a genuine click-through at both desktop and phone viewport widths.
- **QA per `AI_RULES.md` §3.21, every phase.** The `qa/` register's module codes follow
  `api/*.md` contract boundaries, and its requirement schema already carries a `system` list
  (Backend/Mobile/Admin) — so web work adds **`Web`** to that list rather than inventing a
  parallel module taxonomy. Genuinely new API surface (Phase 3, Phase 5) gets its own module.
  Run `scripts/qa/*.js` after every `qa/` change; `traceability/RTM.md` and
  `reports/dashboard.md` are generated, never hand-edited.

## Allowed files / areas

`web/**`, the new shared package, `mobile/src/{evaluation,intelligence,i18n,ui,api}/**`
(extraction only, no behaviour change), root workspace config,
`scripts/check-topic-health-parity.js`, `qa/**`, `api/*.md`, `system-design/*`,
`reports/**`, `memory/STATUS.md`. Backend changes only in the phases that name them.

## Out of scope

- Offline support, service workers, installable PWA (decision 2 — revisitable later).
- Server-side rendering / Next.js. Adding a Node SSR tier changes the deployment surface,
  which is currently one Spring service on Cloud Run plus static assets. If SEO later
  justifies it, that is its own task.
- Web push notifications and reminders (Phase 4 note).
- Any change to `admin/`, which stays plain JavaScript.
- Rate limiting, API versioning, and a public single-question endpoint beyond what a phase
  explicitly needs — raise in `reports/open-questions.md` instead.
- Fixing mobile's translation inconsistency (Phase 6 decides only whether web inherits it).
- Hindi UI translation. Only `en` and `te` exist — see the doc-drift note below.

## Documentation drift to fix (per `AI_RULES.md` §6)

Found during this task's research, none caused by it:

1. `api/README.md` documents the auth header as `Authorization: <opaque token>`. The backend
   requires the literal `Bearer ` prefix. `api/AUTH.md` is correct; the README is not.
2. `api/README.md` describes two auth checks; there is a third, `requireReviewer`.
3. `api/QUESTIONS.md` says `app.question-pool.temporary-enabled` defaults to `true` and the
   pool is restricted. `application.yml` sets it to `false` — the full bank is served.
4. The entire reminders API (`/api/push-tokens`, `/api/reminders`) is undocumented.
5. `/api/admin/ingestion/*` (11 endpoints) is undocumented.
6. `api/EXAM-GUIDE.md` is missing `changes-from-previous`, `prepare-plan`, and the
   career-posts admin CRUD, and does not note the reviewer-gated transitions.
7. `memory/STATUS.md` describes the UI as translated into English/Hindi/Telugu. Only `en` and
   `te` exist — `mobile/src/db/preferences.ts` declares `UiLanguage = "en" | "te"`. Question
   *content* is genuinely bilingual English/Hindi; the UI is not.

## Implementation status

`In progress` — plan and the signed-out open decision both approved 2026-09-11 (the
recommended middle option: browse and practise freely, session held for the visit, prompt to
sign in to keep history).

### Phase 0 — shared package extraction: DONE and verified

`packages/core` (`@sarkaritaiyaari/core`) now holds four modules, extracted with `git mv` so
history is preserved:

| Module | From | Consumers rewired |
|---|---|---|
| `evaluation/` | `mobile/src/evaluation/` | 4 files, direct imports |
| `intelligence/` (`topicHealth`, `types`) | `mobile/src/intelligence/` | 7 files, direct imports |
| `i18n/` (`en`, `te`, `counts`, new `translate`) | `mobile/src/i18n/` | 5 files, direct imports |
| `design/` (`tokens`, `palettes`) | `mobile/src/ui/{theme,palettes}.ts` | facade kept at `mobile/src/ui/theme.ts` |

**Workspace topology.** Root `package.json` declares `workspaces: ["packages/*"]` only.
`mobile/` and `admin/` stay independent npm projects; mobile consumes core through a
`file:../packages/core` dependency plus two additions to `metro.config.js` (`watchFolders`
and `nodeModulesPaths`). Effect on mobile's install: `node_modules` 577 → 578 entries and
**13 added lockfile lines with nothing removed or re-resolved** — deliberately minimal, since
mobile is a shipped app.

**Why the design tokens kept a facade while the other three got direct imports:** `ui/theme`
and `ui/palettes` have ~48 consumers between them. One documented entry point is a smaller
change to review — and a safer one on a shipped app — than 48 mechanical edits, and it leaves
somewhere to put a genuinely mobile-only token. The other three modules had 4–7 consumers
each, so direct imports cost nothing.

**The i18n split went further than "move the catalogues."** `lookup`, `interpolate`, the
dotted-key `Paths<Catalogue>` typing and the English-fallback rule were all pure functions
trapped inside mobile's React context; they now live in `core/i18n/translate.ts` as
`translatorFor()`. Mobile's `I18nContext.tsx` keeps only React context and SQLite
persistence. Web therefore inherits the identical translation engine rather than a
reimplementation.

### Two real findings from this phase

1. **`topicHealth.ts` referenced `__DEV__`, a React Native global that does not exist in a
   browser.** It sits inside the weight-sum assertion, so a web bundle would have thrown
   `ReferenceError: __DEV__ is not defined` in exactly the situation that assertion exists to
   diagnose — masking the real bug. Now guarded with `typeof __DEV__ !== "undefined"`, and
   `web/` will define `__DEV__` through Vite so both platforms behave identically. Found by
   the package's own type guard, before any web code existed.
2. **The evaluator's Java/TypeScript duplication is no longer asymmetric.** Adding Vitest let
   `sample-data/question-evaluator-fixtures.json` — 36 cases, previously asserted only on the
   Java side — run against the TypeScript evaluator too. It passed all 36 unmodified, so the
   mirror was genuinely correct; it is now *proven* rather than asserted.

### Guard worth knowing about

`packages/core/tsconfig.json` sets **no** `types` and keeps `lib` at `ES2022`, so shared code
cannot reference Node (`process`, `fs`) or the DOM (`window`, `document`) and still compile —
that is what keeps the package consumable by both Metro and Vite. Tests get Node's types via a
separate `tsconfig.test.json` so the allowance cannot leak into library source.
`src/globals.d.ts` declares the only two permitted ambients (`__DEV__` as possibly-undefined,
and a minimal `console`).

### Verified

- `packages/core`: typecheck clean under both configs; **37 tests pass** (36 fixtures + a
  guard). Test proven to fail correctly — inverting one comparison failed exactly the 4 cases
  that reach it while the 2 unattempted cases still passed. Guard proven to bite — a
  `process.env` reference in shared source fails the library typecheck.
- `scripts/check-topic-health-parity.js`: path updated, **passes** (35 shared constants agree).
- `mobile/`: `tsc --noEmit` clean; `expo lint` back at its exact documented baseline of
  **9 problems (8 errors, 1 warning)** after fixing one duplicate-import warning the merge
  genuinely introduced.
- `mobile/`: a real **`expo export` Metro production bundle succeeds** (7MB Hermes), and all
  four extracted modules are confirmed present in it. Non-ASCII needed a UTF-16LE byte search
  — a plain grep reports the Telugu catalogue missing when it is in fact there.

### Phase 0 — API client extraction: DONE

All of `mobile/src/api/` moved to `packages/core/src/api/` **except `config.ts`**, which stays
in mobile because resolving its base URL depends on Expo's `hostUri` (a phone on a dev build
has to reach the laptop running Metro; a browser has no equivalent). 29 import sites rewired.

The client no longer imports a base URL — it is injected via `configureApi({ baseUrl })`,
which throws if a request is attempted before it is called. Failing loudly beats defaulting,
because a silently wrong base URL presents as a backend outage and gets debugged in the wrong
place. Mobile calls it at module scope in `_layout.tsx` beside the existing `Sentry.init()`;
web in `main.tsx`. Verified no module-scope API call can run before either.

### Phase 0 — the `web/` app: scaffolded, running and verified in a real browser

Vite + React 19 + TypeScript + `react-router-dom` + oxlint — deliberately the same stack as
`admin/`, with TypeScript added because consuming the shared package requires it.

- **Theme**: `applyTheme()` flattens the *shared* palette into CSS custom properties on
  `:root`, so web declares no colour of its own. Called synchronously in `main.tsx` before
  React renders, so the first paint is already correct. Mobile's WeakMap-cached
  `useThemedStyles` is deliberately not ported — that machinery exists because React Native
  has no cascade; the web does.
- **i18n**: web's provider wraps the same `translatorFor()` engine mobile uses, persisting to
  localStorage instead of SQLite.
- **Auth**: sign up / in / out against the shared client, token in localStorage, validated on
  startup with `fetchMe` — the same choice `admin/` makes, because only the server knows a
  token has been revoked.
- **Shell**: sidebar from 1024px, bottom bar below. `More` does not survive translation — it
  exists on mobile because a phone tab bar runs out of room, and a sidebar does not.
  `Progress` becomes a real destination rather than mobile's `href: null` hidden route.

**Two real bugs found by looking at browser screenshots, not by building successfully:**

1. **Account and Settings were unreachable on a phone.** They live in the sidebar's footer,
   which is hidden below 1024px, and the bottom bar was full with five primary destinations.
   This is precisely the pressure that made the native app invent its "More" tab. Fixed with a
   narrow-screens-only top bar carrying both, at a 44px touch target. Verified by actually
   tapping it at 390px and landing on `/account`.
2. **The Exams card rendered as a bare heading when the fetch failed** — neither the loading
   nor the loaded branch matched. Now hidden entirely on error, since the banner already
   explains.

### CORS: verified for the first time, and it is strict

The plan flagged that CORS "has never been exercised by a real cross-origin browser request".
It has now, against a running backend:

| Check | Result |
|---|---|
| Preflight from allowlisted `http://localhost:5173` | `200`, `Access-Control-Allow-Origin` echoed, methods `GET,POST,PUT,DELETE`, `authorization` allowed, `Max-Age: 1800` |
| Preflight from unlisted `http://localhost:5174` | **`403 Invalid CORS request`** |
| Same from a real browser | Chromium blocked the fetch with the standard "No 'Access-Control-Allow-Origin' header" error |

So the mechanism works and the allowlist is exact and hard-enforced. `application.yml`'s dev
default now lists both origins (`5173` admin, `5174` web). **The success path for `5174` is
still unproven** — the backend running on this machine was started before that change and has
not been restarted.

### Verified (Phase 0 so far)

- `web/`: `tsc --noEmit` clean, `oxlint` **zero problems**, `vite build` succeeds
  (**305 kB JS / 95 kB gzipped**). Rendered in Chromium at 1280px and 390px: no horizontal
  overflow at either, theme variables resolve from the shared palette
  (`--color-brand-primary: #2563EB`, `--space-base: 16px`), dark-mode toggle flips
  `data-theme` and repaints to `#0A0D14` and persists, routing works across five routes, zero
  console/page errors.
- Contexts are split from providers so React Fast Refresh keeps working — a deliberate,
  documented deviation from `admin/`, whose single documented lint warning is exactly this
  pattern. `web/` starts at zero warnings instead.
- `packages/core`: **67 tests** (36 evaluator fixtures + 30 platform-purity scans + guards),
  both typecheck configs clean. The purity test is proven to fail on a real violation.

### Deployment: configured, never run

Firebase Hosting chosen (same GCP project as the backend, purpose-built for SPAs, no new
vendor). `firebase.json`, `.firebaserc`, `.github/workflows/web-deploy.yml` and
`WEB-DEPLOY-SETUP.md` are all in place; the workflow fails fast until three repository
variables exist. The one-time setup needs the Firebase Console and `gcloud` — the same category
as the backend's Workload Identity setup, and not doable from inside the repository.

**The step most likely to be skipped and then misdiagnosed:** the deployed origin must be added
to `APP_CORS_ALLOWED_ORIGINS`, and Firebase serves both `*.web.app` and `*.firebaseapp.com`,
which are different origins. A missing entry presents in the browser as an opaque network
failure indistinguishable from the backend being down — verified deliberately, see the report.

### Phase 0 outcome

**Done.** Full account of what shipped, what was verified and what was not:
`reports/28-web-application-phase-0/web-application-phase-0.md`.

Carried forward into Phase 1: no emulator/device pass has happened since the extraction touched
~45 mobile import sites (typecheck, lint and a real Metro bundle all pass, but nobody has opened
the app), and `web/` has never run anywhere but a local dev server.

### A standing visual bar, set explicitly 2026-09-12

User: *"we are developing government exam preparation application. so css looks like should
premium with proffessional... we are developing entireprice application so think in that
level."* Saved to memory (`feedback_premium_visual_design`) so it survives past this session.
Phase 0's shell was rebuilt to this bar before Phase 1 added anything on top of it: real
typography (Inter), a hand-written SVG icon set matching `admin/`'s exact convention (replacing
every emoji), a brand mark, real elevation (mobile's shadow tokens were sitting unused in the
shared package — now converted to a `--shadow-card` CSS variable), a left accent bar on the
active nav item, and stat-row treatment for lists. Verified by looking at real Chromium
screenshots at both viewports/both themes, not inferred from the CSS source. Every Phase 1
screen below was built to this same bar from the start.

## Phase 1 — Practice: DONE and verified end-to-end against real production data

### Shipped

**Two more shared-package extractions**, following Phase 0's own pattern, both moved with
`git mv`: `mobile/src/data/liveQuestions.ts` (the `/live`, `/counts`, `/mock-count`,
`/mock-sample` wrappers — previously only reachable through mobile's hybrid facade, now a
direct, permanent read path for web) and `mobile/src/db/answerResolution.ts` (the
letter-to-index resolver, genuinely dependency-free) → `packages/core/src/evaluation/`. 5
mobile consumers repointed; mobile's typecheck/lint stayed at their exact baselines throughout.

**`web/src/practice/`** — the full browsing funnel (`PracticeExams` → `PracticeSubjects` →
`PracticeTopics` → `PracticeLevels`) plus the engine (`PracticeQuiz`) and `PracticeSummary`,
all built directly on `@sarkaritaiyaari/core/api`/`evaluation` with no hybrid mode at all
(decision 2 — online-only means there is nothing to fall back to). Exam-syllabus scoping
uses `getExamStructures()`'s `syllabusSubjects`, the same mechanism mobile uses to show SSC
CHSL 4 subjects instead of every subject in the catalogue.

**Every one of the nine question types renders and scores**: a single `AnswerDraft`
discriminated union (one shape per evaluator family) replaces what would otherwise be six
separate answer-state maps; `QuestionBody.tsx` dispatches per type to
`OptionList`/`MultiSelectOptionList`/`FreeTextInput`/`MatchPairing`/`OrderingBuilder`, all
built fresh for the browser (click-driven, no drag-and-drop dependency — porting the exact
tap-to-pair/tap-to-append interaction mobile deliberately chose for the same reason). Practice
reveals immediately once an answer is confirmed; types that cannot infer "done" from one click
(MULTIPLE_CHOICE, NUMERIC, FILL_BLANK, MATCH, ORDERING) get an explicit "Check answer" step,
matching mobile's own confirm-step precedent.

**Question groups (passages/media)** render via a new `getQuestionGroups()` — pages the bulk
`/question-groups/sync` endpoint once and keeps only the groups actually referenced by the
current fetch, since there is no single-group read endpoint. Practice has no atomic-group
guarantee (same as mobile), so a grouped question can appear with none of its siblings present.

**Sessions and the signed-out decision, built exactly as scoped.** No local database exists
on web, so a completed session is held in `sessionStorage` (survives a reload of the tab,
gone when it closes) addressed by a generated id (`/practice/summary?sessionId=...`) rather
than fragile router state. When signed in, the session is ALSO uploaded via the exact same
`POST /api/progress/sync` payload shape mobile uses — a real, working step further than the
plan's minimum: a student's web practice becomes a genuine row in the same account history
the phone app restores, not a web-only record. A failed upload is silent by design (the
student's own results never depend on it).

### Two real bugs found by testing against real production data, not synthetic fixtures

1. **The reveal styling for MATCH and ORDERING silently failed to colour anything**, despite
   the "Incorrect"/"Correct" banner being right. Root cause: `.option-correct`/`.option-wrong`
   and `.match-item`/`.ordering-item` are combined onto the same element
   (`class="match-item option-wrong"`), and CSS gives equal-specificity single-class selectors
   the cascade order as tiebreaker — `.match-item`'s own border-color rule was declared AFTER
   the state classes in the stylesheet and silently won. Fixed by moving the state-class block
   to the end of the file, with a comment explaining why position is load-bearing there (any
   future renderer reusing these classes must declare its own base rule ABOVE that block). Also
   extended `MatchPairing` to colour the RIGHT column too, which the first draft omitted
   entirely.
2. **A stale Vite dependency-cache made a real data fetch look like an infinite hang.** Mid-session
   file additions to the linked `@sarkaritaiyaari/core` package left Vite's dependency
   pre-bundling stale; `getTopics`/`getQuestionCounts` calls never even reached the network.
   Diagnosed by tracing execution with temporary debug logging (removed afterward) down to
   "the promise never settles, not even as a rejection" — then confirmed and fixed by killing
   the long-lived dev server process and restarting with `--force`.

### A genuine, disclosed backend performance finding

`GET /api/questions/counts?groupBy=topic` against the real Neon dev database took **30-60+
seconds** to resolve when called live from a browser for a subject with ~28 topics — not a
bug in this phase's code (the data that eventually came back was completely correct), but a
real latency characteristic no prior session had reason to notice, since mobile only ever
calls this endpoint against local-first UX expectations, not "instant browser page load."
Worth a look before Phase 1 is considered production-ready; not investigated further here
(no backend code changed this phase).

### Verified against real, live, production data — not a synthetic fixture

A full real session was driven end-to-end via Playwright against the actual dev backend and
Neon database, not mocked:
- Browsed the real catalogue: 11 exams → SSC CGL (4 syllabus-scoped subjects, confirming the
  scoping logic works) → Quantitative Aptitude → a real 140-question topic → answered 10 real
  SINGLE_CHOICE questions with correct reveal and real math explanations pulled from the
  database → Finished → Summary rendered the right score → **reload survived** (sessionStorage
  persistence confirmed) → zero console errors throughout.
- Separately drove the real `[WAVEB-VERIFY]`/`[P3-VERIFY]` tagged content (the same content a
  prior mobile-side session seeded and verified) directly: NUMERIC, FILL_BLANK, MATCH and
  ORDERING all scored and revealed correctly, including the corrected per-item MATCH/ORDERING
  colouring. A real passage-grouped question (`[P3-VERIFY] ... Rajya Sabha`) rendered its full
  English passage text, collapsed/expanded correctly, and revealed correctly alongside it —
  with the EN/HI question-content language toggle also appearing and working.
- `tsc`/`oxlint`/`vite build` clean throughout (`web/` still at zero lint warnings); core's 70
  tests pass; mobile's typecheck clean and lint at its exact 9-problem baseline; the parity
  script passes.

### Not verified

- MULTIPLE_CHOICE and TRUE_FALSE were not exercised against live data (none existed in the
  topics walked this session) — their scoring is proven at the unit level (the shared
  evaluator's own 70-test suite covers both), and their renderers are structurally identical
  to the already-proven `OptionList` (radio vs. checkbox), but the live UI path is unconfirmed.
- The signed-in upload-to-`/api/progress/sync` path was built and code-reviewed against the
  documented contract, but not exercised against a real account this session (no disposable
  test account was created) — see the new `qa/` `USER-PROGRESS` module's `TC-USERPROGRESS-001`,
  `Not Executed`.
- No mobile emulator pass, per explicit instruction this session.
- `web/` still has not been deployed anywhere.

### A real correctness fix made retroactively, found while researching Phase 2

While reading mobile's `mock-test/test.tsx` for Phase 2's scoring contract, found that both
mobile's Practice and Mock Test engines deliberately do NOT score SINGLE_CHOICE/
ASSERTION_REASON/STATEMENT_COMBINATION through `questionEvaluatorFor` — they use a direct
`chosen === correctIndex` comparison instead, with an explicit, previously-shipped reason
(TASK-2301 Phase P2 Wave A's own comment): the evaluator's SINGLE_CHOICE branch reads
`answerKey.correctOption`, which older content synced before the multi-type architecture
landed never populated, where `correctIndex` (resolved from the always-present
`correctAnswer` string) is proven correct for every question in the bank.

My Phase 1 `PracticeQuiz.tsx` had not made this distinction — it routed every type, including
single-choice, through the shared evaluator. Checked directly against the real database
(oldest content by `updatedAt`, predating 2026-08-18) and found `answerKey.correctOption` is
in fact 100% populated today, so this was not an observed bug — but it is a real, previously
investigated and fixed risk this project already paid to discover once, and reintroducing it
in a third client would have been the same mistake happening again quietly. Fixed by adding
`evaluateDraft()` to `answerDraft.ts` (single/assertion/statement → direct comparison;
everything else → the shared evaluator, since those types have always required a real
`answerKey` at authoring time and have no legacy content to be compatible with), used by both
the live reveal and the final scoring pass. Re-verified against the same real content
afterward: correct/incorrect discrimination unchanged, zero errors — a behavior-preserving
fix for the current data, a real one for any content that ever lacks the field.

### QA coverage added, per `AI_RULES.md` §3.21

Two existing QUESTIONS requirements (`/live`, `/counts`) updated to add `Web` to their
`system` list, reflecting that web is now a real, permanent consumer, not a hybrid-mode
fallback. Two new QUESTIONS requirements for the genuinely new behaviour (multi-type scoring
in a browser; question-group rendering). **A new `USER-PROGRESS` module** — a real,
pre-existing gap in `qa/`'s original scope (only AUTH/CATALOG/QUESTIONS were ever covered;
session/bookmark/topic-progress/followed-exam sync had no coverage at all) — scoped narrowly
to what this phase actually touches, not a retroactive full pass. RTM: 73/136/153 →
**76/141/158**. All new cases `Not Executed`, several explicitly written as regression guards
for the two real bugs found this phase.

### Standing visual bar, set explicitly 2026-09-12

User: *"we are developing government exam preparation application. so css looks like should
premium with proffessional... we are developing entireprice application so think in that
level."* Saved to memory (`feedback_premium_visual_design`) so it survives past this session,
not just this task.

Looking honestly at the Phase 0 screenshots against that bar, the shell read as a functional
scaffold, not a professional product — emoji nav icons, flat unshadowed cards, default system
font, a plain-text wordmark with no mark. Fixed before Phase 1 builds anything on top of it,
since every later screen inherits the shell:

- **Real typography** — Inter loaded via Google Fonts (the shared design tokens don't bundle a
  font file, and this is a real deployed SPA, not an Artifact, so a CDN `<link>` is the
  pragmatic choice most production SaaS products make), with a tightened heading scale
  (weight 700-750, negative letter-spacing) instead of default browser type.
- **A real icon set**, `web/src/components/icons.tsx` — hand-written inline SVG, 24x24
  viewBox, `currentColor`, 1.75px stroke — deliberately matching the convention
  `admin/src/components/icons.jsx` already established, so the two web surfaces in this repo
  read as one product family. Replaces every emoji in the nav and banners.
- **A brand mark** (`BrandMark` — a rounded monogram badge) paired with the wordmark, instead
  of plain bold text.
- **Real elevation** — `darkShadow`/`lightShadow` from `@sarkaritaiyaari/core/design` (already
  used by mobile, never wired into web's CSS) are converted to a `--shadow-card` custom
  property in `applyTheme.ts` and applied to every card. This is the one place the two
  platforms' different shadow vocabularies (RN's shadowColor/Offset/Opacity/Radius vs. CSS
  box-shadow) are reconciled.
- **A left accent bar** on the sidebar's active nav item (the standard "current section"
  convention in professional dashboard products) rather than a background tint alone.
- **Stat-row treatment** for the Exams list on Home — icon badge, name, monospace code,
  hairline dividers — replacing a plain `<li>` list, plus a large headline number for the
  count.
- Refined buttons (shadow + glow on hover, pressed-state translate), inputs (focus ring from
  the brand glow token), banners/notices (icon-led), and an inline-link pattern for the
  sign-in/sign-up toggle in place of a mismatched boxed secondary button.

Verified the same way as Phase 0's functional work: `tsc`/`oxlint`/`vite build` clean (bundle
96 kB gzipped, negligible growth), then actually looked at real Chromium screenshots at both
viewports and both themes before calling it done — not inferred from the CSS source.

This bar now applies to every screen Phase 1 onward builds, not retroactively to `admin/` or
`mobile/`, which are already-shipped, separately-matured design systems.

### Documentation corrected in place (per §6)

`sample-data/question-evaluator-fixtures.json`'s own comment and
`QuestionEvaluatorsTest`'s Javadoc both stated the TypeScript side had no test runner and was
"verified by reading". Both were true when written and are now false; both updated, along with
the moved path they referenced.

## Phase 2 — Mock Test: DONE and verified end-to-end against real production data

**Found already built, uncommitted, at the start of this session** — `web/src/mocktest/`
(8 files: `MockTestExams`, `MockTestPapers`, `MockTestStart`, `MockTestEngine`, `MockTestResult`,
`mockTestApi.ts`, `attempt.ts`, `types.ts`) existed on disk, wired into `App.tsx`, with no
report, no task-doc entry and no `qa/` coverage recording it — the same "concurrent/interrupted
session" pattern `memory/STATUS.md` has flagged more than once for `mobile/`. Rather than
re-plan or rebuild it, this session read it in full, verified it end-to-end against the real
backend, found and fixed one real bug, and closed out its documentation.

### What was already there, confirmed correct by reading and then by running it

- **`mockTestApi.ts`** builds `MockPaper`/`MockSection` from `GET /api/exam-structures` exactly
  as mobile's own `mockTestStructureData.ts` does from the same endpoint, with no hybrid
  local/live split (decision 2 — online-only means there is nothing to fall back to).
  `buildMockTestQuestions()` calls `/mock-sample` per section and resolves each question's
  `correctIndex` via the shared `resolveCorrectIndex`/`isIndexBasedType` from
  `@sarkaritaiyaari/core/evaluation` — the same functions Phase 1 already proved.
- **`MockTestEngine.tsx`** is blind by construction, not by a flag: `QuestionBody` is always
  called with `revealed={false}`, so the same renderers Phase 1 built for Practice (which do
  reveal) render nothing differently here except that they never receive a `correctIndex`/
  outcome to colour with. The countdown is driven by a fixed end-timestamp
  (`endAtRef.current = Date.now() + durationSeconds * 1000`), not a decrementing counter, so a
  throttled/backgrounded tab still reports the correct remaining time on its next tick instead
  of drifting — the same lesson `preparation-radar`'s recompute-staleness bug taught this
  project once already, applied here proactively.
- **`ActiveSessionProvider.tsx`** is web's answer to mobile's `activeSessionContext.tsx` guard,
  built on the two mechanisms a browser actually offers: in-app navigation is intercepted by
  `AppShell` with a styled confirmation dialog; a tab close/refresh can only trigger the
  browser's own native, un-stylable `beforeunload` prompt. Deliberately not built on React
  Router's data-router `useBlocker` (would force migrating off plain `<BrowserRouter>` for one
  guard) — intercepting at the navigation trigger is a closer port of the already-proven mobile
  pattern.
- **`attempt.ts`** follows Phase 1's `practice/session.ts` precedent exactly: a completed
  attempt lives in `sessionStorage` (survives a tab reload, gone when the tab closes) and, when
  signed in, is also uploaded via the same `POST /api/progress/sync` payload shape mobile uses
  — a real attempt becomes a genuine row in the same `user_mock_attempt_results` history the
  phone app restores, with a silent-by-design failed upload (the student's own scorecard never
  depends on it).

### One real bug found and fixed this session

**The question-navigator's own Close button was unreachable on a real 100-question paper, at
both viewport widths.** `index.css` already defined `.navigator-scroll` (`overflow-y: auto`,
capped `.navigator-panel { max-height: 85vh }`) — with a comment describing exactly this
failure mode, from having been diagnosed once before: *"a real paper has 80-190 questions ...
the grid genuinely does not fit any viewport ... capping the panel's height and scrolling its
body ... is required, not cosmetic ... found by testing against a real 100-question SSC CGL
paper, where the uncapped panel spilled off both the top and bottom of the screen and made its
own Close button unreachable."* But `MockTestEngine.tsx`'s JSX never actually wrapped
`.navigator-grid` in a `.navigator-scroll` div — the class was defined and documented but never
applied, so the exact failure the comment describes was still live. Reproduced independently via
a real Playwright run against a real SSC CGL Tier 1 paper (100 questions) before reading the CSS
comment: opening the navigator and trying to click Close timed out with Playwright reporting
"element is outside of the viewport." Fixed by wrapping the grid in the already-defined
`.navigator-scroll` div — one line, no CSS change needed since the rules already existed.
Re-verified immediately after: the same script completed cleanly end to end.

### Verified against real, live production data — a full attempt, start to scorecard

Driven via a headless Playwright script against the real dev backend (not mocked), then
re-driven at a 390px phone viewport for the same flow:

- Opened Mock Test → 11 exams listed with mockable-paper counts → SSC CGL → its one paper,
  "Tier 1 (Computer Based Examination)" (Tier 1 · 60 min · 100 questions, +2/−0.5) → the
  pre-test briefing (correct duration, marking scheme, and honest per-section availability) →
  Start.
- **Confirmed blind mode holds before any answer**: zero `.option-correct`/`.option-wrong`
  elements present on the first question.
- Answered 5 real questions via their radio inputs, marked the 2nd for review, opened the
  Question Navigator: **100 cells rendered, exactly 4 shown as answered and 1 as marked** —
  correctly matching the engine's own precedence rule (a marked question shows as marked, not
  answered, even though it was also answered) — confirmed the fix above by clicking through to
  and clicking the now-reachable Close button.
- Submitted via the confirmation dialog (correctly named the answered count) →
  **Result screen scored −2.5** for 0 correct / 5 wrong under the paper's real +2/−0.5 scheme
  — exact arithmetic match — with a correct by-subject breakdown (Reasoning 0/5/20,
  and the other three subjects' full unattempted counts) and a full per-question review
  showing the real question text, the student's own wrong answer, the correct answer, and the
  stored explanation text (e.g. "Each number increases by 7: 21+7=28.").
- **Zero browser console errors throughout**, both runs.
- Repeated the same flow at 390px: no horizontal overflow (`document.scrollWidth` stayed at
  390 on the exam list, the briefing screen, and the engine screen), the bottom tab bar and top
  account/settings icons both present and unobstructed, and — the specific regression this
  session fixed — the navigator dialog rendered fully, Close button included, at phone width
  too.
- `tsc --noEmit`, `oxlint`, and `vite build` all clean before and after the fix (build:
  364 kB JS / 108.8 kB gzipped, a modest, expected growth from Phase 1's 96 kB for a whole new
  feature area).

### Not verified

- **The signed-in upload-to-`/api/progress/sync` path was not exercised against a real
  account this session** (no disposable test account was created, matching Phase 1's identical
  disclosed gap for Practice) — code matches the documented payload shape used by
  `uploadCompletedAttempt`, not executed.
- **The `beforeunload` tab-close/refresh guard was not exercised** — browsers deliberately
  suppress the native prompt under automated/headless control, so this can only be confirmed by
  a human driving a real browser tab. The in-app navigation guard (the styled dialog) was
  read and reasoned through in `AppShell`/`ActiveSessionProvider` but not clicked through this
  session.
- Only SINGLE_CHOICE questions were exercised live this session (the real SSC CGL Tier 1 paper
  sampled mostly SINGLE_CHOICE content in the sections walked) — every other type's scoring is
  already proven at both the shared-evaluator unit level and, for Practice, against live data in
  Phase 1; the Mock Test engine reuses the identical renderer set with `revealed={false}`, so
  the residual risk is low but unconfirmed for this specific screen.
- No mobile emulator pass, no deploy — unchanged from Phase 1, per the same standing scope.

### QA coverage added, per `AI_RULES.md` §3.21

`REQ-QUESTIONS-018` (`/mock-count`/`/mock-sample`) gained `Web` to its `system` list — Phase 2
is not a fallback consumer of that endpoint pair the way mobile's hybrid mode is, it is the
*only* path, per decision 2. New `REQ-WEB-010` (Mock Test engine — timed, blind, navigable,
with an unload guard) plus three scenarios (`SCN-WEB-014/015/016`) and three test cases
(`TC-WEB-015/016/017`) — the navigator case (`TC-WEB-016`) is written explicitly as a
regression guard for the bug found and fixed this phase, and the unload-guard case
(`TC-WEB-017`) is disclosed as manual-only by nature (browsers suppress `beforeunload` under
automation), not by omission. RTM: 93/175/192 → **94/178/195**.

### Report

Full account: `reports/28-web-application-phase-0/web-application-phase-2.md`.
