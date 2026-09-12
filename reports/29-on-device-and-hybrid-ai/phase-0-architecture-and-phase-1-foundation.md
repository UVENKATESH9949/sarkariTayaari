# On-device & hybrid AI — Phase 0 (architecture) and Phase 1 (shared foundation)

**Date:** 2026-09-12
**Architecture:** [`AI_ARCHITECTURE.md`](../../AI_ARCHITECTURE.md) — the decisions and the full
reasoning live there; this file records what was actually done and what was actually verified.
**Task doc:** [`tasks/TASK-2701-on-device-and-hybrid-ai.md`](../../tasks/TASK-2701-on-device-and-hybrid-ai.md).

**Phase 2 (batch generation + human review), shipped later the same session, has its own report:
[`phase-2-generation-and-review.md`](phase-2-generation-and-review.md).**

## What was asked for

A 52-section brief asking for AI as a foundational capability: on-device inference, hybrid
online/offline routing, personalization, mistake intelligence, admin control, evaluation and
benchmarking. Its own §46/§51 required an architectural assessment before any code, which is also
what `AI_RULES.md` §5.2 requires for anything touching schema, API surface or a new native
capability.

## Phase 0 — the audit changed the plan

Four findings, each of which moved a decision:

1. **Roughly a third of the brief is already shipped.** `AIService`/`AIProvider`/registry/retry/
   usage recording (ADR-013) and the DB-backed admin control center with an encrypted key and an
   audit log (ADR-014) already exist. The brief's Phases 1 and 7 and its §12/§14/§26/§29/§39 were
   largely descriptions of `backend/.../ai/`.
2. **The deterministic layer already does the diagnosis.** `topicHealth` (seven weighted
   components, confidence, evidence levels, renormalisation) plus `localRadar`'s eleven typed
   reason codes run offline on device today, and `WeaknessRadarService`/`PreparePlanService` answer
   "where am I weak" and "what should I study". An LLM asked to re-derive any of that would be
   slower, costlier, non-deterministic and less accurate.
3. **The question bank is finite and shared, and `explanation` already exists.** So the flagship
   feature does not need on-device inference: generate once server-side, review it through the
   *existing* `ContentStatus`/`REVIEWER` queue, ship it via the sync pipeline as reference
   content. That reaches every device including low-RAM ones, costs nothing per user, and puts a
   human between the model and the student — which is the real answer to the brief's §23.
4. **Telugu has no question content at all.** `mobile/src/practice/appLanguage.tsx:4` says the
   eleven-language picker is a mock; the seed generator writes `en` and `hi` only. The brief's §33
   assumes otherwise.

Three further corrections are recorded in `AI_ARCHITECTURE.md` §3: no feature-flag channel exists
anywhere (verified by enumerating all 33 controllers plus two independent greps), `GET /api/progress`
is unpaginated and unusable as context, and the backend cannot host a model file (`/downloads` is
dead on Cloud Run; both Cloudinary paths buffer in memory and cap at 20 MB).

**Recommendation, accepted by the project owner:** build ground-truth → deterministic → cached →
cloud first, and gate on-device inference behind a real benchmark as Phase 6. Reasoning in
`AI_ARCHITECTURE.md` §1 and §9; the distribution-cost problem (~$800 of egress per 10,000 devices
for a 700 MB model, potentially more than the inference it saves) is §9.4.

**Decisions taken before any code** (`AI_ARCHITECTURE.md` §13): Tier-2-first build order; generate
explanations for **real content only**, not the ~35,700 synthetic load-test questions already
slated for replacement; Telugu **out of scope** until real question content exists.

## Phase 1 — what shipped

All of it in `packages/core/src/ai/`, platform-pure, consumed identically by `mobile/` and `web/`.
No schema change, no endpoint, no native code, no new dependency, no user-visible change.

| File | What |
|---|---|
| `tasks.ts` | The task registry — 9 tasks, each declaring tiers, personalization, cacheability, languages, entitled context, output ceiling, minimum device band and fallback. Plus `registryViolations()`, the self-consistency check. |
| `context/types.ts` | `QuestionContext`, `LearnerContext`, `ExamContext`, `TopicContext` — minimisation expressed as types. |
| `context/build.ts` | Pure projections over already-computed values; `assembleContext` enforces the per-task allowlist. |
| `schema/types.ts` | Structured response shapes and the closed mistake taxonomy. |
| `schema/validate.ts` | Parsing, shape validation, and the answer-grounding check. |
| `router.ts` | Tier resolution, capability gating, fall-through. |

Three design points worth keeping:

- **The model is never asked for the answer.** It is given the verified answer and asked to reason
  about it, so a response asserting a different answer is a mechanical mismatch rather than a
  judgement call. `answerMatches` is tolerant of form (casing, option labels, letter-versus-text —
  real data carries both since V28 widened `correct_answer`) and strict about substance.
- **The registry, not a comment, keeps Telugu out.** A task cannot declare a language without
  question content, and the router refuses rather than falling back to another language.
- **Failures fall through in exactly one place.** Every handler runs inside one `attempt()` that
  catches, records and continues, so a host app cannot forget the rule at a call site.

## Verified

- `packages/core`: **155 tests pass** (up from 67), both typecheck configs clean. 79 of those are
  new: registry invariants and their deliberate violation, context minimisation, grounding, output
  validation, and routing.
- **The registry guard caught a real inconsistency in this session's own work** —
  `QUESTION_CLASSIFICATION` was declared `cacheable: true` with no `CACHED` tier. Fixed to
  `cacheable: false` (its output is applied to the question row and becomes ordinary content, so
  there is nothing left to serve from an AI cache). Found by the check, not by review.
- **Drift detection proven, not assumed.** `registryViolations` is exercised against a
  deliberately broken registry for each invariant — the same discipline used to prove
  `scripts/check-topic-health-parity.js`.
- `mobile/`: `tsc --noEmit` clean. `web/`: `tsc --noEmit` clean.
- `scripts/check-topic-health-parity.js`: passes (35 constants agree).
- No export-name collisions introduced into the `@sarkaritaiyaari/core` barrel (109 exported names
  checked).
- **QA per `AI_RULES.md` §3.21**: new `AI` module — 9 requirements, 22 scenarios, 22 manual test
  cases, all `Not Executed` with no invented results. Every case cites a real, written, executed
  automated test. RTM went to **85 / 163 / 180**, plus a new `regression-ai` suite.

## Not verified / not done

- **Nothing beyond Phase 1 exists.** No `ai_content` table, no generation pass, no review queue,
  no sync to device, no client-config endpoint, no model runtime. The router's local branch is
  typed and gated but has no implementation behind it — by design, and it reports "unavailable"
  rather than stubbing an answer.
- **No AI output has ever been generated or validated end to end.** The validators are proven
  against constructed payloads, not against a real model response.
- **No real device work.** Device tiering is typed and unit-tested against simulated profiles;
  `expo-device` exposes `Device.totalMemory` (verified in the installed `.d.ts`) but nothing reads
  it yet.
- Every model size, latency, licensing and cost figure in `AI_ARCHITECTURE.md` is from public
  documentation and arithmetic over published pricing — **none of it is measured**, which is
  precisely what Phase 5 exists to fix and why Phase 6 is gated on it.
- Nothing committed to git.

## Two incidental findings, not fixed

1. **`qa/` is being written by something outside this session.**
   `qa/requirements/user-progress.yaml` appeared at 11:02 today, after this session had already
   listed that directory and not seen it, and `questions.yaml` was touched at 11:01. The whole
   `qa/` tree is untracked (`?? qa/`). No QA generator writes to `requirements/` (checked), so
   this is another session or process working concurrently in the same repo. This session's
   regeneration of the RTM/dashboard/suites **incorporated** that module rather than dropping it,
   but concurrent writers to an untracked tree is a real way to lose work.
2. **`expo-notifications` is installed but absent from `app.json`'s plugins array.** Probably
   harmless — the package autolinks and the plugin mainly sets the Android notification icon,
   colour and sounds; it is *not* the reason push is non-functional, which `memory/STATUS.md`
   already attributes to a missing EAS `projectId`. Flagged for whenever notifications are next
   touched.

## Next

Phase 2 — the `ai_content` table (migration **V41**), batch generation through the existing
`AIService`, and review/publish reusing `ContentStatus` + the `REVIEWER` role. Done; see
`phase-2-generation-and-review.md`.
