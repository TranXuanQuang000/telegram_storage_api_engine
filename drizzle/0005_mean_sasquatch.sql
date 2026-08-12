CREATE TABLE `chapter_pages` (
	`chapter_id` text NOT NULL,
	`page_index` integer NOT NULL,
	`image_url` text NOT NULL,
	`fetched_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`chapter_id`, `page_index`),
	FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE cascade
);
