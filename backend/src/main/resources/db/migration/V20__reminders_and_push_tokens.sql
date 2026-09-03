-- Exam Guide spec §8 "Reminder System" -- confirmed by grep before this migration: there is
-- no push-notification infrastructure anywhere in this repo, backend or mobile. This is a
-- from-scratch capability, not a wiring task.
--
-- IMPORTANT DEPLOYMENT NOTE, not just a code comment -- see ReminderService's own class
-- comment for the full reasoning: this backend is deployed to Cloud Run with
-- --max-instances=3 and SCALE-TO-ZERO (reports/14-cloud-run-deployment/). A plain
-- @Scheduled in-process job would silently not fire reliably in that environment, since
-- the container is not guaranteed to be running at any given minute. Dispatch is therefore
-- exposed as an explicit, externally-triggerable endpoint (a Cloud Scheduler job hitting it
-- is the intended production trigger -- one more piece of one-time gcloud setup, same
-- category as the existing GitHub Actions repository variables), not a background timer.

CREATE TABLE push_tokens (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    -- An Expo push token, not a raw FCM/APNs token -- Expo's push service is the
    -- integration point (see ReminderService), so this is what registration receives.
    expo_token    TEXT NOT NULL,
    -- ANDROID | IOS. Free-form rather than a DB enum, matching every other lifecycle/
    -- platform-ish column in this codebase (application-level values, not a DB CHECK).
    platform      VARCHAR(20),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Bumped on every re-registration -- one signal for a future cleanup pass to prune
    -- tokens nobody has confirmed in months, without needing a separate table.
    last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- A device re-installing the app gets a new Expo token but the same user signs back
    -- in -- upserting on (user, token) avoids accumulating duplicate rows for the same
    -- device across sign-outs/sign-ins.
    UNIQUE (user_id, expo_token)
);

CREATE INDEX idx_push_tokens_user ON push_tokens (user_id);

-- §8's reminders. Deliberately NOT recruitment-cycle-scoped like most Exam Guide content --
-- a reminder is a fact about a specific important_dates row a user asked to be nudged
-- about, and important_dates already cascades from its cycle, so a reminder pointing at a
-- deleted date should disappear too rather than fire with nothing left to reference.
CREATE TABLE user_reminders (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    exam_code           VARCHAR(30) NOT NULL REFERENCES exams (code),
    important_date_id   UUID REFERENCES important_dates (id) ON DELETE CASCADE,
    remind_at           TIMESTAMPTZ NOT NULL,
    message             TEXT NOT NULL,
    sent                BOOLEAN NOT NULL DEFAULT false,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The dispatch job's own query shape: "every unsent reminder due by now". A partial index
-- on the unsent rows only, since a sent reminder is never queried by this path again.
CREATE INDEX idx_user_reminders_due ON user_reminders (remind_at) WHERE NOT sent;
CREATE INDEX idx_user_reminders_user ON user_reminders (user_id);
