# AI Admin Control Center — `/api/admin/ai`

Covers `AiConfigurationController`. Lets an authorized admin manage the AI provider
configuration built in `system-design/06-ai-foundation.md` — enable/disable AI, pick the
active provider, set a model/API key/base URL, test a connection, and read a recent
audit trail. **No AI-powered user feature exists yet** — this is administration only.

All endpoints below require `Authorization: Bearer <token>` for a user whose role is
`ADMIN` (checked by `AuthService.requireAdmin`).

**No response here ever contains a plaintext API key.** `configured: true/false` is the
closest any response gets to describing one. See `system-design/06-ai-foundation.md`'s
Control Center section for the full precedence/encryption/audit design.

Every write below (`PUT /settings`, `PUT /providers/{id}`) requires `expectedVersion` —
the `version` the caller's last `GET /config` returned for that row. A stale value is
rejected `409 Conflict`; reload and retry.

---

### GET /api/admin/ai/config
**Purpose:** The full admin view — master settings plus every registered provider's safe
configuration state.
**Auth:** admin
**Request:** none
**Response:** `200 OK`:
```
{
  settings: {
    enabled: boolean,                  // effective value (admin override, else app.ai.enabled)
    enabledIsOverridden: boolean,      // true once an admin has ever saved this
    activeProvider: string | null,     // effective value, always uppercase (e.g. "CLAUDE")
    activeProviderIsOverridden: boolean,
    version: number                    // send back as expectedVersion on the next PUT /settings
  },
  availableProviders: string[],        // only providers with a real registered bean -- never
                                        // a hardcoded list, never an unimplemented provider
  providers: [
    {
      provider: string,                // e.g. "CLAUDE"
      configured: boolean,              // true for MOCK always; true for others once a key
                                        // exists (DB or static env-var fallback)
      model: string | null,             // effective value
      baseUrlConfigured: boolean,
      updatedAt: ISO-8601 timestamp | null,
      updatedByEmail: string | null,
      lastTestStatus: "SUCCESS" | "FAILED" | "NOT_TESTED",
      lastTestAt: ISO-8601 timestamp | null,
      lastTestLatencyMs: number | null,
      lastTestMessage: string | null,   // always a normalized message, never a raw provider error body
      version: number                   // send back as expectedVersion on the next PUT /providers/{id}
    }
  ]
}
```
**Errors:** 401, 403.
**Consumers:** Admin

### PUT /api/admin/ai/settings
**Purpose:** Change the master enable switch and/or the active provider.
**Auth:** admin
**Request:**
```
{ enabled: boolean, activeProvider: string | null, expectedVersion: number }
```
`activeProvider: null` clears the override back to the static `app.ai.provider` default.
**Response:** `200 OK`, the `settings` shape from `GET /config` above.
**Errors:** 401, 403, 400 `activeProvider` isn't a registered provider, 400 `enabled: true`
with no active provider resolvable, 400 `enabled: true` for a non-`MOCK` provider with no
API key configured anywhere (DB or static fallback) — "Configure a key first," 409 stale
`expectedVersion`.
**Business rules:** The backend enforces this, not just the frontend — `AIServiceImpl`
refuses to run any AI call while `enabled` is effectively `false`, regardless of what a
provider's own credentials say. Disabling AI never deletes provider configuration,
history, or the audit log — it only stops execution; re-enabling reuses whatever was
already configured.
**Consumers:** Admin

### PUT /api/admin/ai/providers/{providerId}
**Purpose:** Save one provider's model/API key/base URL.
**Auth:** admin
**Request:**
```
{ model: string | null, apiKey: string | null, baseUrl: string | null, expectedVersion: number }
```
`apiKey: null` (or omitted/blank) means **leave the currently stored key unchanged** — this
is the only field with that semantic; `model`/`baseUrl` are always applied verbatim (blank
clears back to the static fallback). A non-blank `apiKey` is encrypted (AES-256-GCM) before
being stored — never written to the database in plaintext, never logged.
**Response:** `200 OK`, one entry from the `providers` array in `GET /config` above.
**Errors:** 401, 403, 400 unknown/unregistered `providerId`, 409 stale `expectedVersion`.
**Consumers:** Admin

### POST /api/admin/ai/providers/{providerId}/test-connection
**Purpose:** A minimal, inexpensive real call to the provider to confirm SarkariTaiyaari
can actually reach it — independent of the master `enabled` switch, so an admin can verify
a key works before turning AI on.
**Auth:** admin
**Request:** `{ apiKey: string | null, model: string | null, baseUrl: string | null }` — all
optional; any field left blank falls back to that provider's already-saved (or
static-fallback) value, so a draft can be tested **before** clicking Save.
**Response:** `200 OK`:
```
{ success: boolean, provider: string, model: string | null, latencyMs: number, message: string }
```
**Errors:** 401, 403, 503 unregistered `providerId`. A failed *connection* is not an HTTP
error — it's a normal `200` with `success: false` and a normalized `message` (never a raw
provider error body).
**Business rules:** Records `lastTestStatus`/`lastTestAt`/`lastTestLatencyMs`/
`lastTestMessage` on that provider's row (creating one if it didn't exist yet) — which
bumps that row's `version`; re-fetch `GET /config` before a subsequent `PUT
/providers/{id}` or its `expectedVersion` will be stale. `MOCK` always succeeds near-
instantly with no real network call.
**Consumers:** Admin

### GET /api/admin/ai/providers/{providerId}/models
**Purpose:** Populate a model picker without hardcoding any provider's model names
anywhere, backend or frontend — a direct passthrough to the already-built
`AIProvider.listModels()` (Phase 1), which itself calls the provider's real model-listing
API (e.g. Anthropic's `GET /v1/models`).
**Auth:** admin
**Request:** none
**Response:** `200 OK`, `[{ id: string, displayName: string }]`.
**Errors:** 401, 403, 503 unregistered `providerId` or the provider has no API key
configured yet (falls back to whatever error the provider itself reports, normalized).
**Consumers:** Admin

### GET /api/admin/ai/audit-log
**Purpose:** The last 50 configuration changes, newest first — who changed what, when.
Never a secret value.
**Auth:** admin
**Request:** none
**Response:** `200 OK`:
```
[{ changedAt: ISO-8601 timestamp, changedByEmail: string, action: string, provider: string | null, summary: string }]
```
`action` is one of `AI_ENABLED` | `AI_DISABLED` | `ACTIVE_PROVIDER_CHANGED` |
`PROVIDER_CONFIG_UPDATED` | `TEST_CONNECTION`. `summary` is a short, human-readable
sentence naming *which fields* changed (e.g. "Updated CLAUDE configuration: model, API
key") — never the value.
**Consumers:** Admin

---

### GET /api/admin/ai-usage/summary?since=
**Purpose:** Aggregated AI usage — how many calls, how many tokens, how many failures, grouped
by feature and model. Backed by `ai_usage_events` (migration V46) via `DatabaseAIUsageRecorder`,
which took over from `LoggingAIUsageRecorder` as the `@Primary` `AIUsageRecorder` bean — exactly
the swap Phase 1's own extension point was written for, with no change to `AIServiceImpl`.
**Auth:** admin
**Query:** `since` — ISO-8601 **UTC** instant (`2026-01-01T00:00:00Z`), or omitted/`0` for the
last 30 days. Same parsing convention as `/api/questions/sync`. Use the `Z` form: a `+05:30`
offset decodes as a space in a query string unless percent-encoded.
**Response:** `200 OK`:
```
{
  since: ISO-8601 timestamp,
  totalCalls: number, totalInputTokens: number, totalOutputTokens: number,
  totalTokens: number, totalFailures: number,
  byFeature: [{ feature, model, calls, inputTokens, outputTokens, totalTokens, failures }]
}
```
**Reports tokens, never money.** Per-model pricing changes on the vendor's schedule, so cost stays
a calculation done by whoever reads this rather than a number frozen into each stored row — the
separation `AIUsageEvent`'s own doc comment established before any of this was persisted.

**Failures are recorded, not just successes** — a burst of rate-limit or validation failures is
the most useful thing to be able to see here, and it is invisible if only successes are stored.
This is not hypothetical: a `PROFILE_SUMMARY` truncation bug billed every call in full and
returned `null`, and nothing aggregated it.
**Errors:** `400` for a malformed `since`.
**Consumers:** `admin/src/pages/AiUsage.jsx` (the **AI Usage** page, under Settings). It renders
the headline totals and the `byFeature` breakdown over a selectable window (24 hours / 7 / 30 /
90 days), sending the window as an ISO-8601 `Z` instant. The page deliberately hardcodes no
vendor price: it reports tokens, and offers optional rate fields so the operator supplies
today's pricing and gets an estimate computed in the browser — keeping the
"pricing belongs to whoever reads this" separation this endpoint was built with.

---

## Explicitly out of scope (this API surface, as built)

- No `POST /api/ai/generate`-shaped passthrough anywhere — this controller is
  configuration only. A future AI-powered feature exposes its own narrow endpoint that
  calls `AIService` internally (see `system-design/06-ai-foundation.md`).
- No cost figure computed anywhere in the **backend** — per-model pricing changes on the
  vendor's schedule, so it stays a calculation over `(model, tokens)` made by the reader. The
  admin console's AI Usage page will estimate one from a rate the operator types in, but nothing
  in this repo stores or asserts a price.
  (This bullet previously said no queryable usage data existed at all, and then that no screen
  rendered it; both stopped being true — the first when `DatabaseAIUsageRecorder` and V46
  landed, the second when `admin/src/pages/AiUsage.jsx` did.)
- No admin-facing "delete this provider's configuration" endpoint — only overwrite
  (`PUT /providers/{id}`). Disabling AI (`PUT /settings` with `enabled: false`) is the
  supported way to stop using a provider without losing its saved configuration.
