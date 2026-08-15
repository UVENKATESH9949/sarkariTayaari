# Exam Structure — Phase B: Admin UI

**Status:** ✅ done, verified in a real browser against the live backend (2026-08-15)
**Scope:** TICKET-911 → TICKET-916. Follows `reports/exam-structure-phase-a-backend.md`; design in Section 7 of `offline-exam-app-requirements.md`.

---

## What was built

### TICKET-911 — API client
`admin/src/api.js` gained the exam-structure tree read, full CRUD for stages/papers/sections, and CRUD for difficulty levels (with the active vs `/all` split) and paper types.

### TICKET-912 — Exam Structure editor
`admin/src/pages/ExamStructure.jsx`, reached from a **Structure** action on each row of the Exams page (`/exams/:examCode/structure`).

The nesting was the design problem — five levels is easy to make unreadable. The layout that worked:

- **Stage** as a card, headed by its name, version label, effective date and paper count.
- **Paper** as an inset block inside its stage, with its attributes as badges — type, duration, marking, `not mock-testable` when the type disallows it, `qualifying N%` where set — plus a derived **"N Q in sections"** count so an author can see at a glance whether the sections add up to the intended paper.
- **Section** as a table row: questions, timing, marking, subjects.

Two things are surfaced rather than left implicit, because both are invisible in the raw data:

- Timing reads **"shares paper"** or the section's own minutes, instead of showing a blank cell for null.
- Marking shows the resolved value with an **"inherited"** note underneath when the section doesn't override it — so an author can tell at a glance which numbers are set here and which come from the paper.

Forms are modals per level. The section form's marks fields use the paper's values as placeholders (`inherits 2`), making the fallback obvious at the point of editing rather than something to remember.

### TICKET-913 / 914 — Difficulty Levels and Paper Types
Full CRUD pages. Difficulty levels carry label, order, icon name, text and background colour (with native colour pickers) and an active flag; the table renders a live **preview badge** in the level's own colours. Codes are immutable on edit, since questions and papers reference them.

### TICKET-915 — Ordering, styling, and the last hardcoded list
- Subjects gained display order, icon name and colours; quick-add stays a single name field, with the styling on the edit modal.
- Topics gained display order, and `TopicService` now orders by it (both the by-subject and unscoped lists were previously unordered `findAll()`).
- **`DIFFICULTIES` is gone from `constants.js`.** The filter on the questions list, the dropdown on the question form and the bulk-import validator all read live levels from the API now. The question form defaults to the first active level rather than assuming one is called `easy`.
- The questions list's difficulty badge took its colour from a hardcoded `easy/medium/hard` class map; it now takes the colour from the level row, so a newly added level renders correctly rather than falling through to a default.

---

## Where the line was drawn

Everything exam-domain is data. App structure — sidebar, routes, the shape of the editor itself — stays in code. `MAX_LENGTHS` also stays hardcoded, deliberately: those mirror DB column widths, and the backend returns an unmapped 500 rather than a readable 400 when one is exceeded, so the client has to know them.

---

## Verification

Every page was loaded in headless Chromium against the running backend and live Neon database, capturing console errors and failed requests. All clean.

- **SSC CGL structure** — Tier 1 → one objective paper (60 min, +2/−0.5, "100 Q in sections · 200 marks") → four sections showing "shares paper" and "+2 / −0.5 inherited".
- **IBPS PO structure** — three sections each showing their own **20 min**, proving sectional timing renders distinctly from the shared case.
- **Difficulty Levels / Paper Types** — both render live data, including the mock-testable flags.
- **Subjects** — display order and backfilled icons (`calculator-outline`, `bulb-outline`, …) all present.
- **Full write round-trip driven through the UI** on the `AUTOMATED_TEST` fixture exam: created a stage, then a paper (90 min, +2/−0.5), then a section (20 questions, own 25-minute timer, one subject). The resulting row read exactly `UI Verify Section 20 25 min +2 / −0.5 inherited Automated Test Subject` — correct inheritance and correct sectional timing, straight from the editor.
- **Delete cascade through the UI** — deleting the stage removed its paper and section; the API confirmed `stages: 0` afterwards.
- **No collateral damage** — three difficulty levels, four paper types, both real structures intact (SSC_CGL 4 sections, IBPS_PO 3), 113 questions.

### A note on the test harness, not the app

Two assertions in the drive script reported `0` for the stage and paper immediately after saving, and `1` for the stage after deleting. Both were **fixed-wait races against the refetch**, not defects: the subsequent steps depended on those elements existing and succeeded, and the API confirmed the true end state (`stages: 0`). Worth remembering that this backend talks to a remote Neon instance, so 2–2.5s fixed waits are marginal — assertions should poll or wait on a condition rather than a timer.

---

## Next — Phase C (mobile)

1. Sync the new tables (`writeReferenceData()` already refetches and upserts the whole reference set).
2. Delete `mobile/src/mockTest/blueprints.ts` in favour of synced structure.
3. Scope Practice's subject list to the exam's real syllabus via `section_subjects`, replacing the current "all subjects for every exam".
4. Make Mock Test paper-aware — let the user pick which paper to attempt, honour per-section timers, and skip non-mockable papers.
5. Replace the hardcoded difficulty union and `constants/subjects.ts` icon map with synced data, rendering whatever arrives.

**Still outstanding and now more urgent:** `runDeltaSync()` is never called, so none of this reaches a device that has already synced once. See STATUS.md item 3.
