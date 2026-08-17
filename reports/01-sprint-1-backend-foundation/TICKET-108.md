# TICKET-108 — Completed (pending your visual confirmation)

**Sprint:** Sprint 1 (added after using TICKET-107's first version)
**Scope:** Design refresh + feature requests on the admin UI, based on hands-on feedback.

## What was requested and built

1. **Question detail modal** — clicking a question row (not the checkbox or action icons) opens a popup showing every field (topic, exam type, difficulty, correct answer, status, all translations with options and explanation, correct option highlighted). Footer has Delete / Edit / Close buttons; header has a ✕ close button. Built as a reusable `Modal` component (`src/components/Modal.jsx`) so it can be reused elsewhere later.

2. **Dropdowns for Topic, Exam Type, Language** (Add/Edit form):
   - Topic and Exam Type use a dropdown of common values **with an "Other" option** that reveals a free-text field — so the tool never blocks content entry when a brand-new topic or exam type comes up. This was a deliberate product decision: a rigid closed dropdown would eventually force someone to stop and ask an engineer to add a new option.
   - Language is a dropdown populated from a **new backend endpoint**, `GET /api/languages`, rather than a hardcoded list — so it always reflects whatever languages actually exist in the database (ties back to the extensible multi-language design from TICKET-101). Each translation block also only offers languages not already used elsewhere on the same question, preventing duplicate-language mistakes.

3. **Bulk import overhaul**:
   - **Clear button** resets the textarea/file input.
   - **"View example format"** now opens a read-only modal instead of populating the import textarea — it's a reference, not something that gets imported by accident.
   - **File upload** (`.json`) — reads the file client-side and feeds it through the exact same analyse → import pipeline as pasting text.
   - **Analyser** (`src/validateQuestions.js`) — checks every question against the same rules the backend enforces (required fields, exactly 4 options, root "en" translation present, known language codes) *before* import, so nothing that passes analysis can fail on import. Also flags two data-quality issues the backend wouldn't catch: whether `correctAnswer` is a valid option reference (A–D or 0–3), and possible duplicate questions within the same batch (same topic + exam + English text).
   - **Partial import**: you can import just the valid questions and skip the invalid ones in the same batch, rather than the whole batch failing on one bad row.
   - **Post-import review screen** — after import, shows exactly what was created, with per-question Edit (jumps to the full edit page) and Remove, plus an "Undo entire import" button that bulk-deletes everything from that batch in one click.

## Deliberately not built (and why)

- **CSV import** — the schema has nested per-language translations (each question can have N translation objects with their own options array), which doesn't map cleanly onto flat CSV rows. JSON is the right format for this data shape. If a CSV workflow becomes important later, it would need either a flattened one-language-per-row CSV schema or a spreadsheet template.
- **Import audit/history log** — tracking who imported what and when needs a real user/auth system, which doesn't exist until v1.1 (write-back sync + basic auth, per the roadmap). Not worth building against an anonymous, single-operator tool right now.

## Backend changes required

- `GET /api/languages` (new) — returns active languages as `{code, name}`, used to populate the language dropdown and to validate language codes during bulk-import analysis.
- `LanguageRepository.findByActiveTrue()` (new derived query).

## Verification

- Backend compiles and runs; `curl http://localhost:8080/api/languages` confirmed returning `[{"code":"en","name":"English"},{"code":"hi","name":"Hindi"}]`
- All admin source files transpile through Vite with no errors (checked via direct HTTP fetch of each module + HMR log — no error overlays)
- **Not verified:** actual interactive behavior in a browser (modal open/close, dropdown behavior, file upload, analyser output, review screen). No browser automation tool is available in this environment — you'll need to click through it yourself.

## Note on a stale-process issue hit during this work

Restarting the backend to pick up the new endpoint initially failed with a 404 — turned out several old `mvn spring-boot:run` processes from earlier in the session had not actually terminated when their background tasks were stopped, and one was still squatting on port 8080 serving the *old* code. Killed the orphaned `java.exe` processes and restarted cleanly. Worth knowing: stopping a background task in this tool doesn't always guarantee the underlying process died — worth double-checking with `netstat`/`tasklist` if a restart doesn't seem to take effect.

## Reference

- Requirements doc: `../offline-exam-app-requirements.md` (Sprint 1, TICKET-108)
- Prior ticket: `TICKET-107.md`
