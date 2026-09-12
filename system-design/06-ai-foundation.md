# 6. AI foundation

This describes the internal AI infrastructure layer added to the backend — **not an AI
feature**. As of this writing, nothing in the app calls any of this yet. It exists so that
whenever the first real AI feature is built (a question explanation, a study planner,
anything), it depends on one internal interface instead of a specific vendor's API.

## Why this exists, in one line

> A future feature calls `aiService.generate(request)`. It never imports Claude, OpenAI, or
> Gemini directly, and it never sees an HTTP call, a retry, or an API key.

## The shape

```
Future feature (not built yet)
        |
        v
   AIService   <-- the ONLY thing a feature depends on
        |
        v
AIProviderRegistry   (resolves "which provider is active" from config)
        |
   -----+------------------------+
   |                             |
ClaudeProvider                MockAIProvider
(real Anthropic API,          (deterministic, zero network —
 java.net.http.HttpClient)     the default when nothing is configured)

   [OpenAIProvider / GeminiProvider — not built, see "adding a provider" below]
```

`AIServiceImpl` (the only implementation of `AIService`) is the single place that:
resolves which provider answers a call, enforces a timeout, retries a transient failure,
and records a usage event. A provider implementation (`ClaudeProvider`) only ever
translates one HTTP call — it never retries, never decides whether it's "enabled," and
never touches usage tracking.

This mirrors a pattern already used elsewhere in this backend: `ingestion.NoticeSourceAdapter`
is resolved the same way, via a Spring `Map<String, NoticeSourceAdapter>` keyed by bean
name rather than an `if/else` chain — `AIProviderRegistry` copies that exactly.

## Package map

All under `backend/src/main/java/.../ai/`:

| File | What |
|---|---|
| `AIService` / `AIServiceImpl` | The facade a feature depends on; retry/timeout/usage-recording live only in the impl |
| `AIRequest` / `AIResponse` / `AIMessage` / `AIUsage` / `AIModelInfo` / `AICredentialStatus` | The internal, provider-agnostic request/response shapes |
| `AICapability` | What a provider can do (`TEXT_GENERATION`, `CHAT`, `STRUCTURED_OUTPUT`, `VISION`, `EMBEDDINGS`, `AUDIO`, `STREAMING`) — checked via `AIProvider.supports()`, never assumed |
| `ResponseFormat` | `TEXT` / `JSON` — the structured-output extension point (see below) |
| `provider/AIProvider` | The interface every vendor implements |
| `provider/AIProviderRegistry` | Resolves the active provider from `AIProperties` |
| `provider/claude/ClaudeProvider` | Real Anthropic Messages API, plain REST over the JDK's `HttpClient` — no SDK dependency |
| `provider/mock/MockAIProvider` | Deterministic, zero-network — the default provider, and what every unit test uses |
| `config/AIProperties` | Every `app.ai.*` config value, read via `@Value` (same style as `AuthService`/`CloudinaryConfig`) |
| `exception/*` | `AIException` and its subtypes — see "Errors" below |
| `usage/AIUsageEvent` / `AIUsageRecorder` / `LoggingAIUsageRecorder` | The usage-tracking extension point |

## Configuration

Environment variables (or `application-local.yml`, gitignored — same convention as the
existing Cloudinary credentials):

| Variable | Property | Default | Meaning |
|---|---|---|---|
| `AI_ENABLED` | `app.ai.enabled` | `false` | Hard off-switch. `AIService.generate()` throws `AIConfigurationException` while false, regardless of provider. |
| `AI_PROVIDER` | `app.ai.provider` | `MOCK` | `CLAUDE` \| `OPENAI` \| `GEMINI` \| `MOCK`. Only `CLAUDE`/`MOCK` have a registered bean today — the others throw `AIUnknownProviderException` until implemented. |
| `AI_API_KEY` | `app.ai.api-key` | *(empty)* | Never logged, never returned in any response. |
| `AI_MODEL` | `app.ai.model` | *(provider default)* | `ClaudeProvider` falls back to `claude-sonnet-5` if blank. A per-request override (`AIRequest.model`) always wins over this. |
| `AI_BASE_URL` | `app.ai.base-url` | *(provider's real endpoint)* | Only needed to point at a proxy or test double. |
| — | `app.ai.connect-timeout-ms` | `10000` | |
| — | `app.ai.request-timeout-ms` | `60000` | LLM calls run long — this is deliberately generous. |
| — | `app.ai.max-retries` | `2` | Attempts beyond the first, for retryable errors only (see below). |

**Precedence**: an admin's saved database override (see "The AI Admin Control Center"
below) → environment variable → `application-local.yml` (gitignored) → `application.yml`
default → request-level override (`AIRequest.provider`/`.model` beat everything else, for
that one call only). The database layer is now built (see below) — env vars remain the
bootstrap/fallback layer, not the only layer.

**Why `enabled` defaults false and `provider` defaults `MOCK`**: a fresh checkout with zero
configuration boots cleanly, and if some future code accidentally calls `AIService` before
an operator has actually turned it on, it fails loudly with `AIConfigurationException`
rather than doing something unintended. This is the same "off unless explicitly turned on"
posture as `app.epic-l.synthetic-seed-enabled` / `app.exam-guide.demo-seed-enabled` /
`app.question-pool.temporary-enabled` already in this codebase.

## Security

- The API key is read once, server-side, via `@Value` — it never appears in a DTO, a
  response, or a log line. `LoggingAIUsageRecorder` logs `provider`/`model`/`feature`/
  `requestId`/token counts/`latencyMs`/`status`/`errorType` — never the key, never the
  prompt or response content.
- **No generation endpoint exists** (no `POST /api/ai/generate`-shaped passthrough). The
  only HTTP surface this layer exposes is `/api/admin/ai/*` — the AI Admin Control Center,
  configuration only, `requireAdmin`-gated, never reachable by a signed-in student or the
  mobile app, and never returning a plaintext key. A future feature exposes its own narrow
  endpoint (e.g. `POST /api/questions/{id}/explanation`) that calls `aiService.generate()`
  internally; it does not get a generic passthrough either.
- **Prompt injection**: not solved here, and not pretended to be. Any future feature that
  puts user-supplied or scraped content into `AIRequest.systemPrompt`/`.messages` must treat
  that content as untrusted — the same rule this codebase already applies to scraped
  notice/PDF content in the `ingestion` package.

## Errors and retry

Every provider implementation only ever throws an `ai.exception.AIException` subtype —
never a raw `IOException`/`HttpTimeoutException`/vendor error body. `AIServiceImpl` is the
one place that decides whether to retry:

| Exception | Retried? | Typical cause |
|---|---|---|
| `AIAuthenticationException` | No | bad/missing/revoked API key |
| `AIInvalidRequestException` | No | malformed request |
| `AIModelNotFoundException` | No | unknown model id |
| `AIUnknownProviderException` | No | `AI_PROVIDER` set to something unimplemented |
| `AIConfigurationException` | No | `app.ai.enabled=false`, or no API key configured |
| `AIRateLimitException` | Yes, backoff | HTTP 429 |
| `AIProviderUnavailableException` | Yes, backoff | connection failure, HTTP 5xx/overloaded |
| `AITimeoutException` | Yes, backoff | connect/read timeout |

Backoff is exponential (500ms base, doubling, capped at 4s), up to `app.ai.max-retries`
additional attempts — centralized in `AIServiceImpl`, never duplicated per provider.
`GlobalExceptionHandler` maps every `AIException` subtype to an HTTP status in one place,
so the first controller that calls `AIService` gets correct status codes for free.

## The AI Admin Control Center — DB-backed provider config

An authorized admin manages `enabled`/active provider/model/API key/base URL from the
Admin console (`/ai-control-center`), with **no backend redeploy** for a normal change.
Phase 1 deliberately shipped without this (ADR-013); this is the layer ADR-013 predicted.
See **ADR-014** in `reports/architecture-decisions.md` for the full decision record.

**Tables** (migration V40): `ai_settings` (singleton row, `id='default'`) holds the master
enable switch and active-provider choice; `ai_provider_configs` (one row per provider,
created only once an admin saves it) holds that provider's model/encrypted API key/base
URL plus `last_test_*` connection-test metadata; `ai_config_audit_log` (append-only)
records who changed what, when — never a secret value.

**How an admin's save actually takes effect, with no restart**:
`ai.config.DynamicAiConfigSource` is a small port interface (`enabledOverride()`,
`activeProviderOverride()`, `credentialOverride(providerId)`, each returning
`Optional.empty()` for "no override yet — fall back to static `AIProperties`").
`service.AiConfigurationService` (the DB-aware admin layer) implements it;
`ai.config.AiConfigResolver` consults it — an admin override always wins when present,
`AIProperties` is the fallback. `AIProviderRegistry`, `AIServiceImpl`, and `ClaudeProvider`
all read through `AiConfigResolver` now, never `AIProperties` directly, for the fields an
admin can actually change. **This is what makes Phase 1's env-var-only mode keep working
unchanged** for any deployment that never touches the admin UI — the database only takes
precedence once an admin actually saves something.

`AiConfigurationService` injects `AIProviderRegistry` as `@Lazy` — a genuine mutual
dependency, not an accident: `ClaudeProvider` (one of the registry's own beans) depends on
`AiConfigResolver`, which depends back on `AiConfigurationService` via
`DynamicAiConfigSource`. `@Lazy` defers real resolution past Spring's startup graph.

No caching layer — a plain repository read per resolution call. Call volume is low (no
feature calls `AIService` in production yet), and there's no existing config-caching
precedent in this codebase to follow; revisit if a real feature makes this a hot path.

**Encryption** (`ai.config.AiCredentialCipher`): AES-256-GCM via the JDK's own
`javax.crypto` — no new dependency. The key comes from `app.ai.encryption-key` /
`AI_ENCRYPTION_KEY` (base64, 32 bytes) and is **never stored in the database** — generate
one with `openssl rand -base64 32`, or, with no `openssl` available,
`python -c "import os,base64;print(base64.b64encode(os.urandom(32)).decode())"`. A blank
key is tolerated at startup; a present-but-wrong-length key fails fast at construction.

**Testing a draft key before saving it**: `AIProvider` gained a default method,
`validateCredentials(ProviderCredentialOverride override)`, so "Test Connection" can check
a not-yet-saved draft (a typed-but-unsaved API key/model/base URL) without persisting or
logging it — `ClaudeProvider` overrides it to call Anthropic's `/v1/models` with the
draft's values directly; a provider that doesn't override it just tests its already-saved
configuration instead.

**Optimistic concurrency**: both `ai_settings` and `ai_provider_configs` carry a JPA
`@Version` column (this codebase's first use of it) — an admin's save carries the
`version` their last read returned, and a stale value is rejected with 409 (mapped in
`GlobalExceptionHandler`) rather than silently overwriting someone else's more recent
change.

**Why still no `ai_usage` table**: usage tracking still has no consumer — nothing calls
`AIService` in production. `LoggingAIUsageRecorder` remains the extension point: a future
`DatabaseAIUsageRecorder implements AIUsageRecorder` can be swapped in via a `@Primary`
bean, with zero change to `AIServiceImpl`, the moment a real feature needs queryable
usage/cost history. The Control Center's own "Usage" section says this plainly rather than
showing invented numbers.

## How a future feature should call this

```java
@Service
public class QuestionExplanationService {
    private final AIService aiService;

    public QuestionExplanationService(AIService aiService) {
        this.aiService = aiService;
    }

    public String explain(Question question) {
        AIRequest request = AIRequest.builder()
                .systemPrompt("You are explaining a multiple-choice question to a student.")
                .messages(List.of(AIMessage.user(question.getText())))
                .metadata(Map.of("feature", "question-explanation"))
                .build();
        return aiService.generate(request).content();
    }
}
```

Never `new ClaudeProvider(...)`, never import anything under `ai.provider.claude` outside
the `ai` package itself.

## How to add a provider (OpenAI, Gemini, or anything else)

1. Create `provider/openai/OpenAIProvider.java implements AIProvider`, translating
   OpenAI's Chat Completions API into `AIRequest`/`AIResponse` exactly like `ClaudeProvider`
   does for Anthropic's Messages API — throw only `ai.exception` subtypes, never retry
   internally, never log the key.
2. Annotate it `@Component("openai")` — the bean name is the registry key.
3. Set `AI_PROVIDER=OPENAI` / `AI_API_KEY=...`.

That's the entire change. `AIService`'s interface, `AIServiceImpl`, `GlobalExceptionHandler`,
usage tracking, and every future feature that calls `aiService.generate()` are all
untouched. This is the concrete answer to "if we switch providers six months from now, how
much application code changes" — the answer this whole layer is built to make true.

## Extension points, still not built

- **Streaming (§13)**: `AIProvider.stream(request, onToken)` exists as a default method
  that throws `UnsupportedOperationException` — a provider that adds streaming overrides
  it instead of the interface changing.
- **Structured output (§12)**: `AIRequest.responseFormat` (`TEXT`/`JSON`) is threaded
  through as a hint. No JSON-schema enforcement or tool-use pipeline exists yet.
- **Usage/cost tracking (§14/§15)**: see "Why still no `ai_usage` table" above.
- **Multiple simultaneous provider configs shown as a real "OpenAI/Gemini not configured"
  row (§35)**: partially true today — `availableProviders` only ever lists providers with
  a registered bean, so OpenAI/Gemini simply don't appear until a provider class exists for
  them; there's no placeholder "not configured" row for an unimplemented provider, by
  design (§5 — never show a provider that cannot work).

## Testing

- `AIServiceImplTest` / `AIProviderRegistryTest` / `AiConfigResolverTest` /
  `AiCredentialCipherTest` — plain JUnit, no Spring context, no database. Same precedent as
  `TopicHealthScoringTest`/`QuestionEvaluatorsTest` for pure-logic services. Cover:
  successful call, retry-then-succeed, no-retry on non-transient errors, retries-exhausted,
  disabled-by-config, empty-messages validation, DB-override-vs-static-fallback precedence,
  and AES-GCM encrypt/decrypt round-tripping.
- `AiConfigurationTest` — real HTTP calls through the full `/api/admin/ai/*` surface
  against the real dev database: admin/non-admin/unauthenticated on every endpoint,
  enabling `mock` needs no key, enabling `claude` with no key anywhere is rejected, a saved
  key is confirmed encrypted at rest (read directly via the repository, not just the API),
  a stale `expectedVersion` gets 409, and every response body plus every audit-log summary
  is asserted to never contain the raw key value.
- `ClaudeProviderRealApiTest` — a **real** call to the real Anthropic API. Skipped by
  default (`@EnabledIfEnvironmentVariable(named = "AI_REAL_PROVIDER_TESTS", matches = "true")`),
  matching this project's existing stance toward anything hitting a real external system by
  default. Run manually with a real key when you actually want to prove the wire format
  still matches Anthropic's real API.
