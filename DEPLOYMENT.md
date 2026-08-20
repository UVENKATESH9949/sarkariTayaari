# Backend Deployment — Google Cloud Run

**Status as of 2026-08-20: not yet deployed.** GCP account and billing are set
up; the Docker packaging is ready in this repo; everything from here on needs
the `gcloud` CLI, which isn't installed on this machine (install restrictions)
— continuing from a laptop that can install it.

This file exists so a session on that laptop (with no memory of this one) can
pick up exactly where this left off. Read this first, then follow "Exact next
steps" in order.

## What's done

- GCP account created, billing profile linked. A card was added and an RBI
  e-mandate was authorized during setup — **this is just an authorization
  ceiling (₹15,000), not a charge.** No money has moved.
- Budget alert set: **₹500/month**, default 50/90/100% thresholds. This is an
  email notification only — it does **not** automatically stop billing if
  usage keeps climbing past it.
- GCP project created via the console. **Fill in below — not recorded here on
  purpose:**
  - Project ID: `______________`
  - Region chosen: `______________` (recommended: `asia-south1` / Mumbai, for
    India-based users — used in all commands below, change if you picked
    differently)
- `backend/Dockerfile` and `backend/.dockerignore` added to this repo:
  multi-stage build — a Maven build stage (tests skipped on purpose: several
  tests, e.g. `LiveQuestionsTest`, hit the real Neon database and there are no
  DB credentials available inside a Docker/Cloud Build context) followed by a
  small `eclipse-temurin:21-jre-alpine` runtime image.
- Confirmed the exact environment variables the app needs in production, from
  `backend/application-local.yml.example` (the real file with real values is
  gitignored and stays local-only):
  - `SPRING_DATASOURCE_URL`, `SPRING_DATASOURCE_USERNAME`, `SPRING_DATASOURCE_PASSWORD`
  - `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
  - `ADMIN_BOOTSTRAP_EMAIL`, `ADMIN_BOOTSTRAP_PASSWORD` (optional — only
    matters if no admin account exists yet; a no-op after that)
  - Spring Boot maps these automatically (relaxed binding) — no code or config
    file changes needed to support them.

## What's NOT done yet

- `gcloud` CLI is not installed anywhere yet. Nothing past account/billing
  setup has actually been run: no APIs enabled via CLI, no Artifact Registry
  repo, no secrets stored, no image built, nothing deployed.
- Real secrets (Neon DB password, Cloudinary API secret, admin bootstrap
  password) exist only in the local, gitignored
  `backend/application-local.yml` on this machine. They need to be typed
  directly into terminal commands on whichever machine finishes deployment —
  **never paste them into a chat with any assistant.**

## Exact next steps (run on the laptop, in order)

### Step 0 — Install gcloud CLI and authenticate

Download from https://cloud.google.com/sdk/docs/install, run the installer,
then in a fresh terminal:

```
gcloud --version
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
gcloud config set run/region asia-south1
gcloud services enable run.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com cloudbuild.googleapis.com
```

### Step 1 — Create the Artifact Registry repo (stores the Docker image)

```
gcloud artifacts repositories create backend-repo \
  --repository-format=docker \
  --location=asia-south1 \
  --description="SarkariTaiyaari backend images"

gcloud artifacts repositories list --location=asia-south1

gcloud auth configure-docker asia-south1-docker.pkg.dev
```

### Step 2 — Store secrets in Secret Manager

Run locally, typing the real values directly — never in chat:

```
echo -n "YOUR_NEON_PASSWORD" | gcloud secrets create db-password --data-file=-
echo -n "YOUR_CLOUDINARY_API_SECRET" | gcloud secrets create cloudinary-secret --data-file=-
echo -n "YOUR_ADMIN_BOOTSTRAP_PASSWORD" | gcloud secrets create admin-bootstrap-password --data-file=-
```

### Step 3 — Build and push the image

From the `backend/` folder:

```
gcloud builds submit --tag asia-south1-docker.pkg.dev/YOUR_PROJECT_ID/backend-repo/backend:latest
```

### Step 4 — Deploy to Cloud Run

```
gcloud run deploy sarkaritaiyaari-backend \
  --image=asia-south1-docker.pkg.dev/YOUR_PROJECT_ID/backend-repo/backend:latest \
  --region=asia-south1 \
  --allow-unauthenticated \
  --set-env-vars="SPRING_DATASOURCE_URL=jdbc:postgresql://YOUR_NEON_HOST/YOUR_DB?sslmode=require,SPRING_DATASOURCE_USERNAME=YOUR_NEON_USERNAME,CLOUDINARY_CLOUD_NAME=YOUR_CLOUD_NAME,CLOUDINARY_API_KEY=YOUR_API_KEY,ADMIN_BOOTSTRAP_EMAIL=your-admin@email.com" \
  --set-secrets="SPRING_DATASOURCE_PASSWORD=db-password:latest,CLOUDINARY_API_SECRET=cloudinary-secret:latest,ADMIN_BOOTSTRAP_PASSWORD=admin-bootstrap-password:latest"
```

`--allow-unauthenticated` is required — the mobile app and admin site call
these endpoints directly without a Google-issued token, same as local dev
today.

### Step 5 — Test it

The deploy command prints a URL like
`https://sarkaritaiyaari-backend-xxxxx-el.a.run.app`. Test it:

```
curl https://YOUR-CLOUD-RUN-URL/api/questions/live?size=1
```

### Step 6 — Point the apps at the new URL

- Admin app's API base URL config (`admin/src/api.js` or wherever the base
  URL constant/env var lives).
- Mobile app's API base URL config (`mobile/src/api/client.ts` or
  equivalent).

Deploying doesn't automatically update these — a next session should grep for
the current `localhost:8080` base URL and replace it in both places, then
rebuild/redeploy the admin site and re-test the mobile app against the real
URL.

## Money safety notes (already covered earlier, repeated here for the record)

- The ₹15,000 e-mandate is an RBI-mandated authorization ceiling, not a
  charge — nothing was billed by authorizing it.
- The ₹500 budget alert emails at roughly 50/90/100% of that amount — it does
  **not** stop billing automatically. There is no hard cutoff configured.
- Cloud Run's free tier (2M requests/month, 360k GB-seconds, 180k vCPU-seconds)
  should comfortably cover current usage. Staying on the default
  **scale-to-zero** (never setting `min-instances > 0`) is what keeps it free
  — that's the one setting to leave alone.

## Also included in this push

Deploying needs the backend's latest code, so this push also carries the
already-completed, already-tested **hybrid online/local sync feature** (see
`reports/13-hybrid-online-sync/hybrid-online-sync.md`) — it adds the
`/api/questions/live`, `/counts`, `/mock-count`, and `/mock-sample` endpoints
the mobile app's hybrid data layer depends on. Whatever gets deployed from
`backend/` already includes these; nothing further is needed on the backend
side for that feature specifically.
