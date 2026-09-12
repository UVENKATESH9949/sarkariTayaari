# Requirement repository — Phase 1B conflicts, ambiguities, and scoping decisions

This file consolidates everything flagged during Phase 1A extraction (AUTH, CATALOG,
QUESTIONS) that spans more than one module, needed an explicit scoping decision, or is
worth a human decision before Phase 2 scenario generation. Per-requirement ambiguities that
don't need cross-module attention stay on the requirement's own `ambiguity` field in
`auth.yaml`/`catalog.yaml`/`questions.yaml`.

Per this project's own rule: a superseded ADR or an open, undecided product question never
becomes an active requirement. Everything below is either a **documented behavior with a
real gap/inconsistency worth QA coverage**, or a **scoping call this phase made and is
recording**, not a guess dressed up as a requirement.

---

## 1. Cross-module, high-confidence finding: a third role (`REVIEWER`) and permission check (`requireReviewer`) exist in real, current code but are undocumented in the two docs that describe the auth model

**Independently found and corroborated by two separate extraction passes** (the AUTH-module
agent, reading `entity/Role.java`/`AuthService.java` directly, and the QUESTIONS-module
agent, reading `QuestionController.java`'s content-status endpoint) — this is real, not a
single agent's misreading:

- `api/AUTH.md` states the role column is `STUDENT`/`ADMIN` only. The actual `Role` enum has
  three values: `STUDENT`, `ADMIN`, `REVIEWER`.
- `api/README.md`'s shared-conventions table documents exactly two permission checks
  (`requireUser`, `requireAdmin`). A third, `requireReviewer` (accepts ADMIN or REVIEWER,
  ADMIN treated as a superset), is real and used at least by
  `PUT /api/questions/{id}/content-status` (REQ-QUESTIONS-019), and per `memory/STATUS.md`'s
  2026-09-02 session, by the Exam Guide content-status workflow too (out of this phase's
  scope).
- **No creation path for a REVIEWER account exists anywhere in AUTH** — neither `register`
  nor `admin/register` can produce one. **REQUIRES CLARIFICATION**: is REVIEWER provisioning
  intentionally out-of-band (direct DB write), or is there a missing endpoint?

**Not turned into an AUTH requirement** — no `api/AUTH.md`/report language exists to ground
what REVIEWER can *do*, and inventing one would violate the "don't guess" rule. Recorded here
so QA doesn't file this as a fresh bug each time it's noticed, and so whoever owns
documentation can fix `api/AUTH.md` and `api/README.md` in place (per `AI_RULES.md` §6) —
**not done in this session**, since it's outside Phase 1A/1B's scope of building the QA
repository, and this session was instructed not to modify application functionality/docs.

**Recommendation:** treat as a real, disclosed doc-drift item. A future Phase 2 scenario for
REQ-QUESTIONS-019 should include "a REVIEWER-role token succeeds," which requires QA to be
able to provision one — worth resolving the provisioning question before that scenario can
actually be executed.

---

## 2. Scoping decision (resolved, not left open): exam-topic weightage/hierarchy/prerequisites stay in CATALOG

`REQ-CATALOG-006` (topic weightage), `REQ-CATALOG-008` (topic hierarchy), `REQ-CATALOG-009`
(topic prerequisites) originate from work internally labeled "Epic L topic model"
(TICKET-2101-2103 per `memory/STATUS.md`), which this task's exclusion list could be read to
cover ("topic intelligence/priority/mastery/PYQ ... Epic L module").

**Decision:** keep them in CATALOG. `api/CONTENT-CATALOG.md` documents these three endpoints
directly as catalog contract, and all three are structural/curation data an admin enters
directly (weightage, hierarchy, prerequisite DAG) — not *computed* intelligence
(trend/priority/mastery scoring derived from PYQ data), which lives in the separate
`api/EXAM-INTELLIGENCE.md` and stays correctly excluded. The line: **if a human types it in,
it's CATALOG; if the system derives it, it's EXAM-INTELLIGENCE** (a later, explicitly
out-of-scope module).

---

## 3. Exam delete with existing structure — undocumented failure mode

`DELETE /api/exams/{code}` (REQ-CATALOG-001/017) has no application-level cascade guard for
an exam that still has stages/subjects/questions referencing it — behavior relies purely on
the database's own FK enforcement, and **no report or test confirms what actually happens**
(a clean 400? a raw 500? silent success if some FK isn't actually enforced?). This is a real,
testable gap, not a guess — flagged for explicit Phase 2/3 scenario coverage rather than
assumed either way.

---

## 4. Real, disclosed deviations from the documented error-response contract

Two endpoints don't follow `api/README.md`'s stated `{"error": "<message>"}` / 400-401-403-404
taxonomy — both are documented deviations in their own source files, not undiscovered bugs,
but worth flagging so QA treats them as *known*, not *newly found*, each time:

- `POST /api/images` (REQ-QUESTIONS-020): a Cloudinary-side failure surfaces as an unmapped
  500 with Spring's default body, not the `{error}` envelope.
- Admin's `ExamStructure.jsx` client-side `MAX_LENGTHS` (REQ-CATALOG-024) is the *only* guard
  against a raw 500 when a text field exceeds its DB column width — the backend itself has no
  bean-validation for this. A thorough QA pass on any text field should probe this directly
  via the API, bypassing the admin client's own guard.

---

## 5. Unspecified behaviors worth a scenario each, not yet resolvable from documentation alone

These aren't conflicts between sources — they're places where **no source specifies the
answer**, so a test scenario should establish (and then pin down) the actual behavior rather
than assume one:

- Deleting an already-soft-deleted question (`DELETE /api/questions/{id}`, REQ-QUESTIONS-008) — idempotent 204, or an error?
- An empty `ids` array on `POST /api/questions/bulk-delete` (REQ-QUESTIONS-009) — exact error shape unstated.
- An unrecognized/malformed code in `supportedTypes` (REQ-QUESTIONS-015) — presumably a silent no-match, not stated.
- An exam's `badge`/`difficulty` code that no longer resolves (REQ-CATALOG-002/020) — no documented client fallback.
- `GET /api/exams/{code}/topics` (REQ-CATALOG-006) is admin-only "for now" per the controller's own comment — don't assume this permission is permanent.

---

## 6. Historical/superseded behavior — explicitly NOT current requirements, recorded only so QA doesn't test against them

- `/api/questions/sync` used to require an `examType` query param (TICKET-102/103/104,
  Sprint 1). This was later removed entirely — the current, documented, and only correct
  contract (REQ-QUESTIONS-012) returns the full bank with no exam filter. Do not write a test
  expecting a 400 for a missing `examType` — that behavior no longer exists.
- `QuestionResponse.duplicateOfQuestionIds` was previously (incorrectly) documented as
  populated by get/list/update too. `api/QUESTIONS.md` already self-corrected this; REQ-QUESTIONS-021 reflects the corrected (create-only) behavior.
- `app.question-pool.temporary-enabled` — `api/QUESTIONS.md`'s own business-rules text
  describes this flag as defaulting `true` (serving a restricted ~500-question pool as "a
  deliberate, reversible interim measure"), but `memory/STATUS.md` and
  `reports/open-questions.md` both confirm it was flipped to `false` on 2026-08-27 and the
  full bank has been served since. This is an operational config value, not a functional
  requirement of the API contract — not written up as its own requirement, but **QA should
  verify the actual deployed value for whichever environment is under test** rather than
  trust the doc's stated default.

---

## 7. Explicitly out of scope for this phase (confirmed correctly excluded by all three agents)

Recorded here once rather than repeated per-file: topic trend/priority/PYQ-derived scoring/
mastery (`api/EXAM-INTELLIGENCE.md`), recruitment cycles/eligibility/Exam Guide
(`api/EXAM-GUIDE.md`), Weakness Radar, AI Admin Control Center, question groups/media
(`api/QUESTION-GROUPS.md`), question occurrences/ingestion pipeline
(`api/QUESTION-INTELLIGENCE.md`), multi-admin fine-grained roles/permissions (an explicitly
open, undecided product question per `reports/open-questions.md`). None of these were turned
into requirements in this phase, and none should be until their own module is scoped.
