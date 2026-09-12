# On-device & hybrid AI — Phase 2 (batch generation + human review)

**Date:** 2026-09-12
**Task doc:** [`tasks/TASK-2701-on-device-and-hybrid-ai.md`](../../tasks/TASK-2701-on-device-and-hybrid-ai.md)
**Architecture:** [`AI_ARCHITECTURE.md`](../../AI_ARCHITECTURE.md) §4/§8/§12
**API contract:** [`api/AI-CONTENT.md`](../../api/AI-CONTENT.md)
**Previous phase:** [`phase-0-architecture-and-phase-1-foundation.md`](phase-0-architecture-and-phase-1-foundation.md)

## What shipped

Migration **V41** (`ai_content` — one row per generated question/topic explanation, `ContentStatus`
DRAFT/REVIEW/PUBLISHED, prompt/model version, a partial-unique index guaranteeing at most one
PUBLISHED row per (task, subject, language)). Backend package `ai/content/`:

- `AiContentTask` — a small enum (`QUESTION_EXPLANATION`, `CONCEPT_EXPLANATION`) mirroring the
  shared TypeScript task registry, classified by whether it is question- or topic-scoped.
- `AiContentContextLoader` — its own bean, deliberately separate from the generation service, so
  a `@Transactional(readOnly = true)` method genuinely runs inside a real transaction (a
  self-invoked call to a method on the *same* bean bypasses Spring's AOP proxy — the exact reason
  this codebase already splits `QuestionCandidateStagingService` out from
  `QuestionIngestionService`). Returns plain records, never an entity, so a lazy
  `question.getTopic().getSubject()` navigation (this app runs `open-in-view: false`) can never
  leak past the transaction that loaded it.
- `AiContentPrompts` — versioned prompt templates. The verified answer is given to the model as
  fact; the model is asked to explain it, never to choose it.
- `AiAnswerGrounding` / `AiContentValidation` — Java mirrors of `packages/core`'s
  `answerMatches`/`validateAiResponse`, kept in parity via a new shared fixture,
  `sample-data/ai-answer-grounding-fixtures.json` (the same cross-language-fixture discipline as
  `question-evaluator-fixtures.json`).
- `AiContentGenerationService` — the batch. Deliberately carries **no class- or method-level
  `@Transactional`**: each item's read, AI call, and write are independent, the same shape
  `NoticeDiscoveryService.scan()` was fixed into after a real bug in this project's own history (a
  shared top-level transaction silently rolling back a caught, logged per-item failure).
- `AiContentReviewService` — DRAFT→REVIEW→PUBLISHED, reusing the *existing* `ContentStatus` enum
  and `REVIEWER` role rather than a parallel workflow, with optimistic-locking (`expectedVersion`)
  on every transition. Unlike `ExamGuideService.setCycleContentStatus` (any status from any
  status), transitions here are validated — new code, no back-compat obligation, and AI-generated
  exam content is a sharper risk than a recruitment cycle's own metadata.
- `AiContentController` (`/api/admin/ai-content`) — generation is `requireAdmin` (the one action
  that spends money); every review transition is `requireReviewer`, matching
  `ExamGuideAdminController`'s exact shape.

## The scoping problem, solved

Nothing in this codebase distinguishes a real, authored question from one of the ~35,700
synthetic load-test rows — no column, no marker (confirmed by the Phase 2 research pass). Rather
than add a provenance column to a 37,900-row production table for this feature's convenience,
`POST /generate` requires an explicit `subjectIds` list. There is no "generate for every question"
mode, by design — scoping which questions to spend real money on is always the caller's decision.
This directly enforces decision 2 in `AI_ARCHITECTURE.md` §13 (real content only).

## Real bugs found by running the tests, not by review

1. **`PropertyReferenceException` from a derived query, the exact trap this project's own history
   already documents once.** A first draft used
   `findFirstByQuestion_IdAndTaskIdAndLanguageCodeAndIsDeletedFalse...` — Spring Data derives a
   property from the entity's *field* name, and `AiContent`'s boolean field is `deleted` (its
   accessor is the conventional `isDeleted()`), so `...IsDeletedFalse...` failed at context
   startup. Fixed with explicit `@Query` methods, matching `QuestionCandidateRepository`'s own
   documented precedent for exactly this shape.
2. **The same mistake, one level up, in hand-written JPQL.** The replacement `@Query` strings
   still wrote `c.isDeleted = false` — JPQL navigates entity *attribute* names too, so this failed
   with `UnknownPathException`. Fixed to `c.deleted = false`.
3. **A column-width mismatch surfaced by the test fixture, not production code.**
   `ai_provider_configs.provider` is `VARCHAR(20)` (V40); the first test-fixture AI provider bean
   was named `"ai-content-test-fixture"` (23 chars including its canonicalized-uppercase form),
   which the real INSERT then rejected. Renamed the fixture's bean id to `"aicontentfixture"`
   (16 chars) — a test-only fix, no production schema touched.
4. **A real test-isolation bug in this session's own cleanup code.** `AiConfigurationService`
   canonicalizes a provider id to **uppercase** before storing it (matching
   `AiConfigurationTest`'s own `deleteAllById(List.of("MOCK", "CLAUDE"))` precedent) — but this
   session's first draft of `resetAiState()` deleted the **lowercase** bean name, which is a
   silent no-op against a row keyed by the uppercase form. The leftover row's non-zero version
   then made every subsequent test's `enableFixtureProvider()` call fail with `409 Conflict`.
   Fixed to delete the uppercased key, exactly matching the existing test's own convention.

## Why `MockAIProvider` couldn't be used for the success-path test

`MockAIProvider` echoes the prompt back as plain text (`"[mock response] " + lastUserMessage`) —
which correctly fails JSON parsing, proving the failure path works, but cannot exercise a real
`GENERATED` outcome. A new test-only `FixtureAiContentProvider` (registered under its own bean
name, selected via the AI Admin Control Center's own dynamic override — the same mechanism
`AiConfigurationTest` already exercises for MOCK/CLAUDE) extracts the verified answer straight out
of the real prompt `AiContentPrompts` builds and echoes it back as a valid, grounded
`QUESTION_EXPLANATION` payload. This means the test proves the real prompt template actually
carries `questions.correct_answer` through to a model and back — not a canned response
disconnected from what production code sends.

## Verified

- **`mvn -f backend/pom.xml compile`: clean**, full backend, both before and after all fixes.
- **All 24 new tests pass against the real dev database, 0 failures, 0 errors**:
  - `AiAnswerGroundingTest` — 2/2 (the shared fixture file, plus a null-input guard).
  - `AiContentValidationTest` — 10/10 (shape validation, grounding, both correct-answer storage
    forms — letter and text).
  - `AiContentIntegrationTest` — 12/12, a real end-to-end HTTP round trip through the actual
    controller/service/repository stack: a grounded `GENERATED` draft from a real prompt and a
    real (fixture) provider; skip-on-existing; unsupported language and unknown task both 400;
    unauthenticated 401, STUDENT and REVIEWER both 403 on generate; the full
    DRAFT→REVIEW→DRAFT(rejected)→PUBLISHED→DRAFT(unpublished) lifecycle with `reviewedByEmail`
    correctly stamped; a blank-reason reject and a reject-from-DRAFT both 400; a stale
    `expectedVersion` 409; and the review queue's `taskId`/`status` filters.
- Real `ai.usage` log lines confirmed the existing `LoggingAIUsageRecorder` extension point works
  unmodified for this new caller, tagged `feature=ai-content-question-explanation` as intended.
- **QA per `AI_RULES.md` §3.21**: 5 new requirements (REQ-AI-010–014), 9 new scenarios
  (SCN-AI-023–031), 9 new test cases (TC-AI-023–031), every one citing a real, passing test
  method. RTM: **85/163/180 → 90/172/189**. New `regression-ai` suite grew to 31 cases.
- `api/AI-CONTENT.md` written in the same change, per `AI_RULES.md` §5.

## Not done

- No admin console page for this queue yet (`admin/src/pages/AiContentReview.jsx`, per the task
  doc's phase table) — the API is fully built and tested, but nothing renders it in a browser.
- No sync to devices — a `PUBLISHED` row is not reachable by any client yet. That is Phase 3.
- The full backend regression suite was **not** re-run this phase (a real `spring-boot:run` dev
  server was already active on this machine from a concurrent session throughout — the scoped,
  targeted test run above was deliberate to avoid resource contention with it, matching this
  project's own established caution around overlapping Maven/Spring processes). Risk is low: this
  phase only added new files plus one additive migration; no existing entity, service, or
  controller was modified.
- Real Anthropic API cost/quality has never been exercised — every test uses either `MockAIProvider`
  (for the negative/refusal paths, which is the default/off-by-default provider) or the new
  test-only `FixtureAiContentProvider` (for the success path). The still-open LLM provider/budget
  decision in `reports/open-questions.md` is what gates a real paid generation run.

## Next

Phase 3 (backend half) shipped the same session — see below.

---

## Addendum, same session: Phase 3 backend (public sync endpoint)

New `GET /api/ai-content/sync?since=` (`AiContentSyncController`, no auth — the same public
content-sync convention `/api/questions/sync` already uses), returning `{id, taskId, questionId,
topicId, languageCode, published, payload, updatedAt}`. `payload` is present only when `published`
is true; a row that is DRAFT, in REVIEW, or was unpublished after once being live still appears —
with `published: false` and no payload — so a device that already synced it while it was live can
drop it, playing the same tombstone role `isDeleted` plays for every other synced table in this
schema. `since` parsing mirrors `QuestionService.parseSince` exactly (`0`/blank = full sync,
otherwise ISO-8601, a malformed value rejected 400).

New `AiContentReviewService.findUpdatedSince`/`parseSince` and `AiContentMapper.toSyncEntry` (the
mapping is where the payload-withholding boundary is actually enforced — never in the controller).

**Verified**: new test `sync_omitsPayloadUnlessPublished_andNeverNeedsAuth` — a real, unauthenticated
HTTP call confirms a DRAFT row's entry carries no payload, publishing flips it to carry one, and
unpublishing reverts it, all against the real dev database. **Full `AiContentIntegrationTest`
class re-run: 13/13 pass, 0 failures.** QA: one more requirement/scenario/test-case
(REQ-AI-015/SCN-AI-032/TC-AI-032). RTM → **91/173/190**.

## Addendum, same session: Phase 3 mobile/web foundation — shipped and verified on a real device

**Shared (`packages/core`):** `api/aiContent.ts` — `getAiContentSync()`, mirroring
`getAllExamGuides()`'s exact "no `since` param, full fetch" convention.

**Mobile:** new local table `ai_content` (schema.ts + hand-written migration **0022**) — one
non-null `subjectId` column rather than nullable `questionId`/`topicId`, deliberately: SQLite's
unique-index semantics treat every `NULL` as distinct from every other `NULL`, so a
`(taskId, questionId, topicId, languageCode)` unique index would never actually detect a
duplicate question row (its `topicId` is `NULL` on every one). New `writeAiContent()` in
`writeQuestions.ts`, wired into `writeReferenceData()` — full replace, same reasoning as
`writeExamGuides`. New `db/aiContentLocal.ts` (`getCachedQuestionExplanation`, a plain read, no
re-validation — the row was already grounded and reviewed before publish) and
`questionRenderer/AiExplanationCard.tsx` (renders nothing when no cached row exists — this is
Tier 2 of `AI_ARCHITECTURE.md`'s tier model, an enhancement a screen must look correct without).
Wired into **both** `practice/quiz.tsx` and `app/revise.tsx` (the second was a real gap found
during on-device verification, not a deliberate scope trim — see below).

### Verified for real, on the emulator, against a real populated pre-existing database

Ran a real Android emulator (`emulator-5554`) with a real dev-client build already installed and
already carrying a real, previously-synced local database (536 questions attempted, real
practice history) — the exact kind of check this project's own history says a clean compile has
repeatedly failed to catch. To avoid touching the concurrent session's own dev backend already
running on port 8080, ran an isolated second backend instance (port 8090) and a separate Metro
instance pointed at it, purely for this verification.

- **Migration 0022 applied cleanly to a real, populated, pre-existing local database** — the
  single highest-risk item in this phase. Confirmed directly via `sqlite3` against the pulled
  device database: `ai_content` exists, correctly shaped, with none of this device's ~7,500
  existing rows disturbed.
- **A real end-to-end sync round trip**: seeded one real `PUBLISHED` row via a scoped,
  since-deleted JDBC-equivalent runner (matching this project's own established precedent —
  `AiContentSeedRunner`, mirroring `AdminTokenMintRunner`'s and TASK-2401's own "temporary,
  deleted-after-use scratch fixture" convention — used because no real Anthropic API key exists
  on this machine, confirmed by inspection, and `MockAIProvider` cannot produce valid JSON).
  Confirmed the row reachable via a real, unauthenticated `curl` to `/api/ai-content/sync`, then
  confirmed it landed in the device's local `ai_content` table after a real "Sync Now" tap.
- **The negative path, confirmed live, twice**: a question with no cached content shows the
  authored explanation only, no AI card — confirmed on an ordinary question and on an unseeded
  duplicate of the seeded one's own question text.
- **The positive path, confirmed live and visually**: bookmarked a real question via the app's
  own star button, seeded a correctly-grounded row for its real id (read the question's own
  `correct_answer` at seed time rather than hardcoding one — an ungrounded seed would have been
  exactly the fabrication this feature exists to prevent), synced, and opened it via
  Revise → Bookmarked. **The "AI EXPLANATION" card rendered correctly**, styled distinctly
  (sparkle icon, blue label, bordered card) beneath the existing authored "EXPLANATION" box —
  screenshot confirmed.
- **A real gap found by this pass, not by review**: `AiExplanationCard` had only been wired into
  `practice/quiz.tsx`. Revise (`app/revise.tsx`) — arguably the more natural place to review an
  AI explanation — had no such surface at all. Fixed in the same session; `tsc --noEmit` stayed
  clean.
- Full cleanup performed afterward: the bookmark removed via the app's own UI, all three seeded
  `ai_content` rows deleted via the same scratch runner (then the runner file itself deleted,
  never committed), the admin token confirmed naturally expired, both scratch server processes
  (backend on 8090, Metro) stopped, `adb reverse` removed, and every scratch screenshot/database
  file removed from the project root. The concurrent session's own dev backend on port 8080 was
  confirmed healthy and completely untouched throughout.

### Real, unrelated bug found along the way (not fixed — out of scope for this task)

A pre-existing `react/no-unique-key` style bug in a `MULTIPLE_CHOICE` (checkbox) question's
option rendering: a live LogBox warning named a real, specific question id
(`0e18cfb6-51df-4415-9e0c-413761763cad`) as a duplicated React key, and while that warning was
showing, taps on that screen's checkboxes and footer buttons stopped registering — the LogBox
overlay's bounds (`[26,2008][1054,2348]`) genuinely overlap the Previous/Finish button row in the
view hierarchy. Not investigated further (unrelated to this task's scope) but worth flagging for
whoever next touches `MultiSelectOptionList.tsx` or the practice question list's key assignment.

### Not done

- The 3 stale local `ai_content` rows left on this emulator's device from the scratch-backend
  seed will self-clear on the next sync against a real backend (full-replace semantics) — not
  force-cleaned, since the scratch backend that would serve the empty state is already stopped
  and forcing a sync against the concurrent session's own backend felt like the wrong call to
  make unilaterally.
- No admin console page for the review queue (unchanged from Phase 2).
- No client-config/feature-flag endpoint yet (Phase 4) — this session's on-device pass ran with
  every AI surface unconditionally live; Phase 4 is what makes it switchable per task.
- The MULTIPLE_CHOICE checkbox rendering bug found above is disclosed, not fixed.

## Next

Phase 4 — the client-config/feature-flag endpoint, and per-task admin control extending the
existing AI Control Center. Then Phase 5's benchmark, which gates whether Phase 6 (on-device
inference) is ever built at all.
