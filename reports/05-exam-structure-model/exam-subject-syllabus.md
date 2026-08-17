# Exam ↔ Subject Syllabus

**Status:** ✅ done, verified end-to-end (2026-08-15)
**Scope:** TICKET-931 → TICKET-936.

---

## What was actually missing

The many-to-many relation *did* exist — Quant, Reasoning and English were already shared between SSC CGL and IBPS PO. But it existed **only as a derivation through paper sections**:

> Exam → Stage → Paper → Section → `section_subjects` → Subject

Three consequences fell out of that:

1. **An exam had no syllabus until someone authored its full paper pattern.** SSC CHSL was live proof: active, real, mapped to zero subjects, so Practice fell back to showing all seven subjects for it.
2. **It was invisible in the admin.** Nothing anywhere answered "which exams use this subject".
3. **Browsing subjects is a syllabus question being answered with pattern data.** A subject can be part of an exam's syllabus without being its own separately-timed section.

---

## The model

A dedicated `exam_subjects` table (migration `V4`), backfilled from the existing sections so nothing regressed.

The two mappings now answer different questions and both are kept:

| | Answers | Used by |
|---|---|---|
| `exam_subjects` | Which subjects does this exam cover? | Practice browsing, syllabus display |
| `section_subjects` | Which subjects does *this section* draw questions from? | Mock test question selection |

**They can't contradict each other.** Saving a section adds its subjects to the exam's syllabus automatically, so the syllabus is always a superset of what the sections reference. An admin can also add syllabus subjects directly, which is what makes a pattern-free exam like SSC CHSL possible.

---

## API

- `GET /api/exams/{code}/subjects` — the exam's syllabus.
- `PUT /api/exams/{code}/subjects` — replaces it wholesale (the admin edits a checklist, so replace is what it means).
- `SubjectResponse` gained `examCodes` — the reverse view, so the Subjects list shows which exams cover each subject.
- `GET /api/exam-structures` now carries `syllabusSubjects` per exam, so mobile syncs it alongside the pattern.

## Admin

- The exam structure page opens with a **Syllabus** card, editable via a subject checklist, stating explicitly that it works with or without a paper pattern below.
- The Subjects list gained an **Exams** column showing which exams cover each subject, or "not in any syllabus".

## Mobile

`getSyllabusSubjectIds()` now reads the explicit `exam_subjects` table instead of walking sections. Local schema and sync updated (migration `0005`); the syllabus is replaced wholesale on each sync like the rest of the structure.

---

## Verified

**Backfill was correct and lossless:**

```
SSC_CGL  -> Quantitative Aptitude, Reasoning, English, General Awareness
IBPS_PO  -> Quantitative Aptitude, Reasoning, English
SSC_CHSL -> (empty — no pattern existed)
```

**One subject, many exams, now explicit:**

```
Quantitative Aptitude -> IBPS_PO, SSC_CGL, SSC_CHSL
Reasoning             -> IBPS_PO, SSC_CGL, SSC_CHSL
English               -> IBPS_PO, SSC_CGL, SSC_CHSL
General Awareness     -> SSC_CGL, SSC_CHSL
```

**The capability that didn't exist before:** SSC CHSL was given a four-subject syllabus through the API without defining a single stage, paper or section. The admin page shows its syllabus alongside "No structure defined yet", and after a pull-to-refresh the app shows **exactly those four subjects** — where it previously showed all seven.

**No regressions:** SSC CGL still shows its four subjects with correct counts (26/20/15/21), 48 backend tests pass, 113 questions unchanged.

---

## Note on data changed

SSC CHSL's syllabus was set to Quant / Reasoning / English / General Awareness as part of verifying this. That matches the real SSC CHSL Tier 1 pattern and replaces incorrect behaviour (all seven subjects), but it is a real content decision — adjust it in the admin if you'd rather it differ.
