# SarkariTaiyaari Backend

Spring Boot 3.3 (Java 21) service exposing the question sync API.

## Local setup

1. Create a free Postgres database on [Neon](https://neon.tech).
2. Copy `application-local.yml.example` to `application-local.yml` (same `backend/` folder) and fill in your real Neon host/db name/username/password. This file is gitignored — it will never be committed.
3. Run the app from the `backend/` folder:

   ```powershell
   mvn spring-boot:run
   ```

4. Check it's up: `GET http://localhost:8080/api/health` → `{"status":"UP"}`

Never put real credentials in `application.yml` — only in your local, gitignored `application-local.yml`.
