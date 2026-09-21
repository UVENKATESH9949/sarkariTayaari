-- Email one-time codes, for sign-in and sign-up without a password.
--
-- Why a table rather than a signed token: a code has to be revocable the moment it is used, has
-- to carry an attempt counter, and has to survive a backend restart. All three want a row.
--
-- The code itself is NEVER stored. Only a BCrypt hash of it, for the same reason users.password_hash
-- is hashed: this database is shared between dev and production (see memory/STATUS.md), and a
-- readable code column would be a list of live credentials.
--
-- Rate limiting lives here too. A six-digit code is only 1,000,000 possibilities, so the expiry and
-- the attempt cap are not hygiene — they are the entire reason brute force is impractical. Without
-- them a caller could simply try every code.
CREATE TABLE email_otp_codes (
    id              UUID PRIMARY KEY,

    -- Lower-cased at the service boundary, exactly like users.email. Deliberately NOT a foreign key
    -- to users: a code is issued BEFORE the account exists for a first-time sign-up, and that is the
    -- whole point of the flow.
    email           VARCHAR(255) NOT NULL,

    code_hash       VARCHAR(255) NOT NULL,

    expires_at      TIMESTAMPTZ  NOT NULL,

    -- Set when the code is successfully redeemed. A consumed code is kept rather than deleted so a
    -- second attempt to use it can be refused on its own terms instead of looking like "no such
    -- code", and so the row remains auditable.
    consumed_at     TIMESTAMPTZ,

    -- Wrong guesses so far. At the cap the row is dead and a new code must be requested.
    attempt_count   INT          NOT NULL DEFAULT 0,

    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- The one query the verify path makes: newest live code for this address.
CREATE INDEX idx_email_otp_codes_email_created ON email_otp_codes (email, created_at DESC);

-- Supports the expiry sweep without scanning the table.
CREATE INDEX idx_email_otp_codes_expires_at ON email_otp_codes (expires_at);
