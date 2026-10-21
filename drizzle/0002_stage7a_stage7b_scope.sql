PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_stage_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`stage` text NOT NULL,
	`scope` text,
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
	CONSTRAINT "stage_runs_stage_check" CHECK("__new_stage_runs"."stage" in ('stage2', 'stage3', 'stage4', 'stage5', 'stage6', 'review2', 'stage7a', 'stage7b')),
	CONSTRAINT "stage_runs_status_check" CHECK("__new_stage_runs"."status" in ('succeeded', 'failed')),
	CONSTRAINT "stage_runs_attempt_check" CHECK("__new_stage_runs"."attempt" >= 1),
	CONSTRAINT "stage_runs_is_current_check" CHECK("__new_stage_runs"."is_current" in (0, 1))
);
--> statement-breakpoint
-- Disunting dari hasil drizzle-kit (T-026): tabel lama belum punya `scope`, dan `stage7` tidak lagi
-- diizinkan. Run `stage7` lama (TASKS utuh dalam satu pemanggilan) menjadi `stage7b` tanpa scope dan
-- tidak berlaku, sehingga tahap 7 harus dijalankan ulang dengan 7a + 7b; dokumen TASKS-nya tetap ada.
INSERT INTO `__new_stage_runs`("id", "project_id", "stage", "scope", "attempt", "prompt_version", "status", "output_raw", "output_json", "errors_json", "input_tokens", "output_tokens", "cost_estimate_usd", "duration_ms", "is_current", "created_at", "finished_at") SELECT "id", "project_id", CASE "stage" WHEN 'stage7' THEN 'stage7b' ELSE "stage" END, NULL, "attempt", "prompt_version", "status", "output_raw", "output_json", "errors_json", "input_tokens", "output_tokens", "cost_estimate_usd", "duration_ms", CASE "stage" WHEN 'stage7' THEN 0 ELSE "is_current" END, "created_at", "finished_at" FROM `stage_runs`;--> statement-breakpoint
DROP TABLE `stage_runs`;--> statement-breakpoint
ALTER TABLE `__new_stage_runs` RENAME TO `stage_runs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `stage_runs_project_stage_idx` ON `stage_runs` (`project_id`,`stage`);--> statement-breakpoint
-- Disunting: drizzle-kit 0.31 salah mengutip ekspresi `ifnull` di indeks.
CREATE UNIQUE INDEX `stage_runs_one_current_idx` ON `stage_runs` (`project_id`,`stage`,ifnull("scope", '')) WHERE "stage_runs"."is_current" = 1;
