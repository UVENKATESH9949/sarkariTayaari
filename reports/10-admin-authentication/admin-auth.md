# Admin Authentication — role-based accounts for the content console

**Closes:** the #1 item in `memory/STATUS.md`'s "Next up" list — confirming whether the
admin console has any authentication at all. It didn't. See ADR-009 in
`reports/architecture-decisions.md` for the design rationale.

## The gap, precisely

`admin/src/App.jsx` rendered straight into the content screens with no login route and
no route guard. On the backend, every content-management endpoint — Questions, Exams,
Subjects, Topics, Languages, Difficulty Levels, Paper Types, the Exam Structure tree,
and image upload — had no auth check at all, unlike `BookmarkController`/
`ProgressController`, which already called `authService.requireUser(...)`. `CorsConfig`
only restricts which *browser origins* can read a response; it does nothing against a
direct API call (curl, Postman, a script). Concretely: anyone who could reach the
backend could create, edit, or delete all content and upload arbitrary images, with
zero credentials.

## What was built

**Backend**

- `entity/Role.java` — `STUDENT` / `ADMIN`. `User` gained a `role` column
  (migration `V8__admin_roles.sql`, `NOT NULL DEFAULT 'STUDENT'`, backfills existing
  rows automatically).
- `AuthService.requireAdmin(header)` — calls the existing `requireUser(header)`, then
  checks the role; throws a new `ForbiddenException` (403) otherwise. `Unauthorized`
  (401, not signed in) and `Forbidden` (403, signed in but not an admin) are now
  distinct for the first time in this codebase — previously nothing needed the
  difference.
- **Nine controllers** (`QuestionController`, `ExamController`, `SubjectController`,
  `TopicController`, `LanguageController`, `DifficultyLevelController`,
  `PaperTypeController`, `ExamStructureController`, `ImageUploadController`) now call
  `requireAdmin` on every content-mutating endpoint and every admin-only read (the
  `/all` variants, single-item lookups used only by edit forms, the paged/filtered
  question list, the per-exam structure tree, exam-syllabus lookup). The mobile-facing
  reads used for offline content sync were verified against `mobile/src/api/
  reference.ts` and `mobile/src/db/schema.ts` and kept public on purpose: `GET
  /api/exams`, `/subjects`, `/topics`, `/difficulty-levels`, `/paper-types`,
  `/exam-structures`, `/api/questions/sync`, and `/languages`.
- `AdminBootstrapRunner` (`ApplicationRunner`) — creates exactly one `ADMIN` user on
  startup from `admin.bootstrap-email`/`admin.bootstrap-password` (new, optional,
  local-only properties — documented in `application-local.yml.example`), and only if
  no admin exists yet. This is how the *first* admin is created, since public
  `/api/auth/register` always creates a `STUDENT`.
- `POST /api/auth/admin/register` — admin-only, creates another admin. Deliberately
  returns `AuthResponse.UserResponse` (no token) — the new admin signs in themselves via
  the normal `/api/auth/login`, rather than the creator ever holding their credential.
- `AuthResponse.UserResponse` gained a `role` field (as a `String`, mapped in
  `AuthService.describe()` — kept off the entity type to preserve the existing DTO/
  entity separation). Purely additive; mobile clients ignore it.

**Admin frontend**

- `auth/AuthContext.jsx` — token persisted in `localStorage` (`st_admin_token` — token
  only, never a cached user; the user is always re-fetched via `GET /api/auth/me` on
  load so a revoked/expired token is caught immediately).
- `pages/Login.jsx` — plain email/password form, matching the existing form/error
  conventions already used elsewhere (e.g. `Exams.jsx`'s `ExamFormModal`).
- `api.js` — `request()` now attaches `Authorization: Bearer <token>` to every call
  (also fixed a latent bug where a caller-supplied `headers` option would have silently
  replaced `Content-Type` instead of merging — nothing currently exercises that path,
  but the next admin-page author might have). A 401 response clears the session via a
  callback the `AuthContext` registers.
- `App.jsx` — gated: no user or a non-admin user sees `Login` (a signed-in non-admin
  sees an explicit "not an admin account" message with a sign-out button, not a wall of
  per-request 403s); an admin sees the unchanged sidebar/routes plus an account block
  (email + Sign Out).

**Tests**

- `AbstractIntegrationTest` gained an idempotent admin fixture (same pattern as the
  existing `TEST_EXAM_CODE`/`TEST_SUBJECT_NAME`): creates/reuses an `ADMIN`-role `User`
  and issues a fresh `UserToken` row directly via the repositories (no bcrypt/login
  round-trip needed for a fixture), exposed as `adminAuth()`/`adminAuth(body)` helpers.
- Every existing CRUD/structure/bulk/sync test that hit a now-protected endpoint was
  updated to authenticate as admin — `QuestionCrudTest`, `ExamCrudTest`,
  `SubjectCrudTest`, `TopicCrudTest`, `BulkOperationsTest`, `ExamStructureTest`,
  `DifficultyLevelTest`, `LanguageControllerTest`, and `SyncEndpointTest` (its own
  subject, `/sync`, stays public, but its fixture helper creates questions through the
  now-protected create endpoint).
- New `AdminAuthTest`: a protected endpoint returns 401 anonymous / 403 for a real
  student token / 2xx for a real admin token; `POST /api/auth/admin/register` itself
  requires an admin token and leaks no token/password hash; every public sync endpoint
  still returns 200 with **no** Authorization header at all (a regression guard against
  ever accidentally locking down mobile's sync path by mistake).

## Verified

All of the following were run for real, not just written down:

- **71 integration tests pass, 0 failures** (`mvn test`, all 13 test classes including
  the new `AdminAuthTest`), against the real dev Neon database. Flyway applied `V8`
  cleanly on top of live data.
- **Bootstrap, for real**: cleared every `ADMIN`-role user from the dev database,
  started the backend with `admin.bootstrap-email`/`bootstrap-password` set — the log
  showed `Bootstrapped the first admin account (...)`, and `POST /api/auth/login` with
  those exact credentials returned a token with `role: "ADMIN"`.
- **Idempotency, for real**: restarted the backend again with the same properties still
  set — no bootstrap log line this time, no error, and logging in again returned the
  *same* user id. No duplicate created.
- **The actual gap, closed, via curl**: `POST /api/exams` with no token → `401`; the
  same request with a real signed-up student's token → `403`; the same request with the
  bootstrapped admin's token → `201`, and the created exam was confirmed via
  `GET /api/exams/all` before being deleted again.
- **Every public sync endpoint, unauthenticated**: `/api/exams`, `/subjects`, `/topics`,
  `/difficulty-levels`, `/paper-types`, `/languages`, `/exam-structures`,
  `/questions/sync` — all returned `200` with no Authorization header at all. This is
  the regression that would have broken the shipped mobile app if the split had been
  gotten wrong.
- **The admin UI, driven with Playwright** against the real dev servers: a fresh load
  shows Login; a wrong password shows "Email or password is incorrect"; correct
  credentials land on the Questions screen with the sidebar and the signed-in email
  visible; a full page reload stays signed in (token persisted in `localStorage`); Sign
  Out returns to Login and a reload afterward does not silently re-enter. (One console
  `401` appears on sign-out in dev mode — React StrictMode double-invokes the logout
  call, the second one hits an already-revoked token; harmless and dev-only, same
  category as the other documented Expo/dev-mode-only artifacts in this project.)
- **A real mutation through the actual UI**: signed in, opened Exams, clicked "Add
  exam," filled the form, saved — the network request carried the `Authorization`
  header, the server responded `201`, and the exam was confirmed to exist server-side
  via a direct API call before being deleted again.
- All test/verification artifacts (the throwaway admin account, the student account
  created for the 403 check, the exams created during curl/UI verification) were
  deleted afterward. The dev database was left with **zero** admin users — whoever picks
  this up next needs to set real `admin.bootstrap-email`/`bootstrap-password` in their
  own `application-local.yml` and start the backend once, per the README.

## Honest gaps in verification

- **iOS/production-hosting implications not exercised** — this was verified entirely
  against `localhost`. `CorsConfig` still hardcodes `http://localhost:5173` as the only
  allowed origin; deploying the admin app anywhere else needs that revisited (already a
  pre-existing note, not new).
- **No UI for admin-inviting-admin yet** — `POST /api/auth/admin/register` exists and is
  tested, but there's no admin-console screen for it. An existing admin has to call it
  directly (e.g. via curl) to add a teammate today.
- **Session-expiry UX not exercised** — the 401-triggers-sign-out wiring exists in
  `api.js`/`AuthContext`, but a genuinely expired (not just revoked) token was never
  actually waited out to confirm the UI recovers cleanly mid-session rather than only on
  next load.
- **Only one flat `ADMIN` role** — anyone with an admin account can do everything. Finer
  roles/permissions (e.g. content-only vs. structure-editing admins) remain an open
  question — see `reports/open-questions.md`.
