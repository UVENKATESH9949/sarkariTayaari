-- AI Admin Control Center. Lets an authorized admin manage AI provider configuration from
-- the Admin console, with no backend redeploy for a normal enable/provider/model/key change.
-- Additive only. See system-design/06-ai-foundation.md and ADR-014
-- (reports/architecture-decisions.md) for the full precedence/security design.

-- Singleton settings row. `enabled`/`active_provider` are nullable on purpose: NULL means
-- "no admin has ever saved this via the UI yet" -> the application falls back to the
-- static app.ai.enabled / app.ai.provider (Phase 1's env-var config), so a deployment that
-- never touches this page keeps working exactly as it did before this migration.
CREATE TABLE ai_settings (
    id VARCHAR(20) PRIMARY KEY,
    enabled BOOLEAN,
    active_provider VARCHAR(20),
    updated_at TIMESTAMPTZ,
    updated_by_email VARCHAR(255),
    version BIGINT NOT NULL DEFAULT 0
);

INSERT INTO ai_settings (id, version) VALUES ('default', 0);

-- One row per provider, created only once an admin actually saves that provider's
-- configuration (a provider with no row here simply falls back to the static
-- app.ai.api-key/.model/.base-url, same reasoning as above).
CREATE TABLE ai_provider_configs (
    provider VARCHAR(20) PRIMARY KEY,
    model VARCHAR(100),
    -- AES-256-GCM ciphertext, base64-encoded (IV + ciphertext + tag). Never plaintext.
    -- Encryption key comes from app.ai.encryption-key / AI_ENCRYPTION_KEY -- never stored
    -- in this table or anywhere else in the database. See AiCredentialCipher.
    encrypted_api_key TEXT,
    base_url VARCHAR(500),
    updated_at TIMESTAMPTZ,
    updated_by_email VARCHAR(255),
    version BIGINT NOT NULL DEFAULT 0,
    last_test_at TIMESTAMPTZ,
    last_test_status VARCHAR(20),
    last_test_latency_ms BIGINT,
    -- Always a normalized message (from ai.exception.AIException / AICredentialStatus),
    -- never a raw provider response body -- see ClaudeProvider's own error translation.
    last_test_message VARCHAR(500)
);

-- Append-only. Never records a secret value -- only that one changed, by whom, when.
CREATE TABLE ai_config_audit_log (
    id UUID PRIMARY KEY,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    changed_by UUID NOT NULL,
    changed_by_email VARCHAR(255),
    action VARCHAR(50) NOT NULL,
    provider VARCHAR(20),
    summary VARCHAR(500) NOT NULL
);

CREATE INDEX idx_ai_config_audit_log_changed_at ON ai_config_audit_log (changed_at DESC);
