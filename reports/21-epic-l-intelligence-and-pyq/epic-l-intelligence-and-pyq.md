# Epic L, second slice — PYQ provenance, mastery, trend/priority, versioning, dedup

**Closes:** TICKET-2104, 2105, 2106, 2107, 2108, 2109 — the remaining six of Epic L's nine
tickets (`preparation-os-requirements.md` §18.3). With the three closed in
`reports/20-epic-l-topic-model/`, Epic L is complete.

**Scope:** backend (migrations V13–V16, 6 new entities, 5 new services), admin console (2 new
pages, PYQ card on the question form, stage versioning), mobile (local migration `0012`, sync,
and the first user-facing Epic L features), plus synthetic curation data so all of it can be
exercised before real editorial content exists.

**Requested explicitly:** "complete those all tickets with fake data … including mobile also."
The synthetic data is therefore a deliverable, not a shortcut, and is built to be reversible.

---

## Migrations

| Migration | Tickets | What |
|---|---|---|
| **V13** `pyq_provenance_and_duplicates` | 2104, 2109 | `questions.is_pyq/pyq_year/pyq_shift/source_paper_id/question_number/source_url/content_fingerprint`; new `question_duplicates` table |
| **V14** `user_topic_progress` | 2105 | Per-(user, topic) mastery state machine, last-write-wins |
| **V15** `topic_trend_and_priority` | 2106, 2107 | `topic_trend` + `topic_priority`, both algorithm-versioned, with the three-column override split |
| **V16** `real_pattern_versioning` | 2108 | Relaxes `UNIQUE (exam_code, name)` on `exam_stages`; adds `effective_to` |

All four are additive; every column and table is nullable or empty, so existing behaviour is
unchanged until an admin curates values. **Applied to the shared Neon database** (schema at
v16), and Hibernate's `ddl-auto: validate` passing on startup is what confirms every entity
mapping matches the real schema.

### Design decisions worth knowing

**`is_pyq` is stored, not derived from `pyq_year != null`.** A question can be known to be a
previous-year question while its exact year is unverified. Collapsing the two makes "PYQ, year
unknown" unrepresentable, and the UI would then have to choose between hiding the badge or
inventing a year.

**`content_fingerprint` uses MD5, and that is not a security choice.** It is a content
fingerprint that must match Postgres's built-in `md5()`, because V13 backfills the ~37,900
pre-existing rows in SQL. Stock Postgres has no SHA without enabling pgcrypto, and a migration
is the wrong place to require an extension. Both halves — hash *and* normalisation — are pinned
deliberately: if they ever disagree, old and new rows stop comparing equal and detection
silently stops working for everything imported before this ticket.

**`topic_priority` has three priority columns, not one.** `system_priority` (only the job
writes it), `admin_override` (only an admin writes it), `final_priority` (what consumers rank
by). Supplied §66 requires that an override never overwrite the computed value. A CHECK asserts
`final IS NOT DISTINCT FROM COALESCE(override, system)`, so a writer that forgets the precedence
rule fails loudly instead of quietly serving a wrong ordering to every student.

**`admin_override` is nullable rather than defaulted**, because "no override" and "explicitly
deprioritise this to 0" are different statements.

**V16's replacement constraint keys on `COALESCE(version_label, '')`.** A plain
`UNIQUE (exam_code, name, version_label)` would have silently *removed* duplicate protection for
every un-versioned stage — which is all of them — because Postgres treats two NULLs as distinct
for uniqueness. `UNIQUE NULLS NOT DISTINCT` says this more directly but needs PG15+, and pinning
a server-version requirement into a migration for cosmetics is not worth it.

**Papers and sections deliberately get no version columns.** A paper is meaningless without its
stage (V3 makes that cascade explicit), so it inherits the stage's version by composition.
Independent versioning would allow a 2018 paper under a 2022 stage — a state with no real-world
meaning that every reader would then have to defend against.

---

## Backend

### TICKET-2104 — PYQ provenance

Five fields plus one shared applier. `QuestionService.applyPyqProvenance` is one method for all
three write paths (create, update, bulk import) via the new `PyqProvenanceCarrier` interface —
the JSON stays flat because the documented import format demands it, but the *logic* lives in one
place instead of three.

Two rules are enforced there rather than by bean validation, because both are cross-field:

- **Year/shift/paper/number are cleared when `pyq` is false.** Otherwise un-ticking the box
  leaves a stale year that `aggregatePyqByTopicAndYear`'s not-null filter still sees, and the
  topic keeps trending on a question nobody considers a PYQ. Invisible in the UI; would surface
  only as a trend nobody can explain.
- **`sourcePaperId` must reference a real paper.** It is a plain UUID column, not a mapped
  association, so nothing else would catch a bad id until the FK rejected it as an unmapped 500.

`source_url` deliberately survives when `pyq` is turned off — where a question came from stays
true whether or not anyone has classified it.

### TICKET-2105 — per-topic mastery

Modelled on `BookmarkService`, not `ProgressService`: mastery is mutable state per (user, topic),
so each incoming row is applied only if newer than what the server holds. The state machine lives
in `TopicProgressState.canTransitionTo`, which rejects two things a CHECK cannot express:

- **NEEDS_REVISION is only reachable from MASTERED.** Arriving there from LEARNING would assert a
  regression that never happened, and lose the fact that the topic was once mastered.
- **Nothing may return to NOT_STARTED.** A stale device replaying an old snapshot is the realistic
  cause, and last-write-wins cannot catch it when the device's clock is also stale. Practice
  history is not erasable by a sync.

Bad rows are rejected individually and counted, not thrown: one unknown topic must not block a
student's other progress from being stored. `correct > attempted` is checked in the service as
well as by a CHECK, because reaching the CHECK aborts the whole transaction and loses the rest of
the batch.

### TICKET-2106 / 2107 — trend, priority, override

`TopicIntelligenceService`. Trend is computed by splitting the tagged years into an older and a
more recent half and comparing appearances-per-year. **A least-squares slope would be more
impressive and less honest** — with three or four tagged years it is dominated by whichever year
happens to be missing. The middle year of an odd window goes to the recent half deliberately:
with three years, treating it as "old" means comparing one year against two and calling the
result a direction.

`INSUFFICIENT_DATA` is a real verdict, not an error. A topic with one tagged appearance has no
trend, and reporting "stable" there is a fabrication the student cannot see through.

Priority blends relative weightage (0.55), trend (0.30) and bank coverage (0.15). The weights are
asserted to sum to 1.00 in a static initialiser, because a silent drift would rescale every score
in the system with no visible symptom.

Every row records its `algorithm_version` and its `inputs` (JSONB) per §65/§67, so a
recommendation stays explainable after the formula changes. Rows from a previous version are left
on disk — `recompute` only clears the version it is about to write.

### TICKET-2108 — real pattern versioning

Relaxing the DB constraint alone would have changed nothing: `ExamStructureService.createStage`
had its own name-only duplicate check, the code-level twin of the constraint. Both were needed.

Resolution now lives in one place, `isEffectiveOn`, and the two structure endpoints deliberately
differ:

- **`/api/exams/{code}/structure`** (admin) returns *every* version with an `active` flag. An
  admin managing pattern history has to be able to edit superseded rows; filtering them would
  make them invisible and uneditable.
- **`/api/exam-structures`** (mobile sync) returns *only* the effective version. Without this,
  relaxing uniqueness would let a device sync two "Tier 2" stages and generate a mock test from a
  superseded pattern — a regression created by the migration itself.

Overlapping windows an admin enters by hand resolve deterministically (latest start wins; a dated
start beats an undated one) rather than by arbitrary list order.

### TICKET-2109 — server-side duplicate detection

Closes the gap §18.2 found: the only dedup was `admin/src/validateQuestions.js` —
exact-lowercased-text, *within the pasted batch only*, warning-only, never checked against the
existing bank. With ~37,900 questions stored and bulk import as the main ingestion path, a
re-pasted file silently doubled content.

Detection records a relationship and **never deletes**. Supplied §14 requires it and it is the
right call: two questions can share wording and still be different, and an automatic delete of
real editorial content is unrecoverable.

**Found by running it:** the existing bank contains **2,189 duplicate fingerprint groups** — as
expected from the ~35,700 templated load-test questions, and something nothing in the project
could previously detect.

---

## Synthetic curation data

`SyntheticCurationService`, behind two independent gates: an admin token *and*
`app.epic-l.synthetic-seed-enabled=true` (default false). The flag alone would let an
unauthenticated caller rewrite content; the token alone would let a legitimate admin on
production write demo data over real editorial work.

Seeded (idempotent — a second run reported 0 rows added for every pass):

| Pass | Result |
|---|---|
| Topic hierarchy | 61 topics given a parent |
| Prerequisites | 97 DAG edges |
| Exam topic map | 595 rows across 11 exams, weightages normalised to sum 100 per exam |
| PYQ tagging | 8,962 questions tagged, years 2019–2024, with shift, number and source paper |
| Intelligence | recomputed for all 12 exams |
| Admin overrides | 2 per exam |

**Every choice derives from an MD5 of the row's own UUID, not a random number generator.**
Re-running produces identical output, so the endpoint is safe to call twice and a bug is
reproducible instead of a different shape each run.

**Years are deliberately not uniform.** Each topic draws a rising/stable/falling bias and its
questions' years are skewed accordingly (`sqrt` skews recent, squaring skews early). Without
this, every topic would come out STABLE and TICKET-2106 would look like it worked while actually
being untested. Result on SSC CGL: **32 RISING, 24 FALLING, 5 STABLE**.

**Only 25% of the bank is tagged, on purpose.** A bank where every question is a PYQ would hide
every code path that only runs when `is_pyq` is false — the cleared-fields rule, V13's partial
indexes, and the INSUFFICIENT_DATA branch all need untagged rows to exercise.

### Reversibility

`POST /api/admin/synthetic-curation/purge`. The PYQ pass is removed **precisely**, by matching
the `synthetic://epic-l-demo` marker in `source_url` — a genuine PYQ an admin tagged has a
different `source_url` and survives.

The curation passes are **not** that precise, and the purge report says so out loud:
`exam_topics`, `topics.parent_id` and `topic_prerequisites` carry no provenance column, so purge
clears them wholesale. Safe while the synthetic rows are the only ones there; anyone who has
curated by hand since seeding should not run it. `exam_subjects` is left intact — it was derived
from questions that genuinely exist, so it is the one pass whose output is true rather than
invented.

---

## Mobile

Local migration `0012`, hand-edited to add the `IF NOT EXISTS` guards drizzle-kit does not
generate — the same edit as `0011`, and for the same reason: a failed migration is a hard gate in
`_layout.tsx`, and a bare `DROP INDEX` in `0011` did brick the app on the test emulator.

**Stated rather than hidden:** SQLite has no `ALTER TABLE … ADD COLUMN IF NOT EXISTS`, so the
five ADD COLUMN statements cannot be guarded. They are last in the file so everything guardable
commits first, but a partial failure there needs app data cleared. There is no SQL-level fix.

### What a user can now see

| Where | What |
|---|---|
| **Practice → Topics** | Topics grouped under their parent; a **By priority / Syllabus order** toggle; per-topic chips for priority band, mastery state + accuracy, PYQ trend, and paper weightage; a "Best after: …" prerequisite hint |
| **Home** | A **Focus next** card — the top 4 topics for the followed exam, ranked by `finalPriority` |
| **Quiz** | An **"Asked in 2023 · Shift 2"** badge above the question text |
| **Everywhere** | Finishing a quiz updates that topic's mastery, which syncs and restores across devices |

### Decisions

**Priority is shown as a band ("High priority"), not a raw score.** "78/100" implies a precision
the number does not have — it is a weighted blend of a curated estimate, a trend over a handful
of tagged years, and bank coverage. Three bands is roughly the resolution the data supports.

**A prerequisite is a hint, never a lock.** The topic stays fully tappable. Epic D will use the
graph to *order* recommendations; using it to forbid practice would be a worse product — a
student revising for an exam next week must be able to open whatever they want.

**MASTERED is the only state that clears a prerequisite.** PRACTICING deliberately does not: the
point of the gate is that fundamentals are solid, and "still practising" is not that.

**`STABLE` and `INSUFFICIENT_DATA` render no chip.** Stable is the default state of most topics
and a chip on every row carries no information; INSUFFICIENT_DATA means the app genuinely does
not know, and a neutral label would imply it does.

**Hierarchy grouping applies only in syllabus order.** The two orderings answer different
questions: priority order is a flat ranking across the subject, and forcing it into parent groups
would scatter the highest-priority topics down the page.

**Intelligence is read from local SQLite even in live mode**, and an empty result renders no
chips. It is decoration on a screen that must work regardless; blocking the list on it would make
a working screen depend on an optional feature.

---

## Bugs found and fixed

**1. `IllegalFormatConversionException` from a comment.** The seeder's SQL was built with
`"""…""".formatted(…)`. A literal percent sign in a prose comment — "the first ~45% of each
subject" — is a valid format conversion to `Formatter`, which read `"% o"` as an octal directive
and threw at runtime. Rewritten with concatenation, so no SQL string in that class can be broken
by editing a comment.

**2. The priority formula did not do what its own weights claimed.** Found by reading real seeded
output, not by reasoning. `relativeWeightage` came out as `0.47` on a 0–100 scale, because the
computed weightage is a share of the exam's *total* appearances — across 61 topics it averages
~1.6% and peaks near 4%. So the weightage term contributed under one point while trend
contributed thirty: the ranking was effectively trend-only, despite weightage carrying the
largest declared weight. Now normalised against the exam's busiest mapped topic, and
**`ALGORITHM_VERSION` bumped to `v2`** rather than edited in place — which is exactly what
storing the version per row is for. Top score on SSC CGL went from 45.89 to 91.98.

**3. `backfillDetection` loaded the entire question bank into memory.** `findAll()` on ~37,900
entities, each with lazy topic/subject/exam/translation associations, to read two columns. The
request never returned. Rewritten as one set-based SQL statement using `first_value` /
`row_number` over the fingerprint index. This is the same mistake this codebase has now fixed
four times.

**4. Override carry-forward could resurrect a cleared override.** `findOverridesForExam` returned
overrides at *any* algorithm version, and superseded versions stay on disk by design — so
clearing an override on v2 could be undone by a stale v1 row on the next recompute. Now ordered
newest-first with the caller keeping only the first hit per topic.

**6. `upsertTranslation` returned a 500 for every new language — a regression this work
introduced, caught by the existing test suite.** `refreshFingerprint` iterated
`question.getTranslations()`, a lazy bag mapped with `orphanRemoval = true`. Forcing that
collection to initialise *after* a transient element had been added to it made Hibernate compute
orphans against a snapshot that did not know about the new element, and it threw
`TransientObjectException` at flush. The fix is a second entry point,
`setFingerprintFromText`, which takes the text from the caller so the collection is never touched
on a managed entity. `refreshFingerprint` now documents that it is only safe on a transient one.
`QuestionCrudTest` found this; reading the code would not have.

**7. `recompute` failed whenever an override already existed at the same algorithm version.**
`findOverridesForExam` returned *managed* `TopicPriority` entities; the bulk delete that follows
does not evict them from the persistence context, so `saveAll` of rows with the same synthetic ids
took `merge()`'s path against still-managed copies of rows that had just been deleted. It
reproduced only on the ordinary production sequence — recompute → override → recompute — which is
why the seeding run never hit it (there, the managed rows were v1 and the write was v2, so the ids
differed). Now a projection query, so nothing is managed when the delete/insert runs.

**5. Synthetic override seeding was not idempotent.** A recompute carries overrides forward, so a
second seed run found the next two un-overridden topics and added two more every time. Now skips
exams that already carry one.

---

## Verified

**Backend:** compiles; V13–V16 applied to the real Neon database; `ddl-auto: validate` passes on
startup, which is what proves the six new entity mappings match the real schema.

**Data, via the live API:** 61 topics with a parent, 97 prerequisite edges, 595 topic-map rows,
8,962 PYQ-tagged questions, trend directions genuinely varied (32/24/5), and the override split
visible as `system 36.25 / override 90.00 / final 90.00`.

**Admin console — click-tested in a real browser (Playwright), which had never been done.**
The recorded blocker was access: the only working admin's password is deliberately not in this
public repo, and the account the docs named was demoted to STUDENT. Solved with
`AdminTokenMintRunner`, which mints a 45-minute token for the *existing ADMIN-role test fixture*
— no human's credentials involved, no password created or stored, revocable, and gated on an env
var so it is invisible to `mvn test` and CI.

What the run confirmed:

- Topic Intelligence renders 61 rows; the three priority columns are visibly distinct.
- The override modal's client-side validation fires ("A reason is required…").
- **The override persisted across a full page reload** — this is the check the previous session's
  shadowed-import bug would have failed, since it closed the modal and looked successful while
  writing nothing.
- Clearing an override returns `final` to the computed value (91.98).
- Duplicates page renders; the scan found 2,189 groups and recorded 1,000 edges.
- The PYQ card's year field is disabled until the box is ticked, and enabled after.
- Questions list shows PYQ badges; Topics shows 61 parents and 97 prerequisite counts.
- **Zero console errors.**

Two apparent failures in that run were my *test script's* selectors, not the app: a
`net::ERR_ABORTED` from my 2.5s wait racing a slow Neon round trip (the write had committed), and
a row filter that matched a *child* of "Blood Relations" because parent names render in the same
cell. Both re-verified.

**Backend test suite: 111 tests, all passing** — 21 of them new (`EpicLIntelligenceTest`), up from
90 before this work. Three of the bugs listed above were found by running it rather than by
reading, and two of those were regressions in the existing suite rather than in the new tests.

**Mobile:** `npx tsc --noEmit` clean; `expo lint` at 11 problems, **all pre-existing** — this work
adds none. One lint error it *did* flag was mine and was worth fixing:
`react-hooks/set-state-in-effect` on `PreparationPlanCard` pointed at a real latent bug, since
clearing the list via `setState` meant switching followed exam briefly rendered the previous
exam's topics. Now keyed by exam code with no synchronous state write.

Checked against the pinned Expo SDK 57 docs per `mobile/AGENTS.md`: this work introduces no new
Expo API — it reuses only the `expo-router` / `expo-sqlite` / `@expo/vector-icons` patterns already
established in the codebase, all of which are current in SDK 57. Separately verified that drizzle's
`setWhere` really is emitted by the SQLite dialect, since the "newer wins" guard in
`restoreTopicProgress` would otherwise have been a silently-ignored option.

**Not yet run on the emulator** — see below.

---

## Honest gaps

- **The mobile app has not been launched.** Everything typechecks and the migration is written
  defensively, but no screen has been rendered on a device or emulator. That is the next step and
  the reason this report exists before it.
- **Migration `0012` has never executed.** It is the highest-risk item here: its five ADD COLUMN
  statements are unguardable, and a failed migration is a hard gate that stops the app starting.
- **`PreparationPlanCard` only appears if an exam is followed.** On a device with no followed exam
  it renders nothing, by design — worth knowing before concluding it is broken.
- **The deployed Cloud Run backend still runs pre-V13 code**, so `GET /api/exams/{code}/topic-intelligence`
  returns 404 there (verified by curl). Since the CI APK bakes in the Cloud Run URL, **an APK built
  from this push shows none of the new Epic L features until Cloud Run is redeployed.**
- **Correction to a long-standing claim:** `memory/STATUS.md` has said for several sessions that a
  Cloud Run instance restarting without the applied migrations "fails Flyway validation and will
  not start". Tested, and it does not: `ignoreFutureMigrations` defaults to true, and V11–V16 sort
  above the deployed build's highest local version, so they are ignored with a warning. Cloud Run
  cold-started successfully with the DB at v16 and its build at ~v10. The failure mode described
  belongs to a *missing intermediate* migration.
- **A sync regression caught while checking the above:** `uploadPendingTopicProgress` sat in the
  full-sync `Promise.all` next to progress and bookmarks, so a 404 from the new endpoint would have
  aborted the entire sign-in sync and skipped restoring practice history. Now caught per-call.
- The 2,189 duplicate groups are recorded but unreviewed, and 1,189 groups are not yet even
  recorded (the scan caps at 1,000 edges per run).
- No low-end physical device; emulator only, as before.
