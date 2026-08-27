# Epic L — Topic Model for Exam Intelligence (TICKET-2101/2102/2103)

**Closes:** the first slice of Epic L in `preparation-os-requirements.md` §18.3 — the phase-0 prerequisite schema for the Preparation Plan engine. Epics A/C/D/F all assume a per-exam, hierarchical, dependency-aware topic model that did not exist. This is not a user-facing feature; nothing on mobile consumes it yet.

Scoped deliberately to the topic model. The other six Epic L tickets (2104 PYQ provenance, 2105 `user_topic_progress`, 2106 trend/priority, 2107 admin override, 2108 pattern versioning, 2109 server-side dedup) are **not** in this change.

## What existed before

Confirmed by the audit recorded in §18.2, not assumed:

- `topics` had exactly four columns — `id`, `subject_id`, `name`, `display_order`. No `parent_id`, no self-reference, no metadata. The hierarchy was exactly **Subject → Topic**, two levels.
- Topics reached exams **only transitively**, via `exam_subjects` (exam ↔ *subject*). There was no `exam_topics` table, so "which topics matter for SSC CGL" was unanswerable at topic granularity and **no per-exam topic attribute could be stored at all**. This was the single biggest structural gap.
- No notion of one topic requiring another — no `topic_prerequisites`, no DAG, no ordering beyond `display_order`.

## What was built

### Migration `V12__topic_model_for_exam_intelligence.sql`

Additive only. Every column and table added is nullable or starts empty, so existing behaviour is unchanged until an admin curates real values. Nothing is backfilled with invented data.

- **`topics.parent_id`** (self-FK, nullable) + `idx_topics_parent_id`. **One recursive relation instead of the four separate Chapter/Topic/SubTopic/Concept tables the source spec proposed** — depth genuinely varies by subject (Quant wants Chapter→Topic→Sub-topic, English often doesn't), so a fixed ladder would force empty levels while a self-reference lets each subject use only the depth it needs. Every existing row becomes a top-level topic.
- **`exam_topics`** — `id`, `exam_code`, `topic_id`, `weightage_percent`, with `UNIQUE (exam_code, topic_id)` plus indexes on both FKs.
- **`topic_prerequisites`** — `(topic_id, prerequisite_topic_id)` composite PK, a `CHECK` blocking the self-edge, and an index on the reverse direction.

Two decisions worth recording:

**The synthetic `exam_topics.id` is not a style preference.** ADR-005 records that a JPA `@IdClass` composite key on `user_bookmarks` produced *real 500s*, because Hibernate's `isNew()` entity-state detection misbehaves for a derived composite id. `user_practice_session_results` and `user_bookmarks` both already use the synthetic-string form. `exam_topics` follows suit (`"examCode:topicId"`) and keeps the natural key as a `UNIQUE` so the pair still cannot duplicate.

**`exam_topics.weightage_percent` is the admin's curated figure and is deliberately NOT the field TICKET-2106 will compute from previous-year questions.** Source spec §66 requires a human override and a derived value to stay distinguishable; collapsing them would make it impossible to tell which a recommendation came from.

### Backend

- `Topic` entity gains a lazy `parent` self-reference and a `prerequisites` `@ManyToMany` over the new join table.
- New `ExamTopic` entity + `ExamTopicRepository`; new `ExamTopicsRequest` / `ExamTopicResponse` DTOs.
- `TopicRequest`/`TopicResponse` gain `parentId` and `prerequisiteTopicIds`; the response also carries `parentName` so a client can render a breadcrumb without a second call.
- `TopicService` gains `applyParent` and `applyPrerequisites` with **validation the database cannot express** (see below).
- `ExamService.getTopics`/`setTopics`, mirroring the existing `getSyllabus`/`setSyllabus` full-replace semantics.
- `GET`/`PUT /api/exams/{code}/topics`, admin-only.

### Validation that a constraint cannot do

- **Hierarchy cycles of any length.** A FK permits any existing topic and the `CHECK` only catches the one-node case. `applyParent` walks up from the proposed parent and rejects the edge if it reaches the topic itself — otherwise a recursive read of the tree would never terminate.
- **Cross-subject parents** are rejected: a topic's parent must belong to the same subject.
- **Prerequisite cycles of any length** (A needs B, B needs C, C needs A). Only reachability catches these; `dependsOn` is a depth-first search with a visited set (which also guards against a pre-existing cycle). Getting this wrong would make Epic D's sequencing loop forever rather than fail loudly here.
- **Null vs. empty `prerequisiteTopicIds`** are different: null means "leave unchanged" so a client predating the field cannot silently wipe curated edges; an empty list is an explicit clear.
- **Duplicate `topicId` in a `setTopics` request** is rejected explicitly. The synthetic id would otherwise silently collapse duplicates into one row, so the admin would see fewer topics saved than it sent, with no error.

## Real bugs found and fixed

Both found by running the tests, not by reading code.

**1. `TransactionRequiredException` on a derived delete.** `examTopicRepository.deleteByExamCode(...)` failed with *"No EntityManager with actual transaction available for current thread"* when called from a non-transactional caller (the test teardown). `SimpleJpaRepository` only wraps its *own* CRUD methods in a transaction, not derived deletes. Replaced with an explicit `@Modifying @Transactional @Query`. It worked inside `ExamService` (which is `@Transactional`) which is exactly why reading the code would not have caught it.

**2. Foreign-key violation in test teardown, cascading into 8 errored tests.** Neither `exam_topics` nor `topic_prerequisites` cascades from `topics`, so the base class's `topicRepository.deleteAllById(...)` hit `violates foreign key constraint "exam_topics_topic_id_fkey"`. Fixed with a subclass `@AfterEach` (JUnit runs those *before* the superclass one) that clears both referencing sets first, plus a new `TopicRepository.deletePrerequisiteEdges` that deletes edges in **both** directions — a topic can be *someone else's* prerequisite, and clearing only the owning side leaves rows pointing at a topic about to be deleted.

**3. A test-isolation flaw of my own making, fixed rather than worked around.** After fixing (2), one test still failed because bug (2)'s failed teardown had left rows behind and `subjects.name` is `UNIQUE`. The first fix attempted was reuse-if-present — then discarded, because a leftover topic could arrive carrying a `parent` or `prerequisites` from an earlier run and silently invalidate the assertions. Replaced with a per-run unique suffix (`runId`), which guarantees isolation instead of hoping for it.

## Verified

- **`mvn -o test`: 90/90 pass, 0 failures, 0 errors** — including the 8 new `TopicModelTest` cases and all 82 pre-existing tests, so no regression.
- **Migration applied for real** against the dev Neon database: `Migrating schema "public" to version "12 - topic model for exam intelligence"` → `Successfully applied 1 migration ... now at version v12`.
- **New endpoint is admin-gated**: `GET /api/exams/SSC_CGL/topics` without a token returns `401`.
- **Existing contracts unchanged**: the public `GET /api/exams` still returns the same shape (including the `difficulty`/`badge` fields from `eac8f32`), and `GET /api/topics` now carries `parentId: null`, `parentName: null`, `prerequisiteTopicIds: []` on existing rows — additive, not breaking.
- **Mobile still syncs against V12**: a delta sync on the emulator completed `0 upserted, 0 deleted` with zero errors in the Metro log, which also exercises the bulk topic upsert added in §9 Phase 5.
- **Dev database left clean.** The orphaned fixtures that bug (2) stranded were removed via a throwaway JDBC one-off (5 rows across `exam_topics`, `topics`, `subjects`, `exams` — `psql` isn't installed on this machine, same approach the bookmark-sync work used). Verified by the delete counts and a commit.

## Update — admin UI (same session)

The curation surface the gap below called for. Two screens.

**`admin/src/pages/Topics.jsx`** — the topic editor gains a **Parent topic** select and a **Prerequisites** checkbox grid, plus two new table columns (Parent, and a count of prerequisites) so the hierarchy is visible without opening anything.

Both pickers are scoped to *other topics in the same subject* — the API enforces the same-subject rule for parents, and a cross-subject prerequisite would be meaningless here. The parent list additionally **excludes the topic's own descendants**: the server rejects such an edge anyway, but offering it and then failing teaches the admin nothing, whereas a descendant simply cannot be a valid parent. `isDescendantOf` carries a `seen` guard because the API only started rejecting cycles in V12 — a tree that already contained one would otherwise loop forever and hang the page.

The editor loads an **unfiltered** topic list separately from the table's subject-filtered one, since walking a parent chain against a partial list could miss a link.

**`admin/src/pages/ExamStructure.jsx`** — a new **Topic map** card beside the existing Syllabus card, with a modal listing every topic of the exam's syllabus subjects, grouped under subject headings, each with a checkbox and an optional weightage input. The weightage input is disabled until its topic is ticked. Weightage is held as a *string* while editing so a half-typed `1.` isn't coerced mid-keystroke, and is validated (0–100, numeric) before the request goes out — the API stores what it's given, and a typo is much cheaper to catch here. The "Edit topic map" button is disabled with an explanatory empty state until a syllabus exists, since topics are offered per subject.

`getExamTopics` / `setExamTopics` added to `admin/src/api.js`, mirroring the syllabus pair.

### Real bug found and fixed (admin UI)

**An import silently shadowed by a state setter.** `ExamStructure.jsx` already declares `const [examTopics, setExamTopics] = useState([])`, and I imported the API function under the same name — so `saveTopicMap` was calling the *state setter*, not the API. It would have built and run, closed the modal, appeared to work, and **never persisted anything**. Caught by `oxlint` reporting the import as unused, which is the only signal that distinguished the two. Fixed by aliasing the import to `saveExamTopicsApi`.

## Honest gaps

- **The admin UI is unverified in a browser.** It builds clean (`vite build`, 45 modules) and lint is back to the single pre-existing warning, but no click-through happened, because **there is no admin credential available to me**. `admin@sarkaritaiyaari.app` / `Admin@12345` — which `memory/STATUS.md` listed as the working admin in three places — authenticates but returns `role: STUDENT`; it was demoted during the Cloud Run credential remediation and the doc was never updated. Confirmed by driving the real login: the console shows *"admin@sarkaritaiyaari.app is signed in but is not an admin account."* Those three stale references are now corrected in STATUS.md so nobody repeats the detour. **The shadowing bug above is exactly the class of defect a build and a lint pass can miss, so the save path in particular should be clicked through before this is trusted.**
- The endpoints underneath the UI *are* covered — 8 integration tests over `GET`/`PUT /api/exams/{code}/topics` including full-replace, weightage round-trip, duplicates and unknown topics.
- **Nothing on mobile consumes it.** No sync, no local schema, no screen. `exam_topics` and the hierarchy are invisible to the app, by design for this slice.
- **Zero real data.** No exam has a topic map, no topic has a parent or a prerequisite. The 107 topics that hold questions are all still flat and top-level. Until someone curates real values, every downstream Epic L computation would have nothing to work from.
- **Depth is untested beyond three levels.** `topicParentCycleIsRejected` builds a three-level chain; nothing exercises a deeper tree, and there is no maximum-depth guard — a pathological hierarchy would make `applyParent`'s upward walk long, though the visited-set guard prevents non-termination.
- **`weightage_percent` is stored and returned but nothing validates it sums sensibly** across an exam's topics. Deliberate for now — the admin might legitimately save a partial map mid-curation — but it means the column can hold a set that adds to more than 100%.
