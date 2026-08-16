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
[`memory/STATUS.md`](memory/STATUS.md).

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

### Mobile

```bash
npm --prefix mobile ci
cd mobile && npx expo start
```

In development the API URL is derived from Metro's host, so it follows your machine's
LAN IP automatically. See below for standalone builds, where it can't be.

---

## Building an Android APK

The native `android/` project is **not committed**. It is regenerated from `app.json`
by `expo prebuild` (Continuous Native Generation), so edits made directly inside
`android/` are discarded on the next build — change `app.json` instead.

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

**Release builds are currently signed with the debug key.** That is what makes an
installable APK possible without managing a keystore, and it is fine for internal
testing — but it cannot go to the Play Store, and a debug key regenerated on another
machine produces a signature mismatch that blocks upgrade-in-place. Add a real
keystore before distributing.

The app talks to the backend over plain HTTP, so `usesCleartextTraffic` is enabled via
the `expo-build-properties` plugin. Move the backend to HTTPS and remove that before
any public release.

---

## CI

[`Jenkinsfile`](Jenkinsfile) defines the pipeline: backend build, optional backend
tests, admin lint/build, mobile typecheck, and APK. It assumes a Linux agent with
JDK 21, Node 20+, Maven and the Android SDK; the file's header comments list the
Jenkins credentials it expects and what to change for a Windows agent.

Backend integration tests are **off by default**. They run against a real database and
clean up after themselves, so two concurrent builds would collide — point them at a
dedicated CI database before enabling them.
