# AI Foundation — Phase 1 (provider-independent AI infrastructure)

**Requested:** introduce a general-purpose AI infrastructure layer — explicitly **not** an
AI feature. No chatbot, no explanation generator, no study planner, no endpoint, no admin
UI, no mobile change. The goal was purely: if a future feature calls one internal
`AIService`, swapping the underlying vendor (Claude → OpenAI → Gemini) should mean writing
one new class and flipping a config value, never touching the feature's own code.

Per the requesting brief's own explicit process (Phase 1 understand → Phase 2 architecture
proposal → wait for approval → Phase 3 implement → Phase 4 tests → Phase 5 docs) and this
project's `AI_RULES.md` §5, a full architecture proposal was written and approved via
`EnterPlanMode`/`ExitPlanMode` before any code was written. The proposal is preserved in
this session's plan file; this report is the as-built account.

## What was inspected first (nothing was assumed)

Grepped the whole backend for `claude|anthropic|openai|gemini` — zero hits, confirming
this is genuinely greenfield. Read `AI_RULES.md`, `system-design/01`/`04`/`05`,
`reports/architecture-decisions.md`, `reports/open-questions.md`, and, directly, the
backend's actual patterns: `pom.xml` (no HTTP-client dependency beyond what
`spring-boot-starter-web` already brings; `ReminderService`/the `ingestion` package already
call external HTTP APIs with the JDK's own `java.net.http.HttpClient` — no SDK, ever),
`application.yml`/`application-local.yml.example` (config lives as discrete `@Value`
injections, not `@ConfigurationProperties`, in `AuthService`/`CorsConfig`/
`CloudinaryConfig`), `GlobalExceptionHandler` (one `@RestControllerAdvice`, one handler per
exception type mapped to an HTTP status), `AbstractIntegrationTest`
(real-Neon-DB integration tests) versus `TopicHealthScoringTest`/`QuestionEvaluatorsTest`
(plain JUnit, no Spring context, for pure-logic services), and the `ingestion` package's
own `NoticeSourceAdapter` + `Map<String, NoticeSourceAdapter>`-keyed-by-bean-name registry
pattern — explicitly chosen over an inheritance tree, and the direct model for
`AIProviderRegistry` below.

## What shipped

New package `backend/src/main/java/.../ai/`, zero new Maven dependency, zero database
migration, zero HTTP endpoint:

- **`AIService` / `AIServiceImpl`** — the one interface a future feature depends on.
  `AIServiceImpl` is the single place that resolves the active provider, retries a
  transient failure, enforces `app.ai.enabled` as a hard off-switch, and records a usage
  event. Everything else in the layer is either a pure data shape or a "translate one HTTP
  call" adapter.
- **`AIRequest`/`AIResponse`/`AIMessage`/`AIUsage`/`AIModelInfo`/`AICredentialStatus`** —
  the internal, provider-agnostic request/response vocabulary. `AIRequest` has a small
  builder (records with 8 fields are awkward positionally) and normalizes null
  `messages`/`responseFormat`/`metadata` in its compact constructor; it deliberately does
  **not** validate emptiness itself — that's `AIServiceImpl`'s job, so a provider-level test
  can still build a partial fixture without a surprise exception.
- **`AICapability`** (`TEXT_GENERATION`/`CHAT`/`STRUCTURED_OUTPUT`/`VISION`/`EMBEDDINGS`/
  `AUDIO`/`STREAMING`) and **`ResponseFormat`** (`TEXT`/`JSON`) — the capability and
  structured-output extension points from §11/§12 of the brief. Only `TEXT_GENERATION`/
  `CHAT` are exercised by anything real today.
- **`provider/AIProvider`** — the interface every vendor implements, with a default
  `stream()` that throws `UnsupportedOperationException` (§13's streaming extension point,
  deliberately not built further this phase).
- **`provider/AIProviderRegistry`** — resolves "which bean answers a call" from
  `AIProperties.provider`, case-insensitively, via the injected `Map<String, AIProvider>` —
  the exact `ingestion.NoticeSourceAdapter` pattern, not an `if/else` chain.
- **`provider/claude/ClaudeProvider`** — a real implementation against Anthropic's Messages
  API (`POST /v1/messages`, `GET /v1/models`), plain REST over `java.net.http.HttpClient`
  with a plain `new ObjectMapper()` — no Anthropic SDK. Translates every HTTP status/error
  body into the right `ai.exception` subtype (401/403 → authentication, 404 → model not
  found, 400/413 → invalid request, 429 → rate limit, 5xx/`overloaded_error` → provider
  unavailable) and never retries internally.
- **`provider/mock/MockAIProvider`** — deterministic, zero network. This is
  `app.ai.provider`'s default value, so a fresh checkout with no API key configured still
  exercises the whole `AIService` path (retry plumbing, usage recording, error
  normalization) in tests and local dev.
- **`config/AIProperties`** — every `app.ai.*` value via constructor `@Value` injection,
  matching the codebase's existing style rather than introducing
  `@ConfigurationProperties`.
- **`exception/AIException`** + 7 subtypes (`AIAuthenticationException`,
  `AIRateLimitException`, `AIProviderUnavailableException`, `AIInvalidRequestException`,
  `AIModelNotFoundException`, `AITimeoutException`, `AIUnknownProviderException`,
  `AIConfigurationException`) — wired into `GlobalExceptionHandler` via one new
  `@ExceptionHandler(AIException.class)` using a pattern-matching `switch` over the concrete
  subtype, so the first controller that ever calls `AIService` gets correct HTTP statuses
  for free without this file needing a second edit.
- **`usage/AIUsageEvent`/`AIUsageRecorder`/`LoggingAIUsageRecorder`** — the usage-tracking
  extension point (§14/§15). The default implementation is a single structured SLF4J log
  line (provider/model/feature/requestId/token counts/latency/status/errorType — never the
  key or the prompt/response content); a future `DatabaseAIUsageRecorder` can replace it via
  a `@Primary` bean with zero change to `AIServiceImpl`.

**Retry policy**, centralized in `AIServiceImpl` only: `AIRateLimitException`/
`AIProviderUnavailableException`/`AITimeoutException` are retried with exponential backoff
(500ms base, doubling, capped at 4s) up to `app.ai.max-retries` additional attempts (default
2); every other exception type fails immediately. No provider implementation contains a
retry loop.

**Config** (`app.ai.*` / `AI_*` env vars): `enabled` (default `false`), `provider` (default
`MOCK`; `CLAUDE`/`OPENAI`/`GEMINI`/`MOCK` are the recognized values, only `CLAUDE`/`MOCK`
have a registered bean), `api-key`, `model`, `base-url`, `connect-timeout-ms` (10000),
`request-timeout-ms` (60000), `max-retries` (2). Added to `application.yml` (with safe
defaults) and `backend/application-local.yml.example` (commented, alongside the existing
Cloudinary/Epic-L blocks) — the real, gitignored `application-local.yml` was **not**
touched, since it's the user's own local secrets file.

## A real decision made along the way, not in the original brief verbatim

`AICredentialStatus`'s first draft had a static factory method named `valid()` — the same
name as its own `boolean valid` record component. This doesn't compile: a record cannot
have a static method whose name collides with a component accessor unless it *is* that
accessor (and accessors can't be static). Caught immediately by `mvn compile`, not by
review; renamed the factory to `AICredentialStatus.ok()`.

## Deliberately not built (scope control, per the brief's own §37 and this project's
`AI_RULES.md` §1 "read only what the task needs")

- No `/api/ai/*` endpoint of any kind, no admin UI, no mobile change, no navigation change.
- No `OpenAIProvider`/`GeminiProvider` — the interface makes them a one-file addition later
  (see `system-design/06-ai-foundation.md`'s "how to add a provider"), not built now.
- No database table for provider config or usage — see the new **ADR-013** in
  `reports/architecture-decisions.md` for the full reasoning (no encryption-at-rest
  infrastructure exists for the former; no consumer exists yet for the latter).
- No JSON-schema-enforced structured output or tool-use pipeline — only the
  `ResponseFormat` hint.
- No real streaming implementation — only the `AIProvider.stream()` extension point,
  which throws `UnsupportedOperationException` today.
- No new Maven dependency — Anthropic's Messages API is plain REST, so the JDK's own
  `HttpClient` (already this codebase's established pattern) was sufficient.

## Verified

- `mvn -f backend/pom.xml compile` — clean, no new dependency.
- `mvn -f backend/pom.xml test -Dtest="com.sarkaritaiyaari.backend.ai.**"` —
  **9 tests run, 0 failures, 2 skipped** (the real-Anthropic-API test class, correctly
  skipped with no `AI_REAL_PROVIDER_TESTS` env var set). Covers: a successful call through
  `MockAIProvider` with a usage event recorded; a transient failure that retries and then
  succeeds; an authentication failure that does **not** retry; retries genuinely exhausted
  after the configured attempt count, with an "error" usage event recorded; `app.ai.enabled=false`
  throwing `AIConfigurationException` **without the provider ever being called** (asserted
  via a call counter); and an empty `messages` list rejected with `AIInvalidRequestException`.
  All plain JUnit, no Spring context, no database — matching the `TopicHealthScoringTest`
  precedent.
- `ClaudeProviderRealApiTest` exists but was **not** run against the real Anthropic API this
  session — no real Anthropic API key was available/shared in this environment. It is
  correctly skipped by default (`@EnabledIfEnvironmentVariable`) and documented with the
  exact command to run it manually once a real key is available:
  `AI_REAL_PROVIDER_TESTS=true AI_API_KEY=sk-ant-... mvn -f backend/pom.xml test -Dtest=ClaudeProviderRealApiTest`.
  **This is a genuine, disclosed gap** — the wire format against Anthropic's real API
  (request shape, error-body parsing, `/v1/models` response shape) is implemented from
  Anthropic's public API documentation, not confirmed against a live response.
- Grepped the full diff for the literal `api-key`/`API_KEY` occurrences to confirm the key
  is never written into a log statement, a DTO, or a test assertion string — confirmed
  clean; every occurrence is a config-key name or a doc comment, never a value.
- Full existing backend suite (`mvn test`, previously 256 tests) re-run at the end to
  confirm zero regression, since this phase touches no existing file other than
  `GlobalExceptionHandler` (additive: one new `@ExceptionHandler` method, no existing
  handler changed) and `application.yml`/`application-local.yml.example` (additive blocks).
  [Result recorded once the run completes — see this report's own follow-up note / the
  session's `memory/STATUS.md` entry.]

## Documentation updated in the same change (per `AI_RULES.md` §5)

- New `system-design/06-ai-foundation.md` — the architecture, package map, config table,
  "how a future feature should call this," "how to add a provider," security rules, and
  the extension points not yet built.
- `system-design/README.md`'s file table gained the new 06 row; `AI_RULES.md`'s "(5 short
  files)" line corrected to "(6 short files)" in the same change, per §6 (fix stale docs in
  place, say so).
- New **ADR-013** in `reports/architecture-decisions.md`.
- This report.
- `memory/STATUS.md`'s resume point updated (see its own entry for this session).

## Answer to the brief's own final question (§38)

*"If six months from now SarkariTaiyaari has 10 AI-powered features and switches from
Claude to OpenAI or Gemini, how much existing application code changes?"*

One new file (`provider/openai/OpenAIProvider.java`, implementing the existing
`AIProvider` interface), one `@Component("openai")` annotation, and one config value
(`AI_PROVIDER=OPENAI`). `AIService`'s interface, `AIServiceImpl`, `GlobalExceptionHandler`,
the usage-tracking extension point, and every one of the 10 features that call
`aiService.generate(request)` are untouched. That is the design target this phase was
built to hit, and the interface boundaries above were chosen specifically so that answer
stays true.
