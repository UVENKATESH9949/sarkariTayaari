# Exam Intelligence API (Epic L)

Computed per-topic mastery signal for one exam: relative weightage, appearance trend across
previous-year questions (PYQs), and a blended 0-100 priority score. Introduced by migrations
`backend/src/main/resources/db/migration/V12__topic_model_for_exam_intelligence.sql` through
`V16__real_pattern_versioning.sql`. Background: `reports/20-epic-l-topic-model/epic-l-topic-model.md`
and `reports/21-epic-l-intelligence-and-pyq/epic-l-intelligence-and-pyq.md`. This document
describes the actual current code, which has moved on in places from what those reports
originally proposed (see "Surprises" at the bottom of the parent task report).

## The three-priority-column model

`topic_priority` (V15) stores three separate numbers per (exam, topic, algorithm version) rather
than one mutable field:

- **`systemPriority`** — computed by `TopicIntelligenceService.scoreTopic`, never written by a
  human. Blends normalised relative weightage (55%), trend (30%) and question-bank coverage
  (15%); the three weights are asserted at startup to sum to 1.00.
- **`adminOverride`** — written only by `PUT /topics/{topicId}/priority-override`. Nullable, and
  null means "no override" — distinct from an override of `0` ("explicitly deprioritise this").
  Setting a non-null value requires a non-blank `reason` (enforced in the service and by a DB
  `CHECK`), because an unexplained override is unauditable.
- **`finalPriority`** — `COALESCE(adminOverride, systemPriority)`, what every consumer sorts and
  ranks by. Stored, not computed on read, so every consumer applies the same precedence rule; a
  DB `CHECK` (`chk_topic_priority_final`) asserts the invariant so a future writer that forgets
  the rule fails loudly instead of silently mis-ranking topics for students.

A recompute never touches `systemPriority` from a previous override, and `setOverride` never
touches `systemPriority` at all — that separation is the entire point of TICKET-2107.

## Algorithm versioning

`TopicIntelligenceService.ALGORITHM_VERSION` (currently `"v2"`) is a hand-bumped constant, not a
config value. Every `topic_trend` and `topic_priority` row is tagged with the version that
produced it. Recompute only deletes-and-replaces rows for the *current* version — rows from a
superseded version are left on disk rather than deleted, so a stored recommendation stays
explainable after the formula changes (a reader can tell a `v1` row was produced by the old,
wrong normalisation rather than silently reinterpreting it as current).

Admin overrides are preserved across a recompute: before deleting old rows, the service reads
existing overrides for the exam (newest version first, `putIfAbsent` semantics so a stale `v1`
override can't resurrect one an admin cleared on `v2`) and re-applies them to the freshly
computed rows. Without this, bumping the version would silently discard every editorial
decision ever made.

`v2` itself exists because `v1`'s computed weightage was used as a raw share of total exam
appearances (often under 1%), so it contributed almost nothing to a 0-100 blend that trend then
dominated despite carrying a smaller declared weight. `v2` normalises computed weightage against
the exam's own busiest mapped topic instead.

Trend direction (`RISING` / `STABLE` / `FALLING` / `INSUFFICIENT_DATA`) needs at least 3 tagged
appearances across at least 2 distinct years, and a >15% swing between the older and newer half
of the tagged years to be called a direction rather than noise. Below that floor, every topic
honestly reports `INSUFFICIENT_DATA` rather than a fabricated value.

## Endpoints — `TopicIntelligenceController` (mounted under `/api/exams/{examCode}`)

### GET /api/exams/{examCode}/topic-intelligence
**Purpose:** Ranked topic list for one exam — weightage (curated + computed), trend, and the
three priority columns — sorted by final priority descending (nulls last), then alphabetically.
**Auth:** none (deliberately public, same rule as `/api/topics` and `/api/exam-structures` — this
is mobile's sync source for Practice-screen priority badges and exposes nothing student-specific)
**Request:** none
**Response:** `ExamTopicIntelligenceResponse { examCode, algorithmVersion, pyqTaggedCount, topics: [ TopicIntelligence... ] }` — each `TopicIntelligence` row carries `topicId`, `topicName`, `subjectId/Name`, `parentId/Name`, `curatedWeightagePercent`, `computedWeightagePercent`, `appearanceCount`, `windowFromYear/ToYear`, `trendDirection`, `trendScore`, `systemPriority`, `adminOverride`, `finalPriority`, `overrideReason`, `overrideAt`, `algorithmVersion`, `inputs` (the score's raw inputs, for auditability), `computedAt`
**Errors:** 404 exam not found
**Business rules:** Built from the `exam_topics` mapping outward, so a topic mapped to the exam
but never scored still appears (with nulls meaning "not computed yet") instead of being silently
absent. `pyqTaggedCount` is returned so the UI can distinguish "nothing is tagged yet" from
"every topic scores the same."
**Consumers:** Both (mobile: Practice screen priority badges via `mobile/src/api/reference.ts`; admin: Topic Priority page via `admin/src/api.js` `getTopicIntelligence`)

### POST /api/exams/{examCode}/topic-intelligence/recompute
**Purpose:** Re-runs trend + priority computation for every topic mapped to this exam.
**Auth:** admin (Bearer token + ADMIN role, via `authService.requireAdmin`)
**Request:** none
**Response:** `RecomputeResponse { examCode, algorithmVersion, topicsScored, pyqTaggedCount, overridesCarriedForward }`
**Errors:** 401 no/invalid token, 403 authenticated but not an admin, 404 exam not found
**Business rules:** Admin-triggered, not scheduled — inputs only change when an admin tags PYQ
years or edits the topic map, so a cron job would waste nearly every run recomputing identical
numbers, and an unprompted full scan at Cloud Run startup would be an unpleasant surprise.
Deletes and replaces only the current algorithm version's rows for this exam; existing overrides
are preserved and reapplied (see "Algorithm versioning" above).
**Consumers:** Admin (Topic Priority page, `recomputeTopicIntelligence` in `admin/src/api.js`)

### PUT /api/exams/{examCode}/topics/{topicId}/priority-override
**Purpose:** Sets or clears the admin priority override for one topic.
**Auth:** admin (Bearer token + ADMIN role)
**Request:** `OverrideRequest { priority: number (0-100) | null, reason: string }` — a null `priority` clears the override; a non-null `priority` requires a non-blank `reason`
**Response:** `TopicIntelligence` (the full recomputed row, per the shape above)
**Errors:** 401, 403, 400 (override with no/blank reason, or priority outside `[0,100]` — `@DecimalMin`/`@DecimalMax`), 404 exam not found, or "no computed priority for this topic — recompute first" if the topic has never been scored under the current algorithm version
**Business rules:** Never touches `systemPriority`. Records `overrideBy` (the acting admin) and `overrideAt`. Clearing an override (`priority: null`) also clears `overrideReason`/`overrideBy`/`overrideAt`, handing ranking back to the computed value.
**Consumers:** Admin (`setTopicPriorityOverride` in `admin/src/api.js`)

## Endpoints — `SyntheticCurationController` (mounted under `/api/admin/synthetic-curation`)

Operational data-seeding tool, not a product feature — under `/api/admin/` specifically so the
path itself signals that. Gated by **two independent, both-required** conditions: an admin
token, and `app.epic-l.synthetic-seed-enabled=true` (config default `false`, see
`backend/src/main/resources/application.yml`). Neither gate alone is sufficient: the flag alone
would let an unauthenticated caller rewrite content, and the token alone would let a legitimate
admin on a production instance overwrite real editorial work by clicking the wrong thing.

Every question this seeder tags carries the marker `synthetic://epic-l-demo` in
`questions.source_url`, which is what lets purge remove exactly what was added. The topic
hierarchy, prerequisite edges, and exam-topic map carry no such provenance column, so purge
clears those tables wholesale rather than selectively — safe only as long as no real curation has
been entered since seeding. All seeded values are deterministic (derived from an MD5 hash of the
row's own UUID, not a random number generator), so seeding twice produces identical output.

**Surprising finding:** grepping `admin/src/api.js` and `mobile/src/api/*.ts` turns up **no
caller at all** for any of these three endpoints — no admin page wires them to a button. They
exist only for direct HTTP invocation (curl/Postman) during development/demos, unlike the
`ExamGuideDemoSeedController` endpoints below, which at least have (unused) wrapper functions in
`admin/src/api.js`.

### GET /api/admin/synthetic-curation/status
**Purpose:** Reports whether seeding is currently possible, so a caller can check before attempting it.
**Auth:** admin (Bearer token + ADMIN role)
**Request:** none
**Response:** `{ enabled: boolean, marker: "synthetic://epic-l-demo" }`
**Errors:** 401, 403
**Business rules:** `enabled` reflects only the config-flag gate, not the admin-token gate (the caller already had to pass that to reach this endpoint).
**Consumers:** none (no UI wiring found; operational tool only)

### POST /api/admin/synthetic-curation/seed
**Purpose:** Runs every synthetic seeding pass in order (syllabus derivation, topic hierarchy, prerequisites, exam-topic map, PYQ tagging, source-paper linking), then recomputes topic intelligence for every exam and applies a couple of demo priority overrides per exam.
**Auth:** admin (Bearer token + ADMIN role)
**Request:** none
**Response:** `Map<String,Object>` report — counts per pass (`syllabusRowsAdded`, `topicsGivenParent`, `prerequisiteEdgesAdded`, `examTopicRowsAdded`, `questionsTaggedAsPyq`, `questionsGivenSourcePaper`, `intelligenceRecomputed` per exam, `algorithmVersion`, `overridesApplied`)
**Errors:** 401, 403, 403 ("Synthetic Epic L seeding is disabled...") if the config flag is off
**Business rules:** Additive — an exam that already has a curated syllabus, a topic with an existing parent, or a question already tagged as PYQ is left untouched by the relevant pass. Idempotent: re-running does not re-tag already-tagged rows or add duplicate overrides.
**Consumers:** none (no UI wiring found; operational tool only)

### POST /api/admin/synthetic-curation/purge
**Purpose:** Removes the synthetic data added by `seed`.
**Auth:** admin (Bearer token + ADMIN role)
**Request:** none
**Response:** `Map<String,Object>` report — `pyqTagsCleared` (precise, by marker), `topicPriorityRowsDeleted`, `topicTrendRowsDeleted`, `examTopicRowsDeleted`, `prerequisiteEdgesDeleted`, `topicParentsCleared` (all four of these last are wholesale, not marker-scoped), a `note` explaining the wholesale-vs-precise distinction, and `syllabusLeftIntact: true`
**Errors:** 401, 403, 403 if the config flag is off
**Business rules:** PYQ tags are removed precisely by matching the synthetic marker, so a genuine PYQ an admin has since tagged is untouched. The topic hierarchy, prerequisite edges and exam-topic map have no provenance column and are cleared wholesale — do not run this if real curation has been entered since seeding. `exam_subjects` (syllabus) is deliberately left intact because it was derived from questions that genuinely exist, not invented.
**Consumers:** none (no UI wiring found; operational tool only)
