CREATE TABLE `answers` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`stage` text NOT NULL,
	`question_id` text NOT NULL,
	`topic` text NOT NULL,
	`value_json` text NOT NULL,
	`source` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "answers_stage_check" CHECK("answers"."stage" in ('stage2', 'stage3', 'stage4', 'stage5', 'stage6', 'review2', 'stage7')),
	CONSTRAINT "answers_source_check" CHECK("answers"."source" in ('user', 'default', 'guess'))
);
--> statement-breakpoint
CREATE INDEX `answers_project_stage_idx` ON `answers` (`project_id`,`stage`);--> statement-breakpoint
CREATE TABLE `decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`code` text NOT NULL,
	`origin` text NOT NULL,
	`category` text NOT NULL,
	`finding` text NOT NULL,
	`chosen_option` text NOT NULL,
	`consequence` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "decisions_origin_check" CHECK("decisions"."origin" in ('review1', 'review2', 'profile'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `decisions_project_code_idx` ON `decisions` (`project_id`,`code`);--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`kind` text NOT NULL,
	`version` integer NOT NULL,
	`content` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "documents_kind_check" CHECK("documents"."kind" in ('prd', 'tasks')),
	CONSTRAINT "documents_version_check" CHECK("documents"."version" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `documents_project_kind_version_idx` ON `documents` (`project_id`,`kind`,`version`);--> statement-breakpoint
CREATE TABLE `feature_choices` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`feature_code` text NOT NULL,
	`accepted` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "feature_choices_accepted_check" CHECK("feature_choices"."accepted" in (0, 1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `feature_choices_project_feature_idx` ON `feature_choices` (`project_id`,`feature_code`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`stage` text NOT NULL,
	`status` text NOT NULL,
	`error` text,
	`created_at` text NOT NULL,
	`started_at` text,
	`finished_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "jobs_stage_check" CHECK("jobs"."stage" in ('stage2', 'stage3', 'stage4', 'stage5', 'stage6', 'review2', 'stage7')),
	CONSTRAINT "jobs_status_check" CHECK("jobs"."status" in ('queued', 'running', 'succeeded', 'failed', 'interrupted'))
);
--> statement-breakpoint
CREATE INDEX `jobs_project_idx` ON `jobs` (`project_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_one_active_idx` ON `jobs` ((1)) WHERE "jobs"."status" in ('queued', 'running');--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`idea` text NOT NULL,
	`current_stage` text NOT NULL,
	`profile_choice` text,
	`template_commit` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "projects_current_stage_check" CHECK("projects"."current_stage" in ('stage2', 'stage3', 'stage4', 'stage5', 'stage6', 'review2', 'stage7', 'export')),
	CONSTRAINT "projects_profile_choice_check" CHECK("projects"."profile_choice" in ('A', 'A_with_seo_mitigation', 'postpone'))
);
--> statement-breakpoint
CREATE TABLE `stage_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`stage` text NOT NULL,
	`attempt` integer NOT NULL,
	`prompt_version` text NOT NULL,
	`status` text NOT NULL,
	`output_raw` text,
	`output_json` text,
	`errors_json` text,
	`input_tokens` integer,
	`output_tokens` integer,
	`cost_estimate_usd` real,
	`duration_ms` integer,
	`is_current` integer NOT NULL,
	`created_at` text NOT NULL,
	`finished_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "stage_runs_stage_check" CHECK("stage_runs"."stage" in ('stage2', 'stage3', 'stage4', 'stage5', 'stage6', 'review2', 'stage7')),
	CONSTRAINT "stage_runs_status_check" CHECK("stage_runs"."status" in ('succeeded', 'failed')),
	CONSTRAINT "stage_runs_attempt_check" CHECK("stage_runs"."attempt" >= 1),
	CONSTRAINT "stage_runs_is_current_check" CHECK("stage_runs"."is_current" in (0, 1))
);
--> statement-breakpoint
CREATE INDEX `stage_runs_project_stage_idx` ON `stage_runs` (`project_id`,`stage`);--> statement-breakpoint
CREATE UNIQUE INDEX `stage_runs_one_current_idx` ON `stage_runs` (`project_id`,`stage`) WHERE "stage_runs"."is_current" = 1;