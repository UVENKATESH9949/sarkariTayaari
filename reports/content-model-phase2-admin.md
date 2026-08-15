# Content Model Redesign — Phase 2: Admin UI

**Status:** ✅ done, verified in-browser against the live backend (2026-08-14)
**Scope:** TICKET-801 through TICKET-810 — bring the admin app onto the redesigned content model, and add CRUD for the reference data the redesign introduced.

---

## Why this was next

Phase 1 shipped the new backend model (global Subjects/Topics, many-to-many exam tagging, real `exams` table), and Phase 3 brought the mobile app onto it. The admin app was never updated — so it was not merely outdated, it was **actively broken against the live API**:

- **Questions list** rendered `q.topic` and `q.examType`. The API returns `subjectName`/`topicName`/`examCodes`, so both columns were blank for all 112 rows.
- **Add/Edit question** posted `{correctAnswer, topic, difficulty, examType}` while the backend expects `topicId` + `examCodes` — creating a question from the UI could not succeed. Edit mode read `q.topic`/`q.examType` back, both `undefined`, so the form loaded blank.
- **Bulk import** required `topic` and `examType` on every item, so its client-side analyser rejected correctly-shaped new-model JSON before it was ever sent.
- `constants.js` hardcoded six exam types and six topics as plain strings — exactly what the redesign replaced with real tables — and `api.js` had no exams/subjects/topics functions at all.

Since bulk import through this UI is the only practical path for getting content into the database, the content pipeline was effectively blocked.

---

## What was built

### TICKET-801 — API client + constants foundation
`api.js` extended with full CRUD for Exams, Subjects, Topics and Languages, plus `uploadImage`. Notes baked into the client:
- `listAllExams()`/`listAllLanguages()` hit the `/all` variants (admin sees inactive rows); the bare `listExams()`/`listLanguages()` stay active-only, matching what mobile sees.
- `listQuestions()` takes an options object and enforces the server's rule that `topicId` and `subjectId` are mutually exclusive (topicId wins).
- Error extraction falls back through `{error}` → `{message}` → status code, since unhandled 500s use Spring's default body rather than the `{error}` envelope.
- `uploadImage` deliberately does **not** set `Content-Type`, so the browser supplies the multipart boundary. Field name is `file`.

`constants.js` lost `EXAM_TYPES`/`TOPICS`/`OTHER_VALUE` (removed once the last consumer was reworked in TICKET-809) and gained `MAX_LENGTHS` and `IMAGE_MAX_BYTES`.

### TICKET-802–805 — Reference data CRUD
Four new pages (`Subjects`, `Topics`, `Exams`, `Languages`), plus a grouped sidebar (Content / Reference data) and two shared modules: `components/icons.jsx` and `errors.js`.

- **Subjects** — list with a live per-subject topic count, inline add, modal edit, delete. The topic count is not decoration: it tells the admin up front whether a delete will fail.
- **Topics** — subject filter (server-side via `?subjectId=`), subject picker on create/edit, and a dedicated empty state that links to Subjects when none exist, since a topic cannot exist without one.
- **Exams** — uses `/all`, sorted by display order. Modal form with code (immutable on edit), name, display order, active toggle, and Cloudinary image upload with preview, client-side size check and a Remove action.
- **Languages** — upgraded from read-only to full CRUD, also via `/all`. There is no `GET /api/languages/{code}`, so the edit form seeds from the row already in the list.

Three backend behaviours shaped all four pages:
1. **`PUT` is a full replace** and `active`/`displayOrder` are primitives — omitting `active` silently deactivates a record. Every form submits the complete object.
2. **Deletes are hard deletes** and throw a raw 500 on any FK violation. `deleteFailureMessage()` turns that into "something still references it", and each confirm dialog says what will block it. Both Exams and Languages steer the user toward the Active toggle as the non-destructive alternative.
3. **DB column widths are not bean-validated** — exceeding one returns a 500, not a 400 — so `MAX_LENGTHS` enforces them client-side.

### TICKET-806–808 — Question pages
- **List**: real Subject/Topic, exam-code badges, difficulty, languages, plus explicit `Deleted` and `Premium` badges (the endpoint returns soft-deleted rows, so they must be labelled rather than hidden). Free-text filters became real dropdowns fed from live data, applied immediately, sorted `updatedAt,desc`. Topic options render as "Subject — Topic" when no subject is selected, because every subject currently has a topic named "General" and the bare names were indistinguishable.
- **Form**: cascading Subject → Topic pickers, multi-select exam tags (inactive exams still taggable, marked as such), premium checkbox, and the 1+N save flow — `PUT /api/questions/{id}` for metadata, then one `PUT .../translations/{lang}` per language, since the question endpoint cannot edit translation content.
- **Correct answer became an A–D dropdown** showing each option's English text, replacing free-text entry. This closes the data-quality hole that produced the one malformed row in the database.
- **Detail modal**: new fields, plus explicit warnings when `correctAnswer` is stored as a value rather than a letter, or matches no option at all.

### TICKET-809 — Bulk import
`validateQuestions.js` reworked to the import shape: `subjectName`/`topicName` (matched by name, auto-created server-side) and `examCodes` (validated against the real exam list, since unknown codes are **not** auto-created). Example JSON updated and extended to show a second language.

This validator earns its keep for a specific reason: the backend's bean validation runs before the controller, so a single malformed item rejects the **entire batch** with a 400 and never reaches the per-item `failures` list. Only business errors fail per-item. Catching bean-validation problems client-side is what stops one bad row from sinking a whole import.

### Backend change
`spring.servlet.multipart.max-file-size: 5MB` (request 10MB). Spring's 1MB default rejects ordinary exam artwork, and the overflow surfaces as an unmapped 500.

---

## Cloudinary credentials

The credentials initially landed in `application-local.yml.example` — the shared template — rather than `application-local.yml`, the gitignored file the backend actually reads. Moved to the correct file and the template restored to placeholders.

The value itself was also wrong: `api-secret` had been copied as `REDACTED@dqrxzbfdu`, which is the tail of a `CLOUDINARY_URL` (`cloudinary://<key>:<secret>@<cloud_name>`) rather than the secret alone, and `cloud-name` was set to the product-environment name. Cloudinary rejected this with `Invalid Signature`. Correct values confirmed via the ping endpoint: cloud name `dqrxzbfdu`, secret `REDACTED`.

Because the real secret was briefly written into the template file, **rotating it in the Cloudinary dashboard is worth doing** even though this project root is not a git repository and it was never committed.

---

## Verification

Every page was loaded in a real headless Chromium against the running backend and the live Neon database — not type-checked or assumed. Console errors and failed network requests were captured on each load; all came back clean.

- **Subjects / Topics / Exams / Languages** — all render live data. Exams correctly shows all 7 rows including the 5 inactive ones, confirming the `/all` split works.
- **Questions list** — real text, subject/topic, exam badges, difficulty, languages, and `Deleted` badges on the two soft-deleted rows.
- **Edit form on the known-bad row** (`correctAnswer` stored as `"12"`) — correctly warned, matched it to **B**, and showed option previews (`B — 12`). Saving normalises it.
- **Full create round-trip, driven through the browser** — filled the form, saved, and confirmed via the API that the question was created with the correct topic, exam tag, difficulty, answer and both translation fields (112 → 113 rows). The test row was then soft-deleted.
- **Bulk import analyser** — a deliberately mixed batch produced exactly the right verdicts: valid new-shape item accepted; unknown exam code, missing `subjectName`, and a 3-option translation each rejected with a specific message; and an old pre-redesign item rejected for all three missing fields.

---

## Known leftovers (not introduced here)

- `Automated Test Subject`, `Automated Test Topic` and `AUTOMATED_TEST` exam remain in the live Neon database from the Phase 1 backend test suite. Harmless but visible in every admin dropdown — worth cleaning up.
- Two test PNGs were uploaded to Cloudinary while verifying the upload path, and can be deleted from the dashboard.
- Real content is still thin: every subject has exactly one topic ("General") from the migration backfill. Authoring real sub-topics is the point of this phase, and is now possible.
