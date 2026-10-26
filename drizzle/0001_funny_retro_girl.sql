CREATE TABLE IF NOT EXISTS `discord_membership` (
	`user_id` text NOT NULL,
	`guild_id` text NOT NULL,
	`discord_id` text NOT NULL,
	`member` integer DEFAULT false NOT NULL,
	`roles` text DEFAULT '[]' NOT NULL,
	`verified_at` integer,
	`last_checked_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`user_id`, `guild_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `discord_membership_discord_idx` ON `discord_membership` (`discord_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `discord_j4r_claim` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`discord_id` text NOT NULL,
	`guild_id` text NOT NULL,
	`reward_coins` integer DEFAULT 0 NOT NULL,
	`claimed_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `discord_j4r_claim_user_guild_idx` ON `discord_j4r_claim` (`user_id`,`guild_id`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `discord_j4r_claim_discord_guild_idx` ON `discord_j4r_claim` (`discord_id`,`guild_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `inviters` (
	`discord_id` text PRIMARY KEY NOT NULL,
	`current_invite_count` integer DEFAULT 0 NOT NULL,
	`total_lifetime_invites` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `invited_users` (
	`discord_id` text PRIMARY KEY NOT NULL,
	`inviter_id` text NOT NULL,
	`guild_id` text DEFAULT '' NOT NULL,
	`joined_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`account_created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`counted` integer DEFAULT false NOT NULL,
	`still_in_server` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`inviter_id`) REFERENCES `inviters`(`discord_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `invited_users_inviter_idx` ON `invited_users` (`inviter_id`,`counted`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `invited_users_guild_idx` ON `invited_users` (`guild_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `discord_invite_claim` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`inviter_id` text NOT NULL,
	`invite_count` integer NOT NULL,
	`reward_coins` integer DEFAULT 0 NOT NULL,
	`claimed_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `discord_invite_claim_user_idx` ON `discord_invite_claim` (`user_id`,`claimed_at`);
