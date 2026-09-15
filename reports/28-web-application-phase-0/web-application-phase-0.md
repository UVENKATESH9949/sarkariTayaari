# Student web application — Phase 0 (foundation)

**Date:** 2026-09-11
**Task:** [`tasks/TASK-2601-student-web-application.md`](../../tasks/TASK-2601-student-web-application.md) — the plan, the five decisions taken, and the remaining six phases live there and are not repeated here.
**Resume point:** [`memory/STATUS.md`](../../memory/STATUS.md) — the session narrative.

This report covers what shipped, what was actually verified and how, and what was not.

---

## What shipped

| Area | Change |
|---|---|
| `packages/core` (new) | `@sarkaritaiyaari/core` — evaluator, topic-health algorithm, i18n catalogues + engine, design tokens, HTTP API client. Vitest. |
| root | `package.json` with `workspaces: ["packages/*", "web"]`; `js-yaml` declared; `qa:generate` script. |
| `web/` (new) | Vite + React 19 + TypeScript + react-router-dom + oxlint. Shell, theming, i18n, auth, 4 placeholder routes. |
| `mobile/` | Consumes the shared package; `metro.config.js` gains `watchFolders`/`nodeModulesPaths`; ~45 import sites rewired. No behaviour change intended. |
| `backend/` | `application.yml` CORS dev default now lists the web origin alongside admin's. No Java changed. |
| `scripts/qa/` | Module list derived from the filesystem instead of hardcoded in three places. |
| `qa/` | New `WEB` module: 9 requirements, 13 scenarios, 14 test cases. |
| deploy | `firebase.json`, `.firebaserc`, `.github/workflows/web-deploy.yml`, `WEB-DEPLOY-SETUP.md`. |

Files moved with `git mv`, so history is preserved on all of them.

---

## Verified — and how

Nothing below is inferred from a clean compile.

**The shared package**
- 67 tests pass: 36 shared evaluator fixtures, plus a platform-purity scan per source file.
- **Both guards were deliberately broken to prove they work.** Inverting one comparison in
  `singleChoiceEvaluator` failed exactly the 4 cases that reach that comparison while the 2
  unattempted cases still passed — the right failure signature, not a blanket red. Adding
  `localStorage.getItem` to shared source failed the purity test naming that file; adding
  `process.env` failed the library typecheck.
- Both typecheck configs clean (library config declares no `types`, so Node globals are
  genuinely unavailable to shared source).

**Mobile is unregressed**
- `npx tsc --noEmit` clean.
- `npx expo lint` at its exact documented baseline: **9 problems (8 errors, 1 warning)**, all in
  files this work never touched. One duplicate-import warning genuinely introduced by the merge
  was found and fixed rather than absorbed into the baseline.
- **A real `expo export` Metro production bundle succeeds** (7MB Hermes) — this is the check
  that matters, because `tsc` does not exercise Metro's resolution of an out-of-tree symlinked
  package, which was the plan's single largest risk.
- All five shared modules confirmed present *inside* that bundle by byte search.
- Install impact measured, not assumed: `node_modules` 577 → 578, **13 added lockfile lines,
  nothing removed or re-resolved.**
- `scripts/check-topic-health-parity.js` passes after its hardcoded path was updated (35 shared
  constants agree) — and was confirmed to still detect drift.

**The web app**
- `tsc` clean, `oxlint` **zero findings**, `vite build` succeeds: **305 kB JS / 95 kB gzipped**.
- Driven in real Chromium at **1280px and 390px**: no horizontal overflow at either width; CSS
  custom properties resolve from the shared palette (`--color-brand-primary: #2563EB`,
  `--space-base: 16px`); the dark toggle flips `data-theme`, repaints to `#0A0D14` and persists
  to localStorage; five routes render; zero console or page errors.
- **Against a restarted backend it renders all 11 real active exams cross-origin** — the full
  chain: browser → cross-origin fetch → Spring → Neon → rendered.
- Account reachability on a phone was verified by an actual click at 390px, not by inspection.

**CORS — the open question from `reports/14-cloud-run-deployment/`**

That report recorded the CORS configuration had "never been exercised by a real cross-origin
browser request". It has now, by curl and in a browser:

| Origin | Result |
|---|---|
| Allowlisted | `200`, origin echoed, `GET,POST,PUT,DELETE`, `authorization` allowed, `Max-Age: 1800` |
| Not listed | `403 Invalid CORS request` |
| `127.0.0.1:5174` while `localhost:5174` is listed | `403` — the "exact origin" warning is real |
| From Chromium, unlisted | Blocked with the standard no-`Access-Control-Allow-Origin` error |

---

## Bugs found and fixed

1. **`__DEV__` in shared code** (`topicHealth.ts`). A React Native global Metro injects that
   does not exist in a browser, referenced inside the weight-sum assertion — so a web bundle
   would have thrown `ReferenceError: __DEV__ is not defined` in precisely the situation that
   assertion exists to report, masking the real problem. Guarded with `typeof`; `web/` defines
   it via Vite so both platforms behave the same. **Found by the package's own type guard,
   before any web code existed.**
2. **Account and Settings unreachable below 1024px.** They live in the sidebar footer; the
   bottom bar was full with five primary destinations. Found by looking at a phone-width
   screenshot — nothing else on screen looked wrong. Fixed with a narrow-screens-only top bar
   at a 44px touch target. `TC-WEB-006` exists as its regression guard.
3. **Empty Exams card on fetch failure** — neither the loading nor the loaded branch matched,
   leaving a card with only a heading. Now hidden on error. `TC-WEB-013` guards it.
4. **QA generators had an undeclared `js-yaml` dependency** and a module list hardcoded in three
   separate scripts, so a new module silently produced no RTM row, no suite and no test data.
   Both pre-existing; found only because this work added a module.

## A mistake made and repaired, recorded deliberately

Patching the QA generators with `perl -0pi -e` corrupted two files: perl interpreted `$/` in
the replacement as its input-record-separator variable, producing `/.yaml<NUL>` and injecting a
NUL byte into each file. **`scripts/qa/` is untracked, so git could not restore them.** Damage
was confined to one line per file, identified by dumping byte offsets, and repaired exactly;
both then passed `node --check` and produced correct output.

Worth remembering: `perl -0pi -e` with a replacement containing `$` is unsafe here, and
untracked files have no safety net. A Node script file or the editing tools would have avoided
both problems.

---

## What was NOT verified

- **`web/` has never been deployed or run anywhere but a local dev server.** Firebase Hosting is
  fully configured but the one-time setup needs the Firebase Console and `gcloud`. The workflow
  has never run.
- **The SPA rewrite rule is untested.** `TC-WEB-014` passes trivially on the Vite dev server;
  the real risk is the deployed host's configuration, and that cannot be checked until a deploy.
- **No mobile device or emulator run.** Mobile is verified by typecheck, lint and a real Metro
  bundle — strong evidence the extraction is sound, but nobody has opened the phone app since.
  Given the extraction touched ~45 import sites across the evaluator, radar, i18n and API
  layers, an emulator pass before Phase 1 would be cheap insurance.
- **The signed-out web session behaviour is decided but not built** — no practice session exists
  yet to hold.
- **Telugu wording is unreviewed** by a native speaker, as the catalogue itself already notes.
  `TC-WEB-009` checks the mechanism, not the translation.
- **No QA test case has been executed.** All 14 are `Not Executed` with empty results, per
  `AI_RULES.md` §3.21 — several of these behaviours were checked by hand while building, and
  that account is above, but an execution record needs a real tester, date and build and none
  was invented.

## Risks carried forward

- **A public browser client widens the scraping surface.** The content endpoints are public,
  unauthenticated and now CORS-enabled for a browser origin, against a scale-to-zero Cloud Run
  service with `--max-instances=3` and **no rate limiting anywhere in the backend**. Out of
  scope here; belongs in `reports/open-questions.md`.
- **Two student clients, no API versioning.** From now on a breaking backend change breaks both.
- **A 365-day bearer token in `localStorage`** is a larger XSS blast radius for a public student
  app than for the internal admin console. Accepted deliberately — the backend is header-only
  and sets no cookies, so there is no httpOnly option — but it is a decision, not a default.
- **Firebase preview channels per PR would each need their own CORS origin**, which does not
  scale as a manual step. Noted in `WEB-DEPLOY-SETUP.md` rather than solved.

## Documentation corrected in place (per `AI_RULES.md` §6)

`sample-data/question-evaluator-fixtures.json`'s comment and `QuestionEvaluatorsTest`'s Javadoc
both stated the TypeScript evaluator had no test runner and was "verified by reading". True when
written, false now — both updated along with the moved paths they referenced.

Seven further drift items were found during research and are recorded in the task doc's
"Documentation drift to fix" section; they are **not** fixed yet (they concern `api/*.md`, which
no phase has touched).
