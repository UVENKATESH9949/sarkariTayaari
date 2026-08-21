# Architecture Decision Records

The real "why we built it this way" record for this project. Each entry is a decision that was actually made and implemented — not a proposal. Add a new `ADR-xxx` here whenever a real architectural choice gets made with a real alternative that was rejected; don't record routine implementation details.

---

### ADR-001 — Opaque, revocable tokens instead of JWT
- **Status:** Confirmed (implemented)
- **Context:** Needed a mobile auth token that survives a 365-day TTL and can be revoked server-side (e.g. on sign-out) without a blocklist.
- **Decision:** Store a random opaque token server-side (`user_tokens`), looked up per request; not a self-contained JWT.
- **Alternatives:** JWT with short expiry + refresh tokens.
- **Reason:** A revoked JWT is still valid until it expires unless a blocklist is maintained anyway — at which point you've reinvented an opaque-token lookup with extra steps, for a single-backend system with no need for stateless verification across services.
- **Consequences:** Every authenticated request costs one DB lookup (with a join-fetch to avoid a lazy-loading trap, itself a bug found and fixed). Fine at current scale; would need caching at real scale.

### ADR-002 — Modular monolith, not microservices
- **Status:** Confirmed (implemented, implicitly — never split)
- **Context:** One backend, one database, no production traffic yet.
- **Decision:** Single Spring Boot application with clear package-level module boundaries.
- **Alternatives:** Microservices per domain (auth, content, sync, progress).
- **Reason:** Microservices buy independent scaling/deployment at the cost of network calls, distributed transactions, and multiple things to operate — costs that are pure overhead with zero current benefit at this scale.
- **Consequences:** Easy to reason about and deploy today; a future split (if ever needed) would follow the existing package boundaries fairly cleanly, since they're already domain-shaped.

### ADR-003 — `spring-security-crypto` only, not `spring-boot-starter-security`
- **Status:** Confirmed (implemented)
- **Context:** Needed BCrypt hashing without adopting Spring Security's full filter chain.
- **Decision:** Depend on the crypto library alone; hand-roll a `requireUser(header)` check per endpoint that needs it.
- **Reason:** The full starter secures every endpoint by default, which would have broken existing public content endpoints and the sync flow without substantial reconfiguration, for a project with genuinely simple auth needs (one role, no OAuth, no scopes).
- **Consequences:** No automatic CSRF/session handling (not needed — stateless bearer tokens); auth checks are opt-in per controller method, which puts the burden of remembering to call `requireUser()` on every future endpoint author.

### ADR-004 — Two independent subject mappings (`exam_subjects` vs `section_subjects`)
- **Status:** Confirmed (implemented)
- **Context:** "Which subjects does this exam cover" (syllabus) and "which subjects does this specific paper's section draw from" (mock-test generation) are related but genuinely different facts.
- **Decision:** Keep them as separate tables; auto-add a section's subjects to the syllabus on save, so they can't casually diverge, but allow the syllabus to be broader (e.g. covers a subject with no paper pattern defined yet).
- **Alternatives:** Derive the syllabus purely from sections.
- **Reason:** Deriving it from sections meant an exam with no structure yet had *no syllabus at all*, which is wrong — "not modeled yet" and "covers nothing" are different facts.
- **Consequences:** Two tables to keep mentally straight; mitigated by the auto-sync-on-save behavior and by naming them for their actual purpose rather than generically.

### ADR-005 — Synthetic string PK for `user_bookmarks`, not a JPA composite `@IdClass`
- **Status:** Confirmed (implemented, after reverting a failed first attempt)
- **Context:** A bookmark is naturally keyed by `(user, question)`.
- **Decision:** Use a derived string id (`userId + ":" + questionId`) as a plain single-column primary key, matching the existing convention already used for `user_practice_session_results` (`sessionId + ":" + orderIndex`).
- **Alternatives tried and rejected:** `@IdClass` composite key with the `@ManyToOne` association as part of the identifier — this is textbook-valid JPA, but caused real 500 errors in integration testing (`isNew()` entity-state detection misbehaving for a derived composite identifier).
- **Reason:** The simpler, already-proven convention avoided a genuinely tricky corner of JPA entirely, rather than debugging it further.
- **Consequences:** One extra string-concatenation step in the service layer; in exchange, zero exposure to composite-key edge cases.

### ADR-006 — Debug-signed APKs served over plain HTTP download, not a store listing
- **Status:** **Superseded by ADR-012** (2026-08-21). Both halves are now dead: the debug signing is replaced by a real upload keystore in CI, and `/downloads` stopped working when the backend moved to Cloud Run (ephemeral disk, scale-to-zero — see ADR-011). Kept for the record; the "must be replaced" note below was written when this was still live, and has now been acted on.
- **Context:** Needed a way to get a build onto a real device without the friction of transferring an APK file by hand.
- **Decision:** Backend serves a `/downloads` folder directly; Jenkins drops a built APK there.
- **Alternatives:** Google Play internal testing track, Firebase App Distribution.
- **Reason:** Fastest path to "click a link, install a build," while the product is pre-launch and iterating quickly.
- **Consequences:** No code signing for production trust, no automatic update mechanism, no crash-symbolication pipeline. **Must be replaced** before any real user distribution — tracked in `reports/open-questions.md`, not silently accepted as final.

### ADR-007 — expo-sqlite + Drizzle ORM, reversing an earlier WatermelonDB decision
- **Status:** Confirmed (implemented) — source: `offline-exam-app-requirements.md` §4
- **Context:** Needed a local mobile database for the offline-first content cache.
- **Decision:** WatermelonDB was the *first* decision made, then explicitly reversed to expo-sqlite + Drizzle ORM during Sprint 2 (TICKET-202).
- **Reason (verbatim rationale):** WatermelonDB requires a custom native build, leaving Expo Go entirely; expo-sqlite + Drizzle stays inside Expo Go with no native build step, and has first-class documented Expo support.
- **Consequences:** Faster iteration during early development (no native rebuild per change); this same choice is exactly why a debug **dev-client** build (not Expo Go) later became necessary once `@react-native-community/netinfo` was added for the offline indicator — a reminder that "stays in Expo Go" is a moving target as native dependencies accumulate, not a permanent guarantee.

### ADR-008 — Mock tests generated on-the-fly, not curated fixed sets
- **Status:** Confirmed (implemented) — source: `offline-exam-app-requirements.md` §6
- **Context:** Needed to decide how a mock test's question set is assembled.
- **Decision:** Each attempt is assembled at start-time from the locally-synced pool, per-subject counts matching a blueprint, rather than admin-authored fixed papers.
- **Alternatives:** Curated fixed test sets (same paper every time, comparable across attempts and users).
- **Reason:** Zero new content-authoring burden; works immediately against whatever's already synced.
- **Consequences (explicitly accepted trade-off):** attempts may repeat questions at the current small question-bank size, and two attempts aren't a fixed, comparable paper — no percentile/rank comparison is possible under this model. The source document explicitly flags revisiting curated fixed sets once question volume is much higher.

### ADR-009 — Admin auth reuses the opaque-token infra, with a role column and a real public/admin endpoint split
- **Status:** Confirmed (implemented)
- **Context:** The admin console and every content-management endpoint (questions, exams, subjects, topics, languages, difficulty levels, paper types, exam structure, image upload) had zero authentication — anyone reaching the backend could mutate all content. Fixing it needed to support multiple named admin accounts (not one shared credential), without breaking the mobile app's unauthenticated content-sync reads.
- **Decision:** Add a `role` column (`STUDENT`/`ADMIN`) to the existing `users` table rather than a second user/auth system. `AuthService.requireAdmin(header)` layers a role check on top of the existing `requireUser(header)` (ADR-001's opaque bearer tokens). The first admin is created by an `AdminBootstrapRunner` on startup from local-only config (`admin.bootstrap-email`/`admin.bootstrap-password`, gitignored); every admin after that is created by an existing admin via `POST /api/auth/admin/register`, which deliberately returns no token for the new account — the new admin signs in themselves.
- **Alternatives:** Spring Security with method-level `@PreAuthorize`; a separate JWT-based admin auth system; a single shared admin credential from an env var.
- **Reason:** Spring Security was already rejected once for this codebase (ADR-003) — adopting it now for admin-only would mean two different auth mechanisms in one app. A single shared credential doesn't give per-person accountability or revocation and doesn't answer the "multiple admin accounts" requirement. The reused-infrastructure approach cost one column, one new exception type (403, mirroring the existing 401 `UnauthorizedException`), and a mechanical per-endpoint check — the same pattern `BookmarkController`/`ProgressController` already used for student auth.
- **Consequences:** Every admin-only controller method takes an extra `Authorization` header parameter and an explicit `requireAdmin()` call — opt-in per endpoint, same trade-off ADR-003 already accepted (a future endpoint author must remember to add the check; nothing enforces it globally). The public/admin split itself was decided endpoint-by-endpoint by checking what the mobile client actually calls (`mobile/src/api/reference.ts`, `mobile/src/db/schema.ts`'s sync-source comments) rather than locking down everything — `GET /api/exams`, `/subjects`, `/topics`, `/difficulty-levels`, `/paper-types`, `/exam-structures`, `/api/questions/sync`, and `/languages` stay public because signed-out students' apps call them directly for offline content sync.

### ADR-011 — Google Cloud Run with scale-to-zero, sharing the existing Neon database
- **Status:** Confirmed (implemented, 2026-08-21) — see `reports/14-cloud-run-deployment/cloud-run-deployment.md`
- **Context:** The backend had only ever run on a developer laptop. "Decide production hosting" had been an open question for the life of the project, and it also gated admin usability, since `CorsConfig` hardcoded `localhost:5173` as the only allowed origin.
- **Decision:** Deploy the existing Docker image to **Google Cloud Run** in `asia-south1`, **scaling to zero** (no `min-instances`) with `--max-instances=3`, reusing the **existing Neon database** rather than provisioning a separate production one. Secrets in Secret Manager; CORS origins moved to configuration (`app.cors.allowed-origins`).
- **Alternatives:** A VM or managed container platform kept warm (no cold starts, but a continuous bill); a separate production Neon database (clean prod/dev separation, but the entire ~36,000-question dataset, exam structures and real accounts would need re-seeding, and the load-test content is only regenerable via scripts).
- **Reason:** Cloud Run's free tier plus scale-to-zero makes an idle service genuinely free, which matters for a pre-revenue project whose backend is idle most of the time. Reusing the Neon database made the deployed service immediately useful — it serves real content from the first request rather than an empty schema. `--max-instances=3` was added beyond the original plan because Cloud Run's default ceiling is 100 and the configured budget alert only emails; it never stops spending.
- **Consequences:** A ~10-20s cold start on the first request after idle — acceptable now because the mobile app's hybrid data layer (see `reports/13-hybrid-online-sync/`) never blocks the UI on a network call, but worth revisiting before beta users. Prod and dev now share one database, so the integration suite creates and deletes rows in the database the deployed service serves. `DownloadsConfig`'s `/downloads` APK hosting is effectively dead, since Cloud Run's filesystem is ephemeral and scales to zero — ADR-006 had already flagged that mechanism as not production-final. And deploying made a latent problem live: plaintext credentials in a public repo became a working key to a reachable backend, which is the general hazard of publishing anything that a repo already documents.

### ADR-010 — Sentry for crash reporting; basic analytics as Sentry breadcrumbs, not a dedicated platform
- **Status:** Confirmed (implemented), crash reporting **inactive until a real DSN is set**
- **Context:** TICKET-503 needed crash reporting and "basic analytics events." No error-tracking or analytics library existed anywhere in the mobile app before this — confirmed by grepping the whole tree, not assumed. `reports/open-questions.md` had "Analytics platform and event taxonomy" listed as undecided, and separately, "no privacy policy/data retention policy exists" is a real, already-flagged gap in this same document.
- **Decision:** Install `@sentry/react-native` (crash reporting, both JS and native, via the auto-linked native module) with a placeholder `EXPO_PUBLIC_SENTRY_DSN` — no Sentry account exists yet, so nothing uploads until a real DSN is set, but the SDK, error boundary (`Sentry.wrap(RootLayout)`), and every capture call site are real and functional today. "Basic analytics" is implemented as Sentry breadcrumbs (`Sentry.addBreadcrumb` via a small `trackEvent()` helper) rather than a second, dedicated analytics platform.
- **Alternatives:** A dedicated analytics platform (PostHog/Mixpanel/Amplitude) for the "basic events" half of the ticket; enabling Sentry's session replay/performance tracing/`sendDefaultPii` alongside crash capture, since the SDK supports all three out of the box.
- **Reason:** A dedicated analytics platform means picking a vendor and creating another account before either could function at all — deferred until the product actually has enough users for that data to matter, per the user's explicit direction. Routing basic events through Sentry breadcrumbs instead costs nothing extra (same SDK, already required for crashes) and makes the crash-context timeline meaningful (what the user was doing right before a crash) rather than a bare stack trace. Session replay, performance tracing, and `sendDefaultPii` were deliberately left off: this project has no stated privacy policy yet, and turning on user-session recording or default PII collection ahead of one would be the wrong order to do things in.
- **Consequences:** The `app.json` Sentry Expo config plugin (org/project/URL) and the Metro source-map-upload wiring are **not** configured — they need a real Sentry org/project and a build-time auth token to mean anything, and only affect whether stack traces are de-minified in the dashboard later, not whether crashes are captured at all. This is a deliberate, documented deferral (see `reports/11-crash-reporting-and-analytics/`), not a silent omission — it needs picking up once a real Sentry project exists. Basic events are also necessarily bounded by what a breadcrumb is: a timeline attached to *this device's* eventual crash reports, not a queryable cross-user analytics dataset — if real product-usage analysis becomes a priority, that's still an open, separate decision.

### ADR-012 — GitHub Actions for APK builds, with signing injected by an Expo config plugin
- **Status:** Confirmed (implemented, 2026-08-21) — see `reports/15-github-actions-apk-builds/github-actions-apk-builds.md`
- **Context:** Every APK so far had been built by hand, in an AI-assisted session, and was signed with the **debug key** — installable but not distributable, and unable to upgrade a properly signed install. The user asked for something repeatable they could run themselves. Two sub-decisions had to be made: where builds run, and how a real keystore reaches Gradle given that `android/` is regenerated by `expo prebuild` on every build.
- **Decision:** **GitHub Actions**, triggered by push to `main` (30-day artifact), a `v*` tag (permanent GitHub Release), or manual dispatch. Signing is injected by a local **Expo config plugin** (`mobile/plugins/withReleaseSigning.js`) that patches the generated `app/build.gradle` during prebuild; the keystore reaches Gradle as `-P` properties, decoded from a repo secret into `$RUNNER_TEMP` outside the workspace. `versionCode` is `1000 + github.run_number`. A post-build `apksigner verify --print-certs` check compares the APK's signer certificate against a hardcoded expected fingerprint and fails the build on mismatch.
- **Alternatives:**
  - **EAS Build** (Expo's own managed service) — would have handled keystore custody, credentials and versioning with far less code. Rejected because it puts the signing key and the build environment in a third party's hands, has a metered free tier, and gives less visibility into the build box than a project already running its own Jenkinsfile wants. Worth revisiting alongside **EAS Update**, which is the genuinely compelling half (JS-only changes ship without a build at all).
  - **The existing `Jenkinsfile`** — already had a working APK stage. Rejected because no Jenkins instance is known to be running, and it needs a maintained Linux agent with an Android SDK; GitHub Actions is free and unlimited for this public repo with no infrastructure to keep alive.
  - **Codemagic / Bitrise** (mobile-specialist CI) — prebuilt Android/RN steps, but vendor-specific step syntax and thin free tiers for no capability this project needs.
  - **Committing `android/`** to make the signing config a normal committed file. Rejected outright: it abandons Continuous Native Generation, makes `app.json` no longer the source of truth, and contradicts a rule the project already documents in three places.
  - **`-P` Gradle properties alone**, relying on the well-known bare-React-Native `MYAPP_UPLOAD_STORE_FILE` block. Rejected because that block **does not exist in Expo's SDK 57 template** — verified by reading the generated file. Had this been assumed, the build would have passed properties nothing read and produced a debug-signed APK while reporting success.
- **Reason:** The config plugin is the only mechanism that survives `expo prebuild`, which makes it the only correct answer rather than the convenient one. GitHub Actions costs nothing here, lives next to the code, and needs no machine kept alive. The two-tier retention (expiring artifact vs. permanent Release) mirrors how the builds are actually used — many disposable, few named. The signer-fingerprint check exists because a debug-signed APK is indistinguishable from a correct one at a glance, and this project's README already records that trap.
- **Consequences:** The plugin pattern-matches on Expo template text, so an SDK upgrade can break it — mitigated by making the plugin **throw** rather than skip, by a fast fixture-based check that runs before the expensive build, and by the fingerprint check as a final backstop. Rotating the keystore requires hand-editing the expected fingerprint, deliberately. The keystore is currently the *real* signing key rather than an upload key, so **losing it is unrecoverable until Play App Signing is enabled** — the sharpest consequence of this decision, tracked in `open-questions.md`. No `paths:` filter is used, so backend-only commits still trigger a build; filtering was rejected because GitHub applies `paths` to tag pushes too, which would make a release silently not happen. And the debug-key fallback for local builds is retained for convenience, which is itself a footgun — hence the loud Gradle warning and the fact that CI never relies on it.
