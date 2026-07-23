CREATE TABLE `chapters` (
	`id` text PRIMARY KEY NOT NULL,
	`story_id` text NOT NULL,
	`source_item_id` text,
	`number` real NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`language` text DEFAULT 'vi' NOT NULL,
	`page_count` integer DEFAULT 0 NOT NULL,
	`published_at` text,
	`external_url` text NOT NULL,
	FOREIGN KEY (`story_id`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_item_id`) REFERENCES `source_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `chapters_story_number_idx` ON `chapters` (`story_id`,`number`);--> statement-breakpoint
CREATE TABLE `genres` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `genres_slug_unique` ON `genres` (`slug`);--> statement-breakpoint
CREATE TABLE `library_entries` (
	`profile_id` text NOT NULL,
	`story_id` text NOT NULL,
	`status` text NOT NULL,
	`followed` integer DEFAULT false NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`profile_id`, `story_id`),
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`story_id`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `library_profile_status_idx` ON `library_entries` (`profile_id`,`status`);--> statement-breakpoint
CREATE TABLE `profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`email_hash` text NOT NULL,
	`display_name` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profiles_email_hash_unique` ON `profiles` (`email_hash`);--> statement-breakpoint
CREATE TABLE `rating_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`story_id` text NOT NULL,
	`source_id` text NOT NULL,
	`score_5` real NOT NULL,
	`vote_count` integer DEFAULT 0 NOT NULL,
	`captured_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`source_url` text NOT NULL,
	FOREIGN KEY (`story_id`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `reading_progress` (
	`profile_id` text NOT NULL,
	`story_id` text NOT NULL,
	`chapter_id` text NOT NULL,
	`page` integer DEFAULT 0 NOT NULL,
	`progress` real DEFAULT 0 NOT NULL,
	`idempotency_key` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`profile_id`, `story_id`),
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`story_id`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `progress_idempotency_idx` ON `reading_progress` (`idempotency_key`);--> statement-breakpoint
CREATE TABLE `source_items` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`story_id` text NOT NULL,
	`external_id` text NOT NULL,
	`external_url` text NOT NULL,
	`etag` text,
	`source_updated_at` text,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`story_id`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `source_items_external_idx` ON `source_items` (`source_id`,`external_id`);--> statement-breakpoint
CREATE TABLE `sources` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`base_url` text NOT NULL,
	`kind` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`license_mode` text NOT NULL,
	`last_sync_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sources_slug_unique` ON `sources` (`slug`);--> statement-breakpoint
CREATE TABLE `stories` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`canonical_title` text NOT NULL,
	`synopsis` text DEFAULT '' NOT NULL,
	`author` text,
	`status` text DEFAULT 'ongoing' NOT NULL,
	`origin` text,
	`content_rating` text DEFAULT 'safe' NOT NULL,
	`cover_url` text,
	`latest_chapter` real,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stories_slug_unique` ON `stories` (`slug`);--> statement-breakpoint
CREATE INDEX `stories_updated_idx` ON `stories` (`updated_at`);--> statement-breakpoint
CREATE INDEX `stories_status_idx` ON `stories` (`status`);--> statement-breakpoint
CREATE TABLE `story_genres` (
	`story_id` text NOT NULL,
	`genre_id` text NOT NULL,
	`origin` text NOT NULL,
	`confidence` real DEFAULT 1 NOT NULL,
	PRIMARY KEY(`story_id`, `genre_id`),
	FOREIGN KEY (`story_id`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`genre_id`) REFERENCES `genres`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `story_scores` (
	`story_id` text PRIMARY KEY NOT NULL,
	`score_5` real,
	`confidence` text DEFAULT 'insufficient' NOT NULL,
	`source_count` integer DEFAULT 0 NOT NULL,
	`vote_count` integer DEFAULT 0 NOT NULL,
	`computed_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`story_id`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sync_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`status` text NOT NULL,
	`cursor` text,
	`imported` integer DEFAULT 0 NOT NULL,
	`updated` integer DEFAULT 0 NOT NULL,
	`failed` integer DEFAULT 0 NOT NULL,
	`started_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`finished_at` text,
	`error_summary` text,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE no action
);
