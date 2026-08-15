# TICKET-203 — Completed

**Sprint:** Sprint 2 — Mobile App Scaffold
**Scope:** Local `sync_meta` table and get/set helper functions for `last_synced_at`.

## What was done

- Added a `syncMeta` table to the local schema (`mobile/src/db/schema.ts`) — local-only, no server equivalent: `examType` (primary key), `lastSyncedAt` (nullable timestamp — null means "never synced," which signals a full sync on next app open).
- Generated the migration (`0001_zippy_randall_flagg.sql`) via `drizzle-kit generate`.
- Wrote `mobile/src/db/syncMeta.ts`:
  - `getLastSyncedAt(examType)` → `Date | null`
  - `setLastSyncedAt(examType, date)` → upsert via `onConflictDoUpdate`, so calling it repeatedly for the same exam type updates in place rather than erroring on a duplicate key.

## Verification

Found a working way to get real visual proof from the emulator without any UI-automation tool (no Appium available in this environment): `adb shell screencap` + `adb pull`, then viewing the PNG directly. This is now a reliable technique for confirming on-screen state going forward, not just trusting logs.

Extended the same on-screen check used in TICKET-202 to round-trip through `getLastSyncedAt`/`setLastSyncedAt`, then captured a screenshot. Confirmed on screen:
```
sync_meta before: never synced
sync_meta after set: 2026-08-08T08:52:37.635Z
```
This proves: `getLastSyncedAt` correctly returns `null` when no row exists yet, `setLastSyncedAt` correctly inserts, and a subsequent `getLastSyncedAt` correctly reads back the exact value just written.

## Reference

- Requirements doc: `../offline-exam-app-requirements.md` (Sprint 2, TICKET-203)
- Code: `../mobile/src/db/schema.ts` (`syncMeta` table), `../mobile/src/db/syncMeta.ts`
