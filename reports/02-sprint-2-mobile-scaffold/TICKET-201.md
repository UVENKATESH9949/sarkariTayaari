# TICKET-201 — Completed

**Sprint:** Sprint 2 — Mobile App Scaffold
**Scope:** Initialize the Expo React Native project, folder structure, and navigation.

## What was done

- Scaffolded `mobile/` with `create-expo-app` using the **default template** on **Expo SDK 57** (React Native 0.86.2) — TypeScript, Expo Router pre-configured.
- Ran Expo's own `reset-project` script to strip out the template's demo/tutorial content (tabs example, themed components, etc.), leaving a clean minimal `src/app/index.tsx` + `src/app/_layout.tsx`.
- Aligned app identity with the rest of the project: `app.json` name/slug/scheme and `package.json` name changed from the generic "mobile" to "SarkariTaiyaari" / `sarkaritaiyaari`.
- Verified end-to-end: booted the configured Android emulator, ran `npx expo start --android`, confirmed `Android Bundled` in the log and visually confirmed by the user that the app installed and launched on the emulator.

## Key decision: Expo Router instead of React Navigation

The original doc said "React Navigation," written before checking current Expo docs. `mobile/AGENTS.md` (shipped by the Expo template itself) explicitly instructs checking the versioned docs before writing code, since Expo APIs change significantly between versions. Checked docs for SDK 57 and found:

- Expo Router is the current default/recommended navigation solution, pre-configured in the standard template.
- **As of SDK 56+, Expo Router no longer supports importing from `@react-navigation/*` packages directly in application code** — those imports must be repointed to `expo-router`'s own entry points.

Given this, manually installing React Navigation (per the original doc) would have meant working against the framework's current direction. Used Expo Router instead — this is a plan correction, not a deviation.

## A note on the scaffolding process

The first scaffold attempt used `--template blank` (no router). Realizing mid-way that the default template was the better choice, tried to delete and re-scaffold — the `mobile/` directory got stuck with an OS-level file lock (from an external process, likely Explorer or an IDE watcher) that blocked deleting the directory itself, even after successfully clearing its contents. Rather than fight the lock, scaffolded fresh directly into the now-empty existing folder, which worked fine.

## Reference

- Requirements doc: `../offline-exam-app-requirements.md` (Sprint 2, TICKET-201)
- Project: `../mobile/`
