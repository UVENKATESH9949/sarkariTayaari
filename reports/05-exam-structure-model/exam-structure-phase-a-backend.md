# Exam Structure — Phase A: Schema & Backend

**Status:** ✅ done, verified against the live Neon database (2026-08-15)
**Scope:** TICKET-901 → TICKET-908. Design rationale lives in Section 7 of `offline-exam-app-requirements.md`.

---

## What this closes

The content model had no relation between an exam and the subjects it covers — the only path was `Exam → question_exam_types → Question → Topic → Subject`, so a subject "belonged to" an exam purely as a side effect of content tagging. That produced three real defects:

1. Practice listed **every** subject for every exam (`getSubjectStats()` scopes only the count, not the list).
2. The relation existed anyway, hardcoded in `mobile/src/mockTest/blueprints.ts` and **matched by subject name string** — renaming a subject in the admin UI would silently empty a mock-test section in a feature that computes real scores.
3. Only SSC_CGL had a blueprint, so activating any other exam would have produced a Mock Test tab that could not build a test.

Real exams are not flat either: UPSC has Prelims (2 papers, one qualifying), Mains (9 descriptive papers) and an Interview; IBPS PO enforces per-section timing. The model is now **Exam → Stage → Paper → Section → Subject(s)**.

---

## Migration V3

New tables: `difficulty_levels`, `paper_types`, `exam_stages`, `exam_papers`, `paper_sections`, `section_subjects`.
New columns: `subjects.display_order/icon/color/color_bg`, `topics.display_order`.
New constraint: `questions.difficulty` promoted from a free-form `VARCHAR(20)` to a **foreign key**.

That last one was the notable accuracy fix. The backend previously accepted *any* difficulty string while both clients hardcoded exactly three, so a typo saved cleanly and then rendered nowhere. Before writing the constraint I checked the live data — all 113 rows held clean `easy` (54) / `medium` (48) / `hard` (11) — so no cleanup step was needed.

**Delete semantics are deliberately asymmetric.** `stage → paper → section → section_subjects` cascade, because those are pure composition and meaningless alone. Exams do **not** cascade into stages: deleting an exam that has a pattern fails loudly rather than silently discarding it.

---

## Nothing exam-domain left in code

| Was hardcoded | Now |
|---|---|
| `blueprints.ts` per-exam pattern | `exam_stages` / `exam_papers` / `paper_sections` / `section_subjects` |
| `"easy" \| "medium" \| "hard"` union, labels, icons, colours | `difficulty_levels` rows |
| `paper_type` as an enum | `paper_types` rows, with `is_mockable` |
| `constants/subjects.ts` icon/colour keyed by name | `subjects.icon` / `color` / `color_bg` |
| No ordering on subjects/topics | `display_order` on both |

Subject styling and difficulty colours were backfilled from the current mobile constants, so the switch is visually identical.

---

## API

- `GET /api/exams/{code}/structure` — the whole tree in display order.
- `/api/exam-stages`, `/api/exam-papers`, `/api/paper-sections` — full CRUD, filterable by parent.
- `/api/difficulty-levels` (active) + `/all` (admin), full CRUD.
- `/api/paper-types` — full CRUD.

Two decisions worth recording:

**Marking inheritance is resolved server-side.** A section's `marksCorrect`/`marksWrong` are null by default and fall back to the paper's. The structure response returns both the raw override *and* `effectiveMarksCorrect`/`effectiveMarksWrong`, so no client reimplements the rule and none of them can disagree about it. `sectionallyTimed` is exposed the same way rather than making every consumer infer it from a null check.

**`difficulty` stays a `String` on `Question`.** Mapping it as a `@ManyToOne` would have changed the question API shape and broken mobile for no gain. Instead `QuestionService.requireDifficultyExists()` returns a readable 400 and the DB foreign key is the backstop.

---

## Performance

The structure is a 4-level tree — exactly the shape that produced the earlier ~59s N+1 sync. `findStructureByExamCode` join-fetches papers and paper types, then lets sections and their subjects load through the existing `hibernate.default_batch_fetch_size: 50`, turning them into a couple of `WHERE id IN (...)` batches. Deliberately *not* join-fetching sections as well: two collection fetch-joins in one query is a `MultipleBagFetchException`, and even with `Set`s it would multiply rows. Every foreign key is indexed.

---

## Seed data

**SSC CGL Tier 1** reproduces `blueprints.ts` exactly — 60 minutes, +2/−0.5, 4 sections × 25 — so the existing Mock Test cannot regress. Section names use the real paper's wording ("General Intelligence and Reasoning", "English Comprehension"), which is why the subject mapping is explicit rather than a name match.

**IBPS PO Preliminary** was seeded specifically to exercise per-section timing before the model was trusted: three sections at 20 minutes each rather than sharing the paper's hour.

---

## Verification

**48 tests pass** (35 existing, unchanged + 13 new across `ExamStructureTest` and `DifficultyLevelTest`), self-cleaning per the TICKET-110 convention. One ordering bug was caught while writing them: a subclass `@AfterEach` runs *before* the base class's, so deleting a difficulty level while a test question still referenced it hit the new foreign key — the fix deletes the questions first.

Verified live against the running backend and the real database:

- **SSC CGL** returns 60 min, +2/−0.5, 4 × 25, with sections resolving to `effectiveMarksCorrect: 2.00` by inheritance.
- **IBPS PO** returns three sections with `sectionallyTimed: true` at 20 minutes each.
- **Runtime add** — created a new stage, paper and two sections purely through the API: one section inheriting (`raw null → effective +3/−1`) and one overriding (`+2/−0.5`), confirming an admin can extend an exam with no code change.
- **Cascade** — deleting that stage removed its paper and both sections, leaving zero orphans.
- **Difficulty guard** — an unknown value returns `400 {"error":"Unknown difficulty: super-hard"}` rather than a raw 500.
- **No collateral damage** — after the full suite: only the three seeded difficulty levels remain, zero leftover test stages, both real structures intact, and the question count unchanged at 113.

---

## Note

The Phase 1 report cited "39 tests"; the actual count in source was 35 before this work (verified by counting `@Test` methods). Nothing is being skipped — the earlier figure was simply wrong.

---

## Next

**Phase B — Admin UI.** A nested Stage → Paper → Section → Subjects editor, plus CRUD screens for difficulty levels and paper types, and the new subject/topic ordering and styling fields. This is the hardest part of the whole change; the schema was the easy half.

**Phase C — Mobile.** Sync the new tables, delete `blueprints.ts` in favour of real data, scope Practice's subject list to the actual syllabus, make Mock Test paper-aware, and skip non-mockable papers. Mobile must render whatever arrives — no exhaustive unions, no name-keyed lookups.

**Phase D (optional).** An Exam Pattern screen. Aspirants search for exactly this information, and it is nearly free once the data exists.
