# TICKET-202 — Completed

**Sprint:** Sprint 2 — Mobile App Scaffold
**Scope:** Install and configure local SQLite storage, define schema matching the server model.

## What was done

- Installed `expo-sqlite` (via `npx expo install`, so it's version-matched to Expo SDK 57) and `drizzle-orm` + `drizzle-kit` (stable `latest` dist-tags — 0.45.x / 0.31.x — not the `@rc` versions shown in some Drizzle docs examples, since the expo-sqlite driver has been supported in stable releases for a long time and an RC dependency isn't worth the added risk for a project we want to build reliably on top of).
- Defined the local schema in `mobile/src/db/schema.ts`, mirroring the backend's `languages` / `questions` / `question_translations` tables field-for-field, including the same indexes (topic/difficulty/examType/updatedAt on `questions`) and a unique index on `(questionId, languageCode)` for translations — same reasoning as the backend: `updatedAt` is indexed because it drives delta sync lookups.
- Set up `drizzle.config.ts`, `metro.config.js` (adds `.sql` to resolvable extensions), and `babel.config.js` (adds the `inline-import` plugin) — required for Drizzle's migration files to be importable as JS modules on-device.
- Generated the initial migration via `npx drizzle-kit generate` — produced `src/db/migrations/0000_bright_sunset_bain.sql` plus the `migrations.js` barrel Drizzle needs to bundle migrations into the app.
- Wired `useMigrations` into `src/app/_layout.tsx` so the migration runs automatically on app startup, with a loading state and an error state (shown on screen if migration fails, instead of a silent white screen).

## Verification

This was verified for real, not just compiled:
1. Ran `npx tsc --noEmit` — clean, no type errors, at each step (schema, client, migration wiring, screen).
2. Booted the Android emulator, ran the app via Expo Go, and updated `src/app/index.tsx` to actually query both tables (`db.select().from(languages)`, `db.select().from(questions)`) and display the row counts on screen.
3. **User visually confirmed** seeing the live query result rendered on the emulator screen — proof the migration ran, the tables exist, and Drizzle can query them, not just that the code compiles.

## A process note (unrelated to the schema itself, but worth recording)

Hit two environment snags while getting to this verification:
- Restarting the Expo dev server to pick up the new `metro.config.js`/`babel.config.js` left the *old* Metro process still bound to port 8081 (same "stopping a background task doesn't always kill the underlying process" issue seen earlier with the backend) — had to `taskkill` the actual PID before restarting.
- After the restart, Expo Go on the emulator was still pointed at the dead server session and showed a "Cannot connect to Expo CLI" screen — this looked like a code/compile failure but wasn't one. Fixed by relaunching Expo Go via `adb shell am start` with the server's `exp://` URL.

## Reference

- Requirements doc: `../offline-exam-app-requirements.md` (Sprint 2, TICKET-202)
- Schema: `../mobile/src/db/schema.ts`
- DB client: `../mobile/src/db/client.ts`
