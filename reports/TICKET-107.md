# TICKET-107 — Completed (pending your visual confirmation)

**Sprint:** Sprint 1 — Backend Foundation (added mid-sprint)
**Scope:** Web-based Admin UI for managing questions through a browser, as a separate React app.

## What was built

New `admin/` folder — a Vite + React (JavaScript, not TypeScript) single-page app, separate from the `backend/` project.

**Pages:**
- **Questions list** (`/`) — paginated table, filter by exam type/topic/difficulty, checkboxes + "Delete selected" for bulk delete, per-row Edit/Delete
- **Add question** (`/questions/new`) — core fields + one or more language translation blocks (add/remove languages)
- **Edit question** (`/questions/:id/edit`) — same form, loads existing data; core fields update via `PUT /api/questions/{id}`, each translation updates independently via `PUT /api/questions/{id}/translations/{lang}`
- **Bulk import** (`/bulk-import`) — paste a JSON array of questions, with a "Load example" button showing the expected shape

`src/api.js` is a thin fetch wrapper around all 8 backend endpoints.

## Backend changes required to support this

1. **CORS** (`config/CorsConfig.java`) — the admin app runs on a different origin (`localhost:5173`) than the API (`localhost:8080`), so this had to be explicitly allowed.
2. **List filtering** — `GET /api/questions` didn't support filtering before; added `examType`/`topic`/`difficulty` query params via a JPA `Specification` (`QuestionSpecifications.java`), since the admin UI's filter toolbar needs it and it wasn't previously in TICKET-106's scope.

## Known limitation: adding a brand-new language

The multi-language design (from TICKET-101) means any new language just needs a row in the `languages` table — no schema change. But there's currently no UI (or even an API endpoint) to manage the `languages` table itself. Practically: today you can only add translations in `en` or `hi` (the two seeded at migration time) through this admin UI. Adding Telugu/Kannada/etc. later will need either a new `languages` management screen or a direct DB insert — not built yet, since it wasn't asked for as part of this ticket.

## Verification

- Backend compiles and runs; CORS preflight and actual requests confirmed working (`Access-Control-Allow-Origin` header present) via curl
- All admin source files (`App.jsx`, `QuestionsList.jsx`, `QuestionForm.jsx`, `BulkImport.jsx`, `api.js`) transpile through Vite with no errors (HTTP 200, no error overlay)
- **Not verified:** actual visual/interactive behavior in a browser — this environment has no browser automation tool available. You should open `http://localhost:5173` yourself and click through (list, create, edit, bulk import, delete) to confirm it behaves as expected before considering this fully done.

## Reference

- Requirements doc: `../offline-exam-app-requirements.md` (Sprint 1, TICKET-107)
- Prior ticket: `TICKET-106.md`
