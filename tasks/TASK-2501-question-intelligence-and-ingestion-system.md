
# TASK-2501 — Question Intelligence & Question Ingestion System

**Status:** Architecture proposal — awaiting human sign-off (`AI_RULES.md` §5 step 2).
**No code, migration, or config has been changed. No new dependency has been added.**
**Design only.** Per the brief this responds to, no SQL, no entities, no endpoints are
written here — this is what a later `TASK-26xx` implementation plan would be built from.

---

## The single most important finding, before anything else

**This codebase already has most of the "Question DNA" scaffolding the brief asks for —
under different names, shipped across TICKET-2104/2109 (V13) and TASK-2301 (V25–V29) —
and conflates exactly one thing the brief warns against: Canonical Question with Question
Occurrence.** Concretely, verified by reading the code, not assumed:

| Brief's concept (§) | Already exists as | Status |
|---|---|---|
| Question type / structural flexibility (§12) | `question_types` (11 codes, `evaluator_family`: OPTION_SET/NUMERIC/TEXT/MAPPING/SEQUENCE/MANUAL) + `QuestionTypeCode` Java enum + a working 8-class `evaluation/` package (Java, mirrored in TypeScript) | **~90% built.** MANUAL family (`SHORT_ANSWER`/`LONG_ANSWER`) already returns `PENDING_REVIEW` — i.e. this codebase already has a human-grading placeholder state, unprompted by this brief. |
| Shared content / passages / DI / images (§32.4 groups) | `question_groups` + `question_group_translations` + `question_media` (V29), group-atomic Mock Test assembly, per-language passage text | **Built.** |
| PYQ provenance (§4.A) | `questions.is_pyq/pyq_year/pyq_shift/source_paper_id/question_number/source_url` (V13) | **Built, but see the gap below.** |
| Exact/near duplicate detection (§11) | `content_fingerprint` (normalised-text MD5) + `question_duplicates` (directional pair, `similarity_percent`, `detection_method`, never deletes, admin `resolution`) (V13, TICKET-2109) | **Built for exact/near-exact. No semantic layer, no merge action.** |
| Answer verification / confidence-gated review (§14–15) | `EvaluationOutcome` already has `PENDING_REVIEW`/`UNATTEMPTED` states; `ManualEvaluator`'s own doc comment explicitly defers "a real human review workflow" | **State shape exists; workflow doesn't.** |
| Controlled taxonomy pattern (parent/child, versioned) | `topics.parent_id` (self-referencing, arbitrary depth) + `topic_trend`/`topic_priority` (both `algorithm_version`-keyed, `inputs JSONB` for auditability, three-column system/override/final precedent) | **The exact shape §38 asks for already exists — for topics, not question patterns.** |
| Content-readiness workflow (§17/§30, "staging → review → production") | `ContentStatus` (`DRAFT`/`REVIEW`/`PUBLISHED`) + `Role.REVIEWER`, already shipped for Exam Guide (V18) | **Built for a different entity. Reusable, not rebuildable.** |
| Document/notice acquisition pipeline (§20 bulk import, ingestion generally) | **`TASK-2401-exam-guidance-data-platform.md`** — a full, not-yet-built design for source registry → discovery → `DocumentStore` (Cloudinary raw, sha256 dedup) → PDFBox extraction → rule engine → AI-assistant interface (no-op default) → admin review queue → apply into existing tables | **A sibling design, same shape this brief asks for, already written for a different data type (recruitment-cycle facts, not question content). Reuse its infrastructure, don't re-derive it.** |

**The one real gap, found by reading the schema, not assumed:** `questions.pyq_year`,
`pyq_shift`, `source_paper_id`, `question_number`, `source_url` are all **singular columns
on `questions` itself** — one occurrence per question, forever. If the identical
real-world question appeared in SSC CGL 2021 Tier 1 Shift 2 *and* SSC CHSL 2022, the only
way to represent that today is **two separate `questions` rows**, each fully duplicating
text/options/translations/`answer_key`. TICKET-2109's own fingerprinting will then
(correctly) flag that pair in `question_duplicates` — but `resolution` is a binary
`DUPLICATE`/`NOT_DUPLICATE` with **no merge action**, so the two rows just sit there,
confirmed-duplicate, forever independent. **The dedup system that exists can detect
exactly the scenario this brief's §7 describes, but has nothing correct to do about it.**
This is the one piece of new schema this design actually needs — see §E below — and
everything else is extension of what's already shipped.

---

## A. Executive Summary

Build a **question ingestion and intelligence layer in front of the existing question
model**, not a new question model. The existing `questions`/`question_translations`/
`question_types`/`question_groups`/`question_duplicates` schema (V13, V25–V29) already
carries most of what the brief calls "Question DNA" — type, shared content, PYQ tags,
fingerprint-based dedup. What's missing is (1) a way for one real-world question to have
**more than one exam occurrence** without duplicating the row, (2) a **controlled,
versioned pattern taxonomy** (the same shape `topics.parent_id` + `topic_trend` already
prove out, applied to patterns instead of topics), (3) a **document-to-candidate pipeline**
that turns a PDF into staged, cited, confidence-scored question candidates for admin
review — built as a sibling to, and sharing infrastructure with, the already-designed
`TASK-2401` exam-guidance ingestion pipeline — and (4) a small set of new, deliberately
**AI-provider-independent, versioned, additive** columns/tables carrying the deeper
classification (knowledge type, cognitive demand, distractor strategy, multi-dimensional
difficulty) that nothing in this codebase computes today.

Every new table is additive; every existing row keeps working unchanged; every new
capability follows a pattern this codebase has already proven at least once (versioned
algorithm outputs, JSONB skeletons, synthetic vs. composite keys, admin-token-gated HTTP
triggers instead of `@Scheduled`, Cloudinary for anything that must survive Cloud Run's
ephemeral, scale-to-zero disk).

## B. Product Goal

Today, all ~37,900 questions were either hand-typed or generated by a load-test script
(`reports/12-load-test-data-seeding/`) — there is no path from "a real PYQ paper PDF" to
"a well-classified, cited, deduplicated, difficulty-scored question in the bank" that
doesn't route entirely through an admin typing every field by hand. This task's goal is
to build that path — deterministic extraction first, AI only where rules can't reach,
a human as the final gate for anything that matters — while making every question, new or
old, carry enough structured intelligence to power the analytics and personalization this
project's Epic L (topic trend/priority) and Weakness Radar already started.

## C. Final Architecture

```
                    ┌─────────────────────────────────────────────┐
                    │   SOURCE DOCUMENT (PYQ paper PDF, reference   │
                    │   material PDF, admin-authored, AI-generated) │
                    └───────────────────┬───────────────────────────┘
                                        │
                    ┌───────────────────▼───────────────────────────┐
                    │  SHARED INGESTION CORE  (new backend package,   │
                    │  shared with TASK-2401's exam-guidance pipeline)│
                    │  DocumentStore (Cloudinary raw, sha256 dedup)   │
                    │  PdfTextExtractor (PDFBox) · SSRF-hardened fetch│
                    └───────────────────┬───────────────────────────┘
                                        │  question_raw_extractions (immutable, versioned)
                    ┌───────────────────▼───────────────────────────┐
                    │  QUESTION-SPECIFIC EXTRACTION                   │
                    │  Pass 1 Rule-based question/option/answer split │
                    │  Pass 2 AI classification (DNA + pattern +       │
                    │         difficulty), single call, JSON schema    │
                    │  Pass 3 Independent AI re-check — ONLY when      │
                    │         Pass 2 confidence is LOW or a rule       │
                    │         disagrees (cost control, §25)            │
                    └───────────────────┬───────────────────────────┘
                                        │  question_candidates (staged, cited, versioned)
                    ┌───────────────────▼───────────────────────────┐
                    │  DETERMINISTIC VALIDATION                       │
                    │  structural → content → logical → duplicate      │
                    │  (reuses content_fingerprint + question_duplicates│
                    │   + a new semantic-embedding pass)               │
                    └───────────────────┬───────────────────────────┘
                                        │
                    ┌───────────────────▼───────────────────────────┐
                    │  ADMIN REVIEW QUEUE (new admin page, exception-  │
                    │  first: only low-confidence/flagged candidates   │
                    │  need a click; HIGH-confidence, no-warning ones   │
                    │  can bulk-accept)                                │
                    └───────────────────┬───────────────────────────┘
                                        │  Accept → calls the EXISTING
                                        │  QuestionService.create()/bulkImport()
                    ┌───────────────────▼───────────────────────────┐
                    │  PRODUCTION `questions` row, content_status=DRAFT│
                    │  (new column, reusing Exam Guide's ContentStatus)│
                    │  → existing submit-for-review/publish workflow   │
                    │  → existing mobile sync, exactly as today        │
                    └───────────────────┬───────────────────────────┘
                                        │
                    ┌───────────────────▼───────────────────────────┐
                    │  POST-PUBLISH INTELLIGENCE (batch, not per-row): │
                    │  question_patterns assignment, question_dna,     │
                    │  question_difficulty, semantic-relationship scan │
                    │  — feeds Epic L trend/priority + Weakness Radar   │
                    └───────────────────────────────────────────────┘
```

**Critical deviation from the brief's own pipeline (§3), stated and justified rather than
silently followed:** the brief's flow puts duplicate/pattern/quality analysis *before*
staging, all per-question, synchronously. This design splits it into (a) a **synchronous,
per-candidate** minimum needed for a human to make an Accept/Reject decision (structural +
content + logical validation, exact/near duplicate check, a first-pass DNA/pattern/
difficulty classification) and (b) an **asynchronous, batched, post-publish** pass for
everything that benefits from seeing the *whole* bank at once (semantic duplicate
clustering, pattern-trend analysis, cross-question relationship mining) — mirroring how
Epic L's own `topic_trend`/`topic_priority` are already computed as a batch job over
published content, not synchronously per question at authoring time. Forcing all of §3's
steps synchronously per question would mean a candidate's review-readiness depends on a
whole-bank semantic scan finishing first, which doesn't scale and isn't how this
codebase's own precedent (Epic L) already does it.

## D. Data Lifecycle

One question's journey, using the states this design actually introduces (kept
deliberately separate from the two content-state machines that already exist in this
codebase — see the callout after the diagram):

```
RAW_EXTRACTED → RULE_NORMALIZED → AI_ENRICHED → VALIDATED → NEEDS_REVIEW
   → ACCEPTED (becomes a real `questions` row, content_status = DRAFT)
   → [existing] submit-for-review → PUBLISHED → [existing] student-visible, synced
   → (batch, ongoing) pattern/DNA/difficulty refined as classifiers version up
   → DEPRECATED (soft-deleted the existing way — is_deleted tombstone — if superseded)
```

or, on rejection: `NEEDS_REVIEW → REJECTED` (kept, never deleted, for audit — same
`is_deleted`-vs-`removed_at`-style "never destroy" precedent `ingestion_notices` already
uses in TASK-2401).

**Three state machines, three different questions, deliberately not merged, matching how
`ContentStatus` and `EvaluationOutcome` already coexist without merging in this codebase:**

| State machine | Answers | Owner entity | Status |
|---|---|---|---|
| `EvaluationOutcome` (existing) | "Did a student answer this correctly?" | A response row | Existing, untouched |
| `ContentStatus` (existing, Exam Guide) | "Is this fact ready for students to see?" | `recruitment_cycles` today | **Reused as-is, extended to `questions`** (new nullable column, default `PUBLISHED` for every existing row — see §Q) |
| `CandidateStatus` (new, this task) | "Where is this *prospective* question in the pipeline?" | `question_candidates` (new, pipeline-internal, never seen by a student) | New |

## E. Source & Provenance Model

**Canonical Question vs. Question Occurrence — the one real schema gap.** `questions`
stays the canonical entity (no rename, no ID change — every existing FK, sync row,
evaluator call, and group attachment keeps pointing at `questions.id` unchanged). A new
child entity, **`question_occurrences`**, holds what today lives directly on `questions`:
exam code, recruitment cycle/year, stage or paper reference, shift, question number within
the source, source URL, and — new — the **literal, unedited text as it appeared in that
source** (distinct from `question_translations.question_text`, which is the *normalized,
possibly since-corrected* production text; keeping the verbatim original per occurrence is
what makes "raw is immutable" (§F) actually mean something at the occurrence level, not
just at the document level).

| | Today (V13) | Proposed |
|---|---|---|
| Cardinality | One question ↔ at most one occurrence (columns on `questions`) | One question ↔ many occurrences (child rows) |
| Same question in 2 exams | Two duplicate `questions` rows, flagged by `question_duplicates`, stuck | One canonical `questions` row, two `question_occurrences` rows |
| `is_pyq` | Stored boolean on `questions` | **Kept, unchanged** — becomes "at least one occurrence exists," recomputed on occurrence insert. Same "store what's expensive to derive on the hot path" reasoning V13's own comment already gives for why it's a column and not a derived query. |
| Identity | Implicit (the question row itself) | `question_occurrences.id` is a plain UUID (per ADR-005: no derived composite key), with a partial `UNIQUE(source_document_id, page_number, question_number_in_source)` for occurrences that came from an extracted document — the idempotency check that makes re-running extraction on the same PDF a no-op, not a duplicate flood. |

**Migration path (additive, zero behavior change):** every existing question's current
`pyq_year`/`pyq_shift`/`source_paper_id`/`question_number`/`source_url` values become
exactly one `question_occurrences` row, generated once. The old columns are marked
deprecated but **not dropped in the same phase** — every reader (the mobile quiz screen's
"Asked in 2023 · Shift 2" badge, the admin PYQ fields, Epic L's `topic_trend` computation)
migrates to read occurrences first; only then does a later cleanup phase drop the columns,
the same two-step discipline this codebase already uses for every other non-trivial
column removal.

**What happens to `question_duplicates` once occurrences exist:** its role sharpens rather
than changes. When an admin resolves a pair as `DUPLICATE` (§K), the action is now a real
**merge**, not just a label: every `question_occurrences` row on the losing `questions.id`
is re-parented onto the surviving canonical id, and the losing row is soft-deleted
(`is_deleted = true`) through the **existing** tombstone-sync mechanism — no new deletion
machinery. `resolution` gains no new values; the merge is simply what `DUPLICATE` now
*does*, where before it only recorded a verdict.

**Occurrence vs. canonical, answered directly (brief's §6/§7):**
1. **A question occurrence** is identified by its source: exam + cycle/year + stage-or-
   paper + shift + source document + page + question number. Deterministic, not derived
   from content.
2. **The underlying conceptual question** is identified by `questions.id` — a plain UUID,
   unrelated to any occurrence descriptor, matching ADR-005's precedent of never deriving
   a PK from a business key.
3. **Duplicates** are handled by the existing fingerprint + new semantic layer (§K)
   feeding the existing `question_duplicates` table, resolved by an admin merge that now
   produces multiple occurrences under one canonical id instead of two independent rows.
4. **The same question in different exams** is exactly the occurrence model above — one
   canonical row, N occurrence rows, one per real-world appearance.

## F. Raw Dataset Design

**Immutability, but not as local files.** ADR-011 already establishes that Cloud Run's
disk is ephemeral and scales to zero — the dead `/downloads` folder (ADR-006, superseded)
is a confirmed, already-lived failure mode for "store something on local disk and expect
it to persist." A brief-literal `/raw/SSC/CGL/2024/Tier-1/Shift-1/raw.json` folder tree
would silently lose data on every cold start in production, and has no admin-queryable
review surface (defeating §18 entirely). This design keeps the *principle* — raw data is
never overwritten — but implements it in the two places this project already trusts for
durable storage:

- **Raw source bytes** (the PDF itself): Cloudinary, `resource_type: raw`, keyed by
  `sha256`, **exactly** `TASK-2401`'s `ingestion_documents` design — reused, not
  reinvented, if that task ships; built once, shared, if this task ships first.
- **Raw extraction output** (the per-question record straight off the PDF, before any
  enrichment): a new table, **`question_raw_extractions`** — one row per (source document,
  extraction pass, position-in-document), **never `UPDATE`d**. Re-running the extractor
  with a new `extractor_version` inserts new rows; old ones are untouched, exactly
  answering the brief's "Raw Dataset → Processor V1 → Processed V1 / Processor V2 →
  Processed V2" requirement without ever needing a second copy of the PDF or a filesystem.

**A local, git-ignored scratch workspace is still useful — for humans/agents, not as the
system of record.** When a session is actively working through a fresh batch of PDFs
before anything is meant to touch the database at all (e.g. an AI agent downloading a
paper and eyeballing a draft extraction), a `question-ingestion/` scratch folder,
mirroring `scripts/load-test-seed-manifest.json`'s existing precedent of a tracked
manifest for generated content, is a reasonable interactive convenience. It is **never**
authoritative once a batch is meant to become real content — the authoritative path is
always `question_raw_extractions` → `question_candidates` → `questions`.

## G. Processing Pipeline

| Pass | What | AI? | Combined with |
|---|---|---|---|
| 1. Section/question/option split | Regex/heuristic split of extracted text into question stems, options, and an answer-key section if present | No | — |
| 2. Classification | Knowledge type, cognitive demand, mechanism, distractor tags, pattern (constrained to the controlled taxonomy — see §I), a first-pass difficulty estimate | Yes, **one call**, structured-output/JSON-schema response | DNA + pattern + difficulty in one request — see rationale below |
| 3. Answer verification (conditional) | Independent second opinion, **only when** Pass 2's own confidence is LOW or the rule-based answer-key parse disagrees with the AI's read | Yes, only when triggered | — |
| 4. Duplicate/relationship scan | Exact fingerprint (existing) + near-duplicate edit-distance + semantic embedding similarity | Embeddings only, batched | Runs against the **whole bank**, not per-candidate — see §C's deviation note |
| 5. Final validation gate | Deterministic checks: answer key resolves against option count, numeric tolerance is sane, sequence/mapping keys are internally consistent | No | — |

**Why passes 2 (classification+pattern+difficulty) are one call, not three or four:**
they're all read from the same input (the question+options+context) and none needs the
others' *output* as input — unlike answer verification, which specifically needs to be
independent to be worth anything (§14). Combining them into one structured response cuts
3-4 model calls to 1 for the overwhelming majority of candidates (those whose confidence
comes back HIGH and never trigger Pass 3), which is exactly the brief's own §24 "optimize
for cost" instruction resolved concretely rather than left as a slogan.

## H. Question Intelligence Model ("Question DNA")

**What already exists and is reused as-is:** `topic_id` (academic classification, via the
existing `topics.parent_id` chain — Subject → Topic → Sub-topic → Concept is already
expressible today as a chain of `topics` rows at increasing depth, per V12's own comment
that depth "genuinely varies by subject." **No new hierarchy table is needed for §8's
"academic classification" — the deepest `topics` node a question is tagged to already is
the concept.** `question_type`/`content_structure` (structural classification, existing).
`is_pyq` + the new `question_occurrences` (§E, provenance).

**What's new, and where it lives** — versioned exactly like `topic_trend`/`topic_priority`
already are (one row per question per `algorithm_version`, `inputs JSONB` for
auditability), **not** columns on `questions` itself, so re-classification never locks the
hottest read table in the system and old classifications stay inspectable after a
classifier changes:

| New table | Purpose | Key fields |
|---|---|---|
| `question_intelligence` | Knowledge type, cognitive demand, mechanism, answer mechanism, distractor tags (array aligned to option position — language-independent, so it lives here and not in per-language `question_translations`), a derived quality score | `knowledge_type`, `cognitive_demand`, `mechanism`, `answer_mechanism`, `distractor_tags JSONB`, `quality_score`, `algorithm_version`, `confidence_overall`, `inputs JSONB` |
| `question_difficulty` | Multi-dimensional difficulty factors, plus one derived overall score | `concept_complexity`, `memory_load`, `reasoning_load`, `calculation_complexity`, `step_count`, `distractor_similarity`, `ambiguity_score`, `system_difficulty`, `algorithm_version`, `confidence`, `inputs JSONB` |

**Cognitive demand taxonomy: a trimmed Bloom's, not a bespoke one.** Recall → Understand
→ Apply → Analyze → Evaluate. Chosen because it's a well-known, well-documented standard
(easier for a classifier to be consistently prompted against, easier for a future human
reviewer to sanity-check) rather than inventing new labels nobody outside this project
would recognize — the exact trap §38 warns against, just at the cognitive-demand layer
instead of the pattern layer.

**Difficulty: existing `questions.difficulty` (the simple admin-facing label) is kept,
unchanged, as the field every existing screen/scoring path already reads.**
`question_difficulty.system_difficulty` is a *derived suggestion*, surfaced to the admin
exactly the way `topic_priority`'s `system_priority`/`admin_override`/`final_priority`
three-column precedent already works: the admin can accept the suggestion (which updates
the simple label) or leave it — the simple label is never silently overwritten by a batch
job, matching §27's "source of truth" requirement and reusing a pattern this codebase has
already built and tested once.

**Distractor strategy** lives as a `distractor_tags` array inside `question_intelligence`,
index-aligned to option position (e.g. `["SIMILAR_DATE", "PARTIALLY_CORRECT", null,
"EXTREME_OPTION"]`) — a controlled vocabulary (similar concept / similar date / similar
person / common misconception / partially correct / numerical trap / unit-conversion trap
/ extreme option / none-of-the-above trap), not free text, for the same reason patterns
need a controlled taxonomy (§I).

## I. Question Pattern Model

**Reuses the exact shape `topics.parent_id` + `topic_trend` already prove out for a
different taxonomy — a controlled, versioned, self-referencing hierarchy, not free-text AI
labels.** New table **`question_patterns`**: `id`, `parent_id` (self-referencing, same
"depth varies, don't force a fixed ladder" reasoning V12 already used for topics),
`family`/`type`/`subtype` expressed as depth in the same chain (Family: "Government Acts"
→ Type: "Act-to-Feature Association" → Subtype: "Direct Recall with Similar-Act
Distractors" — the brief's own §9 example, expressed as three `question_patterns` rows at
increasing depth rather than three separate columns), `label`, `definition`,
`example_question_id` (nullable, points at a real question once one is tagged, so a
reviewer can see a concrete instance rather than only a definition).

`questions` gains `pattern_id` (nullable FK) + a versioned assignment record living in
`question_intelligence` (§H) — `pattern_id`, `pattern_confidence`, `algorithm_version` —
same reasoning as `topic_priority.override_reason`: **an admin can retag a question's
pattern directly**, and that correction is what future classifier passes should be
evaluated against (§41's "AI corrected?" metric), the same way a topic-priority override
already works.

**AI is never allowed to invent a new pattern row on its own.** Classification (Pass 2,
§G) is given the current `question_patterns` list (paged/filtered to the question's
subject, to keep the prompt small — §W) and must pick an existing node or flag
`NO_MATCHING_PATTERN` — which becomes a `NEEDS_REVIEW` candidate outcome, not a silently
invented label. An admin, not the AI, creates a new `question_patterns` row when one is
genuinely needed — mirroring exactly how `question_types`/`QuestionTypeCode` already
enforce "the table can describe, only a human-reviewed code path decides what's real."

This directly answers the brief's own analytical questions (§9): "what patterns does SSC
repeatedly use," "which concepts are tested via statement-based questions," "which
patterns increased in recent years" all become a `GROUP BY pattern_id` (or a walk up
`parent_id`) over `questions ⋈ question_occurrences`, the exact same query shape
`topic_trend`'s existing computation already uses over `questions ⋈ topics`.

## J. Question Relationship Model

**Pruned hard, per the brief's own §10 instruction not to add relationships because they
sound interesting.** Of the brief's suggested list:

| Relationship | Verdict | Why |
|---|---|---|
| `semantic_duplicate_of` | **Keep** — new `detection_method` value in the existing `question_duplicates` table | Already the right table/shape; no new entity needed |
| `same_pattern_as` | **Drop as a pairwise edge** | Already expressed by two questions sharing one `pattern_id` — a pairwise row would be pure, unbounded (N² for a popular pattern) redundancy |
| `prerequisite_for` | **Drop at question granularity** | Already exists, correctly, at *concept/topic* granularity via `topic_prerequisites` (V12) — a question-level prerequisite edge would duplicate a fact the topic DAG already states more usefully |
| `appeared_again_as` | **Drop as a separate relationship** | This *is* the occurrence model (§E) — two occurrences under one canonical question, not a relationship between two rows |
| `similar_to` | **Keep, new** | Genuinely new and genuinely useful — powers "similar question" recommendations (§Z), not derivable from anything that already exists |
| `variant_of` | **Keep, new, narrow scope** | Only for AI-generated practice questions (§4 Source Type D) referencing the real question they were generated from — provenance for *synthetic* content, deliberately not built for hand-authored content in this phase |
| `contrasts_with` / generic `related_to` | **Drop for MVP** | No concrete consumer named anywhere in this brief or this project's existing analytics; speculative, per §43's own "what is unnecessary" instruction |

**New table, deliberately small:** `question_relationships` (`question_id`,
`related_question_id`, `relationship_type` — `SIMILAR_TO` | `VARIANT_OF`, `confidence`,
`algorithm_version`, `created_at`) — **AI-generated, never human-authored for MVP**
(an admin can hide/reject one, not hand-create one — there's no product need yet for a
human to manually wire up "similar questions").

## K. Duplicate Strategy

| Tier | Mechanism | Already built? | Stored where |
|---|---|---|---|
| **Exact** | `content_fingerprint` equality (normalised-text MD5) | **Yes** (V13) | `questions.content_fingerprint`, `question_duplicates` |
| **Near** | Same fingerprint infrastructure + a fuzzy comparison (edit distance) over candidates that share, e.g., the same topic and a fingerprint prefix — batched, not per-import | New logic, existing table (`detection_method = 'FUZZY_EDIT_DISTANCE'`) | `question_duplicates` |
| **Semantic** | Embedding similarity (cosine distance) over a batch job, using the AI-provider-independent embedding interface (§V) | New | `question_duplicates` (`detection_method = 'SEMANTIC_EMBEDDING_<version>'`) |
| **Pattern** | Not a duplicate at all — two genuinely different questions can share a pattern on purpose | N/A — this is `pattern_id` equality (§I), never written to `question_duplicates` | — |

**Never delete, never has (existing behavior, kept):** `question_duplicates` rows are
permanent; the only *new* behavior is that resolving a pair as `DUPLICATE` now performs the
occurrence-merge described in §E instead of only setting a flag nothing acts on.

## L. Question Types

Already ~90% built (V25 table above) — six evaluator families (`OPTION_SET`, `NUMERIC`,
`TEXT`, `MAPPING`, `SEQUENCE`, `MANUAL`) cover the 19-type list the brief separately
enumerates, exactly the collapse `TASK-2301` already found and implemented. **Nothing new
is proposed here.** What this task adds is upstream of type: the ingestion pipeline (§G)
must classify *which* of the 11 existing `question_types` a freshly-extracted question is,
which is a Pass-2 classification output (§H), not a new type-system decision.

## M. Difficulty Model

Covered in §H. Restated for the brief's own required section: the *existing* simple label
(`questions.difficulty`) stays the production-facing scoring/filtering value; the *new*
`question_difficulty` table is a versioned, multi-factor, admin-reviewable **suggestion**
feeding it, following the exact `topic_priority` system/override/final precedent — **never
overwritten in place**, always reviewable, always explainable after the formula changes
(§23's own requirement, already proven out once in this codebase).

## N. Confidence Model

**A plain three-state enum (`HIGH`/`MEDIUM`/`LOW`), never a fabricated float — same
decision `TASK-2401` already made for exam-guidance extraction confidence, for the same
reason (§21's own warning against "fake precision").** Assignment rule, mirrored from that
design: rule-based + an unambiguous match → `HIGH`; rule-based with ambiguity, or a
single AI pass with no internal disagreement → `MEDIUM`; anything from OCR'd text, or an
AI pass that itself expresses uncertainty, or one where the independent re-check (Pass 3)
disagreed with the first → `LOW`. `LOW` confidence on any of {answer key, pattern,
difficulty band} forces `NEEDS_REVIEW` regardless of every other field's confidence — a
candidate is only eligible for bulk-accept when **every** field that matters is `HIGH`.

## O. Validation Architecture

Six layers, same order the brief proposes, mapped onto what this codebase already has or
needs:

1. **Structural** — the candidate payload matches the shape of the existing
   `CreateQuestionRequest`/`UpsertTranslationRequest` DTOs exactly (reuse, don't reinvent
   a parallel schema — same decision `TASK-2401` made for its own candidate payloads).
2. **Content** — required fields present per `question_types.code` (an option-set type
   needs ≥2 options and a resolvable `correctOption`; a numeric type needs
   `correctValue`; etc.) — the same per-type checks `QuestionService.validateTranslationShape`
   already runs for hand-authored content, called from the ingestion path too rather than
   duplicated.
3. **Logical** — answer key resolves against actual option count; a MATCH's
   `correctMapping` covers every `leftKey`; an ORDERING's `correctOrder` is a real
   permutation of `itemKeys` — again, exactly `QuestionService`'s existing per-type
   validation, reused.
4. **AI validation** — Pass 3's conditional independent re-check (§G).
5. **Duplicate/semantic** — §K.
6. **Human review** — §P.

**No new validation logic is written for layers 1-3 — the ingestion pipeline calls the
same service-layer validation `QuestionService` already runs for a hand-typed question,**
so a pipeline-produced question is validated identically to an admin-typed one, the same
"indistinguishable from hand-typed" principle `TASK-2401` states explicitly for its own
domain.

## P. Review Workflow

**Exception-first, per the brief's own §41/§18 instruction not to make an admin open every
good question.** New admin page, `admin/src/pages/QuestionReview.jsx`, following the
existing one-file-per-screen convention and the same list+detail shape `TASK-2401`'s
`IngestionReview.jsx` already specifies:

```
Question Review — Batch: SSC_CGL_2024_TIER1_SHIFT1.pdf (312 candidates)

Ready to bulk-accept (289, all HIGH confidence, no warnings)   [Accept all 289]

Needs a look (23):
  Q47  "The Battle of Plassey was fought in ____"          [View source p.12]
       ⚠ pattern: NO_MATCHING_PATTERN   answer: MEDIUM confidence
       [Accept] [Edit] [Reject] [Compare to PDF]

  Q112 "Which of the following is NOT a fundamental right?"
       ⚠ possible duplicate of an existing question (94% similar)  [View both]
       [Accept as new] [Merge occurrences] [Reject]
```

Side-by-side source comparison (§18): the same PDF page image already stored via
`DocumentStore` (Cloudinary), rendered next to the extracted/AI-processed fields, so a
reviewer checks against the *actual page*, not a re-typed transcription of it.

**High-risk fields requiring mandatory review before Accept is possible, configurable per
`question_types.code`** (data, not hardcoded — same "review-strictness is data" decision
`TASK-2401` already makes): answer key, correct option/mapping/order, numeric tolerance.
Low-stakes fields (explanation text, distractor tags) can ship at `HIGH` confidence with no
click, same as `TASK-2401`'s own free-text fields.

## Q. Dataset Versioning

Two independent version axes, both already precedented in this codebase — not invented
here, extended:

- **Extractor/classifier version** (`extractor_version`, `algorithm_version` on
  `question_raw_extractions`/`question_intelligence`/`question_difficulty`): identical
  discipline to `topic_trend.algorithm_version` — a re-run with a new version produces
  *new* rows, old ones untouched and still queryable, so "why does the system think this"
  never goes stale silently.
- **Content readiness** (`content_status` on `questions`, new column, **reusing the
  existing `ContentStatus` enum** from Exam Guide, not inventing a second one): default
  `PUBLISHED` for every one of the ~37,900 existing rows (they are already live; this
  column changes nothing about them), default `DRAFT` for anything the new pipeline
  creates. **Explicit risk flagged, per a bug this exact shape already caused once**: V18's
  own migration had to remember to publish the Exam Guide demo seeder's cycles, or they'd
  have silently vanished from every public read the moment the migration ran. This
  migration must apply the identical fix at the schema level (existing rows default
  `PUBLISHED`, not `DRAFT`) rather than relying on a follow-up script to remember it.

**When a re-processing pass changes an already-published question's `question_intelligence`/
`question_difficulty`, nothing about the live `questions` row changes** unless an admin
explicitly accepts the new suggestion (§H) — reprocessing populates a new versioned
intelligence/difficulty row, it never silently rewrites production content.

## R. Staging Architecture

```
question_raw_extractions (immutable, per extractor_version)
        │
        ▼
question_candidates (the brief's "staging dataset" — one row per prospective question,
                     CandidateStatus: PENDING → ENRICHED → VALIDATED → NEEDS_REVIEW
                     → ACCEPTED / REJECTED, exactly TASK-2401's ingestion_extraction_
                     results shape, adapted to a question-shaped payload)
        │  Accept
        ▼
questions (production, content_status = DRAFT) → existing submit-for-review/publish
```

Admin dashboard summary (brief's §17 example, this system's real fields):

```
Batch: SSC_CGL_2024_TIER1_SHIFT1.pdf
  Extracted:      312
  Auto-validated: 289  (HIGH confidence, no warnings — eligible for bulk accept)
  Needs review:    18  (LOW confidence on ≥1 high-risk field)
  Possible dupes:   4  (flagged against the existing bank, not each other)
  Rejected:         1  (failed structural validation — no options found)
```

## S. Bulk Import Strategy

**The existing bulk-import path (`admin/src/validateQuestions.js` +
`QuestionService.bulkImport()`) is the exact mechanism `question_candidates` Accept already
calls into** — this task does not add a second import mechanism. What changes: the
*validator* that already exists client-side (currently exact-lowercase, within-batch-only,
warning-only — a real, pre-existing gap flagged by V13's own migration comment) is
superseded for pipeline-sourced content by the richer, whole-bank-aware validation this
task builds (§O), while staying exactly as-is for **manually pasted** bulk-import files
(out of scope for this task — a separate, smaller fix if ever prioritized).

Idempotency: `question_raw_extractions`' `UNIQUE(source_document_id, page_number,
question_number_in_source)` (§E) makes re-running extraction on the same document a no-op
at the raw layer; `question_candidates` inherits a matching uniqueness so accepting the
same batch twice can't double-import; a partial batch failure leaves earlier `ACCEPTED`
candidates as real, already-committed `questions` rows (no all-or-nothing transaction
across an entire 300-question batch — matching this codebase's existing bulk-import
behavior, which already commits per-question, not per-batch).

## T. Conceptual Database Model

No SQL. Entities only, new ones marked **NEW**, existing ones referenced by name.

| Entity | Purpose | Key attributes | Relationships | What it must NOT hold |
|---|---|---|---|---|
| `questions` (existing) | Canonical question | text via translations, `answer_key`, `question_type`, **NEW:** `content_status` | 1—N `question_occurrences` (NEW), 1—N `question_translations`, N—1 `question_patterns` (NEW), 1—1(ish) `question_intelligence`/`question_difficulty` per version | Occurrence-specific facts (moved to `question_occurrences`) |
| **`question_occurrences`** NEW | One real-world appearance of a canonical question | exam code, cycle/year, stage/paper, shift, page, question number, source URL, verbatim original text | N—1 `questions`, N—1 source document | Anything about the question's *content* — only about where/when it appeared |
| **`question_raw_extractions`** NEW | Immutable raw extraction output, pre-enrichment | raw text, options, raw answer if present, `extractor_version`, source document + page | N—1 source document | Anything AI-classified — that's `question_candidates`' job |
| **`question_candidates`** NEW | The staged, reviewable prospective question | full payload shaped like `CreateQuestionRequest`, `CandidateStatus`, confidence per field, validation warnings, dupe/similar links | N—1 `question_raw_extractions`, becomes 0—1 `questions` on Accept | Nothing once Accepted — becomes a real row, doesn't keep living in parallel |
| **`question_patterns`** NEW | Controlled, versioned pattern taxonomy | `parent_id` (self-ref), label, definition, example question | Self-referencing; `questions.pattern_id` FK | Free-text AI labels — enforced by "AI can only pick, never invent" (§I) |
| **`question_intelligence`** NEW | Versioned DNA classification | knowledge type, cognitive demand, mechanism, distractor tags, quality score, pattern assignment + confidence | N—1 `questions`, one row per `algorithm_version` | Difficulty (separate table — different lifecycle, different reviewer) |
| **`question_difficulty`** NEW | Versioned multi-factor difficulty | the 6 factors + `system_difficulty`, `algorithm_version` | N—1 `questions` | The production-facing simple label (stays on `questions.difficulty`) |
| **`question_relationships`** NEW | `SIMILAR_TO` / `VARIANT_OF` only | `related_question_id`, `relationship_type`, confidence | N—N `questions` | Everything pruned in §J |
| `question_duplicates` (existing) | Confirmed/candidate duplicate pairs | unchanged, +1 new `detection_method` value | N—N `questions` | — |
| `question_types`/`QuestionTypeCode` (existing) | Renderable type registry | unchanged | — | — |
| `question_groups`/`question_media` (existing) | Shared passages/DI/media | unchanged | — | — |
| *(shared with TASK-2401)* `ingestion_documents`-equivalent | Immutable source PDF storage | sha256, Cloudinary URL | 1—N `question_raw_extractions` | — |

## U. Taxonomy Architecture

**Subject/Topic/Concept: no new taxonomy — reuse `topics.parent_id` as-is (§H).**
**Question Pattern: a new, separate, controlled taxonomy (§I), same shape, own table** —
kept separate from `topics` because a pattern is a fact about *how* a question tests
something, orthogonal to *what* subject it's in (the same pattern family, "similar-act
distractors," can recur across History, Polity, and Economy). Both are AI-mappable, both
forbid AI from inventing new leaf nodes unreviewed, both are versioned. **This is one
taxonomy pattern, applied twice** — worth stating plainly rather than re-deriving it as two
unrelated designs.

## V. AI Architecture

**Model-independent, same interface-plus-no-op-default shape `TASK-2401` already commits
to for its own AI layer, for the same reason (no LLM provider or budget is decided
anywhere in this project — `reports/open-questions.md`):**

```
interface QuestionEnrichmentAssistant {
    classify(questionText, options, context) -> DnaAndPatternAndDifficultyCandidate
    reverify(questionText, options, priorAnswer) -> AnswerVerificationCandidate   // Pass 3 only
}
interface SemanticSimilarity {
    embed(questionText) -> vector   // batched, cached by content_fingerprint
}
```

Ships with a `NoopQuestionEnrichmentAssistant` (always `NEEDS_REVIEW`, zero AI available) —
the pipeline is fully functional, just fully manual-review, with no AI configured at all,
matching the brief's own §17 requirement and this project's existing precedent exactly.

**Staged passes are a property of the orchestration layer calling this interface, not the
interface itself** — swapping Claude for another provider later changes nothing about
`§G`'s pass structure.

## W. AI Cost Optimization

- **One call for Pass 2**, not four (§G) — the single biggest cost lever.
- **Pass 3 only fires on disagreement/low confidence** — most candidates never trigger it.
- **Cache by `content_fingerprint`**: an already-classified question (e.g. a near-duplicate
  of one already in the bank) never gets re-sent to AI — the candidate inherits the
  existing question's classification as a starting suggestion instead, confirmed rather
  than reasked.
- **Pattern list scoped to subject** in the Pass-2 prompt (§I) — a smaller, relevant
  taxonomy slice per call rather than the whole controlled vocabulary every time.
- **Semantic embeddings computed once per question, stored, reused** across every future
  duplicate/similarity scan — never re-embedded unless the model version changes.
- **Batch, don't stream, whole-bank passes** (§C's deviation) — one nightly/on-demand job
  over unclassified/reclassify-needed rows, not a call per question the instant it's
  authored.

## X. Failure Handling

| Failure | Detection | Recovery |
|---|---|---|
| PDF extraction fails/OCR garbage | `question_raw_extractions` row flagged `is_text_extractable = false` | Routed straight to manual review — never guessed at, same discipline `TASK-2401` already commits to |
| AI unavailable/malformed response | `NoopQuestionEnrichmentAssistant` or a real provider's own error | That candidate's classification fields are simply `NEEDS_REVIEW`; the rest of the batch proceeds |
| Two answers appear valid / ambiguous question | Pass 3 disagreement | `LOW` confidence, forced `NEEDS_REVIEW`, both readings shown to the reviewer |
| Duplicate detected mid-batch | `question_duplicates` candidate row | Reviewer choice: accept as new, or merge occurrences (§E) — never auto-resolved |
| Import fails halfway through a batch | Per-question commit (existing bulk-import behavior) | Earlier accepted questions stay real rows; failed ones stay `NEEDS_REVIEW`/flagged, re-triable independently |
| Taxonomy/pattern changes after questions are tagged | `algorithm_version` on `question_intelligence` | Old rows stay queryable under their original version; nothing is silently reinterpreted |

## Y. Data Governance

- Only `ADMIN`/`REVIEWER` roles (existing) can Accept/Reject/publish — no new role needed.
- **AI can never directly publish.** Every path from `question_candidates` to `questions`
  passes through an Accept action, logged with `reviewed_by`/`reviewed_at`, mirroring
  `TASK-2401`'s identical rule for exam-guidance facts.
- Rejected candidates are retained (never deleted) — an audit trail of what was extracted
  and why it didn't ship.
- An admin can always override AI output at any layer (pattern, DNA, difficulty) — every
  override is the *authoritative* value going forward (§27), same precedent as
  `topic_priority.admin_override`.
- Approved/published questions can still be soft-deleted through the existing mechanism;
  nothing here adds a new hard-delete path anywhere.

## Z. Future Analytics

Everything the brief's §31 asks for becomes a straightforward query once this ships,
because it reuses tables Epic L's `topic_trend`/`topic_priority` already read from:

- **Exam trends** — `questions ⋈ question_occurrences ⋈ question_patterns`, grouped by
  year/pattern/topic — the same shape `topic_trend`'s existing computation already uses,
  extended with pattern as a second grouping key.
- **Topic intelligence** — unchanged, Epic L already does this; this task adds pattern and
  DNA as additional dimensions it can now group by.
- **Student intelligence** (weak concepts/patterns/types) — joins the existing
  per-response `question_type` (already captured, TASK-2301) with the new `pattern_id`,
  giving "weak at statement-based questions in Modern History" instead of only "weak at
  Modern History."
- **Recommendation** — `question_relationships` (`SIMILAR_TO`) is the direct data source
  for "show a similar question," something no existing table can answer today.

## AA. Example Question Walkthrough

A hypothetical SSC CGL 2024 Tier 1 question, "Which Act introduced the Diarchy system in
Indian provinces?":

```
1. RAW EXTRACTION
   question_raw_extractions: { text: "Which Act introduced the Diarchy
     system in Indian provinces?", options: ["Government of India Act 1919",
     "Indian Councils Act 1909", "Government of India Act 1935",
     "Charter Act 1833"], source_document_id: <ssc_cgl_2024_t1_s1>,
     page: 12, position: 82, extractor_version: "v1" }

2. RULE-BASED NORMALIZATION (Pass 1)
   candidate.contentStructure = { optionCount: 4 }   // question_types = SINGLE_CHOICE
   candidate.answerKey = null   // no answer key found on this page — common for a
                                  question-only paper; answer comes from a separate
                                  answer-key document, matched by question_number

3. AI ENRICHMENT (Pass 2, one call)
   question_intelligence: { knowledge_type: "FACTUAL", cognitive_demand: "RECALL",
     mechanism: "DIRECT_RECALL", distractor_tags: ["SIMILAR_ACT", null,
     "SIMILAR_ACT", "SIMILAR_ACT"], pattern_id: <Government-Acts →
     Act-to-Feature-Association → Direct-Recall-Similar-Act-Distractors>,
     pattern_confidence: "HIGH", quality_score: 0.91 }
   question_difficulty: { concept_complexity: 2, memory_load: 4,
     reasoning_load: 1, system_difficulty: "MEDIUM", confidence: "HIGH" }
   answer verification: matched against a separately-ingested answer-key
     document for the same paper → "Government of India Act 1919" → HIGH confidence

4. DUPLICATE/SEMANTIC CHECK
   content_fingerprint computed; no exact match. Semantic scan (batched,
   later) finds a 91%-similar existing question from SSC CHSL 2019 asking the
   same fact with reworded options → question_duplicates row, SEMANTIC_EMBEDDING,
   similarity_percent 91 — flagged for review, not auto-merged

5. VALIDATION
   Structural/content/logical: pass. Answer resolves to option index 0. No warnings.

6. ADMIN REVIEW
   HIGH confidence everywhere except the flagged possible-duplicate → surfaces
   in "Needs a look," reviewer compares both, confirms genuinely the same
   question asked twice → chooses "Merge occurrences": the SSC CHSL 2019
   occurrence is re-parented onto this canonical question; the CHSL row is
   soft-deleted.

7. PRODUCTION
   questions row created, content_status = DRAFT, question_occurrences now
   has 2 rows (SSC CGL 2024 T1 S1 Q82, and the re-parented SSC CHSL 2019
   occurrence) under one canonical id. Existing submit-for-review → publish
   workflow takes over from here, unchanged.
```

## AB. Example 1,000-Question Dataset Walkthrough

```
1,000 extracted from one PDF
   ↓
   960 pass structural + content + logical validation
   ↓  (of the 960)
   850 classify at HIGH confidence on every high-risk field, zero warnings
        → bulk-acceptable with one click
    75 classify at MEDIUM/LOW on ≥1 high-risk field → "Needs a look"
    28 flagged as possible exact/near duplicates against the existing bank
     7 flagged NO_MATCHING_PATTERN → reviewer either picks an existing
       pattern manually or creates a new question_patterns row
   ↓
    40 fail structural/content/logical validation outright (garbled OCR,
       missing options, an answer key that references a 5th option that
       doesn't exist) → REJECTED, kept for audit, never silently dropped
   ↓
Reviewer bulk-accepts the 850, individually resolves the 75 (mostly
Accept-with-a-glance, a few genuine Edits), resolves the 28 duplicate flags
(most confirmed as genuinely different questions that happen to share
wording — NOT_DUPLICATE — a handful genuinely merged per §AA's example)
   ↓
~940-960 real questions ship as content_status = DRAFT, ready for the
existing submit-for-review → publish workflow; 40 stay REJECTED/audited.
```

## AC. Admin Experience

```
Upload/receive a source document (or a batch of them)
 ↓
Inspect the extraction report (§R's summary card)
 ↓
(Pipeline runs Passes 1-2 automatically; Pass 3/duplicate scan run in background)
 ↓
Review exceptions only (§P) — bulk-accept everything else
 ↓
Resolve flagged possible-duplicates (Accept as new / Merge occurrences)
 ↓
Preview the batch's effect (how many new questions, which topics/patterns gain coverage)
 ↓
Confirm — candidates become real questions, content_status = DRAFT
 ↓
Existing submit-for-review → publish workflow, unchanged from today
```

An administrator handling a 1,000-question PDF should touch, by design, on the order of
**~100 candidates**, not 1,000 — everything else is either auto-acceptable or a hard reject
that needs no judgment call.

## AD. Risks & Trade-offs

**What's good:** every new table is additive and versioned; nothing overwrites existing
behavior; the pipeline calls the *same* validation/creation service methods a hand-typed
question already goes through, so "pipeline-produced" and "admin-typed" are provably
identical once accepted; the pattern/DNA/difficulty split mirrors a precedent
(`topic_priority`) already tested in production, rather than a novel design.

**What's risky:**
- **Reviewer fatigue / rubber-stamping bulk-accept.** If HIGH-confidence thresholds are
  set too loosely, "bulk accept 850 of 1,000" becomes "nobody actually looked at 850
  questions." Mitigation: the confidence bar starts conservative (favor more
  `NEEDS_REVIEW`, tune down over time as classifier accuracy is measured against admin
  corrections — §41's own suggested metric).
- **Semantic duplicate false positives at scale.** A pattern-matched, formulaic question
  bank (this project already has ~35,700 templated load-test questions, per
  `memory/STATUS.md`) will produce *many* legitimately-similar-but-not-duplicate
  candidates. Mitigation: semantic duplicate is advisory, never auto-rejected — matches
  what's already built for exact/near duplicates.
- **Pattern taxonomy sprawl.** Nothing stops an admin from creating a new
  `question_patterns` leaf for every question if the review UI makes it too easy.
  Mitigation: surfacing existing near-matches ("did you mean this existing pattern?")
  before allowing a brand-new leaf — a UX detail worth specifying at implementation time,
  not solved by schema alone.
- **A second, parallel ingestion pipeline accidentally emerging** if this task and
  `TASK-2401` are implemented independently without sharing the `DocumentStore`/PDF
  extraction core. This is the single most avoidable risk in this document — flagged
  explicitly, addressed by the shared-infrastructure recommendation below.

**What's unnecessary for now, correctly out of scope:** a graph database (§32) — every
relationship this design actually needs is a handful of FK/join-table relationships at a
scale (tens of thousands, eventually low millions, of questions) plain Postgres handles
comfortably; ADR-002's "don't reach for heavier infrastructure than the problem needs" logic
applies directly. A dedicated vector database for embeddings — Postgres with `pgvector`
(or even a batched in-application cosine comparison at this scale) is enough until the bank
is meaningfully larger than a million rows.

**What becomes expensive at 1,000,000 questions**, honestly assessed:
- The semantic duplicate/similarity batch scan is O(n²) naively — at 1M rows this needs an
  approximate-nearest-neighbor index (`pgvector`'s IVFFlat/HNSW), not a full pairwise scan.
  Flagged now, not solved now — the MVP scale (tens of thousands) doesn't need it yet.
- `question_intelligence`/`question_difficulty` being append-only per version means a
  question reclassified 5 times has 5 rows — fine at any realistic scale, but worth an
  eventual retention policy (keep the last N versions) rather than unbounded growth.
- The admin review queue's "show source page image next to extracted fields" (§P) needs
  real pagination/virtualization once a batch is thousands of candidates, not hundreds —
  same lesson `reports/19-startup-gate-and-query-limits/` already learned the hard way for
  unrelated screens in this app.

## AE. Recommended MVP

**Phase 1 — Must have (closes the one real gap, §E):**
`question_occurrences` (additive, migrates existing PYQ columns), the merge-on-duplicate-
resolution workflow for `question_duplicates`. No ingestion pipeline yet. Ships value
immediately (a question can now legitimately have multiple exam appearances) with the
smallest possible schema change.

**Phase 2 — Important (the actual ingestion pipeline, rule-based only):**
Shared `DocumentStore`/PDF extraction core (built once, used by this task *and*
`TASK-2401` if/when both are approved — the single highest-leverage integration point in
this document), `question_raw_extractions`, `question_candidates` (`CandidateStatus`
state machine), Pass 1 rule-based extraction only (**no AI yet** — `NoopQuestionEnrichmentAssistant`
ships, everything routes to `NEEDS_REVIEW`), the admin review queue UI, `content_status`
on `questions` (reusing the existing `ContentStatus` enum). Proves the pipeline end-to-end
with a human doing 100% of the classification work manually through the review UI —
genuinely useful on its own, and de-risks every later AI phase against a already-working
non-AI fallback.

**Phase 3 — Advanced (AI enrichment):**
A real `QuestionEnrichmentAssistant` (once an LLM provider/budget decision — a pre-existing
open item — is made), `question_patterns` (controlled taxonomy), `question_intelligence`,
`question_difficulty`, Pass 2/3 as designed in §G, exact+near+semantic duplicate detection
fully wired.

**Phase 4 — Future intelligence:**
`question_relationships` (`SIMILAR_TO`/`VARIANT_OF`), AI-assisted question generation
(brief's Source Type D) using `variant_of` provenance, full analytics surfacing (§Z) into
Epic L / Weakness Radar, approximate-nearest-neighbor indexing if/when the bank
meaningfully exceeds today's scale.

## AF. Final Recommendation

Ship Phase 1 now — it's a small, additive migration that fixes a real, already-identified
structural gap and costs almost nothing. Treat Phase 2 as the actual deliverable this
brief is asking for, and insist it shares its document-storage/extraction core with
`TASK-2401` rather than building a second one — that single decision is worth more to this
codebase's long-term health than any individual DNA field this document proposes. Defer
Phase 3's AI layer until this project's standing open question ("LLM provider + budget")
is actually resolved, exactly as `TASK-2401` already recommends for its own AI layer — two
independent designs converging on the same deferral is a good sign it's the right call,
not a coincidence to paper over.

---

## Contradictions found between the brief and the existing system

Per the brief's own §43 instruction to be brutally practical rather than agreeable:

1. **The brief's §21 database-entity list (`QuestionOccurrence`, `QuestionPattern`,
   `QuestionValidation`, `QuestionReview`, `QuestionVersion`, `QuestionDifficulty`,
   `QuestionTag`) substantially already exists or is trivially derived from what does** —
   `QuestionValidation`/`QuestionReview` map onto the existing `ContentStatus` workflow
   plus this task's new `CandidateStatus`; `QuestionVersion` maps onto the
   `algorithm_version` pattern already proven by `topic_trend`. Building all of them as
   separate, brief-literal entities would create redundant machinery next to what's
   already shipped.
2. **The brief's §3 pipeline implies fully synchronous, per-question duplicate/pattern/
   quality analysis before staging.** This design deliberately splits synchronous
   (per-candidate, review-blocking) from asynchronous/batched (whole-bank, precedent:
   Epic L's own trend/priority jobs) — see §C.
3. **The brief's §19 "local-first dataset management" folder tree assumes a persistent
   local filesystem.** This project's backend runs on Cloud Run with an ephemeral,
   scale-to-zero disk (ADR-011) — a confirmed, already-lived failure mode (the dead
   `/downloads` folder, ADR-006). Resolved by keeping the *raw-immutability principle*
   but implementing it in Cloudinary + a database table, not files — see §F.
4. **The brief assumes AI is a routine, always-available part of the pipeline.** This
   project has no LLM provider or budget decided anywhere (`reports/open-questions.md`) —
   resolved the same way `TASK-2401` already resolved the identical tension: an interface
   with a no-op default, real integration deferred to Phase 3.
5. **The brief's §32 graph-database question is answered "no" for the reasons ADR-002
   already gives for rejecting microservices**: real requirements at this scale don't need
   it, and a relational model with a handful of join tables already covers everything
   asked for.

## Open Questions (added to the existing `reports/open-questions.md` pattern)

| Question | Category |
|---|---|
| LLM provider + budget for the enrichment layer | Business — same already-open item gating `TASK-2401`'s AI layer and 4 Future Vision epics |
| Whether/when to build the shared `DocumentStore`/extraction core this task and `TASK-2401` both need, and which task builds it first | Technical/sequencing — the highest-leverage open decision in this document |
| Embedding provider for semantic duplicate detection (and whether `pgvector` gets added as a new dependency) | Technical — new, not yet decided anywhere |
| Content licensing/copyright posture for storing copies of real PYQ paper PDFs | Legal — same category `TASK-2401` already flags for recruitment-notice PDFs |
| Retention policy for `question_intelligence`/`question_difficulty` version history once reprocessing happens repeatedly | Technical — deferred past MVP scale |
| Whether an approved `question_patterns` leaf, once created, ever needs merging/renaming, and what that does to already-tagged questions | Product — not needed until the taxonomy has real usage to observe |

---

## Affected systems

`backend` (new package + new tables + new admin-facing endpoints), `admin` (one new
review page + a patterns-taxonomy management page), **no mobile changes** — every
pipeline output becomes an ordinary `questions` row going through the existing
publish/sync path, which mobile already fully supports (TASK-2301's capability
negotiation on `/sync`/`/live` already handles a client that doesn't know about a type).

## Affected modules

New: `backend/.../ingestion/questions/**` (extraction, candidates, review — sharing a
`DocumentStore`/PDF-extraction core with `TASK-2401` if both are built), new
`entity/QuestionOccurrence`, `QuestionPattern`, `QuestionIntelligence`,
`QuestionDifficulty`, `QuestionRelationship`, `QuestionCandidate`; new
`admin/src/pages/QuestionReview.jsx`, `admin/src/pages/QuestionPatterns.jsx`. Existing
`QuestionService`/`QuestionMapper`/`QuestionController` gain no behavior change for
hand-authored content — the pipeline calls what already exists.

## API changes

New only, all admin-gated, mirroring `TASK-2401`'s `/api/admin/ingestion/...` shape:
`/api/admin/question-ingestion/{sources,documents,candidates,patterns}` and a public
`GET /api/question-patterns` (read-only taxonomy, same shape as the existing public
`GET /api/question-types`). `api/QUESTIONS.md` needs one addition once implemented
(`content_status`, `pattern_id` on `QuestionResponse`); a new `api/QUESTION-INTELLIGENCE.md`
and `api/QUESTION-INGESTION.md` should be written alongside implementation, per
`AI_RULES.md` §5.5 — not written now, since no endpoint exists yet.

## Database changes

New migrations only, additive, phased per §AE: Phase 1 (`question_occurrences` + merge
logic), Phase 2 (`question_raw_extractions`, `question_candidates`, `content_status` on
`questions`, shared document-storage tables if not already added by `TASK-2401`), Phase 3
(`question_patterns`, `question_intelligence`, `question_difficulty`), Phase 4
(`question_relationships`). No `ALTER` that removes or renarrows any existing column in
any phase; the PYQ-column deprecation (§E) is explicitly a later, separate cleanup
migration, not part of this task.

## UI changes

Admin: two new pages (`QuestionReview.jsx`, `QuestionPatterns.jsx`), gated Phase 2/3.
Mobile: none.

## Dependencies

- Human sign-off on this document (schema + new API surface).
- Resolution (or explicit continued deferral) of `TASK-2401`'s sequencing question, since
  Phase 2 of this task shares infrastructure with it.
- Apache PDFBox as a shared dependency if `TASK-2401` hasn't already added it — flagged,
  not duplicated.
- An LLM provider/budget decision before Phase 3 (not before Phase 1/2 — both ship fully
  functional with zero AI).

## Risks

See §AD in full; summarized: reviewer fatigue on bulk-accept thresholds, semantic-duplicate
false positives at this project's templated-content scale, pattern-taxonomy sprawl without
a "did you mean an existing one" UX safeguard, and — the most avoidable — building two
independent document-ingestion cores instead of one shared one with `TASK-2401`.

## Testing requirements

Per `AI_RULES.md` §5.4/§3.13, once implemented: unit tests for extraction/validation
against synthetic fixture PDFs (never a real scraped/copyrighted paper committed to the
repo — same rule `TASK-2401` already states); an integration test asserting a
pipeline-produced question, once Accepted and Published, is **indistinguishable** from a
hand-typed one through every existing read path (sync, mock-test sampling, evaluator);
a real on-device/browser check that the review queue's bulk-accept and merge-occurrences
actions work against real data, not just a clean compile — matching this project's
standing "clean build is not proof of correctness" rule.

## Out of scope (this task, as designed)

- Building `TASK-2401` itself (a sibling, separately-scoped design).
- A real AI provider integration (Phase 3, gated on an open business decision).
- A graph database of any kind (§AD).
- Approximate-nearest-neighbor / `pgvector` indexing (deferred until real scale demands it).
- Any change to mobile.
- Human-authored (as opposed to AI-suggested) `question_relationships`.
- Retention/pruning policy for versioned intelligence rows.

## Implementation status

**Phase 1 and Phase 2 shipped and verified (2026-09-07); Phase 3 (AI) and Phase 4 (relationships)
remain not started, per the recommended MVP scoping in §AE.** User sign-off was obtained via
`AskUserQuestion` ("Phase 1 + Phase 2") before any code changed, per `AI_RULES.md` §5.

**Phase 1 — `question_occurrences` + merge-on-duplicate.** Migration `V36__question_occurrences.sql`
(additive; backfills one `is_legacy_derived` occurrence row per existing PYQ question, best-effort
single exam code). New `entity/QuestionOccurrence`, `repository/QuestionOccurrenceRepository`,
`service/QuestionOccurrenceService`, `controller/QuestionOccurrenceController`
(`/api/questions/{id}/occurrences`, full CRUD, admin-gated). `QuestionService` gained
`syncLegacyOccurrence` — called after every create/update/bulk-import save that touches PYQ
provenance, so the new table and the legacy singular columns can never drift apart; zero behavior
change to the legacy columns themselves. `DuplicateDetectionService.resolve()` now performs a real
merge on `"DUPLICATE"` resolution: every occurrence moves from the loser question onto the
survivor, and the loser is soft-deleted — idempotent, re-resolving an already-merged pair no-ops.
`QuestionResponse`/`QuestionMapper` gained `occurrences` (populated on admin CRUD reads only, same
"dead weight on every synced row" reasoning as `duplicateOfQuestionIds`).

**Phase 2 — rule-based question-ingestion pipeline (no AI).** Reuses TASK-2401's
`DocumentFetcher`/`DocumentStorage`/`PdfTextExtractor` as-is (a question-paper document is simply
one with `notice_id IS NULL`) — the single highest-leverage integration point the design flagged,
resolved by sharing rather than duplicating. New migrations `V37__question_raw_extractions.sql`
(immutable per extractor_version), `V38__question_candidates.sql` (the staged, reviewable row —
reuses the existing `ExtractionReviewStatus`/`ExtractionConfidence` enums, no duplicates created),
`V39__questions_content_status.sql` (`questions.content_status`, reusing `ContentStatus` from Exam
Guide; every existing/hand-authored row defaults `PUBLISHED`, explicit at the schema level per the
exact V18 lesson this design called out in advance). New `ingestion/QuestionRawExtractor`
(question-number/option/answer-line regex splitting) and `ingestion/QuestionCandidateBuilder`
(confidence: HIGH = 4 options + resolved answer, MEDIUM = 4 options no answer, LOW = anything
else — never silently dropped). New `service/QuestionIngestionService` (orchestrator) and
`service/QuestionCandidateStagingService` (staging, its own `REQUIRES_NEW` transaction per
candidate — a genuinely necessary separate bean, not a style choice: a same-class self-invoked
`@Transactional` method is silently never intercepted by Spring's proxy, found by running the
resilience test this behavior is meant to satisfy, not by review). `QuestionService.
validateTranslationShape` made `static` (not just package-private) so the pipeline can reuse the
exact same per-type validation a hand-typed question already goes through, per §O — `static` is
load-bearing: an instance call would route through `QuestionService`'s own transactional proxy,
and a caught exception there still leaves the *caller's* transaction marked rollback-only (the
same trap `DocumentStoreService.store`'s own doc comment already documents once, for a different
pair of classes — found the same way, by running the test). New
`controller/QuestionIngestionController` (`/api/admin/question-ingestion`). Read-path filtering
added to `QuestionService.sync/listPublic/sampleForMock/countsGroupedBy` (via
`QuestionSpecifications.published()`/`examAndSubjectsIn`'s new predicate) so a DRAFT candidate
never reaches a student before an admin publishes it — verified directly, not assumed. New
`PUT /api/questions/{id}/content-status` (one-click, mirroring `ExamGuideService.
setCycleContentStatus` exactly, gated `requireReviewer`).

**Admin console:** new `pages/QuestionIngestion.jsx` (paste a URL → ingest → summary card →
per-candidate Accept/Reject, topic/exam/difficulty overrides). `pages/QuestionsList.jsx` gained a
content-status badge + Publish action per non-`PUBLISHED` row.

**Verified:** `mvn compile` clean throughout. New `QuestionOccurrenceTest` (5/5) and
`QuestionIngestionTest` (3/3, a synthetic PDF built with PDFBox at test time — never a real
scraped paper, matching `PdfTextExtractorTest`'s own precedent) pass against the real dev Neon
database. Regression-checked `QuestionCrudTest`, `BulkOperationsTest`, `LiveQuestionsTest`,
`SyncEndpointTest`, `QuestionGroupsAndMediaTest`, `WaveAOptionSetTypesTest`,
`WaveBFreeInputTypesTest`, `QuestionTypeFoundationTest` (50 tests, all green) — the classes most
directly touched by the content-status/occurrence changes. Admin `npm run build` clean, `oxlint`
at the exact pre-existing one-warning baseline. `api/QUESTIONS.md` updated in the same change
(new fields, new endpoint, filter notes on every public read) plus a new
`api/QUESTION-INTELLIGENCE.md`; `system-design/02-database.md` updated (and its own pre-existing
gap — V25-V35 missing from the migration list — fixed in place per `AI_RULES.md` §6, found while
adding V36-39, not something this task caused).

**Two real bugs found by running the new tests, not by review** (both described above in context):
the self-invocation transactional-proxy trap, and `QuestionCandidate`'s "already reviewed" guard
throwing `IllegalStateException` (no handler in `GlobalExceptionHandler`, would have surfaced as a
bare 500 instead of 400).

**Explicitly not done this session, disclosed per the plan:** no separate extraction-job-tracking
table (raw-extraction rows double as the job record); no AI/pattern taxonomy/semantic duplicate
detection (Phase 3, gated on the still-open LLM provider/budget decision); no distinct "submit for
review" step; zero mobile changes.

**Follow-up in the same session — local file upload added.** The MVP originally shipped
URL-fetch-only (an admin had to host the PDF somewhere reachable first); the user asked for local
upload after seeing the page, and it was added the same session: new
`POST /api/admin/question-ingestion/documents/upload` (`multipart/form-data`, field `file`),
reusing `QuestionIngestionService.ingestBytes` directly — nothing about ingestion itself differs
once bytes exist, whether they arrived via a fetched URL or a direct upload. The document's
`sourceUrl` becomes a synthetic `"local-upload:<original filename>"` string. `DocumentFetcher
.MAX_BYTES` (20MB) was made `public` so both entry points enforce the identical cap instead of a
second, possibly-drifting number; `application.yml`'s global multipart limit was raised from
5MB/10MB to 20MB/20MB to match (previously sized only for admin image uploads). Admin UI: a file
input added next to the URL field on `QuestionIngestion.jsx`. New `QuestionIngestionTest` case
(`upload_ingestsAPdfFromMultipartFormData`, a real HTTP multipart POST via `TestRestTemplate`) —
**4/4 pass**. `mvn compile` clean; admin `npm run build`/`oxlint` clean at baseline.
