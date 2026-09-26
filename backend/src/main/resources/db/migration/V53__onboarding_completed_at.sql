-- Onboarding completion becomes an account fact, not only a device fact (2026-09-24).
--
-- Until now "has this student finished onboarding?" lived only in the phone's own
-- app_preferences.onboarding_completed_at. Uninstalling the app deletes that, so a student who
-- reinstalled, or signed in on a second phone, was asked every setup question again. The server
-- already held their answers (V48) but nothing that said the answers were complete — and a row's
-- mere existence cannot say it, because a half-finished onboarding could be uploaded too.
--
-- Additive and nullable. NULL means "not known to be complete", never "known incomplete".
-- The column is monotonic by rule (PreparationProfileService): once set it is never cleared.

ALTER TABLE user_preparation_profiles
    ADD COLUMN onboarding_completed_at TIMESTAMPTZ NULL;

-- Backfill: a stored profile with a display name was written by a device that had finished
-- onboarding (the device only started uploading once completion was stamped, and the name is the
-- first answer). A row with no name is left NULL on purpose: those are the rows a half-finished or
-- emptied upload produced, and asking that student the questions again is the honest outcome.
UPDATE user_preparation_profiles
   SET onboarding_completed_at = updated_at
 WHERE display_name IS NOT NULL
   AND btrim(display_name) <> '';
