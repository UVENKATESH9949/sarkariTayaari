# API contract — the shared boundary between systems

This folder documents every backend endpoint (`backend/src/main/java/.../controller/`)
by what it does, not how it's implemented. A mobile or admin task should not need to
read backend Java to know what an endpoint expects and returns; a backend task should
not need to read mobile/admin source to know who calls an endpoint. That's what this
folder is for. It doesn't re-explain the data model — see
[`../system-design/02-database.md`](../system-design/02-database.md) for that.

## Conventions, true for every endpoint below unless stated otherwise

**Base path:** everything is `/api/...`. No API versioning exists — see
`reports/open-questions.md`.

**Auth scheme:** a bearer token in the `Authorization` header
(`Authorization: <opaque token>` — not a JWT, see ADR-001 in
`reports/architecture-decisions.md`). There are two independent checks a controller
method can opt into:
- `requireUser(authorization)` — any signed-in student or admin.
- `requireAdmin(authorization)` — signed-in **and** `role = ADMIN` (ADR-009).

Both are opt-in per endpoint method, not a global filter (ADR-003 — no Spring Security
filter chain). An endpoint with neither check is genuinely public — this is deliberate
for the mobile content-sync surface (questions, exams, subjects, topics, languages,
difficulty levels, paper types, exam structure all stay public so a signed-out student's
app can sync), not an oversight. See ADR-009 for exactly how that split was decided.

**Error shape:** every error is `{"error": "<message>"}` (see
`backend/.../config/GlobalExceptionHandler.java`), with the HTTP status carrying the
meaning:

| Status | Means |
|---|---|
| 400 | Bad request — validation failure or missing/malformed parameter |
| 401 | Not signed in — missing/invalid/expired token, or a missing `Authorization` header on a `requireUser`/`requireAdmin` endpoint |
| 403 | Signed in, but not an admin, on a `requireAdmin` endpoint |
| 404 | Resource not found |

**Consumers** are stated per-endpoint below as `Mobile`, `Admin`, or `Both` — determined
by grepping `mobile/src/api/*.ts` and `admin/src/api.js` for actual call sites, not
assumed from whether an endpoint happens to be public.

## The files

| File | Covers |
|---|---|
| [AUTH.md](AUTH.md) | Sign-up/sign-in/sign-out, admin registration |
| [CONTENT-CATALOG.md](CONTENT-CATALOG.md) | Exams, subjects, topics, languages, difficulty levels, paper types, exam structure (stages/papers/sections), exam badges — the reference-data layer everything else hangs off |
| [QUESTIONS.md](QUESTIONS.md) | Question CRUD, bulk import/delete, the content-sync endpoint (`/api/questions/sync`), image upload, duplicate detection |
| [QUESTION-GROUPS.md](QUESTION-GROUPS.md) | Shared passages/datasets/media a question can belong to ("question groups"), TASK-2301 Phase P3 — was missing from this index, added while updating this file for TASK-2501 |
| [QUESTION-INTELLIGENCE.md](QUESTION-INTELLIGENCE.md) | A question's exam occurrences (one canonical question, many appearances) and the rule-based PDF-to-question ingestion pipeline — TASK-2501 Phases 1/2 |
| [USER-PROGRESS.md](USER-PROGRESS.md) | Practice/mock history sync, bookmark sync, per-topic mastery sync, followed-exam sync — the signed-in student's own data, uploaded from and restored to any device |
| [EXAM-INTELLIGENCE.md](EXAM-INTELLIGENCE.md) | Topic trend/priority scoring ("Epic L") and its synthetic-data seeder |
| [EXAM-GUIDE.md](EXAM-GUIDE.md) | Recruitment cycles, eligibility, dates, documents, application steps, fees ("Exam Guide") and its demo-data seeder |
| [USER-ANALYTICS.md](USER-ANALYTICS.md) | Derived analytics over one student's own behaviour — overall/subject/topic/difficulty/activity/trends, computed on read from their practice and mock history. Measurement only: no recommendation, no stored aggregate, and — since TASK-3001 — no per-topic trend (direction is the health model's, read via LEARNING-STATE.md) |
| [LEARNING-STATE.md](LEARNING-STATE.md) | **The canonical per-topic learning state.** One composite per (student, topic), each dimension named and owned by exactly one producer — curriculum (coverage) vs performance (quality), which are separate on purpose. Start here before reading a student's state from anywhere else |
| [STUDY-ROADMAP.md](STUDY-ROADMAP.md) | **The personalized roadmap.** The learning state ordered by exam priority, balanced across subjects, with a workload estimate per topic whose source is always declared. No schedule and no stored plan — Phase 5 adds the day |
| [REVISION-PLAN.md](REVISION-PLAN.md) | **When to come back to a topic**, and what re-testing it means. A spaced-repetition ladder scaled by current state — its intervals are borrowed from published research, not measured here, and the payload says so via a versioned `intervalBasis` |
| [WEAKNESS-RADAR.md](WEAKNESS-RADAR.md) | Per-topic health, confidence, trend and recommended action for one student ("Weakness Radar" / Preparation Intelligence), plus its admin evidence view |
| [AI-ADMIN.md](AI-ADMIN.md) | AI Admin Control Center — admin-managed AI provider enable/disable, model, API key, connection test, audit log. Configuration only; no AI-powered user feature exists yet |
| [AI-CONTENT.md](AI-CONTENT.md) | AI-generated question/topic explanations — batch generation, answer-grounding validation, and the DRAFT→REVIEW→PUBLISHED human review workflow (TASK-2701 Phase 2). No public/mobile endpoint yet — sync is Phase 3 |
| [AI-FEEDBACK.md](AI-FEEDBACK.md) | Live, per-student AI-phrased narratives — Practice/Mock Test session feedback (`POST /api/practice-sessions\|mock-attempts/{id}/feedback`) and the Preparation Radar profile summary (`POST /api/exams/{code}/profile-summary`) — the first live per-request AI calls, distinct from AI-CONTENT.md's batch-and-review pipeline (TASK-2701 Phase 7.1/7.2/7.3) |

Not documented as separate files (trivial, not a real integration contract):
`GET /api/health` (liveness probe) and `GET /downloads` (serves APKs from a local
folder in dev — see the root `README.md`'s "Getting a build onto a phone" section).

## Keeping this current

If you change an endpoint's request/response shape, auth requirement, or add/remove
one, update the relevant file here in the same change — this is §3 rule 5 in
[`../AI_RULES.md`](../AI_RULES.md). If you're not sure a file here is still accurate,
verify against the controller before trusting it; these are hand-written from source at
a point in time, not generated on every build.
