-- Practice Result 3-tab redesign — hand-written, mirroring backend PracticeResultInsightDtos.
-- Two nullable columns on practice_sessions: the AI Feedback tab's structured response (cached
-- on-device only, no server-side copy — see PersonalNarrativeService.practiceResultInsight's
-- doc comment) and when it was generated. Both nullable, additive, no backfill needed (NULL is
-- correct for every existing row — nothing has ever generated this before this migration).
ALTER TABLE `practice_sessions` ADD `insight_json` text;
--> statement-breakpoint
ALTER TABLE `practice_sessions` ADD `insight_generated_at` integer;
