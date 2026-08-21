# Backend Deployment — Google Cloud Run

**Status as of 2026-08-21: DEPLOYED AND LIVE.**

**Service URL:** `https://sarkaritaiyaari-backend-815653276881.asia-south1.run.app`

Verified live: `GET /api/health` returns `{"status":"UP"}`, and
`GET /api/questions/live?size=1` returns real bilingual content from Neon
(`totalElements: 35958`). Full write-up, including what went wrong on the way:
`reports/14-cloud-run-deployment/cloud-run-deployment.md`.

> **There is no page at the root URL.** This is an API — `/` and `/api` return
> Spring's Whitelabel 404 by design. Use `/api/health` or `/api/exams`.

## What is actually deployed

| Thing | Value |
|---|---|
| GCP project | `sarkaritayaari` (project number `815653276881`) |
| Region | `asia-south1` (Mumbai) |
| Cloud Run service | `sarkaritaiyaari-backend` |
| Image | `asia-south1-docker.pkg.dev/sarkaritayaari/backend-repo/backend:latest` |
| Secrets | `db-password`, `cloudinary-secret` (Secret Manager) |
| Database | the **existing Neon dev database** — a deliberate choice, not an oversight |

**Note the spelling.** The GCP project is `sarkaritayaari`; the Java package and repo
are `sarkarita**i**yaari`. They genuinely differ — don't autocorrect one into the other.

**Locked decisions:**
- **Scale to zero.** Never set `min-instances`. That is what keeps this inside the free
  tier. The cost is a ~10-20s cold start on the first request after idle.
- **`--max-instances=3`.** Cloud Run defaults to a ceiling of 100. The cap bounds the
  worst case; the ₹500 budget alert only sends email and never stops spending.
- **`--allow-unauthenticated`** is required — the mobile app and admin site call these
  endpoints directly without a Google-issued token.

## Redeploying after a code change

From `backend/`:

```
gcloud builds submit --tag asia-south1-docker.pkg.dev/sarkaritayaari/backend-repo/backend:latest

gcloud run deploy sarkaritaiyaari-backend --image=asia-south1-docker.pkg.dev/sarkaritayaari/backend-repo/backend:latest --region=asia-south1
```

Environment variables and secrets persist across deploys — you only need to re-specify
them when they change. Cloud Build builds server-side, so local Docker is not involved
and `gcloud auth configure-docker` is unnecessary.

To change allowed CORS origins (e.g. once the admin site is hosted somewhere):

```
gcloud run services update sarkaritaiyaari-backend --region=asia-south1 --update-env-vars="APP_CORS_ALLOWED_ORIGINS=https://your-admin-site,http://localhost:5173"
```

## Traps that cost real time — read before touching this again

1. **A billing *account* is not a billed *project*.** The previous version of this file
   claimed billing was linked. It wasn't: an open billing account existed, but the
   project was never attached to it. GCP then refuses to enable Cloud Run, Artifact
   Registry, Cloud Build or Secret Manager *even for their free tiers* — and
   `gcloud services enable` fails in a way that's easy to miss. Check with
   `gcloud billing projects describe <project> --format="value(billingEnabled)"`.
2. **`--set-secrets` does not grant permission to read those secrets.** The runtime
   service account (`<project-number>-compute@developer.gserviceaccount.com`) needs
   `roles/secretmanager.secretAccessor` explicitly. Miss it and the deploy succeeds,
   then the container dies on startup with something that reads like a database error.
3. **Repointing the apps needs no code change.** An earlier version of this file said to
   grep for `localhost:8080` and edit both apps. Wrong: `admin/src/api.js` already reads
   `VITE_API_BASE_URL`, and `mobile/src/api/config.ts` already reads
   `EXPO_PUBLIC_API_BASE_URL`. It is env configuration only.
   - Admin: `admin/.env.local` → `VITE_API_BASE_URL=<service URL>` (no `/api` suffix)
   - Mobile: `mobile/.env.local` → `EXPO_PUBLIC_API_BASE_URL=<service URL>/api`
     (**the `/api` suffix IS required here** — `src/api/client.ts` appends paths like
     `/exams` directly)
4. **CORS was a hard blocker and is now configuration.** `CorsConfig` used to hardcode
   `http://localhost:5173` as the only allowed origin. A deployed admin site would have
   had every request rejected by the browser before reaching a controller.
5. **Building the APK from inside OneDrive does not work.** OneDrive's Files-On-Demand
   touches files mid-build, which leaves CMake regenerating forever and ninja failing
   with `manifest 'build.ninja' still dirty after 100 tries`. Build from a path outside
   OneDrive. A directory junction does **not** help — Windows resolves it back to the
   real path.

## Security note — learned the hard way here

`memory/STATUS.md` records live credentials in plain text, and this repo is public. That
was low-risk while the backend only ran on a laptop. **Deploying it turned those
credentials into a working key to a publicly reachable door** — confirmed by an actual
login returning role ADMIN, not assumed.

Remediated: `admin@sarkaritaiyaari.app` was demoted to STUDENT and its tokens deleted;
a new admin was created and verified. The general lesson is worth keeping: **any
credential written into this repo must be treated as public**, and the assumption that
"it's only local anyway" expires the moment something is deployed.

## Still open

- The two backend config changes (`CorsConfig`, `application.yml`) are **uncommitted**,
  and the 78-test suite has not been re-run against them — that needs a machine with
  `backend/application-local.yml`.
- Prod and dev share one Neon database. The integration suite writes to the same
  database the deployed service serves.
- `/downloads` APK hosting no longer works: `DownloadsConfig` serves from local disk,
  which on Cloud Run is ephemeral and scales to zero. Use Firebase App Distribution or
  Play internal testing instead.
- No custom domain, no backend CI/CD. Deploys are manual `gcloud` commands; the
  `Jenkinsfile` builds artefacts but has no deploy stage.
- The admin site itself is **not deployed** — it still runs locally against this backend.
