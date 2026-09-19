-- First-time onboarding: the preparation profile.
--
-- Hand-written, and on `app_preferences` rather than a table of its own, for the same two
-- reasons migration 0026 put the active exam here:
--
--   1. This is device-local. There is no server-side preparation profile to sync with -- the
--      backend's `users` table carries email/display_name/role and nothing else -- and
--      onboarding runs BEFORE any sign-in on a fresh install, because accounts in this app are
--      optional and the app works fully signed out. So the device is necessarily the source of
--      truth at the moment these values are written.
--   2. `app_preferences` is a SINGLE row, which makes "one profile per device" structural
--      rather than something a constraint has to enforce.
--
-- The stated consequence, not hidden: a reinstall clears local storage and the student is
-- onboarded again. Making the profile account-wide is an additive backend table plus an
-- endpoint plus a conflict rule for two devices disagreeing -- real work, deliberately not
-- done here, and nothing in this migration would have to move to do it later.
--
-- There is deliberately NO `preferred_language` column: the language chosen in onboarding is
-- the app's interface language, and that already lives in `ui_language` (migration 0013).
-- A second column for the same preference is exactly how the two drift.
--
-- Every column is nullable with no backfill. NULL is correct for every existing device: it
-- means "never onboarded", which is precisely what an install predating this feature is. Those
-- devices are adopted rather than re-onboarded -- see resolveOnboardingStatus() in
-- @sarkaritaiyaari/core/onboarding.
ALTER TABLE `app_preferences` ADD `display_name` text;--> statement-breakpoint
ALTER TABLE `app_preferences` ADD `primary_exam_code` text;--> statement-breakpoint
ALTER TABLE `app_preferences` ADD `exam_stage_id` text;--> statement-breakpoint
ALTER TABLE `app_preferences` ADD `target_year` integer;--> statement-breakpoint
ALTER TABLE `app_preferences` ADD `preparation_level` text;--> statement-breakpoint
ALTER TABLE `app_preferences` ADD `daily_study_time` text;--> statement-breakpoint
-- Written the moment onboarding is first decided to be owed, so the decision survives the app
-- being killed mid-flow. Without it the "has this install been used before?" signals -- which
-- all turn true WHILE the flow is on screen, as the first sync lands -- would re-decide on the
-- next launch and silently adopt a student who never finished.
ALTER TABLE `app_preferences` ADD `onboarding_started_at` text;--> statement-breakpoint
-- The completion flag itself. Set once, never cleared.
ALTER TABLE `app_preferences` ADD `onboarding_completed_at` text;
