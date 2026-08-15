CREATE TABLE `exam_subjects` (
	`exam_code` text NOT NULL,
	`subject_id` text NOT NULL,
	PRIMARY KEY(`exam_code`, `subject_id`),
	FOREIGN KEY (`exam_code`) REFERENCES `exams`(`code`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_exam_subjects_subject_id` ON `exam_subjects` (`subject_id`);