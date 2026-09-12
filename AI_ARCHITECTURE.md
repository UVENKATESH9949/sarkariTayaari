# AI architecture — on-device, cached, and cloud

**Status: approved. Phases 0 and 1 are done; Phase 2 is in progress.** The three decisions in §13
were taken by the project owner on 2026-09-12 before any code was written.

This is the design document — the architecture and the reasoning behind it. The **scoping, phase
table and per-phase implementation status** live in
[`tasks/TASK-2701-on-device-and-hybrid-ai.md`](tasks/TASK-2701-on-device-and-hybrid-ai.md), per
[`AI_RULES.md`](AI_RULES.md) §2; what actually shipped and what was verified is recorded in
[`reports/29-on-device-and-hybrid-ai/`](reports/29-on-device-and-hybrid-ai/). Those three files do
not repeat each other.

This document intentionally replaces the eight separate files the brief asked for
(`AI_MODEL_SELECTION.md`, `AI_OFFLINE_RUNTIME.md`, `AI_DATA_FLOW.md`, `AI_SECURITY.md`,
`AI_EVALUATION.md`, `AI_BENCHMARK.md`, `AI_ADMIN.md`). `AI_RULES.md` §19 forbids creating
top-level docs that duplicate each other, and §2 keeps one document per topic. Each of those
subjects is a section below. On approval, a row gets added to `AI_RULES.md` §2's doc map and a
pointer to [`system-design/06-ai-foundation.md`](system-design/06-ai-foundation.md), which
remains the description of the *shipped* backend layer.

---

## 1. Summary of the recommendation

The brief frames on-device LLM inference as the foundational capability to build first. After
auditing the codebase, **I recommend against that ordering**, and propose a different one that
reaches the same end state.

The reason is specific to this product: **the question bank is finite, shared across all users,
and already carries an authored explanation field.** An explanation for question X is the same
explanation for every student who sees question X. Generating it once on a server, reviewing it,
and shipping it to devices through the sync pipeline that already exists delivers offline AI
explanations to *every* device — including the 3 GB Android phones that can never run a 1B model
— at zero marginal inference cost and with zero hallucination risk, because a human approves it
before it ships.

On-device inference earns its place only for work that is genuinely **per-user and unbounded**:
"why did I get *this* wrong, given how *I* have been performing", free-form questions about a
topic. That is a real category, and the architecture below has a first-class place for it. It is
just not the first thing to build, and building it first would spend months of native-module
work to serve a use case that a synced text column serves better.

The proposed order is therefore: **ground truth → deterministic → cached AI → live AI (cloud) →
live AI (on-device)**, with the routing layer built early enough that the last step is a new
provider behind an existing interface rather than a rewrite.

---

## 2. What already exists — do not rebuild it

The brief's Phases 1, 7, and much of 12/14/39 describe things this codebase already has. This
matters more than anything else in the document, because building them again is the single
largest waste available here.

| Brief asks for | Already exists | Where |
|---|---|---|
| §12 `AIService` / `AIProvider` / provider abstraction | **Shipped** — `AIService`, `AIServiceImpl`, `AIProviderRegistry`, `ClaudeProvider`, `MockAIProvider`, normalized exception hierarchy, centralized retry/backoff, usage-recorder extension point | `backend/.../ai/`, documented in `system-design/06-ai-foundation.md`, ADR-013 |
| §14/§39 Admin AI control (enable/disable, provider, model, API key, connection test, audit) | **Shipped** — five endpoints under `/api/admin/ai`, encrypted key at rest (AES-256-GCM), optimistic locking, append-only audit log | `AiConfigurationController`, migration `V40`, `admin/src/pages/AiControlCenter.jsx`, ADR-014 |
| §26 Future model/provider replacement | **Shipped** — adding a provider is one `@Component("name")` class; no feature code changes | `ai/provider/AIProvider` |
| §29 No API keys in the client | **Shipped** — no generation endpoint exists at all; the only AI HTTP surface is `requireAdmin`-gated config | `system-design/06-ai-foundation.md` §Security |
| §8/§10/§11 "understand the learner", weakness, study recommendation | **Shipped, deterministically, on both server and device** — see below | |

That last row deserves its own paragraph.

### The deterministic intelligence layer is not hypothetical — it is substantial

`TopicHealthService` (backend) and `packages/core/src/intelligence/topicHealth.ts` (shared,
mirrored, parity-enforced by `scripts/check-topic-health-parity.js`) already compute, per
student per topic: a 0–100 health score from seven weighted components, a separate confidence
score, a state (`INSUFFICIENT_DATA` / `NEEDS_REVISION` / `STRONG` / `IMPROVING` /
`NEEDS_ATTENTION` / `DEVELOPING`), trend direction and delta, and an evidence level. Components
with no evidence are dropped and the remaining weights renormalised rather than scored as a
neutral 50.

`WeaknessRadarService` and `mobile/src/intelligence/localRadar.ts` turn that into ranked,
per-exam advice with eleven typed reason codes (`RECENT_DECLINE`, `PYQ_GAP`,
`PREREQUISITE_GAP`, `HIGH_EXAM_WEIGHT`, `STALE_PRACTICE`, …), and `PreparePlanService` produces
an ordered study checklist filtered to topics that actually have questions.

**This runs fully offline on device today.** So §10 (mistake intelligence), §11 (what should I
study today) and most of §8 (learner profile) are already answered without a model. The correct
scope for an LLM here is *verbalising* that output — turning a reason code into a sentence a
student wants to read — not re-deriving the diagnosis. An LLM asked to diagnose weakness from
raw attempt history would be slower, more expensive, non-deterministic, and less accurate than
the code that already ships.

---

## 3. Corrected premises

Following this project's standing rule that supplied specs are drafts to audit rather than
instructions to execute ([`AI_RULES.md`](AI_RULES.md) §4), these are the places the brief's
assumptions do not match the codebase. Each one changes a design decision.

**1. Telugu has no question content at all.** §33 asks for English/Hindi/Telugu AI support and
warns not to assume English-centric models do well in Telugu. The real constraint is upstream of
that: `mobile/src/practice/appLanguage.tsx:4` states the eleven-language picker is a mock and
only `en` and `hi` have real question content; `scripts/generate-load-test-questions.js:520-521`
writes exactly `en` and `hi`. Telugu exists only as UI-chrome strings in
`packages/core/src/i18n/te.ts`. **An AI cannot explain a question in a language the question
does not exist in without translating it first, which is precisely the fabrication risk §23
forbids.** Telugu AI output is therefore blocked on a content decision, not a model decision.

**2. The explanation field already exists and is populated — the gap is quality, not absence.**
`question_translations.explanation` has existed since `V1__init_schema.sql:32`, is per-language,
is carried end-to-end to the device (`mobile/src/db/schema.ts:573`), and is already rendered in
the quiz, summary, revise and mock-result screens. But for the ~35,700 load-test questions that
form the bulk of the ~37,900 bank, it is a formulaic one-liner from a generator template
(`scripts/generate-load-test-questions.js:500`, falling back to
`"The correct answer is ${ans}."`). So "Explain with AI" is not filling a void; it is upgrading
a placeholder.

**3. Most of the question bank is synthetic and slated for replacement.** `memory/STATUS.md`'s
own "Next up" list item 11 says the ~35,700 load-test questions are templated filler to be
replaced by real authored content. **Spending money generating high-quality AI explanations for
filler questions would be burning it.** This is the strongest argument for building the
*mechanism* now and running it over the *real* corpus — today about 113 genuinely authored
questions — rather than over the whole bank.

**4. No feature-flag or client-config channel exists.** Verified twice, independently: all 33
controllers enumerated, plus a repo-wide grep. Every boolean switch in this backend
(`app.ai.enabled` included) is startup-only `@Value` injection, invisible to any client. §15's
kill switch is net-new work, and it is needed regardless of which AI path is chosen.

**5. `GET /api/progress` cannot be an AI context source.** It returns a student's entire
practice and mock history unpaginated — the demo account is 350 sessions and 85 attempts,
roughly 14,000 result rows (`api/USER-PROGRESS.md:153` says so explicitly). Context must be
built from *already-aggregated* structures (`user_topic_health`, `user_topic_progress`), never
from raw history.

**6. The backend cannot host the model file.** `/downloads` is a documented development
convenience that is effectively dead on Cloud Run's ephemeral, scale-to-zero filesystem
(`DEPLOYMENT.md:260`); both Cloudinary paths buffer the entire file in memory and are capped at
20 MB. A 0.5–1 GB model must come from an external object store. This is a real cost line, not a
detail — see §9.4.

**7. §5's "optional AI package" is the only viable shape, not a preference.** The signed APK is
57 MB (GitHub Actions run #4) with a ~7 MB Hermes bundle. Bundling a model would grow the
install by an order of magnitude for a capability most users may never open.

**8. §40's footer-style "AI Chat" framing is right to be rejected, and the brief already
rejects it (§45).** Worth stating plainly because it is the default failure mode: this app's
value is that it *knows the syllabus and the student*. A chat box is the one surface where the
model has neither.

---

## 4. The tier model

```
                        AI request (a typed task, never a free-form prompt)
                                        |
                                        v
                              AI Orchestrator / Router
                                        |
       +----------------+---------------+---------------+----------------+
       |                |                               |                |
       v                v                               v                v
  TIER 0           TIER 1                          TIER 2           TIER 3
  Ground truth     Deterministic                   Cached AI        Live AI
  (authored)       computation                     (pre-generated)  (generated now)
       |                |                               |                |
  explanation      topicHealth                     ai_content        +---------+
  text, radar      weaknessRadar                   synced like       |         |
  reasons,         preparePlan                     reference data    local    cloud
  syllabus,        evaluators                      human-reviewed    model    (Claude)
  official dates                                                     |         |
       |                |                               |            |         |
       +----------------+---------------+---------------+------------+---------+
                                        |
                                   Context Builder
                              (compact, typed, minimal)
                                        |
                    +-------------------+-------------------+
                    |                   |                   |
              Question data       Learner state        Exam / syllabus
                    |                   |                   |
                    +-------------------+-------------------+
                                        |
                          Validated, grounded response
```

The tiers are ordered by **cost, latency, reliability and truthfulness — in the same
direction**. Tier 0 is free, instant, always available offline, and cannot hallucinate. Tier 3
is the opposite on every axis. A request should fall down the ladder only as far as it must.

This inverts the usual framing. The question is never "is the internet available, and if not can
we run a model?" It is **"what is the cheapest tier that fully answers this task?"** Internet
availability only matters once a task has genuinely reached Tier 3.

### Tier 2 is the load-bearing idea

`ai_content` is **reference content, not a runtime cache**. The distinction is the whole design:

- It is generated server-side, in batch, keyed by `(questionId, taskType, languageCode,
  promptVersion, modelVersion)`.
- It goes through **human review before publishing**, reusing this codebase's existing
  `ContentStatus` (`DRAFT` / `REVIEW` / `PUBLISHED`) enum, the existing `REVIEWER` role, and the
  same review-queue pattern `ReviewQueueService` and `admin/src/pages/IngestionReview.jsx`
  already implement for scraped notice content. **This is the answer to §23.** An AI explanation
  for a government exam question is never shown to a student because a model produced it; it is
  shown because a human approved it. Unreviewed output is `DRAFT` and invisible, exactly as
  ingested question candidates already are.
- It ships to devices through `writeReferenceData()` in the existing sync pipeline, honouring
  the existing `sync_meta` watermark, `PAGE_SIZE`, resume checkpoint and delta semantics. No new
  sync engine.
- Therefore it is **available offline on every device, at every RAM tier, with no model
  installed and no network**, and costs nothing per user.

The cost of generating it is one-time and incremental. At current Anthropic pricing
(Haiku 4.5, $1/$5 per MTok, halved again by the Batch API), covering a *full* 37,900-question
bank in two languages at roughly 500 input / 400 output tokens per item works out to **on the
order of $100–200 one-time**, and only for questions that change. Against that, live per-user
calls are unbounded and recurring: 10,000 students requesting 20 explanations a month is 200,000
calls *every month*, forever, for content that is identical for all of them.

Because the real corpus today is ~113 authored questions, running this now costs on the order of
**a dollar**. Build the mechanism at that price; scale it when real content arrives.

---

## 5. Routing

Each task declares which tiers may serve it. The router walks them in order.

```
resolve(task, context):
    if task.tier0 and groundTruth(task, context) is sufficient:
        return it                          # offline, free, verified
    if task.tier1:
        return deterministic(task, context) # offline, free, already shipped
    if task.tier2:
        hit = cachedAiContent(key)
        if hit and hit.status == PUBLISHED:
            return hit                      # offline, free, human-reviewed
    if task.tier3:
        if localModel.installed and localModel.supports(task, language)
                and device.tier >= task.minDeviceTier:
            try: return validate(localModel.run(...))   # offline, private, free
        if online and cloudEnabled(task):
            try: return validate(cloud.run(...))        # online, best quality, costs money
    return gracefulUnavailable(task)        # never an error state — see §11
```

Two rules that are easy to get wrong:

- **Local is tried before cloud when both are available**, not only when offline. It is free,
  private, and usually lower-latency than a round trip. Cloud is the *quality* escalation, not
  the default.
- **A tier failure falls through, it never propagates.** A malformed local-model response
  validates false and drops to cloud; a cloud 429 that exhausts retries drops to
  `gracefulUnavailable`. AI is an enhancement layer (§41), so the terminal state is a calm
  "not available right now" beside content that is already on screen — never a blocked screen,
  never a crash.

---

## 6. Where the code lives

```
packages/core/src/ai/            <-- platform-pure, shared by mobile AND web
    tasks.ts                     task registry (§13) — the single source of truth
    context/                     context builders (§21) — pure functions over typed input
    prompts/                     versioned prompt templates
    schema/                      structured-output types + validators (§22)
    router.ts                    tier routing, provider-agnostic

mobile/src/ai/                   <-- platform-specific, lazy-loaded
    localProvider/               model runtime binding (Phase 5+)
    modelManager/                download / verify / update / delete (§28)
    deviceCapability.ts          RAM + device tiering
    cachedContent.ts             reads ai_content from local SQLite

backend/.../ai/                  <-- EXISTS; extended, not replaced
    provider/, config/, usage/   unchanged
backend/.../service/
    AiContentGenerationService   batch generation into ai_content (new)
    AiContentReviewService       reuses the existing review/publish pattern (new)

admin/src/pages/
    AiControlCenter.jsx          EXISTS; gains feature flags + model registry
    AiContentReview.jsx          new — review queue for generated content
```

`packages/core` is the right home for everything provider- and platform-independent, and this is
enforced rather than trusted: `packages/core/src/platformPurity.test.ts` fails the build on any
`react-native`, `expo`, `react`, `window`, `localStorage`, `process` or `node:` reference. The
model *runtime* is inherently platform-specific and must stay in `mobile/`.

Putting the registry, prompts, context builders and validators in `core` means `web/` gets
identical behaviour for free — and `web/` matters here, because it is online-only with no local
database (`web/package.json`), so it can never run Tier 2 or the local half of Tier 3. It routes
Tier 0/1 locally and everything else to cloud. Shared validators mean it cannot drift.

---

## 7. The task registry

A screen never writes a prompt. It names a task. Each entry declares:

```ts
{
  id: "QUESTION_EXPLANATION",
  tiers: ["TIER_0", "TIER_2", "TIER_3"],   // no deterministic tier for this one
  personalized: false,                      // => cacheable and shareable
  cacheable: true,
  languages: ["en", "hi"],                  // NOT "te" — see §3.1
  requiredContext: ["question", "exam"],    // never the learner profile
  maxOutputTokens: 400,
  minDeviceTier: "MID",                     // for the local-model path only
  fallback: "AUTHORED_EXPLANATION",
}
```

Proposed initial set, with the tier that actually does the work:

| Task | Primary tier | Notes |
|---|---|---|
| `QUESTION_EXPLANATION` | 2 | Generic, shared, cacheable. The flagship feature. |
| `QUESTION_HINT` | 2 | Same key space, different task type. |
| `CONCEPT_EXPLANATION` | 2 | Per topic, not per question — a few hundred rows total. |
| `MISTAKE_ANALYSIS` | 1 → 3 | Rule-based classification first; the model only phrases it. |
| `PERSONALIZED_RECOMMENDATION` | 1 | `WeaknessRadarService` already does this. LLM optional, for wording. |
| `STUDY_PLAN` | 1 | `PreparePlanService` already does this. |
| `TOPIC_ANALYSIS` | 1 | `TopicIntelligenceService` already does this. |
| `PERSONALIZED_EXPLANATION` | 3 | The genuine on-device case — per-user, uncacheable. |
| `QUESTION_CLASSIFICATION` | 3 | Admin-side/ingestion, not student-facing. |

Note how few tasks genuinely need Tier 3. That is the finding, not an accident of the table.

---

## 8. Grounding, hallucination control, and privacy

**The model never states the answer.** The correct answer is verified data
(`questions.correct_answer`, `answer_key`) that the app already knows and already renders. The
prompt supplies it as *given* and asks for reasoning about it. A model that cannot choose the
answer cannot get it wrong. Any response asserting a different answer fails validation and is
discarded — a cheap, deterministic check worth having.

**Current affairs, dates, eligibility and fees are Tier 0 only** (§24). Those live in
`recruitment_cycles`, `important_dates`, `eligibility_rules` and `fee_rules`, carry
`sourceId` attribution already surfaced in the UI, and are never model-generated. This is
non-negotiable for a product whose users make real filing decisions on those dates.

**Context minimisation (§30).** The learner context sent anywhere — and especially to cloud — is
a compact typed struct of aggregates, never raw history, never free text, never identity:

```json
{ "targetExam": "SSC_CGL", "topicState": "NEEDS_REVISION", "recentAccuracy": 61,
  "evidenceLevel": "RELIABLE", "preferredLanguage": "en" }
```

This is almost exactly what `topicHealth` already emits, which is why the context builder is a
projection rather than a new computation. No email, no user id, no question-by-question history.

**Prompt injection.** Question text and scraped ingestion content are untrusted input, the same
rule `system-design/06-ai-foundation.md` already states for the `ingestion` package. Structured
output plus schema validation is the mitigation; free-form model text is never executed,
rendered as markup, or used to select a database row.

---

## 9. On-device inference

Recommended for **Phase 5 and later**, gated on a benchmark and on a task that tiers 0–2
genuinely cannot serve. The analysis below is so the decision is ready when that point arrives.

### 9.1 Runtime

Both realistic options require a config-plugin project, not an npm install: `mobile/android/` is
regenerated by `expo prebuild` on every build and is gitignored, so native changes must arrive as
an autolinked package plus a plugin. There is exactly one local precedent,
`mobile/plugins/withReleaseSigning.js`. New Architecture (Fabric/TurboModules) and Hermes are
both on — inherited from the SDK 57 template rather than pinned — so a new native module must be
TurboModule-compatible.

| Runtime | Fit | Concern |
|---|---|---|
| **`llama.rn`** (llama.cpp binding) — *recommended starting point* | Has an Expo config plugin; runs arbitrary GGUF; **models can be downloaded at runtime** and swapped without an app release, which is exactly §26/§27's requirement | CPU/OpenCL on Android; broadest device support but not NPU-accelerated |
| **`react-native-executorch`** (Software Mansion) | Declarative `useLLM` hook, Expo-compatible, well-maintained, pre-optimized models | Model set is more curated; swapping in an arbitrary community model is less direct |

Runtime choice should be made *after* the Phase 4 benchmark, not before.

### 9.2 Model candidates

To benchmark, not to choose now — the brief is right that picking by popularity is a mistake.
Sizes are approximate at Q4_K_M and must be measured.

| Model | Params | ~Q4 size | License | Why it's a candidate |
|---|---|---|---|---|
| **Qwen3 0.6B** | 0.6B | ~0.4 GB | Apache 2.0 | Strongest multilingual-per-byte; cleanest license; plausible on 4 GB devices |
| **Qwen3 1.7B** | 1.7B | ~1.1 GB | Apache 2.0 | The quality/size sweet spot if 6 GB+ is the floor |
| **Gemma 3 1B** | 1B | ~0.7 GB | Gemma Terms (**not OSI**) | Strong for size; license needs legal review before shipping commercially |
| **Gemma 3 270M** | 270M | ~0.2 GB | Gemma Terms | Classification/extraction only — a candidate for `QUESTION_CLASSIFICATION`, never explanation |
| **Llama 3.2 1B** | 1B | ~0.8 GB | Llama Community (700M MAU clause) | Well-supported; license has a growth trigger and naming obligations |
| **Gemma 4 E2B** | 2.3B eff. | ~4 GB | **Apache 2.0** | High-end devices only; notable because Gemma 4 moved to Apache 2.0 |

**Licensing is a shipping constraint, not a footnote.** Apache 2.0 (Qwen3, Gemma 4) is clean.
Gemma 3's terms permit commercial use but carry redistribution obligations, and Llama's has an
MAU trigger. Since the model is *redistributed to end-user devices*, this needs a real answer
before any model is shipped.

**Expect Hindi to be weak and Telugu to be unusable at ≤2B.** Do not promise either until
measured. Per §3.1, Telugu is blocked on content anyway.

### 9.3 Device tiering — offline AI is not universal

This is the honest version of §16's "AI must work offline". It will, via Tiers 0–2, on every
device. The *local model* will not.

`expo-device` is already installed and exposes `Device.totalMemory` — device tiering needs no new
dependency. Proposed gate:

| Tier | Device RAM | Local model |
|---|---|---|
| `LOW` | < 4 GB | **Never.** Tiers 0–2 plus cloud when online. Loading a model here risks OOM-killing the app. |
| `MID` | 4–6 GB | Sub-1B only, opt-in, unloaded aggressively |
| `HIGH` | > 6 GB | Up to ~1.7B |

Memory management (§19): load on first use, keep warm briefly, **unload on backgrounding and on
memory pressure**. Never at startup (§44) — `_layout.tsx` already gates on migrations and a 5s
first-launch ceiling, and `expo-router` imports every route file at launch, so the AI module must
be reached through a dynamic `import()` from a screen, never a top-level route import. This trap
is already documented in this repo for `topicHealth.ts`'s module-scope assertion.

### 9.4 Distribution — the cost nobody budgets

The model is downloaded post-install (§5). `mobile/src/sync/mediaDownload.ts` is the shape to
follow — `File.downloadFileAsync` into a `Directory` under `Paths.document` — but it is **not
reusable as-is**: it is strictly sequential, has no size cap, no free-space check, no timeout, no
progress callback, no resumability and no integrity check. A model manager needs all of those
(§28), plus SHA-256 verification before first load and a user-visible delete.

Hosting is a real bill. At GCS Premium-tier egress (~$0.12/GB), a 700 MB model to 10,000 devices
is ~7 TB ≈ **$800**, plus every model update. Options, in order of preference: **Hugging Face Hub**
(free CDN, but only for unmodified public models), **GCS behind Cloud CDN** (cheaper than raw
egress, full control, needed if the model is ever fine-tuned), and *not* this backend (§3.6).

**It is entirely possible that model distribution costs more than the cloud inference it
saves.** That comparison must be run before committing.

### 9.5 Retrieval

No vector database, no embeddings, and — importantly — no FTS5 dependency. The data is already
structured and already on the device: a question knows its topic, its subject, its exams, its
difficulty and its PYQ history through real foreign keys. Retrieval is a `WHERE` clause over
SQLite, which is both cheaper and more precise than similarity search over the same corpus.
(`expo-sqlite`'s FTS5 support has a known regression history; avoiding a dependency on it is a
bonus, not the reason.) This is §6's "don't put knowledge in the weights" satisfied by the schema
that already exists.

---

## 10. Admin control and feature flags

Two extensions to what is already shipped, plus one genuinely new channel.

**Extend `AiConfigResolver`.** It currently resolves exactly five values — `isEnabled`,
`activeProvider`, `apiKeyFor`, `modelFor`, `baseUrlFor` — all keyed by provider only.
`DynamicAiConfigSource` has three methods and **no per-feature scoping anywhere**. Per-task flags
and per-task model pinning need a fourth port method plus a task-keyed table. This is additive;
`AIProperties` stays the fallback, so an env-var-only deployment keeps working (the property
ADR-014 was careful to preserve).

**Build the client-config channel (§15).** Net-new, needed regardless of AI:
`GET /api/client-config` — public, unauthenticated, cacheable, returning task-level flags plus
the model registry. On the device it is cached in a new local table shaped like `radar_cache`
(`algorithmVersion`, `computedAt`, `fetchedAt`, a JSON blob, safe to drop) and **the last known
config is used when offline**, per §15. Defaults must be safe: unknown flag ⇒ off.

**Admin console** gains per-task enable/disable and a model registry (id, version, quantization,
size, minimum RAM, supported languages, download URL, SHA-256 — §27) on the existing
`AiControlCenter.jsx`, plus a new `AiContentReview.jsx` review queue.

---

## 11. Observability, evaluation, and failure

**Observability (§40).** `LoggingAIUsageRecorder` is the documented extension point; a
`DatabaseAIUsageRecorder implements AIUsageRecorder` marked `@Primary` swaps in with zero change
to `AIServiceImpl`. Record task, tier actually served, provider, model version, latency,
success/failure, fallback used, tokens. Never prompt or response content, never the key — the
existing recorder's discipline.

**Evaluation (§34).** This project already has the right precedent:
`sample-data/question-evaluator-fixtures.json` is 36 cases asserted by both the Java and
TypeScript evaluators. An AI eval set is the same shape — a fixture file of representative
questions across exams, subjects, difficulties and both languages, with graded expectations —
run by the vitest harness `packages/core` already has (67 tests today, the repo's only automated
JS suite). Grade for: answer agreement with verified data (mechanical, automatable), grounding
(no claim absent from context), relevance, language quality, and refusal to speculate.

**Benchmarking (§35).** A dev-only screen recording model, device, task, input size, output
tokens, time-to-first-token, total latency, tokens/sec, peak RAM and structured-output validity.
Real devices at all three tiers (§36), not just an emulator — a standing rule in this project
already, and the emulator would flatter a 1B model badly.

**Failure (§41).** The ladder is: cloud → local → cached → deterministic → authored → a calm
message. Every AI surface renders *beside* content that is already correct and on screen, so the
worst case is an absent enhancement.

---

## 12. Phased plan

Each phase is independently shippable and independently valuable. **Nothing after Phase 0 starts
without sign-off**, and every phase carries `qa/` coverage in the same change per
[`AI_RULES.md`](AI_RULES.md) §3.21. `qa/` has four modules today (`AUTH`, `CATALOG`, `QUESTIONS`,
`WEB`) and **no AI coverage at all** — the shipped AI foundation and Control Center are both
uncovered, so an `AI` module is net-new. Migrations start at **V41**.

| Phase | What | Systems | Risk |
|---|---|---|---|
| **0** | This document + sign-off + the open decisions in §13 | docs | none |
| **1** | Task registry, context builders, schema validators, router — all against the existing `MockAIProvider`. No user-facing change. | `packages/core`, `backend` | low |
| **2** | `ai_content` table (V41), batch generation via the existing `AIService`, review/publish reusing `ContentStatus` + `REVIEWER`, admin review queue | `backend`, `admin` | medium — new schema |
| **3** | Ship Tier 2 to devices: `ai_content` joins `writeReferenceData()`, local table, "Explain with AI" on the quiz screen reading cache-or-authored. **First user-visible AI, fully offline, no model.** | `mobile`, `backend` | medium — sync path |
| **4** | Client config + per-task flags; cloud Tier 3 for uncached/personalized tasks | `backend`, `admin`, `mobile`, `web` | low |
| **5** | Benchmark harness + real-device measurement of 3–5 candidate models. **Decision gate: does any task justify a local model?** | `mobile` | low — throwaway |
| **6** | If and only if Phase 5 says yes: runtime, model manager, device tiering, local provider | `mobile` | **high** — native |
| **7** | Personalization depth, mistake intelligence phrasing, DB-backed usage recorder | all | medium |

Phases 1–4 need no native code, no APK growth, no model licensing decision, and no new
dependency on the mobile side. They deliver the flagship feature offline. That is the argument
for this ordering in one sentence.

---

## 13. Decisions

### Resolved by the project owner, 2026-09-12, before any code was written

| # | Decision | Chosen |
|---|---|---|
| 1 | **Build order** | **Tier 2 first.** Phases 1–4 as recommended; on-device inference is Phase 6, behind the Phase 5 benchmark gate. Not cancelled — deferred until a task proves it needs it. |
| 2 | **Which corpus gets generated explanations** | **Real content only** — the ~113 genuinely authored questions now, and real content as it is authored. The ~35,700 synthetic load-test questions are not worth generating for, since `memory/STATUS.md` already lists them for replacement. |
| 3 | **Telugu** | **Out of scope until real Telugu question content exists.** The task registry declares `en` + `hi` only. Revisit if and when Telugu content is authored. |

Consequences worth stating, because they are easy to lose later:

- Decision 2 means the Phase 2 generation pipeline must be **scoped by a content filter from day
  one**, not run over the whole bank and trimmed afterwards.
- Decision 3 means `languages: ["en", "hi"]` is a *registry-enforced* constraint, not a comment.
  A task asked for `te` must refuse at the router, not silently translate.
- Decision 1 means the router's Tier 3 local branch is designed and typed in Phase 1 but has no
  implementation behind it until Phase 6. It must be a no-op that reports "unavailable", never a
  stub that fabricates.

### Still open

4. **The LLM provider and monthly budget ceiling** — an open *business* decision in
   `reports/open-questions.md` that already blocks four other epics. Tier 2 batch generation
   needs only a small one-time budget, so this architecture routes around the deadlock rather
   than waiting on it. Needed before Phase 2 actually runs a real generation pass.
5. **Model licensing** — Apache-2.0-only, or is a Gemma/Llama license acceptable for
   redistribution to end-user devices? Needed before Phase 5 picks candidates, not before.
6. **Minimum supported device** for the local model, if Phase 5 says build it (§36).

---

## 14. What this document does not claim

- **No code has been written, and nothing here has been executed.** Every architectural claim is
  from reading the codebase; every model size, latency and license claim is from public
  documentation and is explicitly *to be benchmarked* (§9.2), not verified here.
- The cost figures in §4 and §9.4 are arithmetic over current published pricing, not measured
  bills. They are order-of-magnitude inputs to a decision, not a budget.
- No on-device model has been run on any device in this project. Nothing about real latency, RAM
  or battery on this app's target hardware is known yet — that is precisely what Phase 5 exists
  to find out, and it is the gate for Phase 6 for that reason.
- Tier 2's sync path is proposed by analogy to `writeReferenceData()`; it has not been
  prototyped, and the interaction between a large text column and the existing 500-row page size
  needs measurement.

---

## Incidental finding, unrelated to this work

`expo-notifications` is installed in `mobile/package.json:22` but is **absent from `app.json`'s
plugins array** (verified — the array is `expo-router`, `expo-splash-screen`, `expo-sqlite`,
`expo-build-properties`, `@sentry/react-native`). This is probably harmless: the package
autolinks regardless, and its plugin mainly sets the Android notification icon, colour and
sounds — it is *not* the reason push is non-functional, which `memory/STATUS.md` already
attributes to a missing EAS `projectId`. Flagged rather than fixed, since it is outside this
task's scope ([`AI_RULES.md`](AI_RULES.md) §3.1), and worth a look next time notifications are
touched.
