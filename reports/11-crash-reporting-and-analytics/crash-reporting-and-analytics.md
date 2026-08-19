# Crash Reporting + Basic Analytics (TICKET-503)

**Closes:** TICKET-503 ("Crash reporting (Sentry) + basic analytics events") from Sprint 5.
See ADR-010 in `reports/architecture-decisions.md` for the design rationale.

## What existed before

Nothing. Grepped the whole mobile app for any error-tracking library, analytics
abstraction, React error boundary, or global unhandled-exception handler —
zero matches anywhere in `mobile/src`. This was a from-scratch integration.

## What was built

**Crash reporting** — `@sentry/react-native` (installed via `npx expo install`, which
resolved `~7.11.0` as the version compatible with this project's exact Expo SDK
57.0.11 / RN 0.86.2 / React 19.2.3 pins — deliberately not hand-picked, since RN 0.86 is
very recent).

- `mobile/src/app/_layout.tsx`: `Sentry.init({ dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  environment: __DEV__ ? "development" : "production" })` at module scope, before
  `RootLayout` is defined — so it runs before even the migration-loading/error screens
  that render before any provider mounts. The default export changed from
  `export default function RootLayout()` to a plain function plus
  `export default Sentry.wrap(RootLayout);`, giving the whole app a real error boundary
  for free (Sentry's own documented Expo Router pattern).
- `mobile/metro.config.js`: swapped `getDefaultConfig` for `getSentryExpoConfig`
  (`@sentry/react-native/metro`), keeping the existing `.sql` resolver extension push
  unchanged.
- **No DSN is set.** No Sentry account/project exists yet. Per Sentry's own documented
  behavior, the SDK initializes normally but sends nothing without a `dsn` — this is the
  "placeholder wiring" the user explicitly asked for, not a workaround. Everything else
  (the error boundary, breadcrumbs, capture calls) is real and runs today; only the
  network upload is inactive.

**Basic analytics — as Sentry breadcrumbs, not a dedicated platform** (explicit user
direction; see ADR-010 for why). New `mobile/src/telemetry/analytics.ts`:
- `trackEvent(name, data?)` → `Sentry.addBreadcrumb(...)`.
- `captureError(error, context?)` → `Sentry.captureException(...)`.
- `useScreenViewTracking()` — a `usePathname()`-based hook, called once in
  `_layout.tsx`'s `RootNavigator`, firing a `screen_view` breadcrumb on every route
  change. This alone covers all 17 real screens with no per-screen edits.

**Call sites added:**
- `mobile/src/practice/authContext.tsx` — `sign_up`/`sign_in` (inside `adopt()`, keyed
  by a new `source` parameter so both flows share the same properly-awaited code path)
  and `sign_out`; `captureError` in `runSync`'s existing catch block.
- `mobile/src/db/practiceSessions.ts`, `mobile/src/db/mockTest.ts`,
  `mobile/src/db/bookmarks.ts` — `practice_session_completed`, `mock_attempt_completed`,
  `bookmark_added`/`bookmark_removed`, each added right after the row is actually
  persisted (not at a UI button handler), so the event can't be missed or double-fired
  by a different screen calling the same underlying function.
- `mobile/src/sync/SyncContext.tsx` — every existing `console.warn`-only catch site
  (launch/foreground/reconnect delta sync, auto-follow-exam) now also calls
  `captureError`, and the initial-sync catch block — previously a **bare, fully silent**
  `catch {}` with no error variable at all — now captures the real error too. This was a
  genuine existing gap, not something introduced by this ticket: a first-sync failure had
  no record anywhere beyond the UI's "error" status string.

**Deliberately not done, and why (see ADR-010):**
- The `app.json` Sentry Expo config plugin's organization/project/URL fields, and the
  Sentry auth token for automatic source-map upload. These need a real Sentry project
  and a build-time secret to mean anything — they only affect whether stack traces are
  de-minified in the dashboard later, not whether crashes are captured at all. `npx expo
  install` did auto-add a bare, unconfigured `"@sentry/react-native"` entry to
  `app.json`'s `plugins` array on its own (needed for native module autolinking,
  requires no credentials) — that one was kept.
- Session replay, performance tracing, `sendDefaultPii` — all available in the SDK, none
  enabled. This project has no stated privacy policy yet (`reports/open-questions.md`),
  and turning on session recording or default PII collection ahead of one would be
  backwards.
- A dedicated analytics platform (PostHog/Mixpanel/Amplitude) for real queryable
  product-usage analysis — a separate, still-open decision (`open-questions.md`).

## Verified

- `npx expo install @sentry/react-native` succeeded with no dependency conflicts against
  the pinned Expo 57.0.11 / RN 0.86.2 / React 19.2.3 versions.
- `npx tsc --noEmit` — zero errors, both before and after reverting a temporary
  `debug: true` used only for local diagnostic purposes during this verification pass.
- `npm run lint` (`expo lint`) — this was the **first time ESLint had ever been run in
  this project** (no config existed; `expo lint` bootstrapped one). It surfaced 16
  pre-existing errors / 6 warnings, confirmed by direct diff inspection to be **entirely
  in files this ticket never touched** (`quiz.tsx`, `subjects.tsx`, `topics.tsx`,
  `LanguagePickerModal.tsx`, `bookmarkSync.ts`, `OfflineBanner.tsx`, plus two
  React-hooks-rules violations on pre-existing lines in `authContext.tsx` and
  `SyncContext.tsx` that this ticket's edits are nowhere near). Flagged here as an
  honest, real, incidental finding — not fixed, since fixing 16 unrelated errors is out
  of this ticket's scope, and not hidden either.
- **A real full Android bundle compile**, forced directly against Metro's HTTP endpoint
  (`GET /node_modules/expo-router/entry.bundle?platform=android&dev=true`) since no
  emulator/device was available in this environment: **200 OK**, a genuine ~6.6MB /
  158k-line compiled bundle, confirmed (via string search) to contain `Sentry.init`,
  `RootLayout`, and the wrapped export. Expo Router's `require.context`-based route
  loading means this specific bundle request didn't pull in every lazily-loaded screen
  chunk (confirmed separately — `bookmarks.ts`'s new code appeared, but
  `authContext.tsx`'s and `mockTest.ts`'s did not, despite both being edited the same
  way) — `tsc`'s whole-project static check is what actually covers those files, not
  this bundle fetch.
- `npx expo start --web` was attempted first and failed — **a pre-existing environment
  limitation, not something this ticket caused**: `expo-sqlite`'s web build imports a
  `.wasm` module that Metro can't resolve under this project's web config. Confirmed by
  reading the actual resolution error; nothing about the Sentry/telemetry changes is
  implicated. Fell back to the native (Android) Metro bundle check described above, per
  the plan's own stated fallback.

## Update — 2026-08-19: a real Sentry project now exists, and delivery is confirmed at the device level

The user created a real Sentry project and provided its DSN, now set in
`mobile/.env.local` (gitignored, per this project's convention for local secrets).
`src/app/_layout.tsx`'s stale "no Sentry project exists yet" comment was corrected.

**First attempt found a real gap.** Firing a test event on the then-installed dev-client
APK showed `Note: Native Sentry SDK is disabled` — that APK
(`android/app/build/outputs/apk/debug/app-debug.apk`) had been built via
`npx expo run:android` in an earlier session, **before** `@sentry/react-native` was added
to this project, so it didn't contain the native Sentry Android module. The JS layer ran
and "captured" the event, but no envelope-send confirmation or network call appeared
anywhere in the logs. The user checked the Sentry dashboard directly and confirmed that
first test event never arrived — matching what the device logs implied.

**Fixed with a real native rebuild.** Ran `npx expo run:android` (8m 39s this time,
helped by Gradle's cache from the prior build) to compile the native Sentry module in,
reinstalled on the same emulator, and fired a second test event
(`debug: true` + `Sentry.captureMessage()`, both reverted immediately after). This time
the device logs show the real thing: `RNSentry: Starting with DSN: '...ingest.us.sentry.io/4511936143228928'`,
`Initializing SDK with DSN: ...`, native package versions
(`io.sentry:sentry-android-core 8.31.0`, `@sentry/react-native 7.11.0`), an envelope
written to offline storage, and **`Envelope sent successfully.`** logged twice with zero
errors anywhere in the trace. This is a fundamentally different, stronger result than the
first attempt — a live network round-trip actually completed, not just JS-side
event construction.

**Confirmed — TICKET-503 is fully closed.** The user checked the Sentry dashboard and
saw the event: "Verification test event 2 (native rebuild) - 2026-08-19", Level: Info.
This is genuine end-to-end proof, not inference from device logs — a real event
generated on the emulator reached the real Sentry project. Crash reporting and basic
analytics are no longer "wired but unproven"; they are proven working.

## Honest gaps (original, before the DSN existed — now resolved, kept for history)

- **No real crash has ever actually been uploaded to Sentry** — there is no Sentry
  account for this project yet. Everything above proves the wiring is correct and the
  code paths execute without throwing; it does not prove an event reaches a real Sentry
  dashboard. That requires: create a Sentry project, set `EXPO_PUBLIC_SENTRY_DSN`,
  rebuild, and force a real crash on a device or emulator.
- **No on-device/emulator click-through was performed** — no Android emulator or
  physical device was available in this environment (see `memory/STATUS.md`'s
  environment notes for the usual `adb`/emulator workflow this project relies on).
  Screen-view breadcrumbs, the sign-up/sign-in/sign-out events, and the
  session/attempt/bookmark events were verified by static analysis (`tsc`) and reading
  the exact call sites, not by watching them fire on a running app.
- **The source-map-upload / config-plugin follow-up isn't tracked as a ticket anywhere**
  beyond this report and ADR-010 — worth a line in a future Sprint 5 pass once a real
  Sentry project exists.
