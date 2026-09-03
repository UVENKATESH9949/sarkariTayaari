# SarkariTaiyaari

Offline-first exam preparation platform for Indian government exams (SSC, IBPS, RRB).

The app syncs the question bank to local SQLite on first install and then works fully
offline, pulling only what changed on subsequent opens.

| Piece | Stack | What it is |
|---|---|---|
| `backend/` | Spring Boot 3.3, Java 21, Postgres (Neon) | Question bank, exam structure, reference data, delta-sync API |
| `admin/` | React 19, Vite | Content admin — questions, exams, structure, syllabus, reference data |
| `mobile/` | Expo SDK 57, Expo Router, expo-sqlite + Drizzle | The app: Practice, Mock Test, Progress |

**New to the project, or coming back after a break?** Start with
[`system-design/`](system-design/) — plain-language notes on how the pieces fit
together, what's in the database, how content reaches a phone, and which file to open
when you want to change something.

Detailed history, decisions and verification results live in
[`offline-exam-app-requirements.md`](offline-exam-app-requirements.md) and
[`reports/`](reports/). Current state and next steps are in
[`memory/STATUS.md`](memory/STATUS.md). The API contract (separate from backend
implementation) lives in [`api/`](api/).

**Working here with AI assistance (Claude or otherwise)?** Read
[`AI_RULES.md`](AI_RULES.md) first — it's the contract for how AI sessions should read,
scope, and verify work in this repo, and a map of which doc to read/update for what. For
the day-to-day operating process (task sizing, session strategy, ready-to-paste prompts),
see [`AI_WORKFLOW.md`](AI_WORKFLOW.md).

---

## A note on how this is modelled

Nothing exam-domain is hardcoded. Exam patterns (stage → paper → section), difficulty
levels, subject icons and colours, and the exam↔subject syllabus are all admin-managed
data that reaches devices through delta sync. Adding a new exam, a new difficulty level
or a new section is a content change, not a release.

Two mappings look similar and are deliberately kept apart:

- **`exam_subjects`** — which subjects an exam covers. Drives Practice browsing, and
  works whether or not a paper pattern exists yet.
- **`section_subjects`** — which subjects a specific paper section draws questions
  from. Drives mock-test question selection.

Saving a section adds its subjects to the exam's syllabus automatically, so the
syllabus is always a superset and the two can never contradict each other.

---

## Local setup

### Backend

```bash
cp backend/application-local.yml.example backend/application-local.yml
# fill in your Neon and Cloudinary credentials — this file is gitignored
mvn -f backend/pom.xml spring-boot:run          # http://localhost:8080
```

`GET /api/health` should return `{"status":"UP"}`.

### Admin

```bash
npm --prefix admin ci
npm --prefix admin run dev                       # http://localhost:5173
```

Serve it from `localhost:5173` exactly — backend CORS is pinned to that single origin,
and `127.0.0.1:5173` counts as a different one.

The admin console requires signing in as an admin account. To get the first one, set
`admin.bootstrap-email` and `admin.bootstrap-password` in `backend/application-local.yml`
before starting the backend — it creates that account on boot if no admin exists yet, and
is a no-op on every boot after. Further admins are created by an existing admin via
`POST /api/auth/admin/register`. See `system-design/04-where-do-i-change-things.md`.

### Mobile

```bash
npm --prefix mobile ci
cd mobile && npx expo start
```

In development the API URL is derived from Metro's host, so it follows your machine's
LAN IP automatically. See below for standalone builds, where it can't be.

Crash reporting (Sentry) is wired up but inactive by default — no Sentry project exists
yet. Set `EXPO_PUBLIC_SENTRY_DSN` (see `mobile/README.md`) once one does.

---

## Building an Android APK

**Normally you don't.** GitHub Actions builds a signed APK on every push to `main`, and
attaches a permanent one to a GitHub Release for every `v*` tag — see
[`ANDROID-BUILDS.md`](ANDROID-BUILDS.md) for how to get a build, retrieve an old one, and
the one-time secret setup. The rest of this section is the manual path, for when you need
to build locally.

The native `android/` project is **not committed**. It is regenerated from `app.json` and
[`app.config.js`](mobile/app.config.js) by `expo prebuild` (Continuous Native Generation),
so edits made directly inside `android/` are discarded on the next build — change
`app.json` instead, or add a config plugin under `mobile/plugins/`.

```bash
cd mobile
export EXPO_PUBLIC_API_BASE_URL="http://<reachable-backend>:8080/api"
npx expo prebuild --platform android --no-install --clean
cd android && ./gradlew assembleRelease
# -> android/app/build/outputs/apk/release/app-release.apk
```

Two things that are easy to get wrong:

**The API URL must be baked in at build time.** A standalone APK has no Metro host to
infer it from, and the fallback is `localhost`, which on a phone means the phone
itself. Use `10.0.2.2` for an emulator, a LAN IP for a device on the same network, or
a real domain for anything else.

**A plain local `assembleRelease` is still signed with the debug key**, and says so in a
Gradle warning. That keeps an installable APK possible without handling the keystore, but
it cannot go to the Play Store, and a debug key regenerated on another machine produces a
signature mismatch that blocks upgrade-in-place. A real upload keystore now exists —
**CI signs with it, and fails the build if the finished APK's signer certificate doesn't
match**. To sign locally, pass the same four Gradle properties CI does; see
[`ANDROID-BUILDS.md`](ANDROID-BUILDS.md).

The app talks to the backend over plain HTTP, so `usesCleartextTraffic` is enabled via
the `expo-build-properties` plugin. Move the backend to HTTPS and remove that before
any public release.

### Getting a build onto a phone

Drop the APK into `backend/downloads/` and it is served immediately — no restart:

```
http://<your-lan-ip>:8080/downloads
```

Open that on the phone's browser and tap the build. It is served with the correct APK
content type, so Android offers to install rather than just saving a file, and range
requests are supported so a dropped download resumes.

The phone must be on the same network as the backend, and the machine's firewall must
allow inbound TCP 8080 — the same requirement as the app reaching the API at all.

This is a development convenience only. For anything beyond your own testing, use
Firebase App Distribution or Play internal testing, which handle versioning and update
notifications.

---

## CI

**Android builds — [`.github/workflows/android-build.yml`](.github/workflows/android-build.yml).**
The live one. Signed APK on every push to `main` (artifact, 30 days) and on every `v*` tag
(GitHub Release, permanent). Full documentation in [`ANDROID-BUILDS.md`](ANDROID-BUILDS.md).

**Everything else — [`Jenkinsfile`](Jenkinsfile).** Backend build, optional backend tests,
admin lint/build, mobile typecheck, and an APK stage that predates the GitHub Actions one.
It assumes a Linux agent with JDK 21, Node 20+, Maven and the Android SDK; the file's
header comments list the Jenkins credentials it expects and what to change for a Windows
agent. No Jenkins instance is currently known to be running, and its APK stage is
debug-signed — prefer the GitHub Actions workflow for builds you intend to hand to anyone.

Backend integration tests are **off by default**. They run against a real database and
clean up after themselves, so two concurrent builds would collide — point them at a
dedicated CI database before enabling them.
