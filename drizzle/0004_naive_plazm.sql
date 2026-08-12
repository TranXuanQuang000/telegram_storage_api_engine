CREATE INDEX `chapters_source_item_number_idx` ON `chapters` (`source_item_id`,`number`);--> statement-breakpoint
CREATE INDEX `source_items_story_source_idx` ON `source_items` (`story_id`,`source_id`);--> statement-breakpoint
CREATE INDEX `sync_runs_source_status_finished_idx` ON `sync_runs` (`source_id`,`status`,`finished_at`);