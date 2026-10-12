CREATE TABLE `submission_keys` (
	`submission_key` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL
);
