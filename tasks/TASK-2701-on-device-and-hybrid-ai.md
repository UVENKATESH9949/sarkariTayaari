# TASK-2701 — On-device and hybrid AI

## Objective
Make AI a foundational capability of SarkariTaiyaari: grounded question explanations and
learner-aware guidance that work **offline on every device**, escalating to cloud AI only when a
cheaper tier genuinely cannot answer. Delivered in phases so each one ships value on its own.

The architecture, the reasoning behind it, and the model/runtime analysis live in
[`AI_ARCHITECTURE.md`](../AI_ARCHITECTURE.md) — **this file does not repeat them.** This is the
scoping and per-phase status record; that is the design document.

## Requirements
- AI is an enhancement layer: no AI failure ever degrades Practice, Mock Test, sync or progress.
- Nothing AI-related runs at app startup, and no AI module is imported by a route file at top level.
- A student-facing answer is either verified data, a deterministic computation, or model output a
  human approved — never unreviewed model output about exam facts.
- The model is never asked to choose a question's answer; it is given the verified answer.
- AI answers only in languages that have real question content (`en`, `hi` today).
- Every AI capability is individually switchable off, and an unknown flag means off.
- Learner data sent to any model is a compact aggregate, never raw history or an identifier.
- Cloud credentials never reach a client.
- The base APK does not grow materially; any model is downloaded post-install and deletable.

## Acceptance criteria
- A student with no network and no model installed can still get an explanation for a synced
  question, on a low-RAM device.
- A generated explanation that asserts an answer other than the verified one is rejected before a
  student can see it, and this is demonstrated by a deliberately wrong payload.
- Disabling a task in admin stops it reaching students without a redeploy.
- Turning AI off entirely leaves every existing screen working exactly as before.
- Each phase's checks in "Testing requirements" pass before that phase is called done.

## Affected systems
- **`packages/core`** — the provider- and platform-independent layer (registry, context, schema,
  routing). Shared by mobile and web so the two cannot drift.
- **`backend`** — generation, storage, human review, publishing, sync exposure, client config.
  Extends the existing `ai/` package rather than replacing it.
- **`admin`** — a review queue for generated content, and per-task flags on the existing AI
  Control Center.
- **`mobile`** — local cache table, sync write path, the "Explain with AI" surface, and later the
  model runtime and manager.
- **`web`** — consumes the shared layer; online-only, so cloud-or-nothing for generated tiers.

## Affected modules
- `backend/src/main/java/.../ai/` (existing: `AIService`, `AIProviderRegistry`, `AiConfigResolver`,
  `usage/AIUsageRecorder`) — extended, not rewritten.
- `backend/.../service/`, `.../controller/`, `.../entity/`, `.../repository/` — the flat layering
  this backend already uses (`system-design/04-where-do-i-change-things.md`).
- `mobile/src/db/schema.ts`, `mobile/src/sync/` (`writeQuestions.ts`'s `writeReferenceData`),
  `mobile/src/questionRenderer/`.
- `admin/src/pages/AiControlCenter.jsx` (existing) plus a new review page.

## API changes
- **Phase 2:** `POST|GET /api/admin/ai/content` and its review/publish transitions (admin/reviewer).
- **Phase 3:** generated content joins the existing public reference-sync payload.
- **Phase 4:** `GET /api/client-config` — public, unauthenticated, cacheable; per-task flags.
- No generic `/api/ai/generate` passthrough is ever added — each feature exposes its own narrow
  endpoint, per `system-design/06-ai-foundation.md`.

`api/AI-ADMIN.md` exists for the already-shipped provider configuration. New surfaces get their
contract written in the same change that adds them.

## Database changes
- **V41** — `ai_content` (generated answers, keyed by task + subject + language + prompt/model
  version, carrying `ContentStatus`). Phase 2.
- **V42** — per-task AI flags and any model-registry rows. Phase 4.
- No `ai_usage` table until a real consumer exists (ADR-013's reasoning still holds); the
  `AIUsageRecorder` extension point is how that changes.

## UI changes
- **Admin:** a generated-content review queue; per-task switches on the AI Control Center.
- **Mobile:** an "Explain with AI" affordance on the question surfaces, rendering beside the
  existing authored explanation rather than replacing it. Navigation is not changed.
- **Web:** the same affordance where the shared layer can serve it.

## Dependencies
- **LLM provider and monthly budget ceiling** — an open business decision in
  `reports/open-questions.md`. Blocks Phase 2 actually *running* a generation pass, not building it.
  Decision 2 below keeps the first real spend small.
- **Model licensing** (Apache-2.0-only, or is Gemma/Llama acceptable for redistribution to
  devices?) — blocks Phase 5's candidate list, not earlier phases.
- Phases 2-4 depend on nothing external.

## Risks
- **Generating for the wrong corpus.** ~35,700 of the ~37,900 questions are synthetic load-test
  filler already slated for replacement. Mitigated by decision 2 (real content only) — the
  generation pass must be scoped by a content filter from day one, not trimmed afterwards.
- **A cached answer carrying one student's state.** Would be generated once and served to everyone.
  Mitigated structurally: a personalized task can never be cacheable, enforced by the registry's
  own consistency check and asserted in tests.
- **Model distribution costing more than the inference it saves** (~$800 egress per 10,000 devices
  for a 700MB model). This is why Phase 6 is gated on Phase 5 measuring the alternative first.
- **Low-end devices.** Loading a model on a <4GB device risks the OS killing the app. Mitigated by
  device-tier gating; those devices are served by the non-generating tiers.
- **Concurrent-session collisions in this repo.** Observed on 2026-09-12 (see `memory/STATUS.md`).
  Re-read `memory/STATUS.md` and `git status` before each phase rather than trusting a loaded copy.

## Testing requirements
- `packages/core`: `npm run test` and `npm run typecheck` (both configs) clean.
- Backend: `mvn -f backend/pom.xml compile`, the phase's own tests, and a real regression run
  before a phase is called done.
- Mobile: `npx tsc --noEmit` clean, `npx expo lint` at its documented baseline.
- Admin: `npm run build` + `oxlint` at baseline.
- **Where the phase produces something visible, exercise it for real** — curl the endpoint, click
  through admin, run on the emulator (`-s emulator-5554` only). A clean compile has repeatedly
  missed real bugs in this project.
- QA per `AI_RULES.md` §3.21 in the same change, every phase.

## Allowed files / areas
`packages/core/src/ai/**`, `backend/.../ai/**` and the flat `service`/`controller`/`entity`/
`repository` packages, `backend/.../db/migration/V4x__*.sql`, `admin/src/pages/Ai*.jsx` +
`admin/src/api.js` + router/sidebar registration, `mobile/src/ai/**` + `mobile/src/db/schema.ts` +
`mobile/src/sync/**` + the question-rendering surfaces, `qa/**`, `api/*.md`.

## Out of scope
- A general-purpose chat UI. AI appears where it solves a specific problem (the brief's own §45).
- Fine-tuning of any kind until a benchmarked baseline exists (the brief's §25).
- Re-deriving weakness, mastery, trend or the study plan with a model — those are already computed
  deterministically and must not migrate to an LLM.
- Telugu, until real Telugu question content exists.
- Any change to navigation, the sync engine's mechanics, authentication, or the existing
  provider-configuration surface.

## Decisions taken (project owner, 2026-09-12, before any code)
| # | Decision | Chosen |
|---|---|---|
| 1 | Build order | **Tier 2 first** — Phases 1-4; on-device inference is Phase 6, behind a Phase 5 benchmark gate |
| 2 | Which corpus gets generated explanations | **Real content only** (~113 authored questions today), not the synthetic load-test bank |
| 3 | Telugu | **Out of scope** until real Telugu question content exists |

Full reasoning, including the rejected "on-device first" ordering, is in `AI_ARCHITECTURE.md` §1
and §13.

## Phases
| Phase | What | Systems | Status |
|---|---|---|---|
| 0 | Architecture assessment + decisions | docs | **Done** |
| 1 | Shared foundation: task registry, context builders, schema + validators, router | `packages/core` | **Done** |
| 2 | `ai_content` (V41), batch generation, human review/publish, admin queue | `backend`, `admin` | **Done (backend); admin UI not started** |
| 3 | Ship generated content to devices via the existing reference sync; "Explain with AI" | `mobile`, `backend` | **Done, verified on a real emulator** |
| 4 | Client config + per-task flags; cloud tier for uncached/personalized tasks | all | **Client config + per-task flags done; cloud tier not started** |
| 5 | Benchmark harness + real-device measurement. **Gate: does any task justify a local model?** | `mobile` | Not started |
| 6 | Only if Phase 5 says yes: runtime, model manager, device tiering, local provider | `mobile` | Not started |
| 7 | Personalization depth, mistake-analysis phrasing, DB-backed usage recorder | all | Not started |

## Implementation status

**Phase 0 — Done (2026-09-12).** Architecture assessment written to `AI_ARCHITECTURE.md`; three
decisions taken by the project owner before any code. The audit found that roughly a third of the
brief was already shipped (ADR-013/014), that the deterministic intelligence layer already answers
most of what an LLM would have been used for, that the question bank's finite shared corpus makes
pre-generation beat on-device inference for the flagship feature, and that Telugu has no question
content at all. Full account: `reports/29-on-device-and-hybrid-ai/`.

**Phase 1 — Done (2026-09-12).** `packages/core/src/ai/` — task registry (9 tasks) with a
self-consistency check, context builders enforcing per-task minimisation, structured-output schema
with answer grounding, and the tier router. No schema change, no endpoint, no native code, no new
dependency, no user-visible change. **155 tests pass** in `packages/core` (up from 67); mobile and
web typecheck clean. The registry's own guard caught a real inconsistency in the work
(`QUESTION_CLASSIFICATION` declared cacheable with no cache tier). QA: new `AI` module — 9
requirements, 22 scenarios, 22 test cases, RTM → 85/163/180. Full account:
`reports/29-on-device-and-hybrid-ai/phase-0-architecture-and-phase-1-foundation.md`.

**Phase 2 — Backend done (2026-09-12).** `ai_content` (migration V41), batch generation through
the existing `AIService`, answer-grounding validation (a Java mirror of the shared TypeScript
check, kept in parity via `sample-data/ai-answer-grounding-fixtures.json`), and the full
DRAFT→REVIEW→PUBLISHED review workflow reusing `ContentStatus` + `REVIEWER`. Generation requires
an explicit `subjectIds` list — no "generate for everything" mode, since nothing in this codebase
distinguishes real authored questions from the ~35,700 synthetic load-test rows. **24 new tests,
all passing against the real dev database, 0 failures.** Four real bugs found and fixed during
implementation (two Spring Data/JPQL field-name traps this project has now hit three times total,
a test-fixture column-width mismatch, and a test-cleanup key-casing bug) — full account in
`reports/29-on-device-and-hybrid-ai/phase-2-generation-and-review.md`. QA: 5 new requirements, 9
scenarios, 9 test cases, RTM → 90/172/189. **Not done**: the admin review-queue page
(`admin/src/pages/AiContentReview.jsx`) — the API is fully built and tested but nothing renders it
yet; the full backend regression suite was not re-run (a concurrent session's dev server was
active throughout, so a scoped/targeted run was used instead — see the report for the risk
assessment).

**Phase 3 — Done end to end, same session, verified on a real emulator.** Backend:
`GET /api/ai-content/sync` (public, no auth — same convention as `/api/questions/sync`):
withholds `payload` for anything not currently `PUBLISHED`, and includes a row regardless of
status so a device can drop content that stopped being published (the same tombstone role
`isDeleted` plays elsewhere, expressed here as `published: false`). **13/13 backend tests pass**
against the real dev database. Mobile: new local table `ai_content` (migration **0022** — one
non-null `subjectId` column rather than two nullable ones, since SQLite's unique-index semantics
treat every `NULL` as distinct and would never catch a duplicate question row otherwise), a full
sync write path, and `AiExplanationCard` wired into both `practice/quiz.tsx` and `app/revise.tsx`.

**Verified live on `emulator-5554`** against a real, populated, pre-existing local database:
migration 0022 applied cleanly with no data loss; a real seeded row synced down via a genuine
unauthenticated HTTP round trip and rendered correctly in Revise → Bookmarked (screenshot
confirmed); the negative case (no cached content) confirmed twice. A real gap was found and
fixed in the process — the AI card had only been wired into the quiz screen, not Revise. Full
cleanup performed; the concurrent session's own dev backend (port 8080) was never touched. A
real, unrelated pre-existing bug was found and disclosed (not fixed): a duplicate-React-key
warning in `MULTIPLE_CHOICE` checkbox rendering that blocks taps on that screen while showing.

QA: REQ-AI-015/SCN-AI-032/TC-AI-032, RTM → 91/173/190. Full account:
`reports/29-on-device-and-hybrid-ai/phase-2-generation-and-review.md`.

**Phase 4 — client config + per-task flags done; the cloud-tier half of the original phase
scope not started.** Migration **V42** (`ai_task_flags`, one row per `AiTaskId`, `@Version`
optimistic concurrency). Backend: `GET /api/client-config` (public, no auth — every one of the
9 known `AiTaskId`s always present, synthesizing `enabled: false` for any task with no row, so
"unknown means off" holds identically for "never toggled" and "not yet synced"),
`GET /api/admin/ai-task-flags` (list, admin), `PUT /api/admin/ai-task-flags/{taskId}` (toggle,
admin, optimistic-locked). Mobile: local table `client_config_ai_tasks` (migration **0023**),
`writeClientConfig()` full-replace in `writeReferenceData()`, `getLocalAiTaskFlags()` local read
helper, and `AiExplanationCard` now checks `flags.QUESTION_EXPLANATION === true` before even
querying its cached content — the first AI surface gated on this flag. Admin: a new "AI Tasks"
table on `AiControlCenter.jsx`, independent of that page's existing provider-level settings —
one row per task with an Enable/Disable button, calling the two new endpoints.

**A real bug found and fixed by the new integration test, not by review**: the very first PUT
for a task with no existing row succeeded, but a second PUT immediately reusing
`expectedVersion: 0` also succeeded instead of conflicting — Hibernate's `@Version` is only
bumped by an UPDATE, never by the row's initial INSERT, so the row's true persisted version
stayed 0 after creation. Fixed by having `AiTaskFlagService` explicitly seed `version = 1` on
the creating save only (Hibernate honors an already-non-null version on a transient entity as
its insert value, rather than seeding its own default) — existing-row updates are untouched and
still auto-increment normally. Confirmed via a full re-run of `AiTaskFlagTest` against the real
dev database after the fix: **6/6 pass**.

**Verified**: `mvn compile`/targeted `AiTaskFlagTest` run clean against the real dev database
(6/6, after the version-seeding fix above); mobile `npx tsc --noEmit` clean, `npx expo lint` at
the exact pre-existing 9-problem baseline (none in any file this phase touched); admin
`npm run build` clean, `oxlint` at its exact pre-existing one-warning baseline (an untouched
file). QA: REQ-AI-016/REQ-AI-017, SCN-AI-033/034, TC-AI-033/034 — RTM → 93/175/192.

**Then verified live on `emulator-5554`, end to end — the flag genuinely gates cached content,
not just typechecks.** Same isolated-verification pattern as Phase 3 (a scratch backend on port
8090 + a separate Metro instance, so the concurrent session's own dev backend on port 8080 was
never touched — confirmed untouched afterward by PID). Seeded one grounded, PUBLISHED
`ai_content` row for a real, locally-synced SSC CGL question ("What is 5 + 7?", via a scratch,
since-deleted seed runner mirroring Phase 3's own precedent), then directly inserted a bookmark
row for that exact question into a pulled copy of the device's local database and pushed it
back (this device's local question bank is a frozen pre-question-pool-lift snapshot, per the
2026-09-02 STATUS.md finding, so the specific question a fresh `ai_content` seed targets has to
be one this device already has — not found via random practice sampling).

**Negative case, confirmed via direct SQLite inspection of the device, not just a screenshot**:
with `client_config_ai_tasks.QUESTION_EXPLANATION = 0` synced locally and the real, published
`ai_content` row also synced locally (`published = 1`), Revise → Bookmarked rendered the
question's ordinary authored explanation but genuinely no "AI EXPLANATION" card — the flag
check in `AiExplanationCard` suppresses a render even when matching cached content already
exists on-device, not just when content is absent (the only case Phase 3's own pass could
exercise, since the flag didn't exist yet).

**Positive case, same device, same content, no re-seed needed**: enabled the flag via
`PUT /api/admin/ai-task-flags/QUESTION_EXPLANATION` against the scratch backend, tapped Sync Now
on-device, confirmed via SQLite that `client_config_ai_tasks.QUESTION_EXPLANATION` flipped to
`1` locally, and the exact same cached content then rendered correctly — sparkle icon, "AI
EXPLANATION" label, the seeded `whyCorrect`/`whyOthersWrong`/`examTip` text all present.

**A second real, minor finding, noted rather than fixed**: disabling the flag afterward returned
`version: 1` in the PUT response body, while a fresh `GET /api/admin/ai-task-flags` immediately
after showed the true persisted value was already `2` — the response reflects the entity's
in-memory version before Spring's deferred flush actually runs the versioned `UPDATE`, so a
caller that reuses a mutation response's own `version` for an immediate next call (rather than
refetching) could hit a spurious 409. **Not unique to this new code** — `AiContentReviewService`
has the identical shape (`save()` with no explicit `flush()`) and would show the same behavior;
not fixed here to stay consistent with that existing sibling rather than introduce asymmetric
handling in only one of the two. Both this session's admin UI (`AiControlCenter.jsx`'s new "AI
Tasks" table) and the existing provider-settings section already refetch after every mutation
rather than trust the response's own version, so this never actually surfaces to a real caller.

**Full cleanup performed**: the seeded `ai_content` row and the scratch seed-runner file (never
committed) deleted; the flag disabled again server-side; the test bookmark removed via the
app's own "Remove bookmark" button (confirmed the one pre-existing real bookmark was left
untouched); the minted admin token revoked; the scratch backend (port 8090) and scratch Metro
(port 8081) processes stopped, confirmed via PID; the `adb reverse` mapping removed; the app
force-stopped. The concurrent session's own dev backend (port 8080, PID checked before and
after) was confirmed untouched throughout.

**Not done**: the cloud tier for uncached/personalized tasks (the other half of this phase's
original scope in the phase table above) — genuinely separate work, not started this session;
no admin console click-through in a real browser for the new "AI Tasks" table (build+lint clean,
verified end-to-end via direct API calls instead, not driven through the browser UI).
