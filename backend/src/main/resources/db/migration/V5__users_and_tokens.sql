-- User accounts, so a student's practice history survives losing their phone.
--
-- Until now everything a student built up lived only in that device's SQLite: sessions,
-- mock attempts, bookmarks, readiness score. A lost or wiped phone meant starting from
-- zero, with no way to recover it afterwards. Restoring across devices needs an identity
-- that isn't tied to hardware, which is what this table provides.

CREATE TABLE users (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Stored lower-cased so lookups are case-insensitive without a second column or a
    -- functional index; the service normalises before writing.
    email          VARCHAR(255) NOT NULL UNIQUE,
    password_hash  VARCHAR(255) NOT NULL,
    display_name   VARCHAR(100),
    -- Reserved for phone + OTP sign-in later. Nullable and unique: Postgres allows many
    -- NULLs in a unique column, so this costs nothing until it is used.
    phone          VARCHAR(20) UNIQUE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Opaque session tokens rather than JWTs.
--
-- A JWT would avoid this lookup, but it cannot be revoked before it expires — so "log
-- out" and "this device was stolen" both become impossible to honour. At this scale one
-- indexed primary-key lookup per request is not worth trading that away for.
CREATE TABLE user_tokens (
    token         VARCHAR(64) PRIMARY KEY,
    user_id       UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at    TIMESTAMPTZ NOT NULL,
    -- Which device this token belongs to, so a future "signed-in devices" screen can
    -- show something meaningful and revoke one without signing out everywhere.
    device_label  VARCHAR(100)
);

CREATE INDEX idx_user_tokens_user_id ON user_tokens (user_id);
CREATE INDEX idx_user_tokens_expires_at ON user_tokens (expires_at);
