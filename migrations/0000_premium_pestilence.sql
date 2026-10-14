CREATE TABLE `activity` (
	`id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`project` text,
	`title` text DEFAULT '' NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `activity_project_idx` ON `activity` (`project`);--> statement-breakpoint
CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`project` text,
	`title` text DEFAULT '' NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `comments_project_idx` ON `comments` (`project`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`project` text,
	`title` text DEFAULT '' NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `events_project_idx` ON `events` (`project`);--> statement-breakpoint
CREATE TABLE `files` (
	`id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`project` text,
	`title` text DEFAULT '' NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `files_project_idx` ON `files` (`project`);--> statement-breakpoint
CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`project` text,
	`title` text DEFAULT '' NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `members_project_idx` ON `members` (`project`);--> statement-breakpoint
CREATE TABLE `notifs` (
	`id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`project` text,
	`title` text DEFAULT '' NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `notifs_project_idx` ON `notifs` (`project`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`project` text,
	`title` text DEFAULT '' NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `projects_project_idx` ON `projects` (`project`);--> statement-breakpoint
CREATE TABLE `savedViews` (
	`id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`project` text,
	`title` text DEFAULT '' NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `savedViews_project_idx` ON `savedViews` (`project`);--> statement-breakpoint
CREATE TABLE `settings` (
	`id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`project` text,
	`title` text DEFAULT '' NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `settings_project_idx` ON `settings` (`project`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`project` text,
	`title` text DEFAULT '' NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `tasks_project_idx` ON `tasks` (`project`);--> statement-breakpoint
CREATE TABLE `teams` (
	`id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`project` text,
	`title` text DEFAULT '' NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `teams_project_idx` ON `teams` (`project`);--> statement-breakpoint
CREATE TABLE `workspace` (
	`id` integer PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`last_commit` text DEFAULT '' NOT NULL
);
