CREATE TABLE `maintenance` (
	`id` text PRIMARY KEY NOT NULL,
	`created_by` text NOT NULL,
	`payload_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`date` text NOT NULL,
	`mileage` real NOT NULL,
	`item` text NOT NULL,
	`detail` text NOT NULL,
	`vendor` text NOT NULL,
	`cost` integer NOT NULL,
	`next_mileage` real,
	`note` text NOT NULL,
	`next_date` text NOT NULL,
	`receipt_url` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `maintenance_date_idx` ON `maintenance` (`date`,`created_at`);--> statement-breakpoint
CREATE TABLE `trips` (
	`id` text PRIMARY KEY NOT NULL,
	`created_by` text NOT NULL,
	`payload_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`date` text NOT NULL,
	`driver` text NOT NULL,
	`route` text NOT NULL,
	`purpose` text NOT NULL,
	`start_km` real NOT NULL,
	`end_km` real NOT NULL,
	`type` text NOT NULL,
	`expense` integer NOT NULL,
	`expense_detail` text NOT NULL,
	`note` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `trips_date_idx` ON `trips` (`date`,`created_at`);--> statement-breakpoint
CREATE TABLE `vehicle_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`model` text NOT NULL,
	`plate` text NOT NULL,
	`owner` text NOT NULL,
	`maintenance_items` text NOT NULL,
	`updated_at` integer NOT NULL
);
