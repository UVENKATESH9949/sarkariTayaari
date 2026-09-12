# AI Admin Control Center

**Requested:** let an authorized admin manage the AI provider configuration built in
Phase 1 (`system-design/06-ai-foundation.md`) from the Admin console — enable/disable AI,
pick the active provider, set a model, update an API key, test a connection — with no
backend code change or redeploy for a normal change. Explicitly **not** an AI-powered user
feature: no chatbot, no explanation generator, nothing user-facing beyond the admin page
itself.

Per the request's own §46 ("do not immediately start implementing... first inspect the
existing repository") and this project's `AI_RULES.md` §5, a full architecture proposal
was written and approved via `EnterPlanMode`/`ExitPlanMode` before any code changed —
after two parallel research passes (admin frontend conventions; backend
encryption/audit/versioning conventions), both read directly from source, not assumed.

## What was found before designing anything

- **No reversible encryption anywhere** in the backend — `spring-security-crypto`'s
  `BCryptPasswordEncoder` is one-way, password-hashing only, and `pom.xml` pulls in
  nothing else crypto-related. A new AES-GCM cipher was needed from scratch.
- **No audit-log table or `updated_by`-style column anywhere.** The closest precedent
  (`reviewedBy` on `QuestionCandidate`/`IngestionExtractionResult`) is a bare, never-
  actually-populated `UUID` field with its own doc comment explaining the convention
  ("not a JPA relationship, just an audit stamp"). A small, purpose-built
  `ai_config_audit_log` table was the right scope — not a generic audit system.
- **No `@Version`/optimistic-locking anywhere in this codebase** — introduced here for
  the first time, narrowly, on the two new mutable AI-config tables.
- **`IngestionSource`/`IngestionSourceRepository`/`IngestionSourceService`/
  `IngestionAdminController`** confirmed as the exact layering template to copy: plain
  JPA entities with manual getters/setters, an empty `JpaRepository`, a
  constructor-injected `@Transactional` service with a private `toResponse()` mapper, and
  a controller where every method's first line is `authService.requireAdmin(authorization)`
  — which returns the full `User`, giving direct access to `.getId()`/`.getEmail()` for
  audit stamping.
- **Admin frontend**: no "Settings" nav group existed yet (this is the first); no toggle/
  switch component exists anywhere (a plain `<select>` is this app's established
  convention for a boolean like Active/Inactive); no masked-secret field exists anywhere
  either (only `Login.jsx`'s plain `type="password"` input) — this phase introduces the
  first one, reusing that exact shape.

## Architecture

```
Admin React (AiControlCenter.jsx)
        |  bearer token only, never a provider key
        v
AiConfigurationController   (/api/admin/ai/*, requireAdmin on every method)
        |
        v
AiConfigurationService   (repositories, encryption, validation, audit)
        |                              implements
        v                                    v
Postgres (ai_settings /          ai.config.DynamicAiConfigSource
 ai_provider_configs /                       ^
 ai_config_audit_log)                        | consulted by
                                   ai.config.AiConfigResolver
                                    /                    \
                   AIProviderRegistry.resolve()      ClaudeProvider
                   AIServiceImpl.requireEnabled()   (apiKey/model/baseUrl)
```

**The key design move**: `DynamicAiConfigSource` is a small port interface living in the
`ai` package (the pluggable core), implemented by `AiConfigurationService` (the DB-aware
admin layer, living in the ordinary flat `service/` package like every other CRUD
service). `AiConfigResolver` consults it — an admin's saved override always wins,
`AIProperties` (Phase 1's static env-var config) is the fallback. `AIProviderRegistry`,
`AIServiceImpl`, and `ClaudeProvider` were all updated to read through `AiConfigResolver`
instead of `AIProperties` directly, for exactly the fields an admin can change. This is
what makes Phase 1's env-var-only mode keep working completely unchanged for a deployment
that never touches the admin UI — the database only takes precedence once an admin
actually saves something.

## A real Spring bean cycle, found only by running the app — not by review or compile

`mvn compile` passed cleanly the whole time this was designed. The first attempt to
actually **run** the new integration test failed at Spring context startup with
`UnsatisfiedDependencyException: ... Requested bean is currently in creation: Is there an
unresolvable circular reference?`. The real cycle: `AiConfigurationService` depends on
`AIProviderRegistry` (to validate/resolve providers) → `AIProviderRegistry`'s injected
`Map<String, AIProvider>` includes `ClaudeProvider` → `ClaudeProvider` depends on
`AiConfigResolver` → `AiConfigResolver` depends on `DynamicAiConfigSource`, implemented by
`AiConfigurationService`. A genuine mutual dependency, not a design mistake — the admin
service legitimately needs the registry to test/validate a provider, and a provider
legitimately needs the resolver to read its own config. Fixed with `@Lazy` on
`AiConfigurationService`'s `AIProviderRegistry` constructor parameter — the standard,
narrow Spring fix for exactly this shape, deferring real resolution until the first admin
request actually needs it, by which point the whole context has finished starting
normally. No package restructuring was needed.

## A second real bug, also only caught by running the real integration test

The very next run failed with `TransactionRequiredException: No EntityManager with actual
transaction available for current thread` — from `AiConfigAuditLogRepository`'s own custom
`deleteByChangedByEmail` derived query, called from a plain (non-transactional) JUnit
`@AfterEach`. This is **the exact same trap this project's own history already
documents once**, from an earlier session's Epic L work with a derived `deleteByExamCode`
— a custom derived `deleteBy...` method, unlike the inherited CRUD methods
(`save`/`deleteById`/etc., each individually `@Transactional` on `SimpleJpaRepository`),
is not transactional by default. Fixed with `@Transactional` directly on the repository
interface method — a one-line, precisely-targeted fix, with a doc comment on the method
itself naming the trap so a future session recognizes it immediately rather than
re-diagnosing it.

## What shipped

**Migration V40** (additive): `ai_settings` (singleton, `id='default'`, nullable
`enabled`/`active_provider` — null means "no admin override yet"), `ai_provider_configs`
(one row per provider, created only once an admin saves one; `encrypted_api_key` plus
`last_test_*` connection-test metadata), `ai_config_audit_log` (append-only). Both mutable
tables carry `@Version`.

**Backend**: `ai.ProviderCredentialOverride` + a new default method on `AIProvider`
(`validateCredentials(override)`) so "Test Connection" can check a not-yet-saved draft
key without persisting or logging it — `ClaudeProvider` overrides it to call Anthropic's
`/v1/models` with the draft's values directly (a small refactor: `send()` gained an
explicit `baseUrl` parameter alongside its existing `apiKey` one, and `listModels()`/
`validateCredentials()` were split through a shared `fetchModels(apiKey, baseUrl)` helper
to avoid duplicating the HTTP call). `ai.config.ProviderCredential`,
`ai.config.DynamicAiConfigSource`, `ai.config.AiConfigResolver`,
`ai.config.AiCredentialCipher` (AES-256-GCM via `javax.crypto`, zero new dependency, keyed
by `app.ai.encryption-key`/`AI_ENCRYPTION_KEY`, never stored in the database).
`entity`/`repository` additions for the three new tables. `dto/AiConfigurationDtos.java`
(nested records, matching `IngestionAdminDtos`/`ReminderDtos`). `service/
AiConfigurationService.java` (the orchestrator — validation, encryption, audit, the
`@Lazy` fix above) and `controller/AiConfigurationController.java` (five endpoints under
`/api/admin/ai/*`, mirroring `IngestionAdminController`'s exact shape). One new
`GlobalExceptionHandler` mapping (`ObjectOptimisticLockingFailureException` → 409).

**Validation, per the request's own §14**: enabling AI for a non-`MOCK` provider with no
API key configured anywhere (DB or static env-var fallback) is rejected with a clear 400
— model validity is deliberately *not* strictly enforced at save time, since every
registered provider either needs no credential (`MOCK`) or has a safe built-in default
model (`ClaudeProvider`'s `claude-sonnet-5`).

**Admin frontend**: new `pages/AiControlCenter.jsx` — status badges, a settings form
(Enabled/Active Provider, both `<select>`s matching this app's Active/Inactive
convention), one card per registered provider (model — a `<select>` once "Load models
from provider" succeeds, else a plain text input; a masked API-key field that's always
blank on load with a "Configured ✓ — leave blank to keep the current key" note; optional
base URL; Test Connection with the existing verb→verb-ing disabled-button idiom; Save),
a read-only audit-log table, and an honest "Usage is logged to application logs only — a
queryable dashboard isn't built yet" note rather than invented numbers (per the request's
own explicit §23 instruction). New `Settings` sidebar group (the first one) → `AI Control
Center`, a new `AiIcon`, six new `api.js` functions.

## Explicitly not built, matching the request's own scope-control section

No AI-powered user feature of any kind; no `POST /api/ai/generate`-shaped passthrough; no
queryable usage/cost dashboard (Phase 1's `LoggingAIUsageRecorder` is still log-only —
disclosed in the UI, not faked); no mobile change of any kind; no `OpenAIProvider`/
`GeminiProvider` (the interface already makes either a one-file addition, not built now);
no caching layer for resolved config (a plain repository read per call — call volume is
near zero since nothing calls `AIService` in production yet); no draft-testing merge
logic inside `ClaudeProvider` itself (the caller, `AiConfigurationService`, always hands
it a fully-merged, never-blank override).

## Verified

- `mvn -f backend/pom.xml compile` clean, both before and after the `@Lazy`/`@Transactional`
  fixes.
- New unit tests (`AiConfigResolverTest`, `AiCredentialCipherTest`) — plain JUnit, no
  Spring, no database: DB-override-vs-static-fallback precedence in both directions,
  a per-field blank-falls-back-independently case, AES-GCM encrypt→decrypt round-tripping,
  a fresh random IV per call (two encryptions of the same plaintext produce different
  ciphertext), a blank key tolerated at construction but rejected on first use, a
  wrong-length key failing fast at construction.
- New real-database integration test (`AiConfigurationTest`, extends
  `AbstractIntegrationTest`) — **12 tests, 0 failures, 0 errors** against the real Neon dev
  database: admin/non-admin/unauthenticated on `GET /config`; enabling `MOCK` needs no key;
  enabling `CLAUDE` with no key anywhere is rejected 400; enabling `CLAUDE` succeeds once a
  key is saved; a stale `expectedVersion` is rejected 409; saving a key is confirmed
  encrypted at rest by reading the raw repository row directly (not just trusting the API
  response) and asserting it's neither equal to nor contains the raw key string; a blank
  `apiKey` on a second save leaves the previously-encrypted value byte-for-byte unchanged;
  an unknown provider id is rejected; `Test Connection` against `MOCK` succeeds with
  sub-second latency and no real network call; an unregistered provider's test-connection
  fails cleanly (503, via the existing `AIUnknownProviderException` mapping); the audit log
  shows the expected action rows after a sequence of changes, and every response body plus
  every audit-log summary is explicitly asserted to never contain the raw test API key
  string.
- Admin `npm run build` clean; `npx oxlint` at the exact pre-existing baseline (1 warning,
  in an untouched file) — zero new lint issues from any of the new/changed frontend files.
- Phase 1's existing AI unit tests (`AIServiceImplTest`, `AIProviderRegistryTest`,
  `ClaudeProviderRealApiTest`) were updated for the new constructor shapes (an
  `AiConfigResolver` wrapping a no-override `DynamicAiConfigSource` test double, matching
  this project's own precedent for keeping these tests plain-JUnit and Spring-free) and
  re-confirmed passing — no behavior change to what they were already proving.

- **Full existing backend regression suite re-run, confirmed clean**: **287 tests, 0
  failures, 0 errors, 2 skipped** (the real-Anthropic-API tests), `BUILD SUCCESS` — proves
  the three previously-shipped Phase 1 files this phase touches (`AIProviderRegistry`,
  `AIServiceImpl`, `ClaudeProvider`) caused zero regression anywhere else in the suite.

- **A real Playwright click-through against a real dev backend**, not just a clean build.
  Minted a 45-minute admin token via the existing `AdminTokenMintRunner` fixture mechanism
  (the same harmless `automated-test-admin@sarkaritaiyaari.internal` account this project
  already uses for exactly this purpose), started a real dev backend
  (`mvn spring-boot:run`) and admin dev server (`npm run dev`), and drove the real page in
  a real browser: the API key field rendered as `type="password"`, always empty on load
  and after a reload; the settings form saved for real (confirmed via the audit log
  rendering `AI_ENABLED`/`ACTIVE_PROVIDER_CHANGED` rows); **Test Connection against MOCK
  succeeded instantly (0ms, no network) and against CLAUDE made a real HTTPS call to
  Anthropic's actual API** (no key configured) and correctly surfaced Anthropic's own real
  response, "x-api-key header is required" — a safe, accurate, non-leaking failure
  message, not a raw stack trace; zero browser console errors throughout.
- **A real bug found by this pass, not by review**: the top-level "Settings saved." success
  banner was never cleared when a subsequent Test Connection ran, so it stayed visible
  indefinitely, misleadingly, alongside (or in place of) the actual test result. Fixed by
  adding the same `setNotice(null)` at the start of `handleTestConnection` that
  `handleSaveSettings`/`handleSaveProvider` already had; re-verified clean on a second
  pass.
- **Full cleanup performed afterward**: the AI settings row and both providers' test-only
  rows were reset via `AiConfigurationTest`'s own `@BeforeEach`/`@AfterEach` fixture logic
  (same admin-fixture email, so one targeted test run cleanly reverted everything the
  click-through touched), the minted token was revoked, both scratch Playwright scripts
  were deleted (never committed), and both dev servers were stopped — confirmed by PID
  (matched exactly against the commands this session started, not assumed) and by both
  ports refusing connections afterward.

## Not yet verified

- **No real Anthropic API key was available in this environment**, so `ClaudeProvider`'s
  successful-response path for `validateCredentials(ProviderCredentialOverride)` was
  exercised only against `MOCK`; the Claude path was exercised for real, but only its
  *failure* branch (no key configured) — a genuinely real network round trip with a
  correctly normalized result, just not a successful one. The same disclosed gap Phase
  1's own `ClaudeProviderRealApiTest` already carries.
