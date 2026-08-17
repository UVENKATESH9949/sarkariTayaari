# Backend Framework Setup — Completed

**Date:** 2026-08-05
**Sprint:** Pre-Sprint 1 (framework scaffold)

## What was done

- Scaffolded a Spring Boot 3.3.4 (Java 21) project under `backend/`
- Dependencies wired in: Web, Data JPA, Validation, Postgres driver, Flyway
- Package layout: `controller`, `service`, `repository`, `entity`, `dto`, `config`
- Added `GET /api/health` endpoint (returns `{"status":"UP"}`) to verify the app boots
- Database: chose [Neon](https://neon.tech) (free hosted Postgres) since this machine has no admin rights to install Docker/Postgres locally
- Credentials handling: `application.yml` has no secrets in it — it imports an optional local file (`spring.config.import: optional:file:./application-local.yml`)
  - `backend/application-local.yml.example` — committed template with placeholder values
  - `backend/application-local.yml` — real credentials, gitignored, never committed
- Verified: app builds, connects to the real Neon database, Flyway initializes successfully

## Why these choices

- Environment-variable based config was tried first but abandoned — `SetEnvironmentVariable` (persistent) only applies to processes started *after* the change, and the parent process (VS Code) was already running, so it never picked up the new vars. The gitignored local-file approach avoids this entirely.
- Neon chosen over local Postgres/Docker because installing either requires admin permissions not available on this machine.

## Reference

- Requirements doc: `../offline-exam-app-requirements.md`
