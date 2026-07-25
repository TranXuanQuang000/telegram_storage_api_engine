ALTER TABLE `stories` ADD `medium` text DEFAULT 'comic' NOT NULL;
--> statement-breakpoint
ALTER TABLE `stories` ADD `latest_chapter_label` text;
--> statement-breakpoint
ALTER TABLE `stories` ADD `latest_chapter_id` text;
--> statement-breakpoint
CREATE INDEX `stories_medium_updated_idx` ON `stories` (`medium`, `updated_at`);
--> statement-breakpoint
ALTER TABLE `reading_progress` ADD `chapter_name` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `reading_progress` ADD `total_pages` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `reading_progress` ADD `story_title` text;
--> statement-breakpoint
ALTER TABLE `reading_progress` ADD `cover_url` text;
--> statement-breakpoint
ALTER TABLE `reading_progress` ADD `medium` text DEFAULT 'comic' NOT NULL;
--> statement-breakpoint
ALTER TABLE `reading_progress` ADD `locator` text;
