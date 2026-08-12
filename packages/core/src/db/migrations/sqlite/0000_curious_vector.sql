CREATE TABLE `conflicting_files` (
	`id` text PRIMARY KEY NOT NULL,
	`horizon_item_id` text NOT NULL,
	`path` text NOT NULL,
	`blocked_by_session_id` text,
	`blocked_by_ticket_id` text,
	`estimated_unlock_minutes` integer
);
--> statement-breakpoint
CREATE TABLE `horizon_items` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`zone` text DEFAULT 'DIRECTIONAL' NOT NULL,
	`repo` text NOT NULL,
	`complexity` text,
	`priority` integer DEFAULT 0 NOT NULL,
	`linear_ticket_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `in_flight_files` (
	`id` text PRIMARY KEY NOT NULL,
	`path` text NOT NULL,
	`active_session_id` text NOT NULL,
	`linear_ticket_id` text NOT NULL,
	`estimated_minutes_remaining` integer DEFAULT 30 NOT NULL,
	`horizon_item_id` text,
	`locked_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `plans` (
	`id` text PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`horizon_item_id` text NOT NULL,
	`estimated_cost_usd` real NOT NULL,
	`baseline_cost_usd` real NOT NULL,
	`acceptance_criteria` text NOT NULL,
	`confidence_signals` text NOT NULL,
	`fleet_context_snapshot` text NOT NULL,
	`memory_sessions_used` text DEFAULT '[]',
	`previous_plan_id` text,
	`generated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`model` text DEFAULT 'SONNET' NOT NULL,
	`model_override` text,
	`complexity` text NOT NULL,
	`estimated_cost_usd` real NOT NULL,
	`file_paths` text NOT NULL,
	`conflict_warning` text,
	`depends_on` text DEFAULT '[]',
	`order_index` integer DEFAULT 0 NOT NULL,
	`workstream_id` text,
	`plan_id` text
);
--> statement-breakpoint
CREATE TABLE `touched_files` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`path` text NOT NULL,
	`status` text DEFAULT 'AVAILABLE' NOT NULL,
	`in_flight_via` text
);
--> statement-breakpoint
CREATE TABLE `workstreams` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`label` text NOT NULL,
	`repo` text NOT NULL,
	`worker_count` integer DEFAULT 1 NOT NULL,
	`order_index` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `completed_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`label` text NOT NULL,
	`model` text,
	`duration_minutes` integer,
	`completed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ruflo_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`repo` text NOT NULL,
	`linear_ticket_id` text NOT NULL,
	`ticket_title` text NOT NULL,
	`current_workstream` text DEFAULT 'Main' NOT NULL,
	`progress_percent` integer DEFAULT 0 NOT NULL,
	`elapsed_minutes` integer DEFAULT 0 NOT NULL,
	`estimated_remaining_minutes` integer DEFAULT 30 NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`in_flight_files` text DEFAULT '[]',
	`pr_url` text,
	`external_session_id` text,
	`orchestrator_mode` text,
	`tokens_used` integer,
	`cost_usd` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `conductor_scores` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`total` integer DEFAULT 500 NOT NULL,
	`fleet_utilization` integer DEFAULT 100 NOT NULL,
	`runway_health` integer DEFAULT 100 NOT NULL,
	`plan_accuracy` integer DEFAULT 100 NOT NULL,
	`cost_efficiency` integer DEFAULT 100 NOT NULL,
	`velocity_trend` integer DEFAULT 100 NOT NULL,
	`leaderboard_rank` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `score_history` (
	`id` text PRIMARY KEY NOT NULL,
	`score_id` text NOT NULL,
	`total` integer NOT NULL,
	`fleet_utilization` integer NOT NULL,
	`runway_health` integer NOT NULL,
	`plan_accuracy` integer NOT NULL,
	`cost_efficiency` integer NOT NULL,
	`velocity_trend` integer NOT NULL,
	`recorded_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `activity_events` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`message` text NOT NULL,
	`repo` text,
	`ticket_id` text,
	`metadata` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `dependency_edges` (
	`id` text PRIMARY KEY NOT NULL,
	`wave_plan_id` text NOT NULL,
	`from_task_code` text NOT NULL,
	`to_task_code` text NOT NULL,
	`edge_type` text DEFAULT 'hard' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `wave_plan_metrics` (
	`id` text PRIMARY KEY NOT NULL,
	`wave_plan_id` text NOT NULL,
	`total_wall_clock_ms` integer,
	`theoretical_min_ms` integer,
	`parallelization_efficiency` real,
	`waves_executed` integer DEFAULT 0 NOT NULL,
	`tasks_completed` integer DEFAULT 0 NOT NULL,
	`tasks_failed` integer DEFAULT 0 NOT NULL,
	`tasks_retried` integer DEFAULT 0 NOT NULL,
	`avg_task_duration_ms` integer,
	`max_wave_wait_ms` integer,
	`file_conflicts_avoided` integer DEFAULT 0 NOT NULL,
	`re_optimization_count` integer DEFAULT 0 NOT NULL,
	`recorded_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `wave_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`horizon_item_id` text NOT NULL,
	`total_waves` integer NOT NULL,
	`total_tasks` integer NOT NULL,
	`max_parallelism` integer NOT NULL,
	`critical_path` text NOT NULL,
	`critical_path_length` integer NOT NULL,
	`parallelization_score` real NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`current_wave_index` integer DEFAULT 0 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`previous_wave_plan_id` text,
	`raw_markdown` text,
	`started_at` integer,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `wave_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`wave_id` text NOT NULL,
	`wave_plan_id` text NOT NULL,
	`task_id` text,
	`wave_index` integer NOT NULL,
	`task_code` text NOT NULL,
	`label` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`file_paths` text DEFAULT '[]' NOT NULL,
	`dependencies` text DEFAULT '[]' NOT NULL,
	`recommended_model` text,
	`complexity` text,
	`is_on_critical_path` integer DEFAULT false NOT NULL,
	`can_run_in_parallel` integer DEFAULT true NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`assigned_session_id` text,
	`started_at` integer,
	`completed_at` integer,
	`error_message` text,
	`completion_summary` text,
	`retry_count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `waves` (
	`id` text PRIMARY KEY NOT NULL,
	`wave_plan_id` text NOT NULL,
	`wave_index` integer NOT NULL,
	`label` text NOT NULL,
	`max_parallel_tasks` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`started_at` integer,
	`completed_at` integer
);
--> statement-breakpoint
CREATE TABLE `wiki_articles` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`category` text NOT NULL,
	`content` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`backlinks` text DEFAULT '[]',
	`source_ids` text DEFAULT '[]',
	`repo` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `wiki_log` (
	`id` text PRIMARY KEY NOT NULL,
	`action` text NOT NULL,
	`summary` text NOT NULL,
	`article_ids` text DEFAULT '[]',
	`source_ids` text DEFAULT '[]',
	`repo` text,
	`tokens_used` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `wiki_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`source_type` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`origin` text,
	`repo` text,
	`content_hash` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `palace_closets` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`summary` text NOT NULL,
	`drawer_ids` text DEFAULT '[]',
	`tier` integer DEFAULT 2 NOT NULL,
	`token_cost` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `palace_rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `palace_diary` (
	`id` text PRIMARY KEY NOT NULL,
	`wing_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`entry` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`wing_id`) REFERENCES `palace_wings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `palace_drawers` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`memory_type` text DEFAULT 'fact' NOT NULL,
	`label` text NOT NULL,
	`content` text NOT NULL,
	`aaak_content` text,
	`content_hash` text NOT NULL,
	`source_kind` text,
	`source_ref` text,
	`tags` text DEFAULT '[]',
	`salience` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `palace_rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `palace_halls` (
	`id` text PRIMARY KEY NOT NULL,
	`wing_id` text NOT NULL,
	`from_room_id` text NOT NULL,
	`to_room_id` text NOT NULL,
	`relation` text DEFAULT 'related_to' NOT NULL,
	`weight` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`wing_id`) REFERENCES `palace_wings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`from_room_id`) REFERENCES `palace_rooms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`to_room_id`) REFERENCES `palace_rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `palace_kg_triples` (
	`id` text PRIMARY KEY NOT NULL,
	`wing_id` text NOT NULL,
	`subject` text NOT NULL,
	`predicate` text NOT NULL,
	`object` text NOT NULL,
	`valid_from` integer NOT NULL,
	`valid_until` integer,
	`source_drawer_id` text,
	`confidence` integer DEFAULT 100 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`wing_id`) REFERENCES `palace_wings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `palace_rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`wing_id` text NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`topic` text NOT NULL,
	`description` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`wing_id`) REFERENCES `palace_wings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `palace_tunnels` (
	`id` text PRIMARY KEY NOT NULL,
	`from_room_id` text NOT NULL,
	`to_room_id` text NOT NULL,
	`reason` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`from_room_id`) REFERENCES `palace_rooms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`to_room_id`) REFERENCES `palace_rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `palace_wings` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`wing_type` text DEFAULT 'project' NOT NULL,
	`repo` text,
	`description` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plans_horizon_item_id_unique` ON `plans` (`horizon_item_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `conductor_scores_user_id_unique` ON `conductor_scores` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `wave_plan_metrics_wave_plan_id_unique` ON `wave_plan_metrics` (`wave_plan_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `wiki_articles_slug_unique` ON `wiki_articles` (`slug`);--> statement-breakpoint
CREATE INDEX `palace_closets_tier_idx` ON `palace_closets` (`tier`);--> statement-breakpoint
CREATE INDEX `palace_drawers_hash_idx` ON `palace_drawers` (`content_hash`);--> statement-breakpoint
CREATE INDEX `palace_drawers_room_idx` ON `palace_drawers` (`room_id`);--> statement-breakpoint
CREATE INDEX `palace_kg_sp_idx` ON `palace_kg_triples` (`subject`,`predicate`);--> statement-breakpoint
CREATE INDEX `palace_kg_wing_idx` ON `palace_kg_triples` (`wing_id`);--> statement-breakpoint
CREATE INDEX `palace_rooms_wing_slug_idx` ON `palace_rooms` (`wing_id`,`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `palace_wings_slug_unique` ON `palace_wings` (`slug`);