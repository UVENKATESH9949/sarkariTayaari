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

## Automated deploys (the normal path)

`.github/workflows/backend-deploy.yml` builds and deploys on every push to `main` that
touches `backend/**`. Nothing manual is needed once the one-time setup below is done.

### Why this was added

The APK has been built automatically on every push since 2026-08-21. The backend never was
— it was deployed once, by hand. The two then drifted apart **silently**: V11's exam
difficulty/badge feature shipped on 2026-08-27 and was still not live on 2026-08-31,
because every test in between ran on the emulator, which points at a *local* backend. From
the emulator everything looked correct. Verified on 2026-08-31 against the live service:

```
GET /api/exam-badges   ->  404
GET /api/exams         ->  no "difficulty" / "badge" fields
```

"I pushed it, so it's live" was only half true, and the half that wasn't stayed invisible
for four days. That is what this workflow fixes.

### One-time setup

Run these once, from a machine that has `gcloud` (a personal laptop, or Cloud Shell in the
browser — Cloud Shell needs nothing installed).

> **No terminal available?** `BACKEND-DEPLOY-SETUP.md` is the same setup click-by-click in
> the GCP Console, plus the exact values to paste into GitHub and a troubleshooting table
> for the three ways this typically fails. Written for a machine that cannot install
> `gcloud` at all — which is the machine this project is developed on.

**Use the keyless option.** This repository is **public**. A service-account JSON key is a
long-lived credential with deploy rights to the whole GCP project; Workload Identity
Federation issues a short-lived token bound to this one repository, which cannot be
replayed from anywhere else. The project has already had one credential incident — see the
security note in `memory/STATUS.md`.

```bash
# set -e matters here. Without it, one failed command scrolls past in a wall of Cloud Shell
# output and the rest still runs — which is how a setup ends up looking complete while the
# final binding never landed. That exact failure cost a debugging round on 2026-08-31.
set -euo pipefail

PROJECT=sarkaritayaari          # note the spelling — not sarkaritaiyaari
PROJECT_NUMBER=815653276881
REPO=UVENKATESH9949/sarkariTayaari

# 1. A dedicated deploy identity, so CI never uses your own account.
gcloud iam service-accounts create github-deployer \
  --project "$PROJECT" --display-name "GitHub Actions backend deployer"

SA="github-deployer@${PROJECT}.iam.gserviceaccount.com"

# 2. Only what a build-and-deploy needs. Deliberately not roles/owner or roles/editor.
for ROLE in \
  roles/cloudbuild.builds.editor \
  roles/artifactregistry.writer \
  roles/run.developer \
  roles/logging.viewer
do
  gcloud projects add-iam-policy-binding "$PROJECT" \
    --member "serviceAccount:${SA}" --role "$ROLE" --condition=None
done

# Cloud Build stages source in GCS, and Cloud Run deploys *as* its runtime service
# account — which requires actAs on it. Miss either and the deploy fails late with a
# permission error that does not name the missing role.
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member "serviceAccount:${SA}" --role roles/storage.admin --condition=None

gcloud iam service-accounts add-iam-policy-binding \
  "${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --project "$PROJECT" --member "serviceAccount:${SA}" \
  --role roles/iam.serviceAccountUser

# 3. Let GitHub's OIDC tokens impersonate that identity.
gcloud iam workload-identity-pools create github \
  --project "$PROJECT" --location global --display-name "GitHub Actions"

gcloud iam workload-identity-pools providers create-oidc github-provider \
  --project "$PROJECT" --location global --workload-identity-pool github \
  --display-name "GitHub" \
  --issuer-uri "https://token.actions.githubusercontent.com" \
  --attribute-mapping "google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition "assertion.repository=='${REPO}'"

# The attribute-condition above is the part that matters: without it, ANY GitHub
# repository in the world could mint a token for this identity.

gcloud iam service-accounts add-iam-policy-binding "$SA" \
  --project "$PROJECT" --role roles/iam.workloadIdentityUser \
  --member "principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github/attribute.repository/${REPO}"

# 4. Assert the binding actually landed, rather than trusting that it did.
#
# This is the one that breaks silently, and it is also the one whose absence produces a
# confusing failure much later: the GitHub auth step still reports "Successfully
# authenticated" (it only writes a credential file), and the 403 only appears when
# something first tries to *use* it.
EXPECTED="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github/attribute.repository/${REPO}"

if gcloud iam service-accounts get-iam-policy "$SA" --project "$PROJECT" --format=json \
     | grep -qF "$EXPECTED"; then
  echo "OK: workloadIdentityUser binding is present."
else
  echo "MISSING: the workloadIdentityUser binding did not land. Re-run just this:"
  echo ""
  echo "  gcloud iam service-accounts add-iam-policy-binding $SA \\"
  echo "    --project $PROJECT --role roles/iam.workloadIdentityUser \\"
  echo "    --member '$EXPECTED'"
  exit 1
fi

# 5. Print the two values to paste into GitHub.
echo "GCP_WORKLOAD_IDENTITY_PROVIDER = projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github/providers/github-provider"
echo "GCP_DEPLOY_SERVICE_ACCOUNT     = ${SA}"
```

Then in GitHub: **Settings → Secrets and variables → Actions → Variables** (the
*Variables* tab, not Secrets) and add both names above.

Neither value is a secret — a provider path and a service-account email are not
credentials, which is the point of the keyless approach. They are Variables rather than
Secrets so they stay readable in logs when a deploy needs debugging.

### Fallback: service-account key

Only if Workload Identity Federation is genuinely not an option. Create a JSON key for the
same service account and add it as the repository **secret** `GCP_SA_KEY`. The workflow
accepts it and prints a warning on every run, because a long-lived deploy credential
attached to a public repository is a standing risk rather than a one-off one.

### Verifying it works

Push any change under `backend/`, or run **Actions → Backend Deploy → Run workflow**. The
run reports the image, the revision, and a rollback command in its summary, and fails if
the deployed revision does not answer `/api/health`.

### Rolling back

Every build is tagged with its commit SHA, not just `:latest`, so a rollback has something
specific to point at:

```bash
gcloud run deploy sarkaritaiyaari-backend \
  --image asia-south1-docker.pkg.dev/sarkaritayaari/backend-repo/backend:<previous-sha> \
  --region asia-south1
```

## Redeploying by hand

Still works, and is the right tool for a one-off or when CI itself is broken.
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
- No custom domain. **Backend CI/CD now exists** — see "Automated deploys" below. The
  `Jenkinsfile` still builds artefacts and has no deploy stage; it is not used for this.
- The admin site itself is **not deployed** — it still runs locally against this backend.
