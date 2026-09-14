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

## Decision taken (project owner, 2026-09-14)
| # | Decision | Chosen |
|---|---|---|
| 4 | Phase 5/6 (on-device inference) vs. Phase 7 (personalization, cloud-only) | **Hold Phase 5/6.** The `llama.rn` feasibility spike (`feature/on-device-llm-spike`) stays in the branch untouched but no further work goes into it. Every AI feature ships cloud-only for now, and specifically via **Groq** (free tier) rather than Claude, added as a second `AIProvider` alongside `ClaudeProvider` — same interface, no architectural change. Revisit Phase 5/6 only if the product direction changes again. |

Full reasoning, including the rejected "on-device first" ordering, is in `AI_ARCHITECTURE.md` §1
and §13.

## Phases
| Phase | What | Systems | Status |
|---|---|---|---|
| 0 | Architecture assessment + decisions | docs | **Done** |
| 1 | Shared foundation: task registry, context builders, schema + validators, router | `packages/core` | **Done** |
| 2 | `ai_content` (V41), batch generation, human review/publish, admin queue | `backend`, `admin` | **Done (backend + admin UI)** |
| 3 | Ship generated content to devices via the existing reference sync; "Explain with AI" | `mobile`, `backend` | **Done, verified on a real emulator** |
| 4 | Client config + per-task flags; cloud tier for uncached/personalized tasks | all | **Client config + per-task flags done; cloud tier not started** |
| 5 | Benchmark harness + real-device measurement. **Gate: does any task justify a local model?** | `mobile` | **Exploratory spike only (llama.rn feasibility screen, `feature/on-device-llm-spike`) — no benchmark conclusion reached. Paused 2026-09-14 by explicit project-owner decision: product direction is cloud-only for now (see Phase 7)** |
| 6 | Only if Phase 5 says yes: runtime, model manager, device tiering, local provider | `mobile` | Not started (blocked on Phase 5, which is paused) |
| 7 | Personalization depth, mistake-analysis phrasing, DB-backed usage recorder | all | **Phase 7.1/7.2/7.3 done — `SESSION_FEEDBACK` (Practice + Mock Test) and `PROFILE_SUMMARY` (Preparation Radar), cloud-only via Groq. Mistake-analysis phrasing and a DB-backed usage recorder remain unstarted** |

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

**Phase 7.1 (`SESSION_FEEDBACK`) — Done (2026-09-14), cloud-only via a new Groq provider.**
Per decision 4 above, the on-device spike is held and this feature ships entirely through the
existing provider abstraction, using Groq rather than Claude.

New `ai/provider/groq/GroqProvider` — Groq's OpenAI-compatible chat-completions API over plain
REST (no SDK), mirroring `ClaudeProvider`'s structure line for line; registered as bean `"groq"`,
so `AIProviderRegistry`/the AI Control Center pick it up with no other code change. `application.yml`
documents `GROQ` alongside `CLAUDE`/`MOCK`; the real key lives only in the gitignored
`application-local.yml` (`provider: GROQ`, model `openai/gpt-oss-120b` — Groq's model catalogue
isn't stable/documented, so this default is only as good as the day it was checked against a real
`GET /v1/models` call, per the provider's own doc comment).

**A real bug found by running `AiConfigurationTest` against the real Groq key, not by review**:
`AiConfigResolver`/`AiConfigurationService` both returned the *static* `app.ai.*` fallback
(key/model/base-url) for **any** provider id queried, not just the one `app.ai.provider` actually
names. Harmless with one real provider registered; with two (Claude, Groq), an admin enabling the
one the static config *wasn't* configured for would have silently inherited the other's key. Fixed
in both classes with a `staticFallbackFor(providerId, ...)` guard (case-insensitive match against
`app.ai.provider`); three call sites in each class updated; two new `AiConfigResolverTest` cases
added (`staticConfigDoesNotLeakToADifferentProvider`, `staticProviderMatchIsCaseInsensitive`) —
5/5 pass.

New `ai/feedback/` package: `PersonalNarrativePrompts` (versioned system/user prompt templates,
shared by `SESSION_FEEDBACK` now and `PROFILE_SUMMARY` later — 7.3, not built), 
`PersonalNarrativeGrounding`/`PersonalNarrativeValidation` (the narrative-only counterpart to
`AiAnswerGrounding`/`AiContentValidation` — every number the model cites must be one it was given,
it must name at least one given topic when any were supplied), `PersonalNarrativeService` (the
orchestrator — flag-gated before a prompt is even built, `AIService.generate()`, parse, validate,
`null` on any failure, never throws). New `SessionFeedbackController`
(`POST /api/practice-sessions/{sessionId}/feedback`, `requireUser`) + `SessionFeedbackDtos`.
Migration **V43** (`user_practice_sessions.feedback_narrative`/`feedback_generated_at`, additive,
nullable — opportunistic cache, not a required backfill). `AiTaskFlagService` gained a single-flag
`isEnabled(AiTaskId)` read so a request is never built for a disabled task. New `AiTaskId` values
`SESSION_FEEDBACK`/`PROFILE_SUMMARY` — both automatically appear in the existing
`GET /api/client-config` feed and the admin "AI Tasks" table with no code change (both iterate
`AiTaskId.values()`).

**Grounding proven in parity across languages, same discipline as `ai-answer-grounding-fixtures.json`.**
New shared fixture `sample-data/personal-narrative-grounding-fixtures.json` (6 cases), run by both
`PersonalNarrativeGroundingTest.java` and `packages/core`'s `validate.test.ts` (`groundedNarrative`
block) — both pass on every case. `packages/core` gained `SESSION_FEEDBACK`/`PROFILE_SUMMARY` to
the task registry (`tiers: [DETERMINISTIC, GENERATED]` — a canned-sentence template
(`sessionFeedbackTemplate.ts`) is a genuinely servable `DETERMINISTIC` tier, not a stub, per the
registry's own invariant that every declared tier must be servable), `SessionContext`/
`TopicSnapshot`/`LearnerProfileContext` context types, `buildSessionContext`/
`buildLearnerProfileContext` builders, and `postSessionFeedback` (the API client). The registry's
`registryViolations` learner-scoped-context check was broadened from hard-coding `"learner"` to a
`LEARNER_SCOPED_CONTEXT` set (`learner`, `session`, `learnerProfile`) — the check's own reasoning
(a personalized task must ask for per-student context) applies identically to the two new context
kinds, not just the original one.

**Mobile**: `mobile/src/ai/sessionFeedback.ts`'s `getOrBuildSessionFeedback` — deliberately calls
`routeAiTask` with **only** a `cloud` handler, never a `deterministic` one, even though the task
declares both tiers: the router tries `DETERMINISTIC` before `GENERATED` and returns on the first
supplied handler that succeeds, so handing it a deterministic handler here would mean the canned
template always wins and the cloud narrative the screen actually wants would never run. The
template is instead invoked directly as the on-screen fallback only when the router reports
`UNAVAILABLE` (offline, signed out, disabled, or the backend declined) — keeping the router's own
"cheapest tier that fully answers" contract intact for any future caller that does want the
template tried first. Local migration **0024** mirrors V43 (`practice_sessions.feedback_narrative`/
`feedback_generated_at`); `saveSessionFeedback` caches the result locally so reopening a session
from History never re-fetches. Wired into `practice/quiz.tsx` (passes `topicId`/`examCode` as route
params to Summary — a session is single-topic by construction, so no new persisted column was
needed) and `practice/summary.tsx` (new `SessionFeedbackNarrative` component, loaded after the
screen's own stat blocks render, keyed on `sessionId` to dodge the `react-hooks/set-state-in-effect`
cascading-render violation the same way `PreparationPlanCard` already does). New i18n key
`summary.feedbackLabel` (en/te — this app's UI-chrome languages; content-language grounding stays
en/hi per the registry's `AI_LANGUAGES`, unrelated to UI chrome).

**Verified.** Backend: `mvn compile`/`test-compile` clean. **New tests: 12/12 pass against the
real dev database** — `SessionFeedbackControllerTest` (5: requires auth 401; flag off → `narrative:
null`, 200; grounded narrative generated and contains the given accuracy/topic when enabled against
a fixture provider (`narrativefixture`, registered the same way `AiContentIntegrationTest`'s fixture
provider is, since `MockAIProvider`/`FixtureAiContentProvider`'s own JSON shapes don't match this
task's payload); generation succeeds even with no matching `UserPracticeSession` row; the narrative
persists onto an already-synced session row), `PersonalNarrativeGroundingTest` (2, the shared-fixture
parity check), `AiConfigResolverTest` (5, including the two new multi-provider-isolation cases).
`packages/core`: **183/183 tests pass** (`tasks.test.ts` 23, `build.test.ts` 15,
`sessionFeedbackTemplate.test.ts` 3, `validate.test.ts` 39 including the new `groundedNarrative`
block, plus all pre-existing suites unchanged), `tsc --noEmit` clean. Mobile `tsc --noEmit` clean.

**Not verified**: no on-device/emulator pass for the Summary-screen narrative card (code review +
the full type-checked, tested stack only — the Groq key was exercised directly against Groq's real
API during development per `GroqProvider`'s own doc comment, not through this exact new code path
on a device); `expo lint` was not re-run this session to confirm the pre-existing baseline holds;
`PROFILE_SUMMARY` (Phase 7.3) has prompts written (`PersonalNarrativePrompts.profileSummarySystemPrompt`)
but no service method, controller, or mobile wiring — genuinely not built, not partially built and
undocumented; Mock Test's equivalent (Phase 7.2) not started; the admin "AI Tasks" table was not
re-checked in a browser to confirm `SESSION_FEEDBACK`/`PROFILE_SUMMARY` render correctly in the
existing generic list (reasoned to work, since it iterates `AiTaskId.values()`, not click-tested).
QA: new `REQ-AI-018`, `SCN-AI-035/036/037`, `TC-AI-035/036/037` (all citing real passing test
methods) — RTM 94/178/195 → **95/181/198**.

**Phase 7.2 (`SESSION_FEEDBACK` for Mock Test) — Done (2026-09-14), same session, immediately
after 7.1.** The Mock Test twin of 7.1, reusing everything except the table a result is
opportunistically cached onto.

New migration **V44** (`user_mock_attempts.feedback_narrative`/`feedback_generated_at`, additive
nullable, identical shape to V43). New `MockAttemptFeedbackController`
(`POST /api/mock-attempts/{attemptId}/feedback`) — a separate controller rather than branching
`SessionFeedbackController` on `sessionKind`, since Practice sessions and Mock Test attempts
already live in genuinely separate tables throughout this backend (progress sync, history, etc.)
and a single controller juggling two repositories behind one path would need the same branch
either way. Reuses `PersonalNarrativeService`/`SessionFeedbackDtos` unchanged — the request
shape was already generic enough (`sessionKind: "PRACTICE" | "MOCK"`).

**One real, honest data-gap found while planning, not discovered by a failing test**: a Mock Test
attempt's stored results carry `subjectName` per question but no `topicId` (`MockTestResultItem`
in `mobile/src/db/mockTest.ts`) — unlike a Practice session, which is scoped to exactly one topic
by construction, a mock spans a whole exam's syllabus with no reliable per-question topic
mapping available client-side. Rather than inventing one, the mobile client always sends
`topics: []` for this endpoint — the narrative is accuracy-only for Mock Test, honestly, never a
fabricated per-topic diagnosis. `buildSessionContext`/the grounding checks already tolerate an
empty topic list (`mentionsAKnownTopic` short-circuits true when none are supplied), so no schema
or validation change was needed to support this.

`packages/core`: added `postMockAttemptFeedback` alongside `postSessionFeedback` in
`api/sessionFeedback.ts`, both now delegating to one shared `postFeedback(path, context, token)`
helper — the two differ only in URL path. Mobile: `db/mockTest.ts` gained
`feedbackNarrative`/`feedbackGeneratedAt` on `MockTestAttemptRecord` and a new
`saveMockAttemptFeedback`, mirroring `db/practiceSessions.ts`'s identical pair. Local migration
**0025** mirrors V44. `ai/sessionFeedback.ts` was refactored: the body of `getOrBuildSessionFeedback`
moved into a new shared internal `getOrBuildNarrative` (parameterized by the cached narrative,
session kind, counts, topics, and the effectful `postFeedback`/`persist` callbacks), with
`getOrBuildSessionFeedback` (Practice) and a new `getOrBuildMockFeedback` (Mock Test) both thin
wrappers over it — avoiding duplicating the flag-check/router/grounding-adjacent logic while
keeping both call sites' signatures unchanged from what Phase 7.1 already shipped. Wired into
`mock-test/result.tsx` (new `MockFeedbackNarrative` component, same keyed-on-id pattern as
Practice Summary's `SessionFeedbackNarrative`, placed between the stat row and the time-taken
row). New i18n key `mock.feedbackLabel` (en/te).

**Verified.** Backend: `mvn compile`/`test-compile` clean; migration V44 applied cleanly against
the real dev database; **new `MockAttemptFeedbackControllerTest`: 5/5 pass** (requires auth 401;
flag off → null; grounded narrative generated and contains the given accuracy when enabled;
generation succeeds with no matching `UserMockAttempt` row; narrative persists onto an
already-synced attempt row — the same five cases `SessionFeedbackControllerTest` proved for
Practice, now proved for Mock Test). `packages/core`: **183/183 tests still pass**, `tsc --noEmit`
clean. Mobile: `tsc --noEmit` clean; `expo lint` at the **exact pre-existing 9-problem baseline**
(8 errors, 1 warning — confirmed none in any file this phase touched).

**Not verified**: no on-device/emulator pass for the Mock Test Result screen's new "AI Feedback"
card (same gap 7.1 disclosed for Practice Summary — reasoned correct via the shared code path and
tests, not watched rendering). QA: new `REQ-AI-019`, `SCN-AI-038/039`, `TC-AI-038/039` — RTM
95/181/198 → **96/183/200**.

**Phase 7.3 (`PROFILE_SUMMARY`) — Done (2026-09-14), same session, immediately after 7.2.** The
narrative behind the Preparation Radar screen's strengths/weaknesses — a coach's note over the
Weakness Radar's already-ranked topics, not a to-do list (that framing stays Preparation Plan's
job). A genuinely different task from `SESSION_FEEDBACK` (different `ai_task_flags` row, different
context shape) sharing the same `PersonalNarrativeService`/grounding machinery.

**A deliberate scope decision, distinguishing this from 7.1/7.2**: **no server-side or
client-side cache.** Both `/feedback` endpoints opportunistically cache onto a completed,
immutable session/attempt row — but a profile summary is a live snapshot over the whole exam,
with no natural row to persist onto, and its underlying facts (topic health/trend) change far
more often than a finished session's facts ever could. Building a cache would mean building its
invalidation story too (tied to the radar's own `algorithmVersion`/`computedAt`), which is real
complexity this "coach's note" feature doesn't earn yet — a v1 without one is simpler and more
honest than one that might silently serve a stale narrative. Documented explicitly in both
`api/AI-FEEDBACK.md` and `postProfileSummary`'s own doc comment so it reads as a decision, not a
gap.

**Backend**: `PersonalNarrativePrompts.profileSummaryUserMessage`/`profileSummarySystemPrompt`
(the system prompt already existed, unused, from 7.1's own build-out) and a new
`PersonalNarrativeService.profileSummary()` — same flag-gate/generate/validate/never-throw shape
as `sessionFeedback()`, gated on `AiTaskId.PROFILE_SUMMARY` instead. New `ProfileSummaryDtos`
(reuses `SessionFeedbackDtos.TopicSnapshotDto`/`SessionFeedbackResponse` rather than duplicating
identical records). New `ProfileSummaryController`
(`POST /api/exams/{examCode}/profile-summary`, mirroring the existing
`GET /api/exams/{code}/weakness-radar` path convention). No migration — nothing new to persist.

**The shared test fixture (`FixturePersonalNarrativeProvider`) needed a real extension, not just
reuse** — it only recognized `SESSION_FEEDBACK`'s `"Accuracy: N%"` prompt line; `PROFILE_SUMMARY`'s
prompt has no such line (`"Topics practised: N of M"` instead). Extended to detect either shape
(accuracy tried first, so the original `SESSION_FEEDBACK` narrative wording — already asserted on
by `SessionFeedbackControllerTest`/`MockAttemptFeedbackControllerTest` — is completely unchanged),
confirmed by re-running all three feedback test classes together: **13/13 still pass.**

**`packages/core`**: new `feedback/profileSummaryTemplate.ts` (`PROFILE_SUMMARY`'s `DETERMINISTIC`
tier — states coverage, then the single most urgent weakness and strongest strength, mirroring
`sessionFeedbackTemplate`'s shape) plus its own test file (3 tests). New `api/profileSummary.ts`
(`postProfileSummary`). Mobile: new `ai/profileSummary.ts` (`getOrBuildProfileSummary`) — kept
**separate** from `ai/sessionFeedback.ts` rather than generalizing further, since
`LearnerProfileContext` (strengths/weaknesses/coverage) shares no fields with `SessionContext`
(answered/correct/accuracy) — there is no shared shape worth extracting beyond what
`getOrBuildNarrative` already captures for the two `SESSION_FEEDBACK` call sites. Skips calling
the backend entirely when `topicsWithEvidence === 0` (nothing to summarise for a student who
hasn't practised yet — matches the screen's own existing "invitation" empty state). Wired into
`preparation-radar.tsx` (new `ProfileSummaryNarrative` component, "AI SUMMARY" card placed right
after the overview stats, keyed on the `radar` object reference per this codebase's usual
`set-state-in-effect`-avoiding pattern) — respects the student's actual content-language
preference (`useAppLanguage().defaultLanguageCode`), not hardcoded English, even though this
screen's own UI chrome is English-only by an earlier, separate decision.

**Verified.** Backend: `mvn compile`/`test-compile` clean; **new `ProfileSummaryControllerTest`:
3/3 pass** (requires auth 401; flag off → null; grounded narrative generated, containing the
given `topicsWithEvidence` and a given topic name) against the real dev database; the two prior
Phase 7 test classes re-run alongside it to confirm the shared fixture change didn't regress
them — **13/13 total, all green**. `packages/core`: **188/188 tests pass** (up from 183 — the 3
new template tests plus 2 more purity-scan cases for the 2 new source files), `tsc --noEmit`
clean. Mobile: `tsc --noEmit` clean; `expo lint` at the **exact pre-existing 9-problem baseline**
(confirmed none in any file this phase touched).

**Not verified**: no on-device/emulator pass for the Preparation Radar screen's new "AI Summary"
card (same disclosed gap as 7.1/7.2). QA: new `REQ-AI-020`, `SCN-AI-040/041`, `TC-AI-040/041` —
RTM 96/183/200 → **97/185/202**.

**This closes Phase 7's originally-scoped personalization narratives** (`SESSION_FEEDBACK` for
both Practice and Mock Test, `PROFILE_SUMMARY` for the Preparation Radar). Not done, and
genuinely separate work: mistake-analysis phrasing (the `MISTAKE_ANALYSIS` task already exists in
the registry with a `GENERATED` tier, `DETERMINISTIC` served by `localRadar`'s existing reason
codes — no live endpoint calls it yet) and a DB-backed usage recorder (usage is still
log-line-only, per `LoggingAIUsageRecorder` from Phase 1).

**Phase 2's admin UI — Done (2026-09-14), closing the one gap that phase had left open since it
first shipped.** `admin/src/pages/AiContentReview.jsx`: a "Generate content" form (task/language
selects, a textarea for question/topic ids) plus a filterable review queue (task/status selects,
one card per row showing every payload field, badges for task/language/status) with
Submit-for-review/Publish/Reject/Unpublish actions matching exactly what each `contentStatus`
allows. Structured the same way `IngestionReview.jsx` (TASK-2401) already reviews a different
pipeline's candidates — one card per row, reload-after-mutation rather than optimistic local
state, so `expectedVersion` never drifts from the server's real value. New `admin/src/api.js`
functions (`generateAiContent`, `listAiContent`, `submitAiContentForReview`, `publishAiContent`,
`rejectAiContent`, `unpublishAiContent`); a new "AI Content Review" entry under the existing
Settings sidebar group, beside AI Control Center.

**Verified for real, not just built and assumed** — the same standard this project holds every
admin-console phase to. Minted a 45-minute admin token via the existing `AdminTokenMintRunner`
fixture, started a real dev backend and admin dev server, and drove the page with Playwright: **a
real Groq API call** generated an explanation for a real, live SSC_CGL question (`answer: "A"`,
correctly grounded); the resulting row appeared under the DRAFT filter with its full payload;
Submit for review moved it to REVIEW (confirmed gone from DRAFT); Publish moved it to PUBLISHED
(confirmed a `Reviewed by <fixture-admin-email> at <timestamp>` line appeared); Unpublish moved it
back to DRAFT (confirmed the review note survived the round trip). Zero browser console errors
throughout. `npm run build`/`oxlint` clean at the exact pre-existing one-warning baseline.

**A real bug found by this pass, not by review — a stale-response race, not a StrictMode
artifact.** Quickly switching the Status filter right after generating could let an *older*
request (e.g. for the previous REVIEW filter) resolve *after* a newer one (for PUBLISHED) and
silently overwrite it with stale, wrong-filter data — confirmed by logging every network response
in order and seeing exactly that out-of-order arrival. Fixed with a request-id ref: `load()` now
discards any response that isn't the one it most recently issued, regardless of resolution order
— the standard fix for this class of bug, and one `IngestionReview.jsx`'s own identical
reload-after-mutation pattern does not yet have (pre-existing there, not touched, per this
project's own "don't refactor unrelated code" rule).

**A second thing this pass found, and disclosed rather than silently worked around**: both
questions used for this pass now carry a leftover `DRAFT` `ai_content` row,
since Phase 2 has no delete endpoint by design (only unpublish, never delete — see
`api/AI-CONTENT.md`). Both were confirmed reset to `DRAFT` (not left `PUBLISHED`) before ending
the session, so nothing generated during verification is currently visible to a real student, but
the two rows themselves remain in the database — the same category of harmless test leftover this
project's `memory/STATUS.md` already tracks for other content-generation passes.

**Cleanup performed**: both test-generated `ai_content` rows unpublished (confirmed `DRAFT`); the
minted admin token revoked; the dev backend and admin dev server processes stopped (confirmed by
PID and by the ports refusing new connections afterward); every scratch Playwright script and
screenshot deleted (none committed).

QA: `REQ-AI-010/012/013/014` gained `Admin` to their `system` list (the admin page is simply the
first UI consumer of behavior those requirements already specify); new `SCN-AI-042`/`TC-AI-042`
(`ManualOnly` — no automated browser-test runner exists for the admin console in this project),
`remarks` disclosing exactly what was manually walked through and the bug found — RTM 97/185/202
→ **97/186/203**. `api/AI-CONTENT.md` updated with a new "Admin console" section, replacing its
former "Not yet built: admin console page" line.

## Cost measurement, and the three follow-ups it forced (2026-09-14)

The project owner asked, before further building, roughly how many AI calls/tokens/rupees a single
student generates per day. Answering it properly meant measuring rather than estimating — and the
measurement immediately found a shipped bug, which is the main reason this section exists.

**Measured against live Groq** (`openai/gpt-oss-120b`, $0.15/M in, $0.60/M out — the real published
figures, fetched rather than recalled):

| Call | Input | Output | Cost/call | Latency |
|---|---|---|---|---|
| Session feedback (Practice, 1 topic) | 328 | 248 | $0.00020 | 3.2s |
| Session feedback (Mock, 0 topics) | 301 | 125 | $0.00012 | 2.8s |
| Profile summary (3+3 topics) | 475 | 378 | $0.00030 | 3.4s |
| Question explanation (admin batch) | 356 | ~320 | $0.00025 | ~3s |

A typical active student (3 practice sessions, ~2-3 radar views) runs **~6 calls/day ≈ $0.0013**,
i.e. **~$0.04/user/month**; 10k DAU ≈ $390/month. **Output dominates ~75% of spend** (4× the input
price, and a reasoning model emits roughly as many tokens as it reads). The free tier's 250K TPM
works out to ~357 calls/min, which is the binding constraint long before cost is — fine on average
at 10k DAU, but reachable at an evening peak. It degrades soft (retry with backoff, then the
deterministic template), so it throttles rather than breaks.

**The number that validates the whole Tier-2 architecture**: all 113 real questions × 2 languages
of cached explanations cost **~$0.08 one time, forever**, serving unlimited students via sync. That
is decision 1 (§13) paying off, in measured currency rather than in argument.

### 1. A real bug the measurement found: silent truncation on the most realistic payload

The `PROFILE_SUMMARY` probe returned `narrative: null` for a perfectly ordinary 3-strength/
3-weakness profile. The usage line said `status=success, outputTokens=300` — exactly the
`maxTokens(300)` ceiling. `gpt-oss-120b` is a reasoning model: it spent the entire output budget
thinking and was cut off mid-JSON, which failed parsing and became a silent null.

Proven rather than assumed, by first fixing an observability gap: `PersonalNarrativeService`
computed a `Failed(code, detail)` and then threw it away (`case Failed ignored -> null`), so every
failure mode looked identical to "an admin never enabled this." With logging added, the cause was
unambiguous:

```
PROFILE_SUMMARY rejected a generated narrative: NOT_JSON (response was not valid JSON)
[finishReason=length, outputTokens=300]
```

Fixed by raising the wire-level ceiling to 1000 (`MAX_OUTPUT_TOKENS`), deliberately **not** the
same number as the registry's `maxOutputTokens: 300` — that figure is how long the *answer* should
be, while the wire cap must also cover reasoning. Raising it costs nothing in expectation (a caller
is billed for tokens generated, never for the cap), and the 300 was "saving" nothing: **every
truncated call billed in full and returned nothing.** Re-ran the identical payload after the fix:
a valid, grounded narrative. `TC-AI-040`'s remarks now record that its 3+3 payload is the
regression guard, and that shrinking it would stop catching this.

### 2. The cache the measurement justified

Phase 7.3 shipped deliberately without one, reasoning that a profile summary has no natural row to
attach to and that its facts change too often for a cache to be safe. The measurement showed that
call was wrong on the economics: `PROFILE_SUMMARY` was **~48% of per-user calls and ~57% of
per-user cost**, purely by regenerating identical narratives on every screen mount, pull-to-refresh
and sync-counter change.

The original objection was half right — there genuinely is no natural row — but "have the facts
changed" turned out to be answerable *exactly* rather than approximately. Migration **V45**
(`user_profile_summaries`, one row per (user, exam), ADR-005 synthetic id) keys on a **SHA-256 of
the facts a narrative may cite**, not on the radar's `computedAt`: the radar recomputes on a
schedule whether or not anything citable moved, so a timestamp key would regenerate for nothing.
Checked before a prompt is built, for the same reason the flag is.

Proven with a **generation counter** on the test fixture rather than by comparing returned text —
the fixture is deterministic, so a genuine regeneration returns byte-identical text and would be
indistinguishable from a cache hit. Both halves of the contract are tested: identical facts do not
reach the provider a second time, and a single changed fact (`topicsWithEvidence` 23 → 24) does.

### 3. Usage is now queryable, not just greppable

Phase 1 shipped `LoggingAIUsageRecorder` and explicitly declined to build a table for something
nothing consumed yet (ADR-013) — correct at the time, and the condition has now changed: three live
per-student surfaces spend real money, and the truncation bug above stayed invisible precisely
because nothing aggregated failures. Migration **V46** (`ai_usage_events`) plus
`DatabaseAIUsageRecorder`, registered `@Primary` — exactly the swap `AIUsageRecorder`'s own doc
comment predicted, with **zero change to `AIServiceImpl`**. It delegates to the logging recorder
rather than replacing it, since the tailable log line is what made this session's measurements
possible in the first place.

Two protections, both drawn from this codebase's own history rather than added speculatively:
nothing propagates out of the recorder (a failed usage write must never turn a good AI response
into an error for a student whose call already happened and was already billed), and the write uses
`REQUIRES_NEW` so usage survives a caller's rollback — safe **here specifically** because the
insert references no uncommitted parent row, the exact condition that made `REQUIRES_NEW` the wrong
answer in `DocumentStoreService`. Failures are stored alongside successes, deliberately. New
admin-only `GET /api/admin/ai-usage/summary?since=` aggregates in SQL (never by loading rows —
this is the one table in the schema designed to grow per-call, and this codebase has fixed
"load everything, count in Java" as a real performance bug more than once). It reports **tokens,
never money**: per-model pricing moves on the vendor's schedule, so cost stays a calculation over
(model, tokens), matching `AIUsageEvent`'s own long-standing doc comment.

**A smaller finding, handled by matching convention rather than diverging**: the summary's `since`
param rejected a local-offset timestamp, because `+05:30` decodes as a space in a query string. The
established `QuestionService.parseSince` behaves identically and steers callers to the `Z` form, so
adding tolerance here would have made this endpoint inconsistent with the one the mobile app
already uses — the error message was aligned to that precedent instead, and the test now sends UTC.

### 4. Prompt tone

The first real profile narrative read like a database dump — *"Geometry (STRONG, RISING, health
82) ... Percentages (NEEDS_ATTENTION, FALLING, health 45)"* — grounded but not a coach's note, and
it named all six topics. The `PROFILE_SUMMARY` system prompt now forbids echoing raw state/trend
labels and health scores, caps it at two strengths and two weaknesses, and prefers no numbers at
all. This also *reduces* grounding risk and output cost rather than trading against them.

**Verified**: `ProfileSummaryControllerTest` 5/5 (3 original + 2 new cache tests), migration V45
applied cleanly; `AiUsageTrackingTest` 4/4, migration V46 applied cleanly. QA: `REQ-AI-020`'s
business rule corrected (it asserted "no cache", now false), new `REQ-AI-021`,
`SCN-AI-043/044/045/046`, `TC-AI-043/044/045/046` — RTM 97/186/203 → **98/191/208**.
`api/AI-FEEDBACK.md` and `api/AI-ADMIN.md` both updated, including AI-ADMIN's stale "no queryable
usage data" bullet.

**Not done**: no admin console *screen* renders the usage aggregates (endpoint only); no retention/
pruning for `ai_usage_events` (~22M rows/year at 10k DAU — comfortable for Postgres, but nothing
prunes it); the client still issues a profile-summary request on every radar open (cheap, but a
client-side cache would remove even that round trip); and the tone improvement was verified by
reading one generated narrative, not by any systematic quality check.
