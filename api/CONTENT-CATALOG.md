# Content Catalog API

Covers the lookup/catalog controllers that describe *what content exists and how it's
organised*, as opposed to the question bank itself: `ExamController`, `SubjectController`,
`TopicController`, `LanguageController`, `DifficultyLevelController`, `PaperTypeController`,
`ExamStructureController`, and `ExamBadgeController`. For the underlying entity model
(exams → stages → papers → sections, subjects → topics → questions, and the `exam_subjects`
vs `section_subjects` distinction) see `system-design/02-database.md` — it is not re-explained
here beyond what's needed to read the endpoints below.

**Public vs admin, at a glance:** every endpoint that mobile calls for offline content sync is
deliberately public (no auth) per ADR-009 — that's `GET /api/exams`, `/api/subjects`,
`/api/topics`, `/api/difficulty-levels`, `/api/paper-types`, `/api/exam-badges`, and
`/api/exam-structures`. Everything else — every write, every "list including inactive rows"
admin variant, and the single-exam/topics/structure reads used by the admin editor — requires
an admin bearer token. All auth (`requireUser`/`requireAdmin`) is opaque-bearer-token based;
see `api/AUTH.md`.

---

## ExamController (`/api/exams`)

### POST /api/exams
**Purpose:** Create an exam.
**Auth:** admin
**Request:** `{ code: string, name: string, imageUrl?: string, active: boolean, displayOrder: int, difficulty?: string, badge?: string }`
**Response:** `201 Created` — `ExamResponse`: `{ code, name, imageUrl, active, displayOrder, difficulty, badge }`
**Errors:** 400 validation (blank code/name); 400 `"Exam code already exists: <code>"`; 400 `"Unknown difficulty: <value>"` / `"Unknown badge: <value>"` if those optional codes don't match an existing `difficulty_levels`/`exam_badges` row.
**Business rules:** `code` is the primary key (not a generated id) — it's the human-chosen exam code (e.g. `SSC_CGL`), immutable identity for the row. `difficulty`/`badge` are optional FKs; blank string is normalised to `null` rather than tripping a constraint.
**Consumers:** Admin.

### GET /api/exams/{code}
**Purpose:** Fetch one exam by code.
**Auth:** admin
**Request:** none
**Response:** `ExamResponse`
**Errors:** 404 `"Exam not found: <code>"`.
**Business rules:** None beyond lookup.
**Consumers:** Admin. (Not used by mobile — mobile has no need for a single-exam fetch; it syncs the whole list.)

### GET /api/exams
**Purpose:** List active exams — the Home-screen exam cards.
**Auth:** none
**Request:** none
**Response:** `ExamResponse[]`, ordered by `displayOrder`, filtered to `active == true`.
**Errors:** none.
**Business rules:** Deliberately public — mobile's content-sync source.
**Consumers:** Both. Mobile calls this for its synced exam list; the admin list screen also calls it (`admin/src/api.js: listExams`) even though `/all` exists — worth noting the admin app doesn't consistently use the `/all` variant everywhere it lists exams.

### GET /api/exams/all
**Purpose:** List every exam, including inactive ones, for the admin management screen.
**Auth:** admin
**Request:** none
**Response:** `ExamResponse[]`, ordered by `displayOrder`, unfiltered.
**Errors:** 401/403 if not an admin.
**Consumers:** Admin.

### GET /api/exams/{code}/subjects
**Purpose:** Get the exam's syllabus — every subject it covers (`exam_subjects`), independent of whether a paper pattern exists yet.
**Auth:** admin
**Request:** none
**Response:** `SubjectResponse[]` (sorted by displayOrder then name): `{ id, name, displayOrder, icon, color, colorBg, examCodes: string[] }`
**Errors:** 404 if the exam code doesn't exist.
**Business rules:** This is the **syllabus**, not the paper layout — see "exam_subjects vs section_subjects" below. It can be non-empty even when the exam has zero stages/papers/sections defined.
**Consumers:** Admin only today (`admin/src/api.js: getExamSyllabus`). Not used by mobile — mobile instead gets syllabus subjects embedded in `GET /api/exam-structures`' `syllabusSubjects` field, so it doesn't need this endpoint even though it's the same underlying data.

### PUT /api/exams/{code}/subjects
**Purpose:** Replace the exam's syllabus with exactly the subjects supplied.
**Auth:** admin
**Request:** `{ subjectIds: uuid[] }` — full replacement list; an empty array clears the syllabus.
**Response:** `SubjectResponse[]` — the syllabus after the update.
**Errors:** 404 unknown exam; 400 `"Unknown subjectId: <id>"` for any id that doesn't resolve.
**Business rules:** Whole-list replace, not add/remove deltas — matches how the admin checklist UI edits it.
**Consumers:** Admin.

### GET /api/exams/{code}/topics
**Purpose:** Get the exam's topic map — finer-grained than `/subjects`: which specific topics matter for this exam, with the admin's curated weightage per topic.
**Auth:** admin
**Request:** none
**Response:** `ExamTopicResponse[]`: `{ topicId, topicName, subjectId, subjectName, parentId, parentName, weightagePercent }`
**Errors:** 404 if the exam code doesn't exist (returns 404 rather than a misleading empty list).
**Business rules:** Admin-only "for now" per the controller's own comment — no mobile screen consumes exam-level topic weightage yet; exposing an unfinished curation surface publicly would be premature.
**Consumers:** Admin only.

### PUT /api/exams/{code}/topics
**Purpose:** Replace the exam's topic map with exactly the topics (and weightages) supplied.
**Auth:** admin
**Request:** `{ topics: [{ topicId: uuid, weightagePercent?: decimal }] }` — full replacement.
**Response:** `ExamTopicResponse[]` — the topic map after the update.
**Errors:** 404 unknown exam; 400 `"Duplicate topicId in request: <id>"`; 400 `"Unknown topicId: <id>"`.
**Business rules:** Whole-list replace. `weightagePercent` is optional per entry — null means "relevant, not yet weighted".
**Consumers:** Admin.

### PUT /api/exams/{code}
**Purpose:** Update an exam.
**Auth:** admin
**Request:** `ExamRequest` (same shape as create) — full replace: omitted booleans/ints reset to `false`/`0` (per the admin client's own comment on this call).
**Response:** `ExamResponse`
**Errors:** 404 unknown exam; same 400s as create for unknown `difficulty`/`badge` codes.
**Consumers:** Admin.

### DELETE /api/exams/{code}
**Purpose:** Delete an exam.
**Auth:** admin
**Request:** none
**Response:** `204 No Content`
**Errors:** 404 `"Exam not found: <code>"`.
**Business rules:** No explicit cascade guard shown in the service beyond the DB's own FK behavior — deleting an exam that still has stages/subjects linked relies on the schema, not an application-level check.
**Consumers:** Admin.

---

## SubjectController (`/api/subjects`)

Subjects are global — shared across all exams (`system-design/02-database.md`), not owned by
one exam.

### POST /api/subjects
**Purpose:** Create a subject.
**Auth:** admin
**Request:** `{ name: string, displayOrder: int, icon?: string, color?: string, colorBg?: string }`
**Response:** `201 Created` — `SubjectResponse`: `{ id, name, displayOrder, icon, color, colorBg, examCodes: string[] }`
**Errors:** 400 validation (blank name); 400 `"Subject already exists: <name>"` (case-insensitive name uniqueness).
**Consumers:** Admin.

### GET /api/subjects/{id}
**Purpose:** Fetch one subject.
**Auth:** admin
**Response:** `SubjectResponse`
**Errors:** 404 `"Subject not found: <id>"`.
**Consumers:** Admin.

### GET /api/subjects
**Purpose:** Global subject list, shared by every exam.
**Auth:** none
**Response:** `SubjectResponse[]`, ordered by displayOrder then name.
**Business rules:** Deliberately public — mobile's sync source for the subject catalog.
**Consumers:** Both — mobile syncs this directly; admin also uses it to populate pickers (`getSubjects`/`listSubjects`).

### PUT /api/subjects/{id}
**Purpose:** Update a subject.
**Auth:** admin
**Request:** `SubjectRequest` (same shape as create)
**Response:** `SubjectResponse`
**Errors:** 404 unknown id; 400 duplicate name.
**Consumers:** Admin.

### DELETE /api/subjects/{id}
**Purpose:** Delete a subject.
**Auth:** admin
**Response:** `204 No Content`
**Errors:** 404 `"Subject not found: <id>"`.
**Consumers:** Admin.

---

## TopicController (`/api/topics`)

Topics belong to exactly one subject and optionally to a parent topic (hierarchy) and a set
of prerequisite topics (a DAG, used for sequencing — see `TopicService`).

### POST /api/topics
**Purpose:** Create a topic.
**Auth:** admin
**Request:** `{ subjectId: uuid, name: string, displayOrder: int, parentId?: uuid, prerequisiteTopicIds?: uuid[] }`
**Response:** `201 Created` — `TopicResponse`: `{ id, subjectId, subjectName, name, displayOrder, parentId, parentName, prerequisiteTopicIds: uuid[] }`
**Errors:** 400 validation; 400 `"Unknown subjectId: <id>"`; 400 `"Topic already exists under this subject: <name>"` (case-insensitive, scoped per subject); 400 `"Unknown parentId: <id>"`; 400 `"A topic cannot be its own parent"`; 400 `"That parent would create a cycle in the topic hierarchy"`; 400 `"A topic's parent must belong to the same subject"`; 400 `"Unknown prerequisiteTopicId: <id>"`; 400 `"A topic cannot be its own prerequisite"`; 400 cycle-in-prerequisite-graph message.
**Business rules:** `prerequisiteTopicIds` is a full-replacement list like the exam syllabus, but with a "leave unchanged" escape hatch: **`null` leaves prerequisites untouched, an empty list clears them** — so an older client that doesn't send the field can't silently wipe curated edges. Both the parent hierarchy and the prerequisite graph are cycle-checked server-side (DFS reachability) since neither a DB FK nor a CHECK constraint can express that.
**Consumers:** Admin.

### GET /api/topics/{id}
**Purpose:** Fetch one topic.
**Auth:** admin
**Response:** `TopicResponse`
**Errors:** 404 `"Topic not found: <id>"`.
**Consumers:** Admin.

### GET /api/topics
**Purpose:** List topics, optionally filtered to one subject.
**Auth:** none
**Request:** query param `subjectId?` (uuid)
**Response:** `TopicResponse[]`, ordered by displayOrder then name.
**Business rules:** Deliberately public — mobile's sync source (optionally scoped by subject).
**Consumers:** Both — mobile syncs the full/subject-scoped list; admin uses it for pickers (`getTopics`/`listTopics`).

### PUT /api/topics/{id}
**Purpose:** Update a topic.
**Auth:** admin
**Request:** `TopicRequest` (same shape as create)
**Response:** `TopicResponse`
**Errors:** same set as create, applied to the existing row (unknown subject/parent/prerequisite ids, cycle checks, duplicate name-under-subject).
**Consumers:** Admin.

### DELETE /api/topics/{id}
**Purpose:** Delete a topic.
**Auth:** admin
**Response:** `204 No Content`
**Errors:** 404 `"Topic not found: <id>"`.
**Consumers:** Admin.

---

## LanguageController (`/api/languages`)

### POST /api/languages
**Purpose:** Create a language.
**Auth:** admin
**Request:** `{ code: string, name: string, active: boolean }`
**Response:** `201 Created` — `LanguageResponse`: `{ code, name, active }`
**Errors:** 400 validation; 400 `"Language code already exists: <code>"`.
**Consumers:** Admin.

### GET /api/languages
**Purpose:** List active languages — the mobile-facing list.
**Auth:** none
**Response:** `LanguageResponse[]`, active only.
**Business rules:** Deliberately public.
**Consumers:** Both — mobile syncs this; admin's own list screen also calls the active-only endpoint by default (`listLanguages`), with `/all` reserved for the admin management screen.

### GET /api/languages/all
**Purpose:** List every language, including inactive, for the admin management screen.
**Auth:** admin
**Response:** `LanguageResponse[]`, unfiltered.
**Consumers:** Admin.

### PUT /api/languages/{code}
**Purpose:** Update a language.
**Auth:** admin
**Request:** `LanguageRequest`
**Response:** `LanguageResponse`
**Errors:** 404 `"Language not found: <code>"`.
**Consumers:** Admin.

### DELETE /api/languages/{code}
**Purpose:** Delete a language.
**Auth:** admin
**Response:** `204 No Content`
**Errors:** 404 `"Language not found: <code>"`.
**Consumers:** Admin.

---

## DifficultyLevelController (`/api/difficulty-levels`)

Lookup list of difficulty options (easy/medium/hard) plus their display color/icon, used to
tag exams and questions.

### POST /api/difficulty-levels
**Purpose:** Create a difficulty level.
**Auth:** admin
**Request:** `{ code: string, label: string, displayOrder: int, color?: string, colorBg?: string, icon?: string, active: boolean }`
**Response:** `201 Created` — `DifficultyLevelResponse`: `{ code, label, displayOrder, color, colorBg, icon, active }`
**Errors:** 400 validation; 400 `"Difficulty level already exists: <code>"`.
**Consumers:** Admin.

### GET /api/difficulty-levels
**Purpose:** List active difficulty levels — the mobile-facing list.
**Auth:** none
**Response:** `DifficultyLevelResponse[]`, active only, ordered by displayOrder.
**Business rules:** Deliberately public.
**Consumers:** Both — mobile syncs this; the admin Level screen also renders this active-only list directly (per `mobile/src/api/reference.ts` comment, "drives the Level screen, which renders whatever it receives"), with `/all` reserved for the admin management CRUD screen.

### GET /api/difficulty-levels/all
**Purpose:** List every difficulty level, including inactive, for the admin management screen.
**Auth:** admin
**Response:** `DifficultyLevelResponse[]`, unfiltered.
**Consumers:** Admin.

### PUT /api/difficulty-levels/{code}
**Purpose:** Update a difficulty level.
**Auth:** admin
**Request:** `DifficultyLevelRequest`
**Response:** `DifficultyLevelResponse`
**Errors:** 404 `"Difficulty level not found: <code>"`.
**Consumers:** Admin.

### DELETE /api/difficulty-levels/{code}
**Purpose:** Delete a difficulty level.
**Auth:** admin
**Response:** `204 No Content`
**Errors:** 404 `"Difficulty level not found: <code>"`.
**Consumers:** Admin.

---

## PaperTypeController (`/api/paper-types`)

Lookup list of paper kinds (e.g. objective, descriptive) plus whether a mock test can be
generated from a paper of that type (`mockable`).

### POST /api/paper-types
**Purpose:** Create a paper type.
**Auth:** admin
**Request:** `{ code: string, label: string, mockable: boolean, displayOrder: int }`
**Response:** `201 Created` — `PaperTypeResponse`: `{ code, label, mockable, displayOrder }`
**Errors:** 400 validation; 400 `"Paper type already exists: <code>"`.
**Consumers:** Admin.

### GET /api/paper-types
**Purpose:** List all paper types — mobile's sync source; there is no active-only split here (unlike exams/languages/difficulty-levels/badges).
**Auth:** none
**Response:** `PaperTypeResponse[]`, ordered by displayOrder, unfiltered (no `active` flag exists on this entity at all).
**Business rules:** Deliberately public.
**Consumers:** Both.

### PUT /api/paper-types/{code}
**Purpose:** Update a paper type.
**Auth:** admin
**Request:** `PaperTypeRequest`
**Response:** `PaperTypeResponse`
**Errors:** 404 `"Paper type not found: <code>"`.
**Consumers:** Admin.

### DELETE /api/paper-types/{code}
**Purpose:** Delete a paper type.
**Auth:** admin
**Response:** `204 No Content`
**Errors:** 404 `"Paper type not found: <code>"`.
**Consumers:** Admin.

---

## ExamStructureController

Stage → Paper → Section CRUD, plus the two reads that return a whole structure tree. Kept in
one controller because the three levels are only ever meaningful as parts of the same tree.
This is where the **`section_subjects`** side of the syllabus/layout split lives — see the
callout at the end of this section.

### GET /api/exams/{examCode}/structure
**Purpose:** The whole Stage → Paper → Section → Subjects tree for one exam — feeds the admin structure editor.
**Auth:** admin
**Response:** `ExamStructureResponse`: `{ examCode, examName, syllabusSubjects: [{id,name}], stages: [{ id, name, displayOrder, effectiveFrom, effectiveTo, versionLabel, active, papers: [{ id, name, paperType, mockable, durationMinutes, totalMarks, marksCorrect, marksWrong, qualifying, qualifyingPercentage, displayOrder, sections: [{ id, name, questionCount, durationMinutes, sectionallyTimed, marksCorrect, marksWrong, effectiveMarksCorrect, effectiveMarksWrong, displayOrder, subjects: [{id,name}] }] }] }] }`
**Errors:** 404 unknown exam code.
**Business rules:** Returns **every** stage version (superseded ones included), each flagged `active` (whether that version is in force today) — the admin needs to see and edit pattern history, unlike the public sync endpoint below which sends only the current version. `effectiveMarksCorrect`/`effectiveMarksWrong` on each section are server-resolved: a section's own marks override the paper's, and when the section doesn't set them, the paper's values are echoed back — so no client needs to reimplement that fallback.
**Consumers:** Admin.

### GET /api/exam-structures
**Purpose:** Every active exam's full structure in one response — mobile's single-request sync source (avoids one call per exam).
**Auth:** none
**Response:** `ExamStructureResponse[]`
**Business rules:** Deliberately public. Includes active exams that have *no* structure yet (empty `stages`), so the client can tell "exists, no pattern" from "doesn't exist" rather than the exam silently being omitted. Sends **only the effective version** of each stage (see "pattern versioning" below) — a device can never generate a mock test from a superseded pattern; every returned stage's `active` is hardcoded `true` for this reason.
**Consumers:** Mobile only (per `mobile/src/api/reference.ts: getExamStructures` — this is the one endpoint in this controller mobile actually calls; admin instead builds the tree from the granular stage/paper/section endpoints below plus `getExamStructure`).

### POST /api/exam-stages
**Purpose:** Create a stage (a round — Prelims, Mains, Tier 1...) under an exam.
**Auth:** admin
**Request:** `{ examCode: string, name: string, displayOrder: int, effectiveFrom?: date, effectiveTo?: date, versionLabel?: string }`
**Response:** `201 Created` — `ExamStageResponse`: `{ id, examCode, name, displayOrder, effectiveFrom, effectiveTo, versionLabel, active }`
**Errors:** 404 unknown exam; 400 `"'Effective from' cannot be after 'effective to'."`; 400 duplicate name+version-label combination on the same exam (message varies depending on whether a version label was given).
**Business rules:** **Pattern versioning (TICKET-2108):** more than one stage can share a name if they carry different `versionLabel`s (or different effectivity windows) — this is how an exam's pattern can change over time without losing history. `effectiveFrom`/`effectiveTo` are both open-ended: null `effectiveFrom` means "always applied" (true of every pre-2108 row); null `effectiveTo` means "still current"; `effectiveTo` is inclusive. `active` in the response is server-resolved (whether *today* falls in the effectivity window) — clients never derive it themselves. Blank `versionLabel` is normalised to `null`, not `""` (the uniqueness constraint keys off `coalesce(version_label,'')`, so the two must not be treated as different values).
**Consumers:** Admin.

### GET /api/exam-stages
**Purpose:** List stages, optionally filtered to one exam.
**Auth:** admin
**Request:** query param `examCode?`
**Response:** `ExamStageResponse[]`
**Consumers:** Admin.

### PUT /api/exam-stages/{id}
**Purpose:** Update a stage.
**Auth:** admin
**Request:** `ExamStageRequest`
**Response:** `ExamStageResponse`
**Errors:** 404 unknown stage/exam id; same versioning/date validation as create, excluding the row itself from the duplicate check.
**Consumers:** Admin.

### DELETE /api/exam-stages/{id}
**Purpose:** Delete a stage.
**Auth:** admin
**Response:** `204 No Content`
**Errors:** 404 `"Stage not found: <id>"`.
**Business rules:** Cascades — deleting a stage removes its papers and their sections (per the admin client's own comment).
**Consumers:** Admin.

### POST /api/exam-papers
**Purpose:** Create a paper (one sitting, e.g. "Tier 1 (CBE)") under a stage.
**Auth:** admin
**Request:** `{ stageId: uuid, name: string, paperType: string, durationMinutes?: int, totalMarks?: decimal, marksCorrect?: decimal, marksWrong?: decimal, qualifying: boolean, qualifyingPercentage?: decimal, displayOrder: int }`
**Response:** `201 Created` — `ExamPaperResponse`: `{ id, stageId, name, paperType, mockable, durationMinutes, totalMarks, marksCorrect, marksWrong, qualifying, qualifyingPercentage, displayOrder }`
**Errors:** 400 `"Unknown stageId: <id>"`; 400 `"Unknown paper type: <code>"` (must match an existing `paper_types` row); 400 `"Paper already exists in this stage: <name>"` (case-insensitive).
**Business rules:** `mockable` in the response is not stored on the paper itself — it's echoed from the referenced `paper_types` row.
**Consumers:** Admin.

### GET /api/exam-papers
**Purpose:** List papers, optionally filtered to one stage.
**Auth:** admin
**Request:** query param `stageId?`
**Response:** `ExamPaperResponse[]`
**Consumers:** Admin.

### PUT /api/exam-papers/{id}
**Purpose:** Update a paper.
**Auth:** admin
**Request:** `ExamPaperRequest`
**Response:** `ExamPaperResponse`
**Errors:** 400 unknown paper id / stage id / paper type.
**Consumers:** Admin.

### DELETE /api/exam-papers/{id}
**Purpose:** Delete a paper.
**Auth:** admin
**Response:** `204 No Content`
**Errors:** 404 `"Paper not found: <id>"`.
**Business rules:** Cascades to its sections.
**Consumers:** Admin.

### POST /api/paper-sections
**Purpose:** Create a section (e.g. "Quantitative Aptitude", 25 questions) under a paper.
**Auth:** admin
**Request:** `{ paperId: uuid, name: string, questionCount: int, durationMinutes?: int, marksCorrect?: decimal, marksWrong?: decimal, displayOrder: int, subjectIds: uuid[] (non-empty) }`
**Response:** `201 Created` — `PaperSectionResponse`: `{ id, paperId, name, questionCount, durationMinutes, marksCorrect, marksWrong, displayOrder, subjects: [{id,name}] }`
**Errors:** 400 `"Unknown paperId: <id>"`; 400 `"Section already exists in this paper: <name>"` (case-insensitive); 400 `"at least one subject is required"` (validation — `subjectIds` cannot be empty); 400 `"Unknown subjectId: <id>"`.
**Business rules:** **This is where `section_subjects` (the paper-layout link) is written**, distinct from `exam_subjects` (the syllabus). `durationMinutes: null` means the section shares the paper's overall time; a non-null value means it's separately, sectionally timed (IBPS-style). Likewise `marksCorrect`/`marksWrong: null` means "inherit the paper's marking" — resolved server-side elsewhere as `effectiveMarksCorrect`/`effectiveMarksWrong` (see `GET /api/exams/{code}/structure`). **Side effect:** saving a section auto-adds its subjects to the exam's syllabus (`exam_subjects`) if not already present — this is the mechanism ADR-004 describes that keeps the syllabus a guaranteed superset of what the sections reference, so the two links can't silently diverge. It only ever adds, never removes.
**Consumers:** Admin.

### GET /api/paper-sections
**Purpose:** List sections, optionally filtered to one paper.
**Auth:** admin
**Request:** query param `paperId?`
**Response:** `PaperSectionResponse[]`
**Consumers:** Admin.

### PUT /api/paper-sections/{id}
**Purpose:** Update a section.
**Auth:** admin
**Request:** `PaperSectionRequest`
**Response:** `PaperSectionResponse`
**Errors:** same as create, applied to the existing row; also triggers the same syllabus auto-add side effect.
**Consumers:** Admin.

### DELETE /api/paper-sections/{id}
**Purpose:** Delete a section.
**Auth:** admin
**Response:** `204 No Content`
**Errors:** 404 `"Section not found: <id>"`.
**Business rules:** Deleting a section does **not** remove its subjects from the exam's syllabus (`exam_subjects` is only ever added-to by section saves, never pruned by section deletes) — syllabus can end up broader than the current sections, which is by design (ADR-004): "not modeled yet" and "covers nothing" are different facts.
**Consumers:** Admin.

---

## ExamBadgeController (`/api/exam-badges`)

Read-only. The badge vocabulary (editorial tags an admin picks when editing an exam, e.g.
"New", "Popular") is seeded content that changes rarely — there's no CRUD screen for it; adding
a badge is a migration. Both endpoints are simple repository reads with no service layer.

### GET /api/exam-badges
**Purpose:** List active badges — the mobile-facing list, and what exam cards resolve their tag against.
**Auth:** none
**Request:** none
**Response:** `ExamBadgeResponse[]`: `{ code, label, displayOrder, color, colorBg, active }`, active only, ordered by displayOrder.
**Business rules:** Deliberately public.
**Consumers:** Both — mobile resolves an exam's `badge` code against this; admin's exam form dropdown also uses the active-only list by default (`listExamBadges`), separate from `/all`.

### GET /api/exam-badges/all
**Purpose:** Every badge, including inactive, for the admin exam form's dropdown.
**Auth:** admin
**Response:** `ExamBadgeResponse[]`, unfiltered, ordered by displayOrder.
**Consumers:** Admin.

---

## The `exam_subjects` vs `section_subjects` distinction, as it appears in these endpoints

Two different, both-needed links between subjects and exams (full explanation and the "why"
in `system-design/02-database.md`):

- **`exam_subjects` (the syllabus)** — "which subjects does this exam cover." Read/written by
  `ExamController`'s `GET`/`PUT /api/exams/{code}/subjects`, and surfaced read-only as
  `syllabusSubjects` in `ExamStructureController`'s `GET /api/exams/{code}/structure` and
  `GET /api/exam-structures`. Can be non-empty even with zero papers defined.
- **`section_subjects` (the paper layout)** — "which subjects does *this specific 25-question
  section* draw from." Written only via `ExamStructureController`'s
  `POST`/`PUT /api/paper-sections`, as the `subjectIds` field; read back as each section's
  `subjects` array.
- **The one-way sync:** saving a paper section auto-adds its subjects to the exam's syllabus
  (never removes). The syllabus can be broader than the sections reference; it can never be
  narrower. Deleting a section does not retract that addition.

---

## Facts worth flagging

- **`GET /api/exams/{code}` (single exam) requires admin**, even though `GET /api/exams` (the
  full active list) is public — mobile never fetches one exam by code, only the whole synced
  list, so there was no reason to make the single-item read public too.
- **`GET /api/exams/{code}/subjects` (syllabus) is admin-only**, despite the syllabus data
  itself being non-sensitive and effectively public elsewhere: mobile gets the same data for
  free via `syllabusSubjects` in `GET /api/exam-structures`, so this endpoint just never needed
  a public sibling.
- **`GET`/`PUT /api/exams/{code}/topics` (exam-level topic weightage) is admin-only "for now"**
  per the controller's own comment — no mobile screen consumes it yet.
- **`PaperTypeController` has no active/inactive split** — unlike exams, languages, difficulty
  levels, and badges, paper types have no `active` flag at all; `GET /api/paper-types` is the
  only list and it's unfiltered.
- **Saving a paper section silently grows the exam's syllabus** (`exam_subjects`) as a side
  effect — an admin editing paper structure can end up changing syllabus data without visiting
  the syllabus screen at all.
- **`ExamStructureController`'s public sync endpoint (`/api/exam-structures`) and its admin
  endpoint (`/api/exams/{code}/structure`) diverge in what "current" means**: the admin read
  returns every stage version ever entered (flagged `active`/inactive); the public one silently
  drops superseded versions entirely, so a mobile client can never see or generate a mock test
  from a stale pattern.
