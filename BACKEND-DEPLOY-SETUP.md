# Backend Deploys — GitHub Actions setup, browser only

Click-by-click setup for `.github/workflows/backend-deploy.yml`, using nothing but a web
browser. Nothing is installed and no terminal is used, so a restricted laptop is fine.

**Why a browser-only guide exists:** the machine this project is developed on has no
`gcloud` and no `docker`, and cannot get them. The original Cloud Run deploy was done from
a different, personal laptop — which is exactly how the backend ended up four days behind
the repo without anyone noticing (see `DEPLOYMENT.md` → "Automated deploys" for that
story). A setup that only works from one particular machine is how this happened, so this
one deliberately works from anywhere.

There are two routes. **Route A is strongly preferred.** Route B exists because corporate
networks sometimes block Cloud Shell.

| | Route A — Cloud Shell | Route B — Console clicks |
|---|---|---|
| Time | ~3 min | ~10 min |
| Credential | Keyless (short-lived token) | Keyless (short-lived token) |
| Route C fallback | — | Long-lived JSON key, see bottom |

---

## What you are creating, and why

The workflow needs to prove to Google that it is *this* repository. Two ways to do that:

- **Workload Identity Federation** — GitHub hands Google a short-lived, signed token saying
  "I am a run in `UVENKATESH9949/sarkariTayaari`". Google trades it for a ~1 hour access
  token. Nothing long-lived is ever stored in GitHub.
- **A service-account JSON key** — a permanent credential with deploy rights to the entire
  GCP project, sitting in a GitHub secret.

**This repository is public.** That is the whole reason the first option is the documented
one. It is not theoretical caution: admin credentials and a Cloudinary secret have already
leaked into this repo once (see the security note in `memory/STATUS.md`).

Values you will end up pasting into GitHub — both are just resource *names*, neither is a
secret:

```
GCP_WORKLOAD_IDENTITY_PROVIDER
projects/815653276881/locations/global/workloadIdentityPools/github/providers/github-provider

GCP_DEPLOY_SERVICE_ACCOUNT
github-deployer@sarkaritayaari.iam.gserviceaccount.com
```

> **The project is `sarkaritayaari` — no `i` before the `y`.** The Java package and this
> repo are `sarkarita`**`i`**`yaari`. They genuinely differ, and `DEPLOYMENT.md` warns about
> it because autocorrecting one into the other has already cost time.

---

## Route A — Cloud Shell (preferred)

Cloud Shell is a terminal that runs on Google's machines and opens in a browser tab. Your
laptop's restrictions do not apply to it, because nothing runs locally.

1. Open <https://console.cloud.google.com> and sign in.
2. Top-left project picker → select **`sarkaritayaari`** (project number `815653276881`).
3. Click the **`>_`** icon in the top-right toolbar. A terminal opens at the bottom.
   Approve "Authorize" if prompted.
4. Paste the whole script from **`DEPLOYMENT.md` → Automated deploys → One-time setup**.
   It is one block; paste it all at once and let it run.
5. It prints the two values at the end. **Copy them from that output**, not from this file —
   if the script is ever edited to use different names, its output stays right and this
   file could be stale.
6. Continue at [Add the values to GitHub](#add-the-values-to-github).

If step 3 does nothing, or the tab is blocked, use Route B.

---

## Route B — Console clicks (no terminal)

### B1. Create the deploy service account

1. **IAM & Admin → Service Accounts → + Create service account**
2. Name: `github-deployer` — the ID field fills in to match. Leave the description blank.
3. **Create and continue.**
4. On the "Grant this service account access to project" step, add these four roles one at a
   time via **+ Add another role**:

   | Role | Why |
   |---|---|
   | `Cloud Build Editor` | submit the image build |
   | `Artifact Registry Writer` | push the built image |
   | `Cloud Run Developer` | deploy a new revision |
   | `Storage Admin` | Cloud Build stages your source in a GCS bucket |

   These are deliberately not `Editor` or `Owner`. A deploy identity attached to a public
   repository should be able to deploy and nothing else.
5. **Continue → Done.**

### B2. Let it deploy *as* the Cloud Run runtime account

Cloud Run runs the container under its own service account, and deploying means "act as"
that account. Missing this produces a permission error late in the deploy that does not name
the role it needs — it is the single most common way this setup fails.

1. Still in **Service Accounts**, click **`815653276881-compute@developer.gserviceaccount.com`**
   (the default compute account — this is the one Cloud Run uses here).
2. **Permissions** tab → **Grant access**.
3. New principal: `github-deployer@sarkaritayaari.iam.gserviceaccount.com`
4. Role: **Service Account User**.
5. **Save.**

### B3. Create the identity pool

1. **IAM & Admin → Workload Identity Federation → Create pool** (or *Get started*).
2. Name: `github`. The pool ID fills in as `github` — it must be exactly that, because the
   value you paste into GitHub contains it. **Continue.**
3. Provider: choose **OpenID Connect (OIDC)**.
4. Provider name **and** provider ID: `github-provider` — again, exactly that.
5. Issuer (URL): `https://token.actions.githubusercontent.com`
6. Leave **Audience** on *Default audience*. The GitHub action sends the default audience,
   so overriding it here only creates a mismatch.
7. **Continue.**

### B4. Map attributes, and add the condition that matters

1. Under **Attribute mapping**, create these two rows:

   | OIDC field (Google) | Assertion (GitHub) |
   |---|---|
   | `google.subject` | `assertion.sub` |
   | `attribute.repository` | `assertion.repository` |

2. Under **Attribute conditions**, click *Add condition* and enter exactly:

   ```
   assertion.repository == 'UVENKATESH9949/sarkariTayaari'
   ```

   > **Do not skip this field.** Without it, *any* GitHub repository on the internet can
   > mint a token for your service account and deploy to your project. It is the one field
   > in this whole setup that is load-bearing for security, and the Console does not require
   > it.

3. **Save.**

### B5. Connect the pool to the service account

1. On the pool's page, click **Grant access** (or *Connected service accounts → Grant
   access*).
2. Service account: **`github-deployer`**.
3. Choose **Only identities matching the filter**.
4. Attribute name: **`repository`** · Attribute value: **`UVENKATESH9949/sarkariTayaari`**
5. **Save.** Dismiss the "download config" dialog — the workflow does not use that file.

---

## Add the values to GitHub

This part is a website, so it works from any machine including this laptop.

1. <https://github.com/UVENKATESH9949/sarkariTayaari> → **Settings**
2. Left sidebar → **Secrets and variables → Actions**
3. Select the **`Variables`** tab. **Not Secrets** — neither value is a credential, and
   keeping them readable means a failed deploy can actually be diagnosed from the log.
4. **New repository variable**, twice:

   | Name | Value |
   |---|---|
   | `GCP_WORKLOAD_IDENTITY_PROVIDER` | `projects/815653276881/locations/global/workloadIdentityPools/github/providers/github-provider` |
   | `GCP_DEPLOY_SERVICE_ACCOUNT` | `github-deployer@sarkaritayaari.iam.gserviceaccount.com` |

   Names must match exactly — capitals and underscores. An unset variable expands to an
   empty string rather than an error, which is why the workflow checks for both up front and
   refuses to continue.

---

## Run it

**Actions → Backend Deploy → Run workflow → Run workflow.**

A successful run's summary shows the commit, image tag, revision name, and a ready-made
rollback command. It takes roughly 5–8 minutes, most of it Cloud Build.

The run **fails on purpose** if the deployed revision does not answer `/api/health`. A
revision that Cloud Run marks "ready" is not necessarily one that works, and Flyway applies
migrations at container start — so that check is also what catches a bad migration instead
of letting it go quietly live.

### Confirming the new code is really serving

```
https://sarkaritaiyaari-backend-815653276881.asia-south1.run.app/api/exams/SSC_CGL/topic-intelligence
```

`200` with JSON means Epic L is live. `404` means the old revision is still serving. The
first request after idle takes 10–20 seconds — the service scales to zero, which
`DEPLOYMENT.md` records as a deliberate cost of staying in the free tier, not a fault.

---

## Troubleshooting

**`Permission 'iam.serviceAccounts.getAccessToken' denied`**
B5 was missed, or the attribute value has a typo. It is case-sensitive:
`UVENKATESH9949/sarkariTayaari`.

**`Unable to acquire impersonated credentials`**
Usually the provider path. Compare the variable against
`projects/815653276881/locations/global/workloadIdentityPools/github/providers/github-provider`
character by character — a wrong pool or provider ID from B3/B4 lands here.

**`caller does not have permission ... actAs`**
B2 was missed. Grant `github-deployer` the **Service Account User** role on
`815653276881-compute@developer.gserviceaccount.com`.

**Build succeeds, deploy fails, container will not start**
A migration failed. Read the logs — this is the case the health check exists to catch:

```
gcloud run services logs read sarkaritaiyaari-backend --region asia-south1 --limit 100
```

Or in the Console: **Cloud Run → sarkaritaiyaari-backend → Logs**.

**Workflow does not trigger on push**
It is path-filtered to `backend/**`, on purpose — a mobile-only or docs-only push must not
restart the service for identical code. Use **Run workflow** for anything else.

---

## Route C — the JSON key fallback

Only if both routes above are blocked.

1. **IAM & Admin → Service Accounts →** `github-deployer` (create it per B1 first, and do
   B2 as well) **→ Keys → Add key → Create new key → JSON → Create.** A file downloads.
2. GitHub → **Settings → Secrets and variables → Actions →** the **`Secrets`** tab this time
   → **New repository secret**, named `GCP_SA_KEY`, value = the entire contents of that
   file.
3. Do **not** add the two Variables; the workflow prefers them when present.

The workflow accepts this and prints a warning on every single run. That is deliberate. The
file you just downloaded is a permanent credential with deploy rights to the whole project,
now stored against a public repository, and it does not expire on its own. If you use it,
delete the downloaded file from your machine, and rotate the key from the same **Keys** page
once Route A or B becomes possible.
