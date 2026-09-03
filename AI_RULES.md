# AI development rules — read before touching code

This project is developed with heavy AI assistance and is treated as an **enterprise
application, not a college project** — production-grade rigor is the default, not the
fastest thing that compiles. This file is the contract for any AI session (or human)
working here. It doesn't repeat what's already documented elsewhere — it points to the
right document and tells you the rules for using it.

For the day-to-day operating process this file's rules plug into — task sizing, session
strategy, context budgeting, and ready-to-paste prompts for each stage — see
[`AI_WORKFLOW.md`](AI_WORKFLOW.md). That file is a human-facing playbook, not something
to read as project knowledge by default (see its §14) — this file stays the one that's
auto-loaded every session via `CLAUDE.md`.

## 1. Read this, in this order, before starting real work

You do not need to read the whole repository. Read in this order and stop once you have
enough to act:

1. **[README.md](README.md)** — what the three systems are, the stack, local setup.
2. **[memory/STATUS.md](memory/STATUS.md)** — exact resume point: what shipped last
   session, what's next, what's not verified. This is the single most current file in
   the repo and changes every session — always re-read it fresh, never rely on a memory
   of a previous read.
3. **[system-design/](system-design/)** (5 short files) — architecture, the database
   model, how sync works, "which file do I change for X," and *why* the non-obvious
   things are built the way they are. Read `05-why-its-built-this-way.md` before
   "simplifying" anything that looks odd — most of it was simple once and broke.
4. **[reports/open-questions.md](reports/open-questions.md)** — unresolved
   business/technical decisions. Check this before assuming something is a gap that
   needs filling; it may already be a known, deliberately deferred decision.
5. **[reports/architecture-decisions.md](reports/architecture-decisions.md)** — the real
   ADRs (12 as of this writing): what was decided, what alternative was rejected, and
   why. If you're about to re-litigate one of these, read it first.
6. **[api/](api/)** — the API contract, separated from backend implementation. A mobile
   or admin task should not need to read backend Java to know what an endpoint does;
   a backend task should not need to read mobile/admin source to know who calls it.
7. Only then: the specific source files the task actually touches.

Do **not** default to reading the entirety of `backend/`, `mobile/`, `admin/`, or
`offline-exam-app-requirements.md` (the full chronological history, 80K+ words). Go
there only when the task genuinely requires historical detail the summaries above don't
have.

## 2. Documentation map — don't create a duplicate of something that exists

| If you need... | Read/update... | Not... |
|---|---|---|
| Current state, what's next | `memory/STATUS.md` | a new "status" file |
| How the systems fit together | `system-design/01-big-picture.md` | a new ARCHITECTURE.md |
| What's in the database, why two DBs | `system-design/02-database.md` | re-deriving from migrations |
| How content/sync flows | `system-design/03-how-data-flows.md` | — |
| Which file to change for a feature | `system-design/04-where-do-i-change-things.md` | — |
| Why something non-obvious was built that way | `system-design/05-why-its-built-this-way.md` | — |
| An endpoint's request/response/auth/consumers | `api/*.md` | reading the controller cold |
| Why a real architectural decision was made | `reports/architecture-decisions.md` (ADR-xxx) | a new decisions file |
| An unresolved business/technical question | `reports/open-questions.md` | re-opening it as if new |
| What a past piece of work did and verified | `reports/<NN-topic>/` | re-summarizing it elsewhere |
| Scoping a large/cross-system task before starting it | `tasks/` (see `tasks/README.md` and `tasks/TEMPLATE.md`) | jumping straight into code on a task that needs sign-off first |
| Full historical build log | `offline-exam-app-requirements.md` (shipped) / `preparation-os-requirements.md` (future, unbuilt) | — |

**If several of these disagree, `memory/STATUS.md` and the actual code win** — the rest
can drift between updates. If you find drift (a stale claim), fix it in place and say so,
per §6.

## 3. Core rules

1. Never modify unrelated files. Match the scope of the task.
2. Never remove existing functionality unless explicitly requested.
3. Before implementing, read the relevant `system-design/` file(s) and any ADR that
   touches the area.
4. Before modifying a shared component/table/endpoint, identify its consumers —
   `api/*.md` states them for backend endpoints; for shared mobile code, check
   `system-design/04` and grep for actual usages.
5. Before changing an API contract, update `api/*.md` in the same change and identify
   every consumer (mobile, admin, or both — see ADR-009 for how the public/admin split
   was actually decided, endpoint by endpoint, from what the mobile client calls).
6. Don't change the database schema without a new Flyway migration
   (`backend/src/main/resources/db/migration/V{n}__description.sql`) — **never edit a
   migration that has already run**, write a new one. Update `system-design/02-database.md`
   if the change is structural, not cosmetic.
7. Don't introduce new dependencies unless necessary. This project has already rejected
   heavier alternatives twice for good, recorded reasons (ADR-002: modular monolith over
   microservices; ADR-003: hand-rolled auth over the full Spring Security starter) —
   don't reintroduce that debate without a real new requirement.
8. Prefer existing patterns: the backend's Controller → Service → Repository → Entity
   layering with a separate `dto/` layer (see `system-design/04`); the mobile app's
   `db/` (local read/write) → `sync/` (network sync) → `api/` (raw calls) layering;
   admin's one-file-per-screen `pages/` + single `api.js`.
9. Follow existing conventions (Java/Spring idioms in `backend/`, TypeScript in
   `mobile/`, plain JS/React in `admin/`). Don't introduce a different style in one
   corner of the codebase.
10. Don't refactor unrelated code while implementing a feature.
11. Don't change mobile navigation (`mobile/src/app/` — the folder structure *is* the
    routing) unless the task requires it.
12. Don't change authentication/security behavior (opaque token scheme, `requireUser`/
    `requireAdmin`, CORS origin allowlist) unless explicitly requested — this project
    already treats security as a first-class concern (see `memory` global feedback:
    treat as enterprise app, not hobby project).
13. Run relevant checks after implementing: `mvn -f backend/pom.xml compile` (or the
    full test suite, off by default in CI — see ADR/§5 below), `npm --prefix admin run
    build` + `oxlint`, `npx tsc --noEmit` + `npx expo lint` for mobile. These verify the
    code compiles and types check — they do **not** verify the feature actually works;
    say so explicitly rather than implying a green build means "done."
14. Review the actual diff before calling anything finished, don't assume a clean
    compile means correct behavior.
15. Report every file changed, every assumption made, and every risk — including what
    was **not** verified. This project's own reports model this well (honest "what
    wasn't verified" sections); match that bar, don't round up to "done."
16. If a requirement is ambiguous and guessing could affect architecture, data model, or
    security — stop and ask, per §5 below.
17. Read only what the task needs. Don't assume reading the whole repository is
    necessary or thorough.
18. Update the relevant document (§2's table) when architecture, an API contract, or
    project state genuinely changes. Don't update documentation that didn't change.
19. Don't create a new top-level documentation file that duplicates something in the
    table in §2. Extend or correct the existing one instead.
20. Don't write large docs that just restate what's directly readable from source
    (e.g. don't transcribe every DTO field into prose) — link to the file/line instead.

## 4. Project-specific traps (read once, save yourself a debugging session)

- **Two independent deploy pipelines.** The Android APK auto-builds on every push to
  `main` (GitHub Actions). The backend also auto-deploys to Cloud Run on push to `main`
  touching `backend/**` (`.github/workflows/backend-deploy.yml`), as of 2026-08-31 —
  before that it was manual, from a personal laptop, and silently drifted from what the
  emulator showed for days at a time. **A CI-built APK bakes in the Cloud Run URL; the
  emulator/dev build talks to your local backend at `10.0.2.2:8080`.** If something
  "works on the emulator but not on a real device," check whether the backend was
  actually deployed before suspecting the app. See `memory/STATUS.md` and
  `reports/14-cloud-run-deployment/`.
- **Never edit `mobile/android/`.** It's regenerated from `mobile/app.json` (and
  `mobile/app.config.js`/`mobile/plugins/`) by `expo prebuild` on every build. An edit
  there is silently discarded on the next build.
- **A new mobile screen that reads the local database must watch the sync counter**
  (`useSyncStatus().syncVersion`) or it will show stale data forever after a sync
  completes. See `system-design/03` and `04`.
- **`exam_subjects` vs `section_subjects` are not interchangeable** — one is the
  syllabus (browsing), the other is paper layout (mock-test generation). See
  `system-design/02-database.md` and ADR-004 before touching either.
- **CORS is pinned to an exact origin** (`localhost:5173` in dev; configured origins in
  prod) — `127.0.0.1:5173` is a different origin and will fail silently with a CORS
  error, not a helpful one.
- **Adding a field to `questions` touches ~11 files across all three systems** — there's
  a step-by-step list in `system-design/04-where-do-i-change-things.md`. Missing the
  mobile `writeQuestions.ts` step is the most common way a field "exists on the server
  but the app doesn't show it."
- **On-device verification uses the Android Studio emulator (AVD `Pixel_7`) only.** The
  physical device sometimes attached to this machine belongs to the user's other work —
  never drive it, and tell the user before starting emulator work if it hasn't just been
  handed over. Pin every `adb` call with `-s emulator-5554` when more than one device
  might be attached.
- **Supplied requirement documents (large "Doc" specs) are AI-authored drafts, not
  instructions to execute literally.** Audit every claim against the actual codebase
  first — this project has twice found large fractions of a supplied spec to be false
  (assumed missing features that already existed, misquoted constants, invented modules
  that don't exist in this app's navigation). Report what's wrong before building
  anything, and reconcile into the existing docs rather than creating a competing plan.

## 5. Workflow: Plan → Human review → Implement → Test → Review

1. **Plan.** Read the task, the relevant `system-design/` file(s), any ADR that
   applies, and the `api/*.md` contract if the task touches an endpoint. Identify
   affected systems, files, and consumers. Identify risks. Do not modify code yet.
2. **Human review.** For anything touching the database schema, an API contract,
   authentication, or navigation — get explicit sign-off on the approach before
   implementing. For a contained bug fix or content-only change, proceed directly.
3. **Implement.** Only the files the plan named. Preserve existing behavior. Reuse
   existing patterns. Before touching anything, check `git status`/`git diff --stat` and
   treat whatever is already modified/untracked as pre-existing work that isn't yours to
   touch, stage, or discard unless the task says otherwise (see `AI_WORKFLOW.md` §10) —
   this repo routinely has in-flight work from other sessions sitting uncommitted.
4. **Test.** Compile/typecheck/lint per system (§3.13). Where the task supports it,
   actually exercise the feature (curl the real endpoint, run the app on the emulator)
   rather than trusting a clean build — this project's history is full of real bugs
   that only a clean-compile check would have missed (see any `reports/<NN>/` "bugs
   found and fixed" section for examples of this actually happening, repeatedly).
5. **Review.** Report: files changed/added/deleted, behavior changed, checks run and
   their results, what was **not** verified, risks, assumptions, and which documents
   were updated (per §2's table). This is the same shape `reports/<NN-topic>/*.md`
   files already use — write the report there for anything non-trivial, and update
   `memory/STATUS.md`'s resume point before ending the session.

## 6. When you find stale documentation

Fix it in place and say so — don't silently work around a wrong doc, and don't leave it
wrong for the next session to re-discover. Note what was wrong and what you changed it
to, the same way `reports/open-questions.md`'s "Already resolved" table and
`reports/architecture-decisions.md`'s "Superseded" markers already do.
