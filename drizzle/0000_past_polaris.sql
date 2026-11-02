CREATE TABLE `panel_account` (
	`user_id` text PRIMARY KEY NOT NULL,
	`panel_user_id` text NOT NULL,
	`panel_email` text NOT NULL,
	`linked_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `panel_account_panel_user_id_unique` ON `panel_account` (`panel_user_id`);--> statement-breakpoint
CREATE TABLE `task` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`priority` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_userId_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	`impersonated_by` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_userId_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`role` text,
	`banned` integer DEFAULT false,
	`ban_reason` text,
	`ban_expires` integer,
	`stripe_customer_id` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `activity_log` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`action` text NOT NULL,
	`severity` text DEFAULT 'info' NOT NULL,
	`message` text NOT NULL,
	`metadata` text,
	`ip` text,
	`path` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `activity_log_created_at_idx` ON `activity_log` (`created_at`);--> statement-breakpoint
CREATE INDEX `activity_log_user_id_idx` ON `activity_log` (`user_id`);--> statement-breakpoint
CREATE TABLE `afk_session` (
	`user_id` text PRIMARY KEY NOT NULL,
	`last_ping_at` integer,
	`pending_seconds` integer DEFAULT 0 NOT NULL,
	`earned_today` integer DEFAULT 0 NOT NULL,
	`day` text DEFAULT '' NOT NULL,
	`total_earned` integer DEFAULT 0 NOT NULL,
	`strikes` integer DEFAULT 0 NOT NULL,
	`cooldown_until` integer,
	`last_session_id` text,
	`last_seq` integer DEFAULT 0 NOT NULL,
	`last_client_ip` text,
	`last_user_agent` text,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `credit_account` (
	`user_id` text PRIMARY KEY NOT NULL,
	`balance` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `credit_topup_option` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`badge` text DEFAULT '' NOT NULL,
	`credits` integer NOT NULL,
	`price_cents` integer NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `credit_topup_option_sort_idx` ON `credit_topup_option` (`sort_order`,`created_at`);--> statement-breakpoint
CREATE TABLE `credit_transaction` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`amount` integer NOT NULL,
	`balance_after` integer NOT NULL,
	`kind` text NOT NULL,
	`reference` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`metadata` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `credit_transaction_reference_unique` ON `credit_transaction` (`reference`);--> statement-breakpoint
CREATE INDEX `credit_transaction_user_idx` ON `credit_transaction` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `credit_transaction_created_idx` ON `credit_transaction` (`created_at`);--> statement-breakpoint
CREATE TABLE `discord_invite_claim` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`inviter_id` text NOT NULL,
	`invite_count` integer NOT NULL,
	`reward_coins` integer DEFAULT 0 NOT NULL,
	`claimed_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `discord_invite_claim_user_idx` ON `discord_invite_claim` (`user_id`,`claimed_at`);--> statement-breakpoint
CREATE TABLE `discord_j4r_claim` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`discord_id` text NOT NULL,
	`guild_id` text NOT NULL,
	`reward_coins` integer DEFAULT 0 NOT NULL,
	`claimed_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `discord_j4r_claim_user_guild_idx` ON `discord_j4r_claim` (`user_id`,`guild_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `discord_j4r_claim_discord_guild_idx` ON `discord_j4r_claim` (`discord_id`,`guild_id`);--> statement-breakpoint
CREATE TABLE `discord_membership` (
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
CREATE INDEX `discord_membership_discord_idx` ON `discord_membership` (`discord_id`);--> statement-breakpoint
CREATE TABLE `discord_profile` (
	`user_id` text PRIMARY KEY NOT NULL,
	`discord_id` text NOT NULL,
	`username` text DEFAULT '' NOT NULL,
	`guild_id` text DEFAULT '' NOT NULL,
	`member` integer DEFAULT false NOT NULL,
	`roles` text DEFAULT '[]' NOT NULL,
	`verified_at` integer,
	`last_checked_at` integer,
	`j4r_claimed_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `earn_task` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`url` text NOT NULL,
	`provider` text DEFAULT 'linkvertise' NOT NULL,
	`reward` integer DEFAULT 0 NOT NULL,
	`cooldown_hours` integer DEFAULT 24 NOT NULL,
	`min_seconds` integer DEFAULT 15 NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `earn_task_enabled_idx` ON `earn_task` (`enabled`,`sort_order`);--> statement-breakpoint
CREATE TABLE `earn_task_completion` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`user_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`token` text,
	`verified_at` integer,
	`started_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`completed_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `earn_task`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `earn_task_completion_user_idx` ON `earn_task_completion` (`user_id`,`task_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `earn_task_completion_token_idx` ON `earn_task_completion` (`token`);--> statement-breakpoint
CREATE TABLE `error_log` (
	`id` text PRIMARY KEY NOT NULL,
	`fingerprint` text NOT NULL,
	`reference` text NOT NULL,
	`user_id` text,
	`status` integer DEFAULT 500 NOT NULL,
	`method` text,
	`path` text,
	`message` text NOT NULL,
	`stack` text,
	`metadata` text,
	`count` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`last_seen` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `error_log_fingerprint_unique` ON `error_log` (`fingerprint`);--> statement-breakpoint
CREATE UNIQUE INDEX `error_log_reference_unique` ON `error_log` (`reference`);--> statement-breakpoint
CREATE INDEX `error_log_created_at_idx` ON `error_log` (`created_at`);--> statement-breakpoint
CREATE INDEX `error_log_last_seen_idx` ON `error_log` (`last_seen`);--> statement-breakpoint
CREATE TABLE `invited_users` (
	`discord_id` text PRIMARY KEY NOT NULL,
	`inviter_id` text NOT NULL,
	`guild_id` text DEFAULT '' NOT NULL,
	`joined_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`account_created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`counted` integer DEFAULT false NOT NULL,
	`still_in_server` integer DEFAULT true NOT NULL,
	`rewarded_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`inviter_id`) REFERENCES `inviters`(`discord_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `invited_users_inviter_idx` ON `invited_users` (`inviter_id`,`counted`);--> statement-breakpoint
CREATE INDEX `invited_users_guild_idx` ON `invited_users` (`guild_id`);--> statement-breakpoint
CREATE TABLE `inviters` (
	`discord_id` text PRIMARY KEY NOT NULL,
	`current_invite_count` integer DEFAULT 0 NOT NULL,
	`total_lifetime_invites` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notification_log` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`url` text,
	`read_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notification_log_user_idx` ON `notification_log` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `notification_log_created_idx` ON `notification_log` (`created_at`);--> statement-breakpoint
CREATE TABLE `referral` (
	`id` text PRIMARY KEY NOT NULL,
	`inviter_id` text NOT NULL,
	`invitee_id` text NOT NULL,
	`code` text NOT NULL,
	`reward_coins` integer DEFAULT 0 NOT NULL,
	`reward_cpu` integer DEFAULT 0 NOT NULL,
	`reward_memory` integer DEFAULT 0 NOT NULL,
	`reward_disk` integer DEFAULT 0 NOT NULL,
	`reward_server_slots` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`inviter_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invitee_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `referral_invitee_id_unique` ON `referral` (`invitee_id`);--> statement-breakpoint
CREATE INDEX `referral_inviter_idx` ON `referral` (`inviter_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `referral_profile` (
	`user_id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `referral_profile_code_unique` ON `referral_profile` (`code`);--> statement-breakpoint
CREATE TABLE `server_billing` (
	`id` text PRIMARY KEY NOT NULL,
	`server_id` text NOT NULL,
	`user_id` text NOT NULL,
	`storefront_item_id` text,
	`interval_days` integer DEFAULT 30 NOT NULL,
	`base_renewal_price` integer DEFAULT 0 NOT NULL,
	`renewal_price` integer DEFAULT 0 NOT NULL,
	`next_renewal_at` integer NOT NULL,
	`auto_renew` integer DEFAULT true NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`suspended_at` integer,
	`delete_at` integer,
	`last_renewed_at` integer,
	`last_notified_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`storefront_item_id`) REFERENCES `storefront_item`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `server_billing_server_id_unique` ON `server_billing` (`server_id`);--> statement-breakpoint
CREATE INDEX `server_billing_renewal_idx` ON `server_billing` (`next_renewal_at`);--> statement-breakpoint
CREATE INDEX `server_billing_user_idx` ON `server_billing` (`user_id`);--> statement-breakpoint
CREATE INDEX `server_billing_status_idx` ON `server_billing` (`status`);--> statement-breakpoint
CREATE TABLE `server_entitlement` (
	`id` text PRIMARY KEY NOT NULL,
	`server_id` text NOT NULL,
	`user_id` text NOT NULL,
	`storefront_item_id` text,
	`cpu` integer DEFAULT 0 NOT NULL,
	`memory` integer DEFAULT 0 NOT NULL,
	`disk` integer DEFAULT 0 NOT NULL,
	`renewal_price` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`removed_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`storefront_item_id`) REFERENCES `storefront_item`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `server_entitlement_server_idx` ON `server_entitlement` (`server_id`);--> statement-breakpoint
CREATE INDEX `server_entitlement_user_idx` ON `server_entitlement` (`user_id`);--> statement-breakpoint
CREATE TABLE `software_setting` (
	`key` text PRIMARY KEY NOT NULL,
	`group_id` integer NOT NULL,
	`software_id` integer,
	`visible` integer DEFAULT true NOT NULL,
	`min_cpu` integer,
	`max_cpu` integer,
	`min_memory` integer,
	`max_memory` integer,
	`min_disk` integer,
	`max_disk` integer,
	`editable_variables` text DEFAULT '[]' NOT NULL,
	`docker_image` text DEFAULT '' NOT NULL,
	`startup_command` text DEFAULT '' NOT NULL,
	`environment` text DEFAULT '{}' NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `software_setting_group_idx` ON `software_setting` (`group_id`);--> statement-breakpoint
CREATE INDEX `software_setting_software_idx` ON `software_setting` (`software_id`);--> statement-breakpoint
CREATE TABLE `storefront_item` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`icon` text DEFAULT 'package' NOT NULL,
	`kind` text DEFAULT 'server' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`once_per_user` integer DEFAULT true NOT NULL,
	`price` integer DEFAULT 0 NOT NULL,
	`renewal_price` integer DEFAULT 0 NOT NULL,
	`duration_days` integer DEFAULT 30 NOT NULL,
	`renewable` integer DEFAULT true NOT NULL,
	`stackable` integer DEFAULT true NOT NULL,
	`removable` integer DEFAULT false NOT NULL,
	`cpu` integer NOT NULL,
	`memory` integer NOT NULL,
	`disk` integer NOT NULL,
	`node` text DEFAULT '' NOT NULL,
	`software_group` integer,
	`software` integer,
	`success_mode` text DEFAULT 'console' NOT NULL,
	`success_url` text DEFAULT '' NOT NULL,
	`success_message` text DEFAULT '' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `storefront_item_sort_idx` ON `storefront_item` (`sort_order`,`created_at`);--> statement-breakpoint
CREATE TABLE `storefront_redemption` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`user_id` text NOT NULL,
	`server_id` text,
	`status` text DEFAULT 'completed' NOT NULL,
	`message` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `storefront_item`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `storefront_redemption_item_idx` ON `storefront_redemption` (`item_id`);--> statement-breakpoint
CREATE INDEX `storefront_redemption_user_idx` ON `storefront_redemption` (`user_id`);--> statement-breakpoint
CREATE TABLE `user_quota` (
	`user_id` text PRIMARY KEY NOT NULL,
	`cpu` integer,
	`memory` integer,
	`disk` integer,
	`max_servers` integer,
	`max_databases` integer,
	`max_allocations` integer,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `voucher` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`kind` text DEFAULT 'credits' NOT NULL,
	`credits` integer DEFAULT 0 NOT NULL,
	`cpu` integer DEFAULT 0 NOT NULL,
	`memory` integer DEFAULT 0 NOT NULL,
	`disk` integer DEFAULT 0 NOT NULL,
	`max_uses` integer DEFAULT 0 NOT NULL,
	`used_count` integer DEFAULT 0 NOT NULL,
	`expires_at` integer,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `voucher_code_unique` ON `voucher` (`code`);--> statement-breakpoint
CREATE INDEX `voucher_enabled_idx` ON `voucher` (`enabled`);--> statement-breakpoint
CREATE TABLE `voucher_redemption` (
	`id` text PRIMARY KEY NOT NULL,
	`voucher_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`voucher_id`) REFERENCES `voucher`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `voucher_redemption_voucher_user_idx` ON `voucher_redemption` (`voucher_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `voucher_redemption_user_idx` ON `voucher_redemption` (`user_id`);