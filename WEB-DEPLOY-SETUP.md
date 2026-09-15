# Deploying the student web app

One-time setup for `.github/workflows/web-deploy.yml`, which builds `web/` and publishes it to
Firebase Hosting on every push to `main` that touches `web/**` or `packages/**`.

This is the web equivalent of [`BACKEND-DEPLOY-SETUP.md`](BACKEND-DEPLOY-SETUP.md), and it
reuses that setup's Workload Identity Federation rather than creating a second credential.
**Until these steps are done the workflow fails immediately and tells you what is missing** —
that first failure is by design, not a broken build.

Everything here needs either the Firebase Console or `gcloud`/`firebase` CLI. None of it can
be done from inside the repository, which is why the workflow exists but has never run.

---

## 1. Turn on Firebase Hosting for the existing project

The backend already runs in Google Cloud project **`sarkaritayaari`** (note the spelling — it
differs from the Java package `sarkaritaiyaari`). Firebase sits on top of a GCP project rather
than replacing it, so add it to the one that exists instead of creating a new one:

1. Open <https://console.firebase.google.com/> → **Add project**.
2. Choose **`sarkaritayaari`** from the existing-projects list. Do not create a new project —
   a second project means a second billing account and a second place to look when something
   breaks.
3. In the new Firebase project, open **Build → Hosting** and click through **Get started**.
   Skip the CLI instructions it offers; `firebase.json` is already in this repository.

`.firebaserc` already names `sarkaritayaari` as the default project. If you deliberately chose
a different one, change it there.

## 2. Let the deploy identity publish to Hosting

The service account `backend-deploy.yml` already uses can be reused. Grant it Hosting rights:

```bash
gcloud projects add-iam-policy-binding sarkaritayaari \
  --member="serviceAccount:<the same account as GCP_DEPLOY_SERVICE_ACCOUNT>" \
  --role="roles/firebasehosting.admin"

# firebase-tools resolves the project's own metadata before it can deploy.
gcloud projects add-iam-policy-binding sarkaritayaari \
  --member="serviceAccount:<same>" \
  --role="roles/firebase.viewer"
```

If you would rather keep deploy identities separate, create a second service account and add
it to the same Workload Identity pool — the binding is per-repository, so the existing pool
covers it.

## 3. Set three repository variables

**Settings → Secrets and variables → Actions → Variables** (the *Variables* tab, not Secrets —
none of these are secret, and variables are readable in logs, which is what you want for
debugging a deploy).

| Variable | Value |
|---|---|
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Same value `backend-deploy.yml` uses |
| `GCP_DEPLOY_SERVICE_ACCOUNT` | Same value `backend-deploy.yml` uses |
| `VITE_API_BASE_URL` | `https://sarkaritaiyaari-backend-815653276881.asia-south1.run.app/api` |

`VITE_API_BASE_URL` is **inlined into the bundle at build time**, so changing it requires a
redeploy, not a restart. It must include the `/api` suffix — the shared API client appends
paths like `/exams` straight onto it.

## 4. Add the deployed origin to the backend's CORS allowlist — do not skip this

The backend matches origins **exactly**. A deployed web app whose origin is not listed gets a
flat `403 Invalid CORS request` on every preflight, and the browser reports that only as an
opaque network failure — indistinguishable from the backend being down. This is not
theoretical: it was reproduced deliberately during TASK-2601 Phase 0, by curl and in Chromium.

Firebase serves **two** origins for every site by default, and they are different origins as
far as CORS is concerned. List both:

```bash
gcloud run services update sarkaritaiyaari-backend \
  --region=asia-south1 \
  --update-env-vars='APP_CORS_ALLOWED_ORIGINS=https://<admin-origin>,https://sarkaritayaari.web.app,https://sarkaritayaari.firebaseapp.com'
```

Include every origin in one value — this **replaces** the variable rather than appending, so
omitting the admin console's origin here silently breaks the admin console.

Verify without a browser:

```bash
curl -i -X OPTIONS https://sarkaritaiyaari-backend-815653276881.asia-south1.run.app/api/exams \
  -H "Origin: https://sarkaritayaari.web.app" \
  -H "Access-Control-Request-Method: GET"
```

A correct result echoes `Access-Control-Allow-Origin: https://sarkaritayaari.web.app`. A `403`
with `Invalid CORS request` means the origin is not in the list — check for a trailing slash
or `http` vs `https`.

## 5. Run it

Push a change under `web/`, or trigger **Deploy web** manually from the Actions tab. Then open
the site and confirm the exam list loads — that single check exercises the whole chain: the
build, the baked-in base URL, and the CORS allowlist.

---

## Local development

```bash
cp web/.env.example web/.env.local     # defaults to a local backend
npm run dev:web                        # http://localhost:5174
```

The dev server is pinned to port **5174** (`strictPort`) because the backend's dev CORS
default lists that exact origin. If you move it, add the new origin to
`app.cors.allowed-origins` in `backend/src/main/resources/application.yml` or the backend will
reject every request. `http://127.0.0.1:5174` is a *different* origin from
`http://localhost:5174` and will fail.

## Not set up yet

- **A custom domain.** The app will serve from `*.web.app` until one is configured in the
  Firebase Console; adding one means adding a third origin to the CORS list.
- **Preview channels per pull request.** Firebase supports them and they are genuinely useful
  for reviewing UI changes, but each preview gets its own origin, and every one of those
  origins would need to be in the backend's allowlist — which does not scale as a manual step.
  Worth solving properly (a wildcard-capable CORS configuration) rather than by hand.
