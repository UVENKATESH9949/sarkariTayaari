# Exam Structure — Phase C: Mobile

**Status:** ✅ done, verified on the emulator against the live backend (2026-08-15)
**Scope:** TICKET-921 → TICKET-928. Follows Phases A and B; design in Section 7 of `offline-exam-app-requirements.md`.

---

## What changed

`mobile/src/mockTest/blueprints.ts` is **deleted**. The per-exam pattern, the difficulty levels, and subject presentation are all synced data now.

### Schema and sync
Local SQLite gained `exam_stages`, `exam_papers`, `paper_sections`, `section_subjects`, `difficulty_levels` and `paper_types`, plus ordering and styling columns on `subjects` and ordering on `topics` (migration `0003_lying_revanche.sql` — pure `CREATE TABLE` / `ADD COLUMN`, no table recreation).

Two deliberate choices in `writeReferenceData()`:

- **Structure is replaced wholesale, not upserted.** There is no delta concept for structure, and a stage or section deleted on the server has to disappear locally too; an upsert-only pass would leave orphans forever. Rows are gathered first and written one statement per table — the earlier mock-test submit bug showed that awaiting one insert per row is what makes SQLite writes slow.
- **Subjects and topics stay upserts**, because questions reference them and wiping the table would break those rows mid-sync.

A new backend endpoint `GET /api/exam-structures` returns every active exam's structure in one response, so the client makes a single request rather than one per exam.

### Sections no longer match subjects by name
`db/mockTest.ts` used to resolve each section via `subjectIdByName(section.subjectName)`. Sections now carry real subject ids through `section_subjects`, so **renaming a subject in the admin can no longer silently empty a mock-test section** — the exact fragility Phase A set out to remove.

### Practice is scoped to the real syllabus
`getSubjectStats()` previously returned every subject for every exam and only scoped the *count*. It now filters by the subjects the exam's sections actually cover. When an exam has no structure yet it falls back to showing everything, because a missing pattern is a content gap, not a claim that the exam covers nothing.

### Nothing exam-domain is hardcoded
- The `"easy" | "medium" | "hard"` union is gone. `DifficultyCounts` is keyed by code, and the Levels screen renders whatever was synced, using each level's own colour and icon with a neutral fallback. "All Levels" sums the real counts, so it stays correct as levels are added.
- `constants/subjects.ts` no longer holds a name-keyed table of six subjects. It exposes `toSubjectMeta(row)`, which reads styling off the synced row.
- Mock Test lists **papers**, not exams — an exam can have several, and non-mockable papers (descriptive, interview) are excluded.

---

## Verified on the emulator

Storage cleared for a genuine first-run, then driven through the UI and read back via `uiautomator` dumps (actual on-screen text, not screenshots):

- **Mock Test landing** — `SSC CGL — Tier 1 (Computer Based Examination)` / `Tier 1 · 100 questions · 60 min · +2/-0.5 marking`, entirely from synced data. SSC_CHSL, which is active but has no structure, correctly does not appear.
- **Start screen** — the real SSC section names with honest availability: General Intelligence and Reasoning 20, General Awareness 21, Quantitative Aptitude 25, English Comprehension 15 → "Only 81 of the usual 100". This is the section→subject mapping by id working end to end.
- **Practice → SSC CGL** — exactly **four** subjects (Quant, Reasoning, English, General Awareness). Computer Knowledge and General Science are correctly gone; before this they showed for every exam.
- **Practice → SSC CHSL** (active, no structure) — falls back to all subjects, each "No questions yet", instead of an empty screen.
- **Levels** — Easy 9 / Medium 12 / Hard 5, summing to the All Levels total of 26.

### The decisive test

A difficulty level (`Extreme`, purple, `skull-outline`) was created **through the API only**, then the app was re-synced. It appeared on the Levels screen in the correct position with its own styling and no code change. That is the "nothing hardcoded" requirement demonstrated rather than asserted. The test level was then deleted; the database is back to easy/medium/hard, four paper types, both structures intact, 113 questions.

---

## Known limitation, stated plainly

**Per-section timers are not enforced yet.** A sectionally-timed paper's *total* duration is computed correctly (the sum of its section limits) and the Start screen shows each section's own limit, but the test runs one overall countdown rather than locking each section at its boundary. True sectional enforcement needs section locking and auto-advance, which is a larger change than this pass. IBPS PO — the seeded example — is currently inactive, so nothing user-facing depends on it today.

Also worth noting: the mock-test result breakdown still groups by **subject**, not section. For SSC these coincide; for a paper whose section spans several subjects they would differ.

---

## Two things this surfaced

- **SSC_CHSL is active but has no structure.** Its Mock Test can't be built and Practice falls back to all subjects. Activating an exam and defining its structure are separate steps, and it's worth doing both together.
- **`Automated Test Subject` now appears in the app** for exams without a syllabus, since the fallback shows everything. That leftover is worth deleting from the database.

---

## Next

**Delta sync remains the blocker.** `runDeltaSync()` is still never called, so every verification above required clearing app storage to force a fresh sync. In production that means an installed app would never receive any of this — no new structures, no new difficulty levels, no new content. TICKET-305/306 (sync on launch/foreground, pull to refresh) are the highest-value work left.

After that: Phase D's Exam Pattern screen is now nearly free, since the whole tree is already synced locally.
