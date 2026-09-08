# TASK-2301 — Multi-type question architecture (MCQ engine → assessment engine)

**Status:** Architecture proposal — awaiting human sign-off (`AI_RULES.md` §5 step 2).
**No code has been changed.**

## Objective

Extend the existing question system so that the question formats real Indian government
exams use — multiple-correct, true/false, fill-in-the-blank, numerical, match, ordering,
assertion-reason, statement-based, passage/DI/image/map-grouped, and eventually
descriptive — can each be stored, authored, synced, rendered, evaluated and scored,
**without changing the behaviour of a single one of the ~37,900 existing MCQs** or the
exam/stage/paper/section architecture they hang off.

## What the assessment found (before proposing anything)

Verified by reading the code, not assumed:

- `questions.correct_answer` is **`VARCHAR(10) NOT NULL`** (`V1__init_schema.sql:13`). It
  physically cannot hold a set, a mapping, a permutation, a number with tolerance, or a
  JSON key. This single column is the hardest constraint in the system.
- **No question-type discriminator exists anywhere** — backend, admin, mobile, or SQL.
  Grepped all three systems: zero hits. So §16's "accuracy by question type" is not
  computable from any stored data today.
- **No media field exists on `questions` or `question_translations`**, despite
  `ImageUploadController` already existing and returning Cloudinary URLs. Image/diagram/
  map questions cannot be represented at all.
- **No shared-content / group concept exists** — zero hits for passage/comprehension/
  group across all three systems.
- Options live **only** on `question_translations.options` (JSONB list of strings), so
  option arity is a *per-language* fact and nothing checks cross-language consistency.
- **Exactly-4 options is hard-coded in 4 places**: `TranslationRequest.java:18`,
  `UpsertTranslationRequest.java:15`, `admin/src/validateQuestions.js:22`, and the fixed
  4 inputs in `admin/src/pages/QuestionForm.jsx:552`.
- **The server never evaluates anything.** Evaluation is entirely client-side:
  `mobile/src/db/answerResolution.ts`'s `resolveCorrectIndex()` turns `correctAnswer`
  into an index, falling back to text-matching and then to **index 0 with a
  `console.warn`** — it silently reports a wrong "correct answer" for anything it cannot
  parse. The device receives the answer key by necessity (offline-first).
- Correctness is stored **two different ways already**: practice rows carry
  `is_correct BOOLEAN NOT NULL`; mock rows do not, and correctness is *derived* as
  `selected_index = correct_index` in exactly two places —
  `backend/.../repository/TopicEvidenceRepository.java:84` (JPQL) and
  `mobile/src/intelligence/localEvidence.ts:76` (Drizzle SQL). **Both feed the Weakness
  Radar.** These two lines are where a naive implementation silently corrupts it.
- `user_practice_session_results.selected_index` is `INT NOT NULL` (`V6:39`), so a
  non-index answer type has nowhere valid to write.
- Scoring lives on `exam_papers`/`paper_sections` with section-to-paper inheritance
  already resolved server-side into `effectiveMarksCorrect`/`effectiveMarksWrong`. There
  is no per-question or per-type scoring hook.
- Mock assembly (ADR-008) samples questions **randomly, independently, per section** — it
  has no notion of an atomic multi-question unit, so it would split a passage.

## Proposed architecture, in one paragraph

A **type discriminator** on `questions` (FK to a new `question_types` table, mirrored by
a Java enum so an unrenderable type cannot be authored), plus **three narrowly-scoped
JSONB columns with server-validated per-type schemas** — `answer_key` (the
language-independent canonical answer), `answer_config` (evaluation/scoring knobs), and
`content_structure` (the language-independent skeleton: option keys, statement keys,
match elements) — plus a first-class **`question_groups`** parent for shared passages and
datasets, a **`question_media`** table (a real table, not JSON — media needs querying and
cleanup), and a **six-family evaluator registry** shared in shape between Java and
TypeScript. The existing `correct_answer`, `question_translations.options`,
`selected_index`, `correct_index` and `is_correct` columns are all **kept and kept
populated** for option-set types, so every existing row, query, screen and deployed APK
keeps working unchanged.

The two structural insights that shrink the work most:

1. **Assertion-Reason (§H) and Statement-Based (§I) are not new evaluators.** Both are
   single-correct MCQs whose options are a fixed relationship/combination taxonomy. They
   need new *content structure* and new *renderers* — zero new evaluation logic.
2. **19 question types collapse to 6 evaluator families**: OptionSet (single, multiple,
   true/false, assertion-reason, statement-combination), Text (fill-blank, short answer),
   Numeric, Mapping (match), Sequence (ordering), Manual (descriptive).

## Requirements

- Every existing MCQ renders, evaluates, scores, syncs and reports identically after the
  foundation phase — verified against real data, not by inspection.
- No new online dependency in Practice or Mock Test (§12), including for evaluation.
- Question type is recorded on every response row so §16 per-type analytics is possible.
- A shared passage/dataset is stored once, never duplicated per child question.
- Type-specific scoring resolves through the *existing* inheritance chain, extended:
  `answer_config.scoring` → `question_types` default → `paper_section` → `paper`.
- Deployed APKs already in the field keep working: `/sync` and `/live` gain **capability
  negotiation** — a client that does not declare supported types receives only
  `SINGLE_CHOICE`, i.e. byte-identical behaviour to today.

## Acceptance criteria

- `mvn test` full suite green, including a test asserting a pre-existing Weakness Radar
  computation is **unchanged** after the response-model change.
- Shared JSON evaluator fixtures pass identically in Java and TypeScript, enforced by a
  parity script modelled on the existing `scripts/check-topic-health-parity.js`.
- Mobile local migration verified against a **populated** pre-migration SQLite database
  (existing rows preserved, no data loss) — the `0011` brick and `0018` verification
  precedent.
- On-device (emulator `-s emulator-5554`) run per phase, signed out **and** signed in.
- `api/QUESTIONS.md` and a new `api/QUESTION-GROUPS.md` updated in the same change.

## Affected systems

`backend`, `admin`, `mobile` — all three. This is the change
`system-design/04-where-do-i-change-things.md` "The big one: adding a field to questions"
describes, several times over.

## Affected modules

Backend: `entity/Question`, `entity/QuestionTranslation`, `dto/Question*`,
`dto/QuestionMapper`, `service/QuestionService`, `service/ProgressService`,
`repository/TopicEvidenceRepository` (the derived-correctness query), new `evaluation/`
package, new `entity/QuestionGroup*` / `QuestionMedia`.

Admin: `pages/QuestionForm.jsx` → `pages/questionEditor/*`, `validateQuestions.js`,
`pages/BulkImport.jsx`, `api.js`.

Mobile: `db/schema.ts`, `db/migrations/`, `sync/writeQuestions.ts`, `api/questions.ts`,
`db/practiceContent.ts`, `db/mockTest.ts`, `db/answerResolution.ts`,
`db/practiceSessions.ts`, `db/bookmarks.ts`, `data/practiceData.ts`,
`data/mockTestData.ts`, `intelligence/localEvidence.ts`, new `evaluation/` and
`questionRenderer/`, and the six screens that render options inline
(`practice/quiz.tsx`, `mock-test/test.tsx`, `mock-test/result.tsx`,
`practice/summary.tsx`, `revise.tsx`, `diagnostic-test.tsx`).

## API changes

`QuestionResponse` gains `questionType`, `answerKey`, `answerConfig`,
`contentStructure`, `media[]`, `questionGroupId`, `groupOrder` — `correctAnswer` stays
and stays populated for option-set types. `/sync` and `/live` gain a `supportedTypes`
capability param (absent means `SINGLE_CHOICE` only). New: `GET /api/question-types`
(public), `GET /api/question-groups/sync`, and admin CRUD for groups and media.

Groups sync on **their own paged endpoint**, written **before** question pages (local FK
ordering), rather than embedded per question — embedding would re-download a 400-word
passage once per child question on every sync page.

## Database changes

- **V25** — foundation: `question_types` table; `questions.question_type` (FK, default
  `SINGLE_CHOICE`), `answer_key JSONB`, `answer_config JSONB`, `content_structure JSONB`;
  `response JSONB`, `outcome`, `score_fraction`, `question_type` on **both**
  `user_practice_session_results` and `user_mock_attempt_results`;
  `user_practice_session_results.selected_index` relaxed to nullable; backfill
  `answer_key` for all existing rows from `correct_answer`.
- **V26** — groups and media: `question_groups`, `question_group_translations`,
  `questions.question_group_id` + `group_order`, `question_media`.
- Mobile local **0019** / **0020** mirroring each. Hand-written, never trusting
  `drizzle-kit generate` output as-is.
- No historical migration is edited. No destructive operation. No reset.

## UI changes

Mobile: a new shared `QuestionRenderer` used by all six existing question surfaces, plus
per-family input components and a collapsible group/passage header. Admin: the single
giant form becomes a type-driven editor showing only the relevant fields.
**No navigation change** — no new tab, no restructured routes.

## Dependencies

Eight open questions need answers before P2/P3 can be scoped precisely — variable option
arity, partial credit, numeric tolerance, fill-blank matching strictness, descriptive
evaluation ownership, group scoping, temporary-pool interaction, and whether §15
answer-withholding is wanted at all given offline-first. **P0 and P1 do not depend on any
of them.**

**Resolved (decision taken 2026-09-04): media pre-downloads during sync**, for every
image/diagram/map question and every chart-as-image DI question — not online-only.
Concretely:

- **`expo-file-system` is already a transitive dependency** of the `expo` SDK meta-package
  (confirmed in `mobile/package-lock.json`), just not a direct one yet. Promoting it via
  `npx expo install expo-file-system` is the same category of change as adding
  `expo-notifications` for reminders, not a new external dependency choice under
  `AI_RULES.md` §3.7's "don't introduce new dependencies unless necessary."
- **`expo-image`'s own `Image.prefetch()` is not sufficient on its own** — it writes into
  that library's managed disk cache, which the OS or the library can evict under storage
  pressure with nothing in this app's own data recording that eviction happened. That is
  an *accelerator*, not an offline guarantee, and §12 needs a guarantee.
- The actual mechanism: sync downloads each new/changed media asset via
  `expo-file-system` into the app's own document directory (mirroring how
  `writeQuestions.ts` already treats question rows as the thing sync is responsible for
  making locally durable), and a new local `question_media` table records
  `{ id, remoteUrl, localUri, mimeType, downloadedAt }`. The renderer reads `localUri`
  when present and falls back to the live `remoteUrl` only for a device that has not yet
  finished this asset's download (mid-sync, or a race) — the same "local-or-live" pattern
  `data/hybridSource.ts` already establishes for questions themselves.
- **New real cost, stated rather than hidden**: this is genuinely new storage and
  bandwidth on top of a sync that already moves 76 pages for ~37,900 questions with no
  images. Needs a stated ceiling before P3 (e.g. a per-asset size cap enforced at upload,
  matching the existing 5MB multipart limit) and a deletion/cleanup path for a media row
  whose question is later soft-deleted, or local storage grows without bound.

## Risks

Two evaluator copies drifting (mitigated by shared fixtures plus a parity script, the
pattern this repo already proved); the two derived-correctness call sites silently
corrupting the Weakness Radar; group-aware mock assembly under- or over-filling a section
against ADR-008's random sampler; **§15 (withhold answers) directly contradicts §12
(offline-first)** — Practice reveals the answer on-device with no network, so the key must
ship with the question; media pre-download (above) adding real storage/bandwidth cost and
a new local asset-cleanup responsibility that does not exist for any synced data today;
SQLite `ADD COLUMN` is unguardable and a failed local migration is a hard app-start gate.

## Testing requirements

Per `AI_RULES.md` §3.13 and §5.4: `mvn -f backend/pom.xml test`, `npm --prefix admin run
build` plus `oxlint`, `npx tsc --noEmit` plus `npx expo lint` at the existing 9-problem
baseline — and, for every phase, real exercise: curl each endpoint, and an emulator run
signed out and signed in. A clean compile is explicitly **not** evidence the feature
works.

## Allowed files / areas

Only the modules listed above. Notably **not** touched: navigation, auth, CORS,
`exam_subjects` / `section_subjects` (ADR-004), the exam/stage/paper/section tree,
`mobile/android/`.

## Out of scope

Descriptive question UI and human evaluation workflow (P4 is schema-only); interactive
maps; adaptive or AI-assisted evaluation; curated fixed mock papers (ADR-008 stands);
lifting the temporary question pool.

## Implementation phases

**P0 — refactor only, no schema change.** Extract the mobile `QuestionRenderer` and split
the admin form, both still MCQ-only, behaviour-identical. Ships and verifies on its own,
so the schema change lands on a codebase already shaped for it.

**P1 — foundation (V25).** Type discriminator, the three JSONB columns, `question_types`
seeded with `SINGLE_CHOICE` **only** enabled, both evaluator registries plus shared
fixtures plus parity script, capability-negotiated sync, response-model bridge, backfill.
Nothing new is authorable. This is the gate §17 asks for.

**P2 — objective types.** Wave A: `MULTIPLE_CHOICE`, `TRUE_FALSE`, `ASSERTION_REASON`,
`STATEMENT_COMBINATION` — all one evaluator family, so almost no new evaluation risk.
Wave B: `NUMERIC`, `FILL_BLANK`, `MATCH`, `ORDERING` — four evaluators, four renderers,
free-input UI.

**P3 — shared content (V26).** Groups, media, group-atomic selection in Practice and Mock,
passage / data interpretation / image / map.

**P4 — descriptive.** Schema plus `ManualEvaluator` plus `PENDING_REVIEW` only; no student
UI.

## Implementation status

**P0 — Done (2026-09-04).** Extracted a single shared `mobile/src/questionRenderer/OptionList.tsx`
(plus `optionListStyles.ts`, five module-level style factories, one per screen's existing visual
treatment) used by all six MCQ-rendering screens: `practice/quiz.tsx`, `mock-test/test.tsx`,
`mock-test/result.tsx`, `practice/summary.tsx`, `revise.tsx`, `diagnostic-test.tsx`. No schema
change, no new dependency, behaviour preserved exactly per screen (including a real bug caught
mid-extraction and fixed before it shipped — see below). ~360 lines of duplicated option-rendering
JSX/styles removed; two now-fully-dead imports (`Ionicons`, `Pressable`) and one dead `useTheme()`
call removed from `diagnostic-test.tsx`.

**A real bug found and fixed during extraction, not after.** A naive `isCorrect = !blind && index
=== correctIndex` would have revealed the correct answer on `practice/quiz.tsx` from the moment a
question loads, before any tap — the original code gated that reveal on `selectedOption !== null`,
which the first draft dropped. Caught by re-deriving each call site's exact original condition
before wiring it, not by running the app. A second, related bug surfaced the same way: gating
reveal on `selectedIndex !== null` breaks the two genuinely different read-only review cases where
`selectedIndex` is legitimately `null` — an unattempted mock question (`mock-test/result.tsx`) and
a bookmarked-but-never-answered question (`revise.tsx`'s Bookmarks tab) — both of which must still
show the correct answer in green. Fixed by keying the gate on whether the list is interactive
(`onSelect` present) rather than on `selectedIndex` alone.

**Verified:** `npx tsc --noEmit` clean. `npx expo lint` — exactly the pre-existing 9-problem
baseline (8 errors, 1 warning), confirmed none of the flagged files are among the 6 touched or the
new `questionRenderer/` module. Every one of the 6 diffs reviewed by hand against the original
block before being called done, not just compiled.

**On-device verification completed the same day (2026-09-04, later), on the Android emulator
(`emulator-5554`, AVD `Pixel_7`), signed out, against this device's real pre-existing synced
data.** All six screens exercised with real interaction, not just viewed:

- `practice/quiz.tsx` — Quantitative Aptitude → Problems on Trains: answered wrong, confirmed the
  picked option turned red with a close icon, the correct option turned green with a checkmark,
  and — the specific thing the first draft's bug would have broken — **nothing was revealed before
  the tap**.
- `mock-test/test.tsx` — SSC CGL Tier 1: selected an option, confirmed only the blue "selected"
  state showed (no green/red), "Clear answer" appeared, and Submit's confirmation dialog correctly
  reported the unanswered count.
- `mock-test/result.tsx` — same attempt (1 of 46 answered): expanded the unattempted Question 2 and
  confirmed the correct option ("28") still rendered green with a checkmark despite
  `selectedIndex: null` — **this is the exact second bug fixed during extraction, reproduced and
  confirmed fixed on a real device.**
- `practice/summary.tsx` — the same wrong Problems on Trains answer: confirmed the compact
  letter-badge variant (`revealLetterCompactStyles`) renders correct/wrong identically to
  `quiz.tsx`'s comfortable variant, just smaller.
- `revise.tsx` — Wrong Answers tab showed the new wrong answer correctly (plain rows, no badge,
  correct green + checkmark, wrong red + X). **Bookmarks tab**: bookmarked a question directly
  from `quiz.tsx` without ever answering it, then confirmed in Revise that the correct answer
  ("7.7 days") still rendered green — the first bug's edge case, reproduced and confirmed fixed.
- `diagnostic-test.tsx` — reached via a direct deep link (`sarkaritaiyaari:///diagnostic-test?
  examCode=SSC_CGL`) since My Exams/Exam Guide need a network path this offline pass didn't have;
  `buildDiagnosticSet.ts` has no live dependency so this is a legitimate, not a contrived, path.
  Confirmed the radio-icon variant (`blindRadioStyles`): filled blue when selected, hollow
  otherwise, no letter badge, no reveal.

No regressions found across any of the six screens. `tsc`/`expo lint` were already clean before
this pass; this pass is what actually exercised the behavior rather than reasoning about it.

**Environment notes for whoever resumes:** the emulator, Metro (`npx expo start --dev-client`),
and `adb reverse tcp:8081`/`tcp:8080` were all left running at the end of this session — reuse
rather than relaunch. No backend was started (no `application-local.yml` on this machine, per the
2026-08-24 session's same finding), so the live-network paths (Exams tab, My Exams/Exam Guide,
signed-in sync) were not exercised; everything tested here ran in the app's local/offline mode,
which is what these six screens actually use anyway. A physical device was also attached this
session (`172.16.10.46:33565`) and was never touched — every `adb` call was pinned to
`emulator-5554`.

**P1 — Done (2026-09-04, same day as P0), trimmed from the original proposal in one
deliberate, disclosed way.** Migration V25: `question_types` table (11 rows seeded, matching
every type this proposal names, only `SINGLE_CHOICE` with `is_authoring_enabled=true`);
`questions` gains `question_type` (FK, `NOT NULL DEFAULT 'SINGLE_CHOICE'`), `answer_key` /
`answer_config` / `content_structure` (JSONB); every existing row backfilled. `QuestionService`
computes `answer_key` at all three write sites (create/update/bulk-import) from the same
two-tier resolution the mobile client already uses at read time, so it can never drift from
`correct_answer`. New `evaluation` package (`QuestionEvaluator`, `SingleChoiceEvaluator`,
`EvaluationOutcome`, `EvaluationResult`) — not wired into any live scoring path yet, exactly
as scoped ("nothing new is authorable"). New public `GET /api/question-types`. Mobile: schema
+ local migration `0019` mirroring V25, `writeQuestions.ts` stores the four new fields
(defaulted for an older backend, matching the existing PYQ-field pattern), a TypeScript
evaluator mirror (`evaluation/questionEvaluator.ts`) — not wired into rendering, the six
screens' `resolveCorrectIndex()` stays the live path. `api/QUESTIONS.md` updated with the new
response fields and endpoint in the same change.

**The trim, stated plainly:** `user_practice_session_results` / `user_mock_attempt_results`
(the response-model tables) are untouched — no `response`/`outcome`/`score_fraction`
columns, `selected_index` still `NOT NULL`. The original proposal put this in P1; it moved out
because nothing today would ever produce a null `selected_index` (SINGLE_CHOICE is the only
authorable type and always yields a real index), so relaxing that column now would be a schema
change with no way to prove it correct until a type that actually needs it exists. This is
recorded in V25's own SQL comment, not just here — whichever P2 wave introduces the first
non-index type (NUMERIC/FILL_BLANK/MATCH/ORDERING) must land that slice **and** fix the two
derived-correctness call sites in the same change: `TopicEvidenceRepository.java:84` and
`mobile/src/intelligence/localEvidence.ts:76`, both of which currently compute correctness as
`selected_index = correct_index` and would silently mis-score a null as wrong.

**Two real Postgres bugs found and fixed by actually running the migration, not by review.**
`WITH ORDINAL` is not valid Postgres syntax — the real keyword is `WITH ORDINALITY`; caught on
the first attempt with a clear syntax error. The second was subtler: Postgres does not allow an
`UPDATE`'s target table to be referenced from inside a `LATERAL` subquery's own filter
(`invalid reference to FROM-clause entry for table "q"`) — the fallback backfill's correlation
against `q.correct_answer` had to move from the `LATERAL` subquery's `WHERE` into the outer
`UPDATE`'s `WHERE` instead. Both were caught because a real database was available this
session (`backend/application-local.yml` exists here, contradicting the 2026-08-24 session's
note that it didn't — see memory/STATUS.md's correction) and the migration was actually run
against it, not just read.

**A third bug caught before it ran, not after:** a first draft of the backfill-verification
test loaded the entire ~37,900-row question bank into memory twice via `findAll().stream()` to
count mismatches — the exact anti-pattern this codebase has already fixed as a real performance
bug at least four times (per this project's own history). Replaced with two set-based
`count`-derived repository methods (`countByQuestionTypeNot`, `countByAnswerKeyIsNull`) before
the test ever ran, not as a follow-up fix.

**Verified — genuinely, not just reasoned about, because a real database was available:**

- Backend: `mvn compile` clean. New `QuestionTypeFoundationTest` (4 tests) and
  `SingleChoiceEvaluatorTest` (1 test) both pass against the real shared Neon dev database —
  including a real check that the backfill actually worked (`wrongType` is zero across every
  existing row; `unresolvedAnswerKey` is a small, bounded minority, not silently zero or
  silently everything). **Full regression suite: 164 tests, 0 failures, 0 errors, BUILD
  SUCCESS** — every one of the 24 pre-existing test classes plus both new ones, confirming
  nothing already shipped regressed.
- Mobile: `npx tsc --noEmit` clean. `npx expo lint` — exactly the pre-existing 9-problem
  baseline, confirmed none of the flagged files are among the ones touched this phase. The
  TypeScript evaluator has no test runner to run it through (this project has none configured
  — confirmed by grepping `package.json`), so it was verified by manually tracing all 6 shared
  fixture cases against its logic by hand, exactly as its own file comment and the fixture
  file's comment both say — not implied, not skipped silently.

**Not verified: no on-device/emulator run for P1.** Nothing in this phase is visible on a
screen — no new authorable type, no renderer change, no evaluator wired into a live scoring
path — so there is genuinely nothing new an emulator pass would show that the backend/mobile
verification above doesn't already cover. The next phase that touches rendering (P2) needs a
real emulator pass before being called done, the same way P0 did.

**P2 Wave A — Done (2026-09-04, same day as P0/P1).** Scoped by two explicit user decisions:
all four Wave A types (`MULTIPLE_CHOICE`, `TRUE_FALSE`, `ASSERTION_REASON`,
`STATEMENT_COMBINATION`) in one pass, and **fully playable end-to-end** in real Practice/Mock
Test — not just authorable + evaluable.

Migration **V26**: `question_translations.content` (JSONB — the per-language Assertion/Reason
or Statement-list text; distinct from `content_structure`, P1's still-unused
language-independent skeleton). `is_authoring_enabled=true` for the four new types.
`response`/`outcome`/`score_fraction`/`question_type` added to both result tables;
`selected_index`/`correct_index` relaxed to nullable on both (the exact P1-flagged trim now
landed). Backfill derives the new columns for every pre-existing row so nothing already stored
reads as "unattempted."

**The exact COALESCE bridge P1's risk note demanded, landed in the same change as the nullable
columns, not after.** `TopicEvidenceRepository.mockEvidence` (backend) now sums
`case when r.outcome = 'CORRECT' then 1 else 0 end` and filters `r.outcome <> 'UNATTEMPTED'`
instead of `selected_index = correct_index` — so a null `selected_index` from a real
MULTIPLE_CHOICE/TRUE_FALSE attempt cannot silently mis-score as wrong in the Weakness Radar.
Practice's own evidence query was unaffected (it already reads the type-agnostic stored
`is_correct` boolean). The mobile-side twin
(`mobile/src/intelligence/localEvidence.ts:76`) was **not** touched this pass — see "Not
verified" below.

Backend: `QuestionService.resolveAnswer()` now dispatches per type — MULTIPLE_CHOICE requires
`answerKey.correctOptions` (non-empty index list) and computes a display `correctAnswer`
("A,C"); TRUE_FALSE requires `answerKey.correctBoolean` and computes "TRUE"/"FALSE"; the three
index-based types keep the P1 letter/text resolution unchanged. `validateTranslationShape()`
enforces empty options for TRUE_FALSE, exactly-4 for the other three, and per-type `content`
shape for ASSERTION_REASON (`assertion`+`reason`, both non-blank) and STATEMENT_COMBINATION
(`statements`, ≥2 non-blank). New `MultipleChoiceEvaluator`/`TrueFalseEvaluator` (Java) +
mirrors (TypeScript) join `SingleChoiceEvaluator` in `QuestionEvaluators`/
`questionEvaluatorFor` (ASSERTION_REASON/STATEMENT_COMBINATION reuse the single-choice
evaluator unchanged — both are still single-correct-index answers). Bulk-import stayed
SINGLE_CHOICE-only, disclosed as a deliberate scope trim (format work for four divergent
per-row shapes deferred, not attempted). `api/QUESTIONS.md` and `api/USER-PROGRESS.md` updated
in the same change.

Admin: `QuestionForm.jsx` grew a Question Type dropdown (locked after creation — the type is
immutable, matching `UpdateQuestionRequest` having no field for it at all), per-type "Correct
answer" input (letter dropdown / checkbox grid / True-False dropdown), and per-translation
Assertion/Reason fields or a Statement list editor, all gated on the loaded `question_types`
list rather than a hardcoded set.

Mobile — the harder half, because "fully playable end-to-end" means real rendering and real
scoring, not just data plumbing. New `questionRenderer/MultiSelectOptionList.tsx` (a checkbox
sibling to P0's `OptionList`, kept separate rather than folded in so the already-verified
single-select component stayed untouched — reuses the same per-screen `OptionListStyles`
factories, the badge slot doubling as a checkbox) and `questionRenderer/ContentPreamble.tsx`
(renders the Assertion/Reason block or numbered Statement list above an ordinary, still
index-based `OptionList` for those two types). TRUE_FALSE needed no new component at all — it
renders through the existing, already-verified `OptionList` with `options: [True, False]` and
a boolean↔index adapter at the call site.

`practice/quiz.tsx`: `answers` (the existing single-index map) is untouched; two new maps
(`multiAnswers`, `boolAnswers`) plus a `confirmedMulti` lock set are added alongside it.
MULTIPLE_CHOICE needed a deliberate UX decision beyond what the evaluator prescribes: unlike
single-choice's "first tap is final," a checklist can't infer "done selecting" from one tap, so
a "Confirm Answer" button locks the ticked set and triggers the reveal — TRUE_FALSE keeps the
original first-tap-is-final rule since one tap is a complete answer. `mock-test/test.tsx` gets
the same two maps but no lock/confirm step, since nothing there reveals or scores until the
final Submit and every other type stays freely re-editable until then too. Both screens' result
-building logic was rewritten to call the real evaluator for MULTIPLE_CHOICE/TRUE_FALSE rather
than a direct index comparison — deliberately **not** done for the three index-based types,
which keep the original `chosen === q.correctIndex` comparison, because
`questionEvaluatorFor("SINGLE_CHOICE")` reads `answerKey.correctOption`, a key legacy content
synced before this phase never populated; `correctIndex` (resolved from the always-present
`correctAnswer` string) is proven correct for every question in the bank and was not worth
risking to "unify" the codepath.

Review screens (`practice/summary.tsx`, `mock-test/result.tsx`, `revise.tsx`) all needed the
same fix: `status`/`isCorrect` computed from stored `selectedIndex === correctIndex` reads as
permanently "unattempted" once both are null. New `resultStatus()` (mock-test/result.tsx) and
the pre-existing `outcome` field now drive correct/wrong/unattempted everywhere, falling back
to the old index comparison only for a result saved before Wave A (no stored `outcome`). New
shared `questionRenderer/answerSummary.ts` (`describeYourAnswer`/`describeCorrectAnswer`) for
summary.tsx's "Your Answer"/"Correct Answer" text lines — `describeCorrectAnswer` deliberately
returns `null` for MULTIPLE_CHOICE/TRUE_FALSE, not a guess: those results store only
`response`/`outcome`, never an answer key snapshot (matching the backend's result tables, which
have no such column either), so the *correct* value isn't reconstructable from a stored result
without a live re-lookup, which review screens don't do for any type. `wrongAnswers.ts`'s
`WrongAnswerItem` gained optional `questionType`/`response` so Revise's Wrong Answers tab can
show what was picked for these two types too, not just degrade silently.

**Bookmarks were deliberately, disclosedly scoped out.** `bookmarks.correct_index` is
`NOT NULL` (predates the response model) and was left that way — extending it is a real schema
decision, not a quick fix, and out of scope for "make the four types playable." `quiz.tsx`'s
bookmark button is hidden (not just guarded) for any question whose `correctIndex` is null, so
MULTIPLE_CHOICE/TRUE_FALSE questions simply can't be bookmarked yet rather than writing a
meaningless index.

**One real, disclosed design choice on MULTIPLE_CHOICE's "unattempted vs. answered-empty"
distinction.** The shared evaluator's own contract treats a *present-but-empty*
`selectedOptions` array as "submitted with nothing ticked" (still scoreable, distinct from
never attempting) — but neither screen's UI can actually produce that state: "answered" is
defined as "at least one box ticked," so an empty selection and no selection are
indistinguishable in the UI and both are sent to the evaluator as `response: null`
(UNATTEMPTED). The evaluator-level distinction exists for a future caller that might construct
that state directly; today's two screens never do.

**Verified — mobile.** `npx tsc --noEmit` clean after resolving every cascading error from the
nullable-index type change (traced through `db/mockTest.ts`, `db/practiceSessions.ts`,
`api/progress.ts`, `sync/progressSync.ts`, `practice/wrongAnswers.ts`,
`practice/quiz.tsx`, `practice/summary.tsx` — a `string | null` vs `string | undefined`
mismatch on `questionType` fields, since a Drizzle read of a nullable column returns `null`,
never `undefined`). `npx expo lint` — exactly the pre-existing 9-problem baseline (8 errors, 1
warning), confirmed none of the flagged files are among the ones touched this phase.

**Verified — backend.** New `WaveAOptionSetTypesTest` (10 tests): all four types' create +
validation, plus a full upload→restore round trip through `/api/progress/sync` and
`/api/progress` proving a MULTIPLE_CHOICE practice result correctly nulls
`selectedIndex`/`correctIndex` and populates `response`/`outcome`/`scoreFraction` end to end.
New `QuestionEvaluatorsTest` (replaces P1's `SingleChoiceEvaluatorTest`, now dispatches every
fixture case through `QuestionEvaluators.forType`) — the shared fixture file
(`sample-data/question-evaluator-fixtures.json`) grew 9 new cases for the two new evaluators.
Targeted run of all three new/changed test classes: 15/15 passing.

**Full backend regression suite: attempted 5 times this session; the first 4 failed before
running a single test** — Maven's forked surefire JVM died with "The forked VM terminated
without properly saying goodbye," `Tests run: 0`, and a dumpstream `EOFException` on the fork's
own command channel. Diagnosed, not assumed: this machine had ~1.5GB of 16GB RAM free at the
time, with several unrelated processes running concurrently (this session's own earlier
attempts, VS Code's Java language server, 2-3 Gradle/Kotlin daemons, and — the first two
times — a completely separate automation project's own Maven/TestNG run under
`Desktop/Automation/cwp_test_automation`, confirmed via `Get-CimInstance Win32_Process` command-
line inspection, not touched). This is the same "concurrent Maven" class of environmental risk
this project's history has already documented once, just from unrelated processes rather than
two `mvn` invocations of this project colliding. The 5th attempt, after the unrelated
automation run had finished on its own, progressed normally. [Fill in the final result here
once the 5th run completes — see the session's own resume note if this file is read before
that happens.]

**[RESOLVED, later the same day — 2026-09-04 (2)] On-device verification completed, full backend
suite went green, and `localEvidence.ts:76` was fixed.** The items this section originally flagged
as outstanding were all closed in the immediately-following session, per the user's own "continue
the work... complete all phases" instruction. Full detail lives in `memory/STATUS.md`'s "Session of
2026-09-04 (2)" entry; summarized here so this file doesn't understate its own status:

- **Full backend suite: 174 tests, 0 failures, 0 errors, BUILD SUCCESS** (the 5th attempt from the
  note above; took ~52 minutes and included the new `WaveAOptionSetTypesTest` 10/10).
- **`mobile/src/intelligence/localEvidence.ts`'s mock-evidence query fixed** to read `outcome`
  instead of `selectedIndex = correctIndex` — the exact mobile-side twin this section flagged.
  Migration `0020` (which also landed the Wave A response-model columns on mobile) got the
  backfill for pre-existing rows that the equivalent backend migration already had, added before
  it ever ran anywhere, not after.
- **Real on-device pass on `emulator-5554`**: four real questions of each Wave A type authored via
  a minted admin token, synced to the device, and answered inside both a real Practice quiz (3/4
  correct, matching the intentional wrong answer) and a real Mock Test attempt (via the question
  navigator). Revise → Wrong Answers, the admin console's conditional forms (Playwright), and the
  `WAVEA-VERIFY`-tagged test content are all covered — see STATUS.md for the full account.
- **Two more real bugs found in the same pass**: per-question `timeMs` was never wired into the
  sync DTOs at all (silently dropped on every upload since the Weakness Radar session); and the
  admin's own click-through confirmed the `QuestionForm.jsx` UI genuinely persists, not just
  compiles.

**Next:** Wave B (`NUMERIC`, `FILL_BLANK`, `MATCH`, `ORDERING`) — see its own status section below.

## P2 Wave B — free-input types

**Done.** Scoped the same way Wave A was: all four types
(`NUMERIC`/`FILL_BLANK`/`MATCH`/`ORDERING`) in one pass, **fully playable end-to-end** in real
Practice and Mock Test — the same controlling bar the user chose for Wave A, carried forward.

**Backend.** Migration **V27** (`is_authoring_enabled=true` for the four new types — no other
schema change needed, since Wave A's generic `answer_key`/`content_structure`/
`question_translations.content` JSONB columns already exist and this phase is the first to
actually populate `content_structure`) and **V28** (a real bug found by running the new test, not
by review: `questions.correct_answer` was `VARCHAR(10)` since V1 — too narrow for FILL_BLANK's
joined accepted-answers display or MATCH's joined pair-list display; widened to `VARCHAR(500)`).
New `NumericEvaluator`/`TextAnswerEvaluator`/`MappingEvaluator`/`SequenceEvaluator` (+ TypeScript
mirrors) join the registry via `Map.ofEntries()` (switched from `Map.of()`, which caps at 10
pairs). `QuestionService.resolveAnswer()` gained NUMERIC (`answerKey.correctValue`/`tolerance`,
default tolerance `0.0`, trailing-`.0` stripped from the display value)/FILL_BLANK
(`answerKey.acceptedAnswers`, joined `" / "`)/MATCH (`answerKey.correctMapping` covering every
`contentStructure.leftKey`, joined `"L1-R2,..."`)/ORDERING (`answerKey.correctOrder`, must be an
exact permutation of `contentStructure.itemKeys`) branches. New `validateContentStructure()`
(MATCH/ORDERING each need ≥2 distinct keys) and `requireLabelsCoverKeys()` (every
`content_structure` key needs a non-blank per-language label in `content.leftLabels`/
`rightLabels`/`itemLabels`). Both `questionType` and (new this phase) `contentStructure` are fixed
at creation — no field for either on `UpdateQuestionRequest`. Bulk-import stayed
SINGLE_CHOICE-only, the same disclosed scope trim as Wave A, now covering eight divergent types
instead of four. `api/QUESTIONS.md` and `api/USER-PROGRESS.md` updated in the same change.

**Two stale test assertions fixed, both caused by real Wave A/B content now legitimately existing
in the shared dev database** — the exact same shape a P1-era assertion once needed fixing for:
`QuestionTypeFoundationTest`'s "zero non-SINGLE_CHOICE rows" check and `WaveAOptionSetTypesTest`'s
"exactly 5 authoring-enabled types" check. Both weakened to bounded/subset checks with a comment
explaining why, rather than hidden or worked around.

**Admin.** `QuestionForm.jsx` extended with NUMERIC (Correct value/Tolerance fields), FILL_BLANK
(accepted-answers list, disclosed single-language-only limitation note), and two new conditional
cards — "Match items" (left/right lists + correct-mapping selects) and "Ordering items" (numbered
list with move-up/down/remove) — plus per-translation Left/Right item labels (MATCH) and Item
labels (ORDERING). A `keyCounterRef`-based stable-key scheme (assigned at add-time, never
regenerated from array position) keeps mid-list removal from silently invalidating existing
mappings. **Verified via a real browser (Playwright), not just `npm run build`/`oxlint`** —
closing the exact gap Wave A's own status left open ("not clicked through in the browser, only
reasoned through"): all four types' conditional rendering screenshotted with zero console errors,
and a full real Save click-through for MATCH confirmed correct via a follow-up API read
(`contentStructure`, `content.leftLabels`/`rightLabels`, `answerKey.correctMapping`,
`correctAnswer` display string all persisted correctly).

**Mobile — the harder half again, since "fully playable" means real rendering and real scoring.**
New `questionRenderer/FreeTextAnswerInput.tsx` (shared NUMERIC/FILL_BLANK controlled text input,
differing only in `keyboardType`), `MatchPairing.tsx` (tap-left-then-tap-right pairing, numbered
badges shared per pair, shuffled right column), `OrderingBuilder.tsx` (tap-from-pool-to-append,
tap-in-order-to-remove), and `shuffle.ts` (Fisher-Yates, since MATCH's right column and ORDERING's
pool are authored in the correct/natural order and must be scrambled independently for display).
All three chosen over drag-and-drop specifically to avoid a new gesture-library dependency and to
stay trivially tap-drivable, matching every existing renderer's precedent.

`db/practiceContent.ts`/`db/mockTest.ts`/`data/practiceData.ts`/`data/mockTestData.ts` all gained
a `contentStructure` field on their question types and projections — Wave A's mobile data-layer
work had only carried `answerKey`/`content` through, since nothing needed the language-independent
skeleton yet; this phase is the first consumer. `quiz.tsx` gained `numericAnswers`/
`fillBlankAnswers`/`matchAnswers`/`orderingAnswers` maps plus a shared `confirmedFreeform` lock set
(the same "Confirm Answer" gate MULTIPLE_CHOICE needed in Wave A, extended to all four new types —
none of them can infer "done" from a single tap either) and `useMemo`-cached
shuffled/natural-order item lists keyed on `[question?.id, languageCode]` so a re-render from
typing/tapping never reshuffles mid-answer. `mock-test/test.tsx` got the same four maps with no
confirm gate (blind mode never reveals mid-attempt, matching every other type there) and reuses
the identical shuffle memos. `practice/summary.tsx`/`mock-test/result.tsx`/`revise.tsx` all
extended their per-type rendering: NUMERIC/FILL_BLANK render through `FreeTextAnswerInput`
(disabled, revealing correct/wrong in Practice's summary, not revealing in Mock Test's/Revise's
read-only rows — matching the existing MULTIPLE_CHOICE/TRUE_FALSE precedent there); MATCH/ORDERING
render as plain "Your Answer: N pair(s) matched" / "N item(s) ordered" text via `answerSummary.ts`,
since a stored result carries no per-key labels to reconstruct the actual pairing/order from —
the same honest limitation already documented there for MULTIPLE_CHOICE/TRUE_FALSE's correct
answer.

**Verified — mobile.** `npx tsc --noEmit` clean throughout. `npx expo lint` — exactly the
pre-existing 9-problem baseline (8 errors, 1 warning), confirmed none of the flagged files are
among the ones touched this phase.

**Verified — backend.** New `WaveBFreeInputTypesTest` (13 tests): all four types' create +
validation (including the negative cases — rejects options on NUMERIC, rejects an empty
`acceptedAnswers`, rejects an incomplete MATCH mapping, rejects a non-permutation ORDERING order,
rejects <2 MATCH/ORDERING keys, rejects a missing translation label). Full targeted run:
`WaveBFreeInputTypesTest` 13/13, `WaveAOptionSetTypesTest` 10/10, `QuestionTypeFoundationTest`
4/4, `QuestionEvaluatorsTest` 1/1 — **28/28, BUILD SUCCESS**, re-confirmed clean a second time
after a transient Postgres/PgBouncer "cached plan must not change result type" error (a real
artifact of the V28 `ALTER COLUMN TYPE` running mid-session against a pooled connection holding a
stale prepared-statement plan, diagnosed and dismissed as environmental, not a code defect, by the
second clean run).

**A real, genuine on-device pass on `emulator-5554`** — not just a clean compile, the standard
this task has held every rendering phase to. Four real questions (one NUMERIC, one FILL_BLANK,
one MATCH, one ORDERING, all tagged `[WAVEB-VERIFY]`) authored via direct authenticated API calls
against the real dev backend (the same minted-admin-token mechanism used for Wave A), synced to
the device under SSC_CGL → General Awareness → General. **All four answered and scored correctly
inside a real Practice quiz**: NUMERIC ("42") and FILL_BLANK ("New Delhi") both confirmed correct
with the green reveal; MATCH tap-paired fully correct (all three pairs green); ORDERING
deliberately answered out of order to exercise the wrong-answer path, correctly showed positions
1-2 green/3-4 red with the real explanation. The Session Summary screen correctly showed 3/4,
75%, and rendered each type's "Your Answer" line exactly as designed (`"3 pair(s) matched"` for
MATCH, `"4 item(s) ordered"` for ORDERING — the honest fallback text, not a guess). **The same
four types answered inside a real Mock Test attempt** (via the question navigator, jumping to the
General Awareness section) — MATCH tap-paired correctly (blind mode, no reveal, confirmed via the
blue "active" pairing style rather than green/red), FILL_BLANK typed and registered ("3/54"
answered), ORDERING placed in a deliberately wrong order to test the incorrect-scoring path.
**Submitting that attempt scored exactly 2 correct / 1 wrong for the General Awareness
section** — matching MATCH+FILL_BLANK correct and ORDERING incorrect precisely, and the expanded
Result-screen card for the ORDERING question showed `"Your Answer: 4 item(s) ordered"`, confirming
`mock-test/result.tsx`'s new rendering branch end to end. Pre-existing Wave A (`WAVEA-VERIFY`) and
legacy `SINGLE_CHOICE` content in the same mock attempt rendered and scored correctly alongside the
new types — no regression. Every `adb` call was pinned to `emulator-5554`; no other device was
touched.

**A real, if minor, testing-methodology lesson worth recording**: several early taps and
`uiautomator dump` reads inside this pass appeared to show a stuck/disabled "Confirm Answer"
button — investigated at length before concluding the dump was simply reading a stale
accessibility-tree snapshot one render behind reality, not a real state bug; a same-coordinate
retry (or, for MATCH/ORDERING, using `uiautomator dump`-derived bounds instead of eyeballing a
screenshot without applying its stated device-pixel scale factor) resolved every case. No app code
was changed as a result — confirmed by the fact that every one of these interactions eventually
scored correctly once the input actually landed.

**Not verified:** the admin form's `QuestionForm.jsx` Save was click-tested for MATCH only, not
individually for NUMERIC/FILL_BLANK/ORDERING (though all four share the same save codepath, and
MATCH exercises the most complex payload shape of the four — `contentStructure` +
per-language label maps — so this is a reasonable but not exhaustive proxy). Bulk-import remains
SINGLE_CHOICE-only for all eight non-legacy types, unchanged from Wave A. Bookmarks remain
scoped out for any non-index type, unchanged from Wave A.

**Next:** P3 (shared content — groups, media, group-atomic selection, passage/DI/image/map),
needing the same explicit sign-off this task has used for every phase so far.

## P3 — shared content (groups, media, group-aware assembly)

**Done.** Continuation of the same standing "continue with remaining phases... no permission
needed unless blocker" authorization this task has run under since P0. One mid-task fork was
put to the user via `AskUserQuestion` rather than decided unilaterally, since it affects the
safety of the existing, heavily-relied-upon random Mock Test sampler for ~37,900 questions:
*"a group (a passage with 2-5 child questions) must never be split across a section's random
selection — how should the sampler handle a group that doesn't fit the section's remaining
quota?"* Two options: scope groups to Practice only and defer Mock Test, or implement the full
pack algorithm in Mock Test too. **The user chose the latter** — Mock Test's assembly is fully
group-aware, not scoped down.

**Migration V29** (`question_groups`, `question_group_translations`, `questions.question_group_id`
+ `questions.group_order` — both nullable, no existing row touched, `question_media` with a DB
CHECK enforcing exactly one of `question_id`/`question_group_id`). `group_type` (`PASSAGE`/
`DATA_INTERPRETATION`/`IMAGE`/`MAP`) validated against a new `QuestionGroupType` Java enum at the
service layer — the table can describe a type the enum doesn't yet recognize, only the enum
decides what's renderable, the same defence `question_types`/`QuestionTypeCode` already
established.

**Backend.** New `QuestionGroupService`/`QuestionGroupController` (full CRUD + its own
`/sync`, deliberately a **separate** paged endpoint rather than embedding a group's content
inside every child question's sync row — embedding would re-download the same shared passage
once per question that references it, on every sync page) and
`QuestionMediaService`/`QuestionMediaController` (attach/detach only — the file itself is
uploaded through the pre-existing `POST /api/images`, this only records ownership; creating or
deleting a media row bumps its **owner's** `updatedAt`, since media has no sync endpoint of its
own). `QuestionService`/`QuestionMapper`/`QuestionResponse`/`Create`/`UpdateQuestionRequest` all
extended with `questionGroupId`/`groupOrder` (mutable after creation, unlike `questionType`/
`contentStructure`) and a batch-fetched `media` list (avoiding N+1 across `/sync`, `/live`,
`sampleForMock`, and every single-question read).

**Group-aware Mock Test assembly — the highest-risk piece, per the user's own choice.** New
`QuestionGroupAssembly.packRandomSample()`: fetches a *bounded* random candidate pool
(`min(max(limit*20, 500), 5000)`, still via the existing `ORDER BY random()`), builds "units" (a
standalone question is a unit of size 1; a question in a group pulls in the group's FULL
sibling set, loaded once per distinct group id regardless of how many siblings originally
matched), shuffles units in Java, then greedily packs them without ever exceeding `limit` — a
unit that would overflow is **skipped, not split**, extending ADR-008's already-accepted "may
undershoot" trade-off to whole groups instead of individual questions.
`mobile/src/db/questionGroupAssembly.ts` mirrors this exactly (async loader, since a mobile
group lookup is a real SQLite query rather than Java's synchronous `Function`), wired into
`db/mockTest.ts`'s `buildMockTestQuestions` with the same bounded-candidate-pool math. The live
(pre-first-sync) Mock Test path needed **no separate mobile-side mirror** — it calls the
backend's `/mock-sample`, which already returns group-aware results server-side.

**Capability negotiation — a mechanism from the ORIGINAL P1 architecture proposal that had never
actually been implemented in Wave A or B.** `/sync` and `/live` now accept a `supportedTypes`
param (comma-separated type codes), defaulting to `SINGLE_CHOICE` only when absent — a tombstone
row is still returned regardless of type either way, so an old client still learns to delete a
row it previously downloaded. **Implementing only the backend side would have been a real,
shipped regression**: this project's own already-live mobile client renders/scores all 9 types
today but declared no `supportedTypes` before this phase, so its very next sync would have
silently stopped receiving every non-SINGLE_CHOICE question. Fixed by shipping both sides in the
same change — a new single-source-of-truth `mobile/src/evaluation/supportedQuestionTypes.ts`
(all 9 authorable types) is now always sent by `api/questions.ts`'s `syncQuestions()` and
`data/liveQuestions.ts`'s `getLiveQuestions()`, so current mobile source code is unaffected,
while a genuinely old pre-P3 APK safely degrades to SINGLE_CHOICE-only — the exact scenario the
mechanism exists to protect.

**Mobile — sync, local storage, and rendering.** Local migration **0021** (mirrors V29: the same
three new tables plus the two `questions` columns, hand-written per this project's standing
"never trust generated migration SQL as-is" rule). `writeQuestionGroups()` (full-replace, not
incremental — group volume is small and admin-curated, same reasoning `writeExamStructures`
already uses) runs inside `writeReferenceData()`, **before** the question-page loop, so a
question's `questionGroupId` always resolves locally by the time its own row arrives.
`upsertQuestionsBatch`'s question-owned-media handling deliberately does **not** copy
`questionExams`/`questionTranslations`'s delete-and-reinsert pattern — `question_media` carries
local-only `localUri`/`downloadedAt`, and a blind delete+reinsert would silently reset every
previously-downloaded asset's state on every sync. Uses `onConflictDoUpdate` instead (touching
only server-owned columns), with stale rows (no longer present in the incoming payload)
separately identified, file-cleaned, and deleted.

**Media pre-download, against a real API surprise.** `expo-file-system@~57.0.6` replaced the
legacy flat-function API (`documentDirectory`, `downloadAsync`, `getInfoAsync`,
`makeDirectoryAsync`, `deleteAsync`) with a class-based `Paths`/`File`/`Directory` API entirely —
caught by `tsc`, not assumed away, and fixed by reading the installed package's own `.d.ts` files
directly rather than trusting stale familiarity, per this mobile project's own standing
`AGENTS.md` warning to check the exact versioned API before writing filesystem code.
`mediaDownload.ts`'s `downloadPendingMedia()` now uses `File.downloadFileAsync(url, destination,
{idempotent: true})` against a `new Directory(Paths.document, "question-media")`; deletion uses
a `File` instance's own synchronous `.delete()`. `Image.prefetch()` was rejected earlier in this
task's own architecture assessment as insufficient (an evictable managed cache with nothing
recording eviction) — this is what makes the offline guarantee real. A transaction-handle-mixing
bug was caught and fixed **before any test ran**, by review alone: `deleteLocalMediaFiles` reads
via the module-level `db` handle and is documented as unsafe to call from inside an already-open
`tx` — the two call sites that ARE inside one (`upsertQuestionsBatch`, `deleteQuestionsLocally`)
instead read `localUri` via their own `tx` handle and call the lower-level, DB-handle-agnostic
`deleteMediaFileAtUri` directly.

**Rendering.** New `questionRenderer/GroupContent.tsx` — looked up directly from the local group
tables by `questionGroupId`, independent of whichever question array assembled the current
question, because Practice's sampler carries **no** atomic-group guarantee (unlike Mock Test's
pack algorithm above) — a single grouped question can appear in a Practice session with none of
its siblings present, so the renderer has to work standalone. Shows a collapsible passage (plain
`Image` for any attached media, matching this app's existing convention — `expo-image` is not
used anywhere in this codebase) above the question text, the same "context before the question"
placement `PyqBadge` already established. **A genuine `set-state-in-effect` violation was
introduced and fixed the same pass** (an imperative `setContent(null)` at the top of the
data-loading effect) — fixed with the keyed-remount pattern (`key={question.id}` at both call
sites) rather than an effect-based reset, avoiding the same violation class this codebase has
hit and fixed repeatedly elsewhere (`PreparationPlanCard` etc.). Wired into `practice/quiz.tsx`
and `mock-test/test.tsx` only — **a disclosed scope trim**: review screens
(`summary.tsx`/`result.tsx`/`revise.tsx`) do not render the group passage, matching this
project's existing precedent for "the review screens get the honest text, not the full
authoring-time context" (Wave A/B's own `answerSummary.ts` note). Live-mode (pre-first-sync)
group-passage rendering is also a disclosed gap — `GroupContent` is local-only; a grouped
question encountered before a device's first sync completes renders with no passage above it,
matching this project's existing precedent for "some things wait for sync" (Exam Guide's own
offline-cache phase had the same shape of gap).

**Admin.** New `pages/QuestionGroups.jsx` (list/create/edit/delete a group's type and
per-language passage text; a media sub-modal to attach/detach image/map URLs — reusing the
existing image uploader for the file itself, this only pastes in the resulting URL) registered
as a new sidebar entry + route. `QuestionForm.jsx` gained a "Shared group" dropdown (populated
from `listQuestionGroups`) and an "Order within group" number field, both wired into the
existing create/update payload — `questionGroupId`/`groupOrder` are mutable post-creation,
unlike `questionType`/`contentStructure`, so no special-casing was needed for edit mode.

**New docs.** `api/QUESTION-GROUPS.md` (the two new controllers' full contract). `api/QUESTIONS.md`
updated in the same change: `questionGroupId`/`groupOrder`/`media` on `QuestionResponse` and both
request DTOs, the `supportedTypes` param on `/sync`/`/live`, and `/mock-sample`'s new group-aware
packing behavior.

**Verified.**
- **Backend:** new `QuestionGroupsAndMediaTest` (11 tests — group CRUD, rejecting unknown group
  type, a question joining a group with an order, rejecting unknown `questionGroupId`, moving a
  question out of its group via update, group translation upsert + delete, media attach to
  question/group but rejecting neither-or-both, the group `/sync` endpoint, capability
  negotiation on both `/sync` and `/live`, and `mockSampleNeverSplitsAGroup` — 15 iterations,
  asserting a 3-question group's match count is always 0 or 3, never 1 or 2) — **11/11,
  confirmed via the surefire report file directly** (this session's PowerShell `mvn` output
  redirection proved unreliable mid-run more than once; the `.txt` report is the trusted source
  throughout). Full regression suite re-run afterward: **200 tests, 1 failure, 0 errors** — every
  other test class (29 of 30) passed clean, including `QuestionGroupsAndMediaTest` again (11/11).
  The one failure is analyzed in its own paragraph below rather than summarized away.
- **One test failure, investigated to a confirmed diagnosis, not dismissed.**
  `LiveQuestionsTest.counts_groupsBySubjectAndExcludesDeleted` (a pre-existing test, untouched by
  this phase) failed with `expected: 1L but was: 4L` — it asserts exactly one non-deleted
  question under its own freshly-created question's subject, but that subject is
  `AbstractIntegrationTest`'s `TEST_SUBJECT_NAME`-keyed fixture ("Automated Test Subject"), looked
  up by name and **shared by every test class in the suite**, not created fresh per test.
  `/api/questions/counts` (the endpoint this test hits) was never touched by this phase's diff —
  only `sync`, `live`, and `sampleForMock` were. **Confirmed by a clean, fully-isolated
  `-Dtest=LiveQuestionsTest` re-run** (after two earlier attempts whose JVMs died mid-boot from
  this session's own memory pressure — 0.5-1.2GB free RAM at the time, with an emulator, Metro, a
  dev backend, and an admin dev server all alive at once; the same "VM terminated without
  properly saying goodbye" class of failure this project's history already documents as
  environmental): the **exact same "was 4L"** reproduced in complete isolation. Since `cleanup()`
  hard-deletes every row a test creates immediately after that test method finishes, a single
  clean class-only run cannot itself accumulate 4 — the other 3 rows must already have existed
  under the shared "Automated Test Subject" fixture *before* this isolated run started, i.e. real
  leftover content from an earlier interrupted run, exactly the shared-fixture contamination
  pattern `STATUS.md`'s own "Deferred / known leftovers" section already flags for this exact
  subject/topic pair. **Not a regression from this phase's `QuestionSpecifications.typeIn`/
  `supportedTypes` change.** Not yet cleaned up: identifying and removing the specific orphaned
  rows (the same scoped, direct one-off technique this project has used once before against this
  database) is a reasonable next step, disclosed here as an open item rather than attempted
  without first confirming exactly which rows are safe to remove.
- **Two real bugs found and fixed by running the new test, not by review**: a Spring Data
  derived-query name mismatch (`findByQuestionIdAndIsDeletedFalse...` — the entity's actual field
  is `deleted`, not `isDeleted`; `PropertyReferenceException` at context startup, fixed across
  `QuestionMediaRepository`/`QuestionService`/`QuestionGroupService`); and a test using `since=0`
  against the real ~37,900-row dev DB, which orders ascending and so never reached a question
  created moments earlier — fixed by capturing a real recent UTC timestamp instead (also sidesteps
  a `+05:30`-style offset's `+` being URL-decoded as a space).
- **Mobile:** `npx tsc --noEmit` clean (including the full `mediaDownload.ts` rewrite against the
  real installed `expo-file-system` `.d.ts` files, not assumed API). `npx expo lint` — exactly the
  pre-existing 9-problem baseline (8 errors, 1 warning) after fixing the `set-state-in-effect`
  violation described above.
- **Admin:** `npm run build` clean; `oxlint` shows only the one pre-existing warning
  (`AuthContext.jsx`, untouched by this phase) — no new violations.

**[RESOLVED, later the same day, per explicit user request] Real on-device verification
completed — not just the migration/schema check.** The riskiest new-schema piece was confirmed
first: on `emulator-5554` (the only device touched, per standing project rule), the app was
force-stopped and relaunched against this session's changes, and local migration 0021 ran
cleanly against this device's real, already-populated database — no "Database migration failed"
hard gate, Home/Practice/Exam Guide all rendered correctly afterward with no crash.

**Then a real group was authored and watched rendering.** Restarted a fresh dev backend (the one
left running from earlier in the session turned out to be stale pre-P3 code — a 404 on the new
group-sync endpoint proved it) and a fresh Metro (the old instance had gone fully unresponsive,
traced to two overlapping Metro processes from different points in the session both holding
stale state). Minted a 45-minute admin token via `AdminTokenMintRunner` and authored one real
`[P3-VERIFY]` `PASSAGE` group (English + Hindi text about the Lok Sabha/Rajya Sabha) plus three
real `SINGLE_CHOICE` questions attached to it (`groupOrder` 1-3), under SSC_CGL → General
Awareness → General — the same topic prior `WAVEB-VERIFY` content already lives under. Synced to
the device; confirmed via direct SQLite inspection of the device's own database that all three
questions and the group (both languages' passage text intact, correct `question_group_id`/
`group_order` on each) landed correctly.

**Watched it render for real in a genuine Practice quiz — the actual GroupContent component,
not a mock.** Deep-linked into the quiz screen for that topic. Question 1 (a group member)
showed the full English passage in a collapsible "PASSAGE" card above the question text exactly
as designed; "Hide passage"/"Show passage" toggled correctly with the chevron reversing;
selecting the correct option (552) revealed green with a checkmark and the real explanation.
**Question 2 — a different, pre-existing standalone `NUMERIC` question with no group — correctly
rendered no passage card at all**, confirming both `GroupContent`'s null-render path for an
ungrouped question and that Practice's sampler genuinely interleaves a group's members with
ordinary questions rather than keeping them adjacent (exactly the documented "no atomic
guarantee in Practice" behavior, now actually observed rather than only reasoned through).

**A real testing-methodology bug found and fixed along the way, not a code defect — worth
recording for future sessions.** Deep-linking via `adb shell am start -d "<uri>"` with an
unescaped `&` in the query string silently truncated the URI somewhere in the Windows→adb→device
shell layering, so `topicId`/`levelKey` never reached the screen and it sat on "Preparing your
questions..." indefinitely — indistinguishable from a real hang. Found by checking the synced
local data directly via SQLite first (all correct), which pointed the investigation away from
the app and toward the deep-link command itself. Fixed by escaping every `&` as `\&` before
handing the URI to `adb shell am start -d`.

**Not exercised this pass, honestly disclosed:** a Mock Test attempt with this real group (would
need a full exam-paper/section authoring pass — the group-atomic pack algorithm itself is
already covered by `mockSampleNeverSplitsAGroup`'s 15-iteration integration test, just not
watched rendering on-device); the media `Image` render/fallback path and a downloaded media file
surviving a sync (this test group has no attached image). Standalone-question-only media (an
IMAGE/MAP question with no group) has a working backend/admin path but **no mobile renderer** —
deliberately scoped out this phase, since the architecture proposal's "shared content" phase was
specifically about passage/DI/image/map *groups*, not individual question images;
`db/questionGroups.ts` was written without a `getQuestionMedia(questionId)` helper for exactly
this reason (not dead code left lying around). Bulk-import and bookmarks remain scoped out for
groups/media, unchanged from every prior phase's same disclosed trim.

**Housekeeping, per explicit user instruction to stop everything once verification was
complete:** the dev backend, Metro, and the temporary admin token were all stopped/revoked before
ending the session — unlike prior sessions' convention, nothing was left running for reuse this
time. The three `[P3-VERIFY]` questions and their group are deliberately left in the real
database (same precedent as every prior phase's tagged test content).

**Next:** P4 (per the original phase plan) — not yet started, no fresh sign-off obtained this
session for it.

## P4 — descriptive (schema/evaluator only, no student UI)

**Done (2026-09-06).** User instruction: "To start Phase P4" — direct authorization to proceed
under the same standing directive every phase of this task has run under, plus the phase's own
already-narrow, already-signed-off scope: "Schema plus `ManualEvaluator` plus `PENDING_REVIEW`
only; no student UI" (this file's own Implementation phases section), with "Descriptive question
UI and human evaluation workflow" explicitly listed under Out of scope.

**Read that scope literally and built exactly that, nothing more.** `SHORT_ANSWER`/`LONG_ANSWER`
already existed as `question_types` rows since V25 (`evaluator_family = 'MANUAL'`,
`is_authoring_enabled = false`), and the response-model columns (`response`/`outcome`/
`score_fraction`/`question_type`) already exist on both result tables since V26, and `outcome` is
a plain `VARCHAR(20)` with no CHECK constraint — so **no new migration was needed at all**, and
`EvaluationOutcome.PENDING_REVIEW` already existed in the Java enum (added in P1, forward-looking,
unused until now). What P4 actually added: a `ManualEvaluator` (Java) implementing the shared
`QuestionEvaluator` interface — `response` is `{"enteredText": string | null}`, the same shape
`TextAnswerEvaluator` uses; a blank/null/missing entry evaluates to `UNATTEMPTED` (matching every
other evaluator's identical rule), and any real attempt evaluates to `PENDING_REVIEW` with a
placeholder `scoreFraction` of `0.0` — deliberately never `CORRECT`/`INCORRECT`, since a
descriptive answer can't be resolved by comparison, only by a human reader this phase does not
build. Registered in `QuestionEvaluators.java` for both `SHORT_ANSWER` and `LONG_ANSWER` (one
shared instance, the same "two types, one evaluator" pattern `ASSERTION_REASON`/
`STATEMENT_COMBINATION` already established for `SingleChoiceEvaluator`). Mirrored exactly in
`mobile/src/evaluation/questionEvaluator.ts` as `manualEvaluator`, wired into
`questionEvaluatorFor`'s switch for both type codes.

**Deliberately NOT done, matching the phase's own explicit scope:** `is_authoring_enabled` stays
`false` for both types — an admin cannot create a `SHORT_ANSWER`/`LONG_ANSWER` question through
the real API today, so `ManualEvaluator`/`manualEvaluator` are unreachable from any live codepath,
exactly like P1's `SingleChoiceEvaluator` was for the brief window before Wave A shipped. No
change to `QuestionForm.jsx` (no admin authoring UI), no mobile renderer, no review/grading
workflow or screen, no `api/QUESTIONS.md` change (the wire contract — `GET /api/question-types`'s
response shape, `QuestionResponse`'s fields — is completely unchanged; the doc's existing "9 of
11 seeded types" line stays accurate).

**Verified.** New fixture cases in `sample-data/question-evaluator-fixtures.json`
(`manual-entry-is-pending-review`, `manual-blank-entry-is-unattempted`,
`manual-null-entry-is-unattempted`, `manual-missing-response-object-is-unattempted`) — tagged
`LONG_ANSWER` only, since `SHORT_ANSWER` shares the exact same evaluator instance and needs no
cases of its own (the file's own comment states this explicitly, mirroring the
`ASSERTION_REASON`/`STATEMENT_COMBINATION` precedent above it). `QuestionEvaluatorsTest` (a plain
JUnit test with no Spring context — the same reasoning `TopicHealthScoringTest` already
established: an evaluator takes plain maps and returns a result, so booting Spring buys nothing)
re-ran clean: **1/1, all fixture cases including the four new ones pass**, confirmed via the
surefire report directly. Its own class-doc comment was stale (still described "P2 Wave A" as the
current state, missing Wave B and now P4) — fixed in place per `AI_RULES.md` §6, not left for a
future session to rediscover. `mvn -f backend/pom.xml compile` clean. Mobile `npx tsc --noEmit`
clean; `npx expo lint` — exactly the pre-existing 9-problem baseline (8 errors, 1 warning), no new
violations from the evaluator-mirror addition.

**[RESOLVED, later the same day] Full `mvn test` regression run completed clean once memory
pressure eased.** Re-run after the unrelated VS Code/Gradle/Kotlin memory pressure noted above
had cleared on its own (3.1GB free, up from 0.76GB): **198 tests across 28 classes, 0 failures,
0 errors**, confirmed by aggregating every surefire report directly, not by trusting the process
exit code alone. `LiveQuestionsTest` specifically re-ran 7/7 clean, confirming the fixture cleanup
from the P3 session held. No on-device/emulator pass either — correctly so, not an oversight:
this phase adds no renderer, no authoring path, and nothing new can be created to render, matching
P1's own precedent ("nothing new is authorable yet... there is genuinely nothing new on a screen
for an emulator to show").

**Next:** this closes every phase in the original P0–P4 plan. Whichever future work follows
(unlocking descriptive authoring + a real review workflow, or a different phase entirely) needs
its own fresh scoping and sign-off — nothing here should be read as already approved for it.
