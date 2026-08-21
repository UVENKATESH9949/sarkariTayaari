# Backend Deployment to Google Cloud Run

**Closes:** the "Decide production hosting" item that sat at #4 in `memory/STATUS.md`'s
Next-up list, and the "Cloud provider / hosting for the production backend" +
"Production database (stay on Neon, or a dedicated instance)" rows in
`reports/open-questions.md`. Also executes `DEPLOYMENT.md`, which had been written as a
handoff document on a machine that could not finish the job.

Three decisions were confirmed with the user before starting:
1. **Scope** — backend to Cloud Run plus fixing the CORS blocker. Admin-site hosting and
   an APK rebuild were deliberately excluded from the deployment scope itself.
2. **Database** — reuse the existing Neon database rather than provisioning a separate
   production one. Accepted trade-off: prod and dev now share one database, so the
   integration suite touches live data. Flagged for revisit before beta users.
3. **Scaling** — scale to zero (never set `min-instances`), accepting a ~10-20s cold
   start in exchange for staying inside the free tier.

## What existed before

The backend ran only on a developer laptop. `DEPLOYMENT.md` described the GCP account as
set up and billing as "linked", and listed six steps to finish. Verified against the real
environment rather than trusted, and three of its claims turned out to be wrong — see
"Real bugs found and fixed" below.

`backend/Dockerfile` and `.dockerignore` already existed and were sound: a multi-stage
Maven build (tests skipped, since several hit the real Neon DB and no credentials exist
inside a Cloud Build context) producing an `eclipse-temurin:21-jre-alpine` runtime image.

## What was built

**Two code changes, both required before a deploy could be useful:**

- `backend/.../config/CorsConfig.java` — allowed origins moved from a hardcoded
  `http://localhost:5173` to a configurable `app.cors.allowed-origins`, settable in
  production as `APP_CORS_ALLOWED_ORIGINS`. Without this, a deployed admin site would
  have every request rejected by the browser before reaching a controller.
- `backend/src/main/resources/application.yml` — `server.port` is now `${PORT:8080}`
  (Cloud Run injects `PORT` and requires the container to listen on it; 8080 worked only
  by coincidence), plus the new `app.cors.allowed-origins` default. Dev behaviour is
  unchanged.

**GCP infrastructure** (project `sarkaritayaari`, project number `815653276881`, region
`asia-south1`):

- Billing account `010601-309CBB-C725CD` linked to the project.
- APIs enabled: `run`, `artifactregistry`, `secretmanager`, `cloudbuild`.
- Artifact Registry repo `backend-repo`; image
  `asia-south1-docker.pkg.dev/sarkaritayaari/backend-repo/backend:latest` (120.5 MB,
  built by Cloud Build in 2m22s — no local Docker involved).
- Secret Manager: `db-password`, `cloudinary-secret`.
- `roles/secretmanager.secretAccessor` granted to the runtime service account
  `815653276881-compute@developer.gserviceaccount.com`.
- Cloud Run service `sarkaritaiyaari-backend`, `--allow-unauthenticated`,
  `--max-instances=3`, scale-to-zero.

**Service URL:** `https://sarkaritaiyaari-backend-815653276881.asia-south1.run.app`

**Deliberate deviations from `DEPLOYMENT.md`'s commands:**
- `--max-instances=3` added. Cloud Run's default ceiling is 100; the cap bounds the
  worst case rather than relying on a budget email that only notifies and never stops
  spending.
- `ADMIN_BOOTSTRAP_EMAIL` / `ADMIN_BOOTSTRAP_PASSWORD` dropped, and the third secret
  never created. `AdminBootstrapRunner` is a no-op once any admin exists, and one did.
- `gcloud auth configure-docker` skipped — only needed for pushing from local Docker,
  and `gcloud builds submit` pushes server-side.

## Real bugs found and fixed

1. **Billing was never linked to the project** — the actual reason nothing worked.
   `DEPLOYMENT.md` claimed billing was set up, and a billing *account* did exist and was
   open, but `gcloud billing projects describe` returned `billingEnabled: False`. GCP
   refuses to enable Cloud Run, Artifact Registry, Cloud Build or Secret Manager on an
   unbilled project *even for their free tiers*, so the user's earlier
   `gcloud services enable` had failed and left no trace they noticed — the symptom was
   an empty `gcloud services list` output. Found by checking billing state directly
   rather than trusting the document.
2. **`--set-secrets` does not grant secret access.** The Cloud Run runtime service
   account needs `roles/secretmanager.secretAccessor` explicitly. Without it the deploy
   succeeds and the container then dies on a secret read, surfacing as a startup failure
   that reads like a database misconfiguration. Granted pre-emptively rather than
   diagnosed after the fact.
3. **A real security exposure, created by the deployment itself.** `memory/STATUS.md`
   records live credentials in plain text (`admin@sarkaritaiyaari.app / Admin@12345`,
   `demo@sarkaritaiyaari.app / Demo@1234`) and this repo is public — confirmed via the
   GitHub API, not assumed. That was low-risk while the backend ran only on a laptop.
   Publishing the backend turned it into a working key to a reachable door. Confirmed
   exploitable, not theoretical: `POST /api/auth/login` with those credentials against
   the public URL returned 200 with role ADMIN and a valid token. **Not yet remediated
   — see Honest gaps.**
4. **`DEPLOYMENT.md`'s step 6 was wrong**, and would have sent a future session hunting
   for code changes that aren't needed. It says to grep for `localhost:8080` and edit
   both apps. In fact `admin/src/api.js` already reads `VITE_API_BASE_URL` and
   `mobile/src/api/config.ts` already reads `EXPO_PUBLIC_API_BASE_URL` — repointing is
   env configuration, not a code change.

## Verified

- `GET /api/health` → `200 {"status":"UP"}`.
- `GET /api/questions/live?size=1` → `200`, returning a real question with correct
  subject/topic/exam tags — proving the service genuinely reached Neon, not just that it
  booted. `totalElements: 35958`, consistent with the documented ~37,900 minus the
  ~2,000 soft-deleted load-test rows that `/live` excludes by design.
- **Bilingual content intact end to end**: the Hindi initially appeared corrupted in the
  terminal; decoding the raw response bytes as UTF-8 returned
  `यदि 4x + 10 = 34, तो x ज्ञात करें।` correctly, confirming a console display artifact
  rather than a server encoding fault. Checked rather than assumed.
- `/` and `/api` return 404 while `/api/health` and `/api/exams` return 200 — expected,
  since the backend maps no root path. Verified after the user hit the Whitelabel error
  page and reasonably thought something was broken.
- Both code changes are confirmed working **at runtime, not just compiled**: Cloud Run
  refuses to start a container that does not listen on its injected `PORT`, and the
  service started and served traffic.
- A new admin account (`venkatesh9949.u@gmail.com`) was created via
  `POST /api/auth/admin/register` and independently verified — login returns role ADMIN
  and its token is accepted by `GET /api/auth/me`.
- Billing, all four APIs, the Artifact Registry image digest and the IAM binding were
  each re-queried after the fact rather than assumed from command exit codes.

## Honest gaps

- **The exposed admin credentials are still live.** The remediation (`UPDATE users SET
  role='STUDENT'` plus deleting that user's tokens) requires the Neon SQL console; no
  database credentials exist on this machine, so it could not be done here. Re-checked
  the following morning and the old credentials still returned role ADMIN. **This is the
  highest-priority open item in the project.** The demo student account is exposed the
  same way, at lower severity.
- **The CORS change was never exercised by a real cross-origin browser request.** The
  property binds and the app boots, but nothing has yet made an actual browser request
  from a non-default origin. It gets its first real test when the admin app is used
  against the deployed backend.
- **The backend integration suite (78 tests) was not run against these changes.**
  `backend/application-local.yml` does not exist on this machine, so the tests cannot
  connect to a database. Both changes are compile-verified and runtime-verified via the
  deploy, but the suite itself has not been re-run since they were made.
- **Nothing is committed to git.** The two code changes are working-tree only, per this
  project's convention of never committing without an explicit request.
- **Prod and dev now share one Neon database.** Running the integration suite will
  create and delete rows in the same database the deployed service serves.
- **`/downloads` APK hosting is effectively dead in production.** `DownloadsConfig`
  serves from local disk, which on Cloud Run is ephemeral and scales to zero. The
  development convenience of dropping an APK in `backend/downloads/` does not survive
  deployment. ADR-006 already flagged this mechanism as not production-final.
- **No custom domain, no HTTPS certificate management, no CI/CD for the backend.**
  Deploys are manual `gcloud` commands today. The existing `Jenkinsfile` builds artefacts
  but has no deploy stage.
