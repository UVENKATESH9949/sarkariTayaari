# TICKET-205 — Completed

**Sprint:** Sprint 2 — Mobile App Scaffold (final ticket)
**Scope:** API client setup — fetch wrapper, base URL config, error handling.

## What was done

- `mobile/src/api/config.ts` — resolves `API_BASE_URL`:
  1. `EXPO_PUBLIC_API_BASE_URL` env var, if set (explicit override — for pointing at a real deployed backend later)
  2. otherwise derived automatically from Metro's dev server host (`Constants.expoConfig.hostUri` via `expo-constants`), so it keeps working if the dev machine's LAN IP changes (DHCP renewal, different Wi-Fi) without editing code
  3. `http://localhost:8080/api` as a last-resort fallback
- `mobile/src/api/client.ts` — `apiFetch<T>()`: generic fetch wrapper that sets JSON headers, serializes `body`, and normalizes failures into a single `ApiError` (message + status):
  - network failure (no connection, server unreachable) → `ApiError` with status `0` and a friendly message
  - non-2xx response → parses the backend's `{ error: "..." }` shape (matches `GlobalExceptionHandler`) into the `ApiError` message
  - `204 No Content` → resolves `undefined` instead of trying to parse an empty body
- `mobile/src/api/questions.ts` — typed functions for the two read endpoints the mobile app actually needs: `getLanguages()` and `syncQuestions(examType, since, page, size)`, with TypeScript types matching the backend DTOs (`QuestionResponse`, `TranslationResponse`, `LanguageResponse`, `SyncPage`).

Endpoint-calling functions are limited to `languages` and `sync` — the two read-only endpoints Sprint 3 (sync engine) and beyond will use. Write-back endpoints (`/api/attempts/sync`, etc.) are v1.1 (TICKET-601) and out of scope here.

## Verification

Verified against the real running backend on-device (not mocked or assumed) via a temporary logging probe on the home screen, removed after confirming, with output read from `adb logcat`:

```
API_BASE_URL = http://192.168.100.114:8080/api      (correctly auto-derived from Metro's host IP)
getLanguages() -> [{"code":"en","name":"English"},{"code":"hi","name":"Hindi"}]
syncQuestions() -> totalElements= 108 contentLength= 5   (size=5 param respected)
error-handling path -> status= 400 message= Missing required parameter: examType
```

This confirms: base URL resolution works without hardcoding an IP, real data round-trips correctly, pagination params are honored, and the error path surfaces the backend's actual message and HTTP status rather than a generic failure.

Note: `totalElements=108` reflects the 100 seeded questions (TICKET-105) plus the ~8 leftover manual-test rows flagged earlier (still pending a cleanup decision — unrelated to this ticket).

## Reference

- Requirements doc: `../offline-exam-app-requirements.md` (Sprint 2, TICKET-205 — Sprint 2 now complete)
- Code: `../mobile/src/api/config.ts`, `../mobile/src/api/client.ts`, `../mobile/src/api/questions.ts`
