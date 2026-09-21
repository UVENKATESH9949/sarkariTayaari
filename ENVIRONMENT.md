# Environment — everything you need to rebuild this setup on another machine

**Why this file exists:** a lot of what makes this project runnable has only ever lived on one
laptop — exact tool versions, three gitignored credential files, an emulator with a specific name,
and a pile of hard-won traps that are recorded in session notes rather than anywhere you would
look first. **On a new machine, read this file and `README.md`, in that order.** Everything below
was read off the working machine on **2026-09-21**, not written from memory.

It deliberately does *not* repeat the architecture (`system-design/`), the API contracts (`api/`),
the deploy decisions (`DEPLOYMENT.md`, `BACKEND-DEPLOY-SETUP.md`, `ANDROID-BUILDS.md`,
`WEB-DEPLOY-SETUP.md`) or the current state of play (`memory/STATUS.md`). It covers the *machine*.

---

## 1. What this repository contains

| Folder | What it is | Runs on |
|---|---|---|
| `backend/` | Spring Boot REST API + Flyway migrations | JVM, port 8080 |
| `mobile/` | The student app — Expo / React Native | Android emulator or device |
| `admin/` | Content-management console — React + Vite | Browser, port 5173 |
| `web/` | Student web app — React + Vite | Browser, port 5174 |
| `packages/core` | Shared TypeScript consumed by `mobile/` and `web/` | — |
| `qa/` | The manual test register (YAML) + generated reports | `node scripts/qa/*.js` |
| `scripts/` | Seeding, QA generation, parity checks | Node / PowerShell |

`mobile/` and `admin/` are **independent npm projects**. `packages/*` and `web/` are npm
workspaces of the repo root. That split is deliberate — see `README.md`.

---

## 2. Exact toolchain on the working machine

| Tool | Version | Notes |
|---|---|---|
| **Java (JDK)** | **21.0.11** (`JAVA_HOME=C:\Program Files\Java\jdk-21.0.11`) | `backend/pom.xml` targets `<java.version>21</java.version>` |
| **Maven** | 3.9.16 | No wrapper in `backend/`; Maven must be on PATH |
| **Node** | **24.18.0** | `node:sqlite` (used by QA/inspection scripts) needs Node 22+ |
| **npm** | 11.16.0 | |
| **Git** | 2.55.0.windows.2 | |
| **Android SDK** | `ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk` | |
| **adb** | 1.0.41 | |
| **Emulator AVD** | **`Pixel_7`** | The only AVD. See §6 — its RAM setting matters |
| **Python** | 3.14.6 | Not required by the project; incidental |
| **Spring Boot** | 3.3.4 | via `spring-boot-starter-parent` |
| **Expo SDK** | ~57.0.11 | |
| **React Native** | 0.86.2 | |
| **React** | 19.2.3 (mobile), ^19.2.8 (admin/web) | |
| **expo-router** | ~57.0.11 | File-system routing — the folder structure **is** the navigation |
| **expo-sqlite** | ~57.0.1 | |
| **drizzle-orm** | ^0.45.2 | Mobile's local database |
| **Vite** | ^8.2.0 | admin and web |

**NOT installed on the working machine, and not needed for day-to-day work:**

- **`gcloud`** — so no deploy has ever been run from this laptop. Backend deploys go through
  GitHub Actions, or from the owner's personal laptop / Cloud Shell.
- **`docker`** — the Cloud Run image is built by Cloud Build, not locally.
- **`psql`** — database pokes have been done with throwaway JDBC runners instead.

---

## 3. Setting up a brand-new machine

```powershell
# 1. Install: JDK 21, Maven 3.9+, Node 22+ (24 recommended), Git, Android Studio.
#    Android Studio -> SDK Manager: install a platform + build-tools; create an AVD.
#    Set JAVA_HOME and ANDROID_HOME, and put java/mvn/node/adb on PATH.

git clone <repo-url> project
cd project

# 2. Shared package + web (npm workspaces at the repo root)
npm install

# 3. Mobile and admin are SEPARATE npm projects
npm --prefix mobile install
npm --prefix admin install

# 4. Create the three gitignored credential files — see section 4. Nothing runs without them.

# 5. Verify, cheapest first
mvn -f backend/pom.xml compile
npx --prefix packages/core tsc --noEmit -p packages/core/tsconfig.json
npm --prefix mobile exec tsc -- --noEmit
npm --prefix admin run build
```

---

## 4. The three local files that are NOT in the repo

These are gitignored on purpose and are the single biggest thing a new machine is missing.
**Key names are listed; values are not, because this repository is public.**

### `backend/application-local.yml`

Start from `backend/application-local.yml.example`. Keys actually present on the working machine:

```
spring.datasource.url            # Neon Postgres JDBC URL
spring.datasource.username
spring.datasource.password
cloudinary.cloud-name            # image/PDF uploads
cloudinary.api-key
cloudinary.api-secret
app.ai.encryption-key            # AES-256 key for AI provider credentials at rest
app.ai.enabled
app.ai.provider                  # GROQ on this machine
app.ai.api-key                   # Groq key
app.ai.model                     # openai/gpt-oss-120b
app.document-storage.fake        # true locally, since there are no real Cloudinary creds here
```

**Where the values come from:** the Neon console (database), the Cloudinary dashboard, and the
Groq console. The AI key can alternatively be saved through the admin console, which stores it
**encrypted** in the shared `ai_provider_configs` table — production reads it from there. Only
`app.ai.encryption-key` must reach a deployment as an environment variable.

**⚠️ Dev and production share ONE Neon database.** Anything you do locally is production data.
This is a long-standing open item, not a design choice.

### `mobile/.env.local`

```
EXPO_PUBLIC_API_BASE_URL         # http://10.0.2.2:8080/api on this machine
EXPO_PUBLIC_SENTRY_DSN
```

**`10.0.2.2` is the Android emulator's alias for the HOST machine.** See §6 — this is the single
most expensive trap in this project's history.

### `web/.env.local`

```
VITE_API_BASE_URL
```

(`admin/.env.local` does not exist on this machine; admin reads its base URL from its own default.)

---

## 5. Running everything locally

| What | Command | Port |
|---|---|---|
| Backend | `mvn -f backend/pom.xml spring-boot:run` | **8080** |
| Admin | `npm --prefix admin run dev` | **5173** |
| Web | `npm --prefix web run dev` | **5174** |
| Mobile (Metro) | `npm --prefix mobile exec expo -- start` | **8081** |
| Emulator | `%LOCALAPPDATA%\Android\Sdk\emulator\emulator.exe -avd Pixel_7 -memory 3072` | — |

**CORS is pinned to exact origins.** `localhost:5173` and `localhost:5174` are allow-listed;
`127.0.0.1:5173` is a *different origin* and fails with a CORS error, not a helpful one.

**Flyway runs at backend start**, against the shared Neon database. A new migration applies the
first time you start the backend after adding it.

### Checks to run before calling anything done

```powershell
mvn -f backend/pom.xml compile                       # fast
mvn -f backend/pom.xml test                          # ~1 hour, see the warning below
npm --prefix mobile exec tsc -- --noEmit             # must be clean
npm --prefix mobile exec expo -- lint                # must stay at the 9-problem baseline
npx --prefix packages/core vitest run                # 283 tests as of 2026-09-21
npm --prefix admin run build ; npm --prefix admin exec oxlint
node scripts/qa/generate-suites.js ; node scripts/qa/generate-reports.js
```

**`expo lint` has a documented baseline of 9 problems (8 errors, 1 warning)** in files nobody has
touched. "Clean" means *exactly nine*, not zero. More than nine means you introduced something.

**⚠️ Never run two Maven commands at once.** They share `target/`, and this project has corrupted
a build that way more than once — including a `NoClassDefFoundError` for a class that obviously
existed. If a class is "not found", suspect `target/` before the code, and run `mvn clean`.

**⚠️ Running the backend test suite disables AI in production.** The Phase 7 AI test classes null
out `ai_settings` and delete `ai_task_flags` rows, and prod shares this database. After any
`mvn test`, check `GET /api/client-config` and `GET /api/admin/ai/config` and re-enable what the
tests cleared.

---

## 6. The emulator, and the traps that cost the most time

**The AVD is `Pixel_7`. Always launch it with `-memory 3072`.**

Its saved config is `hw.ramSize=6144`, which gives the emulator process a ~4.9 GB working set on a
16 GB machine and leaves ~300 MB free — the level at which Android's own `system_server` starts
throwing "Process system isn't responding". With `-memory 3072` the footprint is ~3.1 GB and
everything runs cleanly. This cost real time on two separate days before it was diagnosed.

If it hangs anyway: `adb reboot`, wait for a **second** `sys.boot_completed=1`, then continue.

**Pin every `adb` call to the emulator.** A physical device belonging to the machine's owner is
frequently attached. Use `adb -s emulator-5554 …` without exception.

| Trap | What actually happens |
|---|---|
| **`adb reverse` does NOT affect `10.0.2.2`** | The dev build targets the host directly via that alias, so port remapping silently does nothing and the device talks to whatever is already on the host's 8080. **Run the backend under test on 8080 itself, and check what is already listening there first.** |
| Pulling the device database | `adb exec-out run-as <pkg> cat <path>` through a **cmd** redirect is binary-safe. A PowerShell redirect corrupts it. The app's DB is at `files/SQLite/sarkaritaiyaari.db`, not `databases/`. |
| Pushing a file back | There is no safe `exec-in`. `adb shell "run-as … cat > file"` truncated a 64 MB database to 337 bytes. Delete and let the app rebuild instead. |
| `uiautomator dump` | Regularly serves a **stale** tree. The screenshot is the authority. It also only dumps *visible* nodes — an element below the fold is genuinely absent. |
| The LogBox warning toast | Overlaps the bottom tab bar and **silently eats taps on it**. Dismiss it before blaming your coordinates. |
| Deep links with `&` | `adb shell am start -d "…a=1&b=2"` truncates at the first unescaped `&`. Escape them as `\&`. |
| `expo-router` typed routes | `.expo/types/router.d.ts` is **generated**, not committed, so `tsc` rejects a push to a brand-new route until Metro regenerates it. Start Metro briefly. **Do not "fix" it by casting the path.** |
| Metro serving stale code | A stale bundler cache has served a superseded migration and produced a hard "Database migration failed" gate. `expo start --clear`. |
| Screenshots | `adb shell screencap -p /sdcard/x.png` then `adb pull`. Do **not** redirect `exec-out screencap` through PowerShell — it corrupts the PNG. |

---

## 7. Deployment — what runs where

| Piece | Hosted on | Triggered by |
|---|---|---|
| Backend | **Google Cloud Run**, project `sarkaritayaari`, region `asia-south1` | `.github/workflows/backend-deploy.yml` — **push to `main` touching `backend/**`**, or manual dispatch |
| Android APK | GitHub Actions artifact / Release | `.github/workflows/android-build.yml` — push to `main`, a `v*` tag, or **manual dispatch from any branch** |
| Web | Firebase Hosting (configured, **never deployed**) | `.github/workflows/web-deploy.yml` — push to `main` touching `web/**` |
| Database | **Neon Postgres** — one instance shared by dev and production | — |

### ⚠️ Read this before expecting a deploy

**The backend only auto-deploys from `main`.** Work has been happening on
`feature/on-device-llm-spike` for weeks. Pushing that branch deploys **nothing**; you must merge to
`main` or run the workflow manually. This exact gap once hid a shipped feature for four days
because all testing was on the emulator, which talks to a *local* backend.

**A CI-built APK bakes in the Cloud Run URL** (`vars.API_BASE_URL`, overridable on manual
dispatch). So an APK from CI shows whatever the *deployed* backend has — not your laptop. If a
feature "works on the emulator but not on a real device", check whether the backend was deployed
before suspecting the app.

### Repository secrets and variables the workflows need

| Name | Kind | Used by |
|---|---|---|
| `ANDROID_KEYSTORE_BASE` | secret | APK signing (base64 of the `.jks`) |
| `ANDROID_KEYSTORE_PASSWORD` | secret | APK signing |
| `ANDROID_KEY_ALIAS` | secret | APK signing |
| `ANDROID_KEY_PASSWORD` | secret | APK signing |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | variable | Backend deploy (keyless auth) |
| `GCP_DEPLOY_SERVICE_ACCOUNT` | variable | Backend deploy |
| `GCP_SA_KEY` | secret | Web deploy |
| `API_BASE_URL` | variable | Baked into the APK |
| `VITE_API_BASE_URL` | variable | Baked into the web build |

### The upload keystore — the one irreplaceable thing

`C:\dev\keystores\sarkaritaiyaari-upload.jks`, alias `upload`, RSA 4096, valid to 2054-01-06,
SHA-256 fingerprint starting `90:37:06:A2`. **It exists in exactly one place and is not backed
up.** Losing it means no existing installation can ever be updated. Its password is deliberately
not recorded in this repository. Back it up to a password manager and one other place; turning on
Play App Signing would demote it to a mere upload key and make loss recoverable.

### Secrets that live on Cloud Run (not in the repo)

Set once with `gcloud run services update --update-secrets` — **never `--set-secrets`**, which
wipes the others.

- `db-password`, `cloudinary-secret` — already configured
- `APP_AI_ENCRYPTION_KEY` — already configured; strict Base64, so a trailing newline from an
  interactive paste breaks bean creation and the revision fails to start
- **`SPRING_MAIL_USERNAME`, `SPRING_MAIL_PASSWORD`, `APP_MAIL_FROM`, `APP_MAIL_ENABLED=true` —
  NOT configured yet.** Until these exist, the deployed backend cannot email a sign-in code, and
  the app's first screen cannot be completed by a real user. See §8.

---

## 8. ⚠️ Outstanding manual steps (nothing works around these)

1. ~~Mail credentials for sign-in~~ — **DONE 2026-09-21 on Cloud Run.** Secret Manager secret
   `mail-password`, `secretAccessor` granted to the runtime service account
   (`815653276881-compute@developer.gserviceaccount.com`), plus `APP_MAIL_ENABLED=true`,
   `APP_MAIL_FROM` and `SPRING_MAIL_USERNAME`. Confirmed live: `otp/request` returns
   `emailed: true` and a real email arrives. **Still needed on any NEW environment**, and locally
   if you want email from your own machine — a Google app password (Account → Security → 2-Step
   Verification → App passwords), roughly 500 messages a day.
2. **Merge `feature/on-device-llm-spike` into `main`.** ⚠️ Production was deployed from that
   feature branch by manual dispatch on 2026-09-21, so **`main` is ~35 commits behind what is
   live**. The next push to `main` touching `backend/**` would deploy *older* code over it.
3. **Back up the keystore** (§7).
4. Give production its **own database** — dev and prod currently share one Neon instance.
5. Rotate the Cloudinary secret that was briefly committed and later scrubbed from history.

---

## 9. Accounts and test data in the shared database

- `demo@sarkaritaiyaari.app` / `Demo@1234` — a real student account with ~350 practice sessions
  and ~85 mock attempts. Useful for seeing the app populated.
- `venkatesh9949.u@gmail.com` — the working **admin**. Password deliberately not recorded here.
- `admin@sarkaritaiyaari.app` — **NOT an admin.** Demoted to `STUDENT` during a security cleanup;
  older docs that call it the admin account are wrong.
- `automated-test-admin@sarkaritaiyaari.internal` — the ADMIN fixture used by integration tests and
  by `AdminTokenMintRunner`, which mints a short-lived admin token without needing a human password.
- Assorted leftovers, all harmless: `Automated Test Subject` / `Automated Test Topic`, the
  `gate1.*`, `roadmap.check.*`, `signin.check.*` and `otpcheck.*` accounts, and roughly 35,700
  synthetic load-test questions.

**⚠️ Cohort timings are contaminated by those synthetic questions** (~17 s/question, which no human
does). Any "from other students" estimate in the roadmap or the daily plan reflects fixture data,
not real behaviour. This is why every estimate in the API declares its source.

---

## 10. Where to look next

| Question | File |
|---|---|
| What has just been done, what is next | `memory/STATUS.md` — **always read fresh** |
| The rules for working in this repo | `AI_RULES.md` |
| How the three systems fit together | `system-design/01-big-picture.md` |
| What an endpoint does | `api/*.md` |
| Why something odd is the way it is | `system-design/05-why-its-built-this-way.md` |
| A real architectural decision | `reports/architecture-decisions.md` |
| Test coverage for a feature | `qa/README.md` |
| Deploying | `DEPLOYMENT.md`, `BACKEND-DEPLOY-SETUP.md`, `ANDROID-BUILDS.md` |
