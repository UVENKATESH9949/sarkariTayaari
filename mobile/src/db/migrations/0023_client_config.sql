-- TASK-2701 Phase 4 -- local cache for GET /api/client-config's AI task flags, synced from
-- writeReferenceData() the same way ai_content/exam_guide_* content is.
CREATE TABLE IF NOT EXISTS `client_config_ai_tasks` (
	`task_id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT false NOT NULL
);
