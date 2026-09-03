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
| [USER-PROGRESS.md](USER-PROGRESS.md) | Practice/mock history sync, bookmark sync, per-topic mastery sync — the signed-in student's own data, uploaded from and restored to any device |
| [EXAM-INTELLIGENCE.md](EXAM-INTELLIGENCE.md) | Topic trend/priority scoring ("Epic L") and its synthetic-data seeder |
| [EXAM-GUIDE.md](EXAM-GUIDE.md) | Recruitment cycles, eligibility, dates, documents, application steps, fees ("Exam Guide") and its demo-data seeder |

Not documented as separate files (trivial, not a real integration contract):
`GET /api/health` (liveness probe) and `GET /downloads` (serves APKs from a local
folder in dev — see the root `README.md`'s "Getting a build onto a phone" section).

## Keeping this current

If you change an endpoint's request/response shape, auth requirement, or add/remove
one, update the relevant file here in the same change — this is §3 rule 5 in
[`../AI_RULES.md`](../AI_RULES.md). If you're not sure a file here is still accurate,
verify against the controller before trusting it; these are hand-written from source at
a point in time, not generated on every build.
