import { sql } from 'drizzle-orm';
import { db } from './index.ts';

let ready: Promise<void> | undefined;

const statements = [
	sql`CREATE TABLE IF NOT EXISTS user_quota (
		user_id TEXT PRIMARY KEY NOT NULL REFERENCES user(id) ON DELETE CASCADE,
		cpu INTEGER,
		memory INTEGER,
		disk INTEGER,
		max_servers INTEGER,
		max_databases INTEGER,
		max_allocations INTEGER,
		updated_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsecond') * 1000 AS INTEGER))
	)`,
	sql`CREATE TABLE IF NOT EXISTS activity_log (
		id TEXT PRIMARY KEY NOT NULL,
		user_id TEXT REFERENCES user(id) ON DELETE SET NULL,
		action TEXT NOT NULL,
		severity TEXT NOT NULL DEFAULT 'info',
		message TEXT NOT NULL,
		metadata TEXT,
		ip TEXT,
		path TEXT,
		created_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsecond') * 1000 AS INTEGER))
	)`,
	sql`CREATE INDEX IF NOT EXISTS activity_log_created_at_idx ON activity_log (created_at)`,
	sql`CREATE INDEX IF NOT EXISTS activity_log_user_id_idx ON activity_log (user_id)`,
	sql`CREATE TABLE IF NOT EXISTS error_log (
		id TEXT PRIMARY KEY NOT NULL,
		fingerprint TEXT NOT NULL UNIQUE,
		reference TEXT NOT NULL UNIQUE,
		user_id TEXT REFERENCES user(id) ON DELETE SET NULL,
		status INTEGER NOT NULL DEFAULT 500,
		method TEXT,
		path TEXT,
		message TEXT NOT NULL,
		stack TEXT,
		metadata TEXT,
		count INTEGER NOT NULL DEFAULT 1,
		created_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsecond') * 1000 AS INTEGER)),
		last_seen INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsecond') * 1000 AS INTEGER))
	)`,
	sql`CREATE INDEX IF NOT EXISTS error_log_created_at_idx ON error_log (created_at)`,
	sql`CREATE TABLE IF NOT EXISTS storefront_item (
		id TEXT PRIMARY KEY NOT NULL,
		name TEXT NOT NULL,
		description TEXT NOT NULL DEFAULT '',
		icon TEXT NOT NULL DEFAULT 'package',
		enabled INTEGER NOT NULL DEFAULT 1,
		once_per_user INTEGER NOT NULL DEFAULT 1,
		cpu INTEGER NOT NULL,
		memory INTEGER NOT NULL,
		disk INTEGER NOT NULL,
		node TEXT NOT NULL DEFAULT '',
		software_group INTEGER,
		software INTEGER,
		success_mode TEXT NOT NULL DEFAULT 'console',
		success_url TEXT NOT NULL DEFAULT '',
		success_message TEXT NOT NULL DEFAULT '',
		sort_order INTEGER NOT NULL DEFAULT 0,
		created_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsecond') * 1000 AS INTEGER)),
		updated_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsecond') * 1000 AS INTEGER))
	)`,
	sql`CREATE INDEX IF NOT EXISTS storefront_item_sort_idx ON storefront_item (sort_order, created_at)`,
	sql`CREATE TABLE IF NOT EXISTS software_setting (
		key TEXT PRIMARY KEY NOT NULL,
		group_id INTEGER NOT NULL,
		software_id INTEGER,
		visible INTEGER NOT NULL DEFAULT 1,
		min_cpu INTEGER,
		max_cpu INTEGER,
		min_memory INTEGER,
		max_memory INTEGER,
		min_disk INTEGER,
		max_disk INTEGER,
		editable_variables TEXT NOT NULL DEFAULT '[]',
		docker_image TEXT NOT NULL DEFAULT '',
		startup_command TEXT NOT NULL DEFAULT '',
		environment TEXT NOT NULL DEFAULT '{}',
		updated_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsecond') * 1000 AS INTEGER))
	)`,
	sql`CREATE INDEX IF NOT EXISTS software_setting_group_idx ON software_setting (group_id)`,
	sql`CREATE INDEX IF NOT EXISTS software_setting_software_idx ON software_setting (software_id)`,
	sql`CREATE TABLE IF NOT EXISTS storefront_redemption (
		id TEXT PRIMARY KEY NOT NULL,
		item_id TEXT NOT NULL REFERENCES storefront_item(id) ON DELETE CASCADE,
		user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
		server_id TEXT,
		status TEXT NOT NULL DEFAULT 'completed',
		message TEXT NOT NULL DEFAULT '',
		created_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsecond') * 1000 AS INTEGER))
	)`,
	sql`CREATE INDEX IF NOT EXISTS storefront_redemption_item_idx ON storefront_redemption (item_id)`,
	sql`CREATE INDEX IF NOT EXISTS storefront_redemption_user_idx ON storefront_redemption (user_id)`,
	sql`CREATE TABLE IF NOT EXISTS credit_account (
		user_id TEXT PRIMARY KEY NOT NULL REFERENCES user(id) ON DELETE CASCADE,
		balance INTEGER NOT NULL DEFAULT 0,
		updated_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsecond') * 1000 AS INTEGER))
	)`,
	sql`CREATE TABLE IF NOT EXISTS credit_transaction (
		id TEXT PRIMARY KEY NOT NULL,
		user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
		amount INTEGER NOT NULL,
		balance_after INTEGER NOT NULL,
		kind TEXT NOT NULL,
		reference TEXT NOT NULL UNIQUE,
		description TEXT NOT NULL DEFAULT '',
		metadata TEXT,
		created_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsecond') * 1000 AS INTEGER))
	)`,
	sql`CREATE INDEX IF NOT EXISTS credit_transaction_user_idx ON credit_transaction (user_id, created_at)`,
	sql`CREATE INDEX IF NOT EXISTS credit_transaction_created_idx ON credit_transaction (created_at)`,
	sql`CREATE TABLE IF NOT EXISTS credit_topup_option (
		id TEXT PRIMARY KEY NOT NULL,
		label TEXT NOT NULL,
		description TEXT NOT NULL DEFAULT '',
		badge TEXT NOT NULL DEFAULT '',
		credits INTEGER NOT NULL,
		price_cents INTEGER NOT NULL,
		enabled INTEGER NOT NULL DEFAULT 1,
		sort_order INTEGER NOT NULL DEFAULT 0,
		created_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsecond') * 1000 AS INTEGER)),
		updated_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsecond') * 1000 AS INTEGER))
	)`,
	sql`CREATE INDEX IF NOT EXISTS credit_topup_option_sort_idx ON credit_topup_option (sort_order, created_at)`,
	sql`CREATE TABLE IF NOT EXISTS server_billing (
		id TEXT PRIMARY KEY NOT NULL,
		server_id TEXT NOT NULL UNIQUE,
		user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
		storefront_item_id TEXT REFERENCES storefront_item(id) ON DELETE SET NULL,
		interval_days INTEGER NOT NULL DEFAULT 30,
		base_renewal_price INTEGER NOT NULL DEFAULT 0,
		renewal_price INTEGER NOT NULL DEFAULT 0,
		next_renewal_at INTEGER NOT NULL,
		auto_renew INTEGER NOT NULL DEFAULT 1,
		status TEXT NOT NULL DEFAULT 'active',
		suspended_at INTEGER,
		delete_at INTEGER,
		last_renewed_at INTEGER,
		last_notified_at INTEGER,
		created_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsecond') * 1000 AS INTEGER)),
		updated_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsecond') * 1000 AS INTEGER))
	)`,
	sql`CREATE INDEX IF NOT EXISTS server_billing_renewal_idx ON server_billing (next_renewal_at)`,
	sql`CREATE INDEX IF NOT EXISTS server_billing_user_idx ON server_billing (user_id)`,
	sql`CREATE INDEX IF NOT EXISTS server_billing_status_idx ON server_billing (status)`,
	sql`CREATE TABLE IF NOT EXISTS server_entitlement (
		id TEXT PRIMARY KEY NOT NULL,
		server_id TEXT NOT NULL,
		user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
		storefront_item_id TEXT REFERENCES storefront_item(id) ON DELETE SET NULL,
		cpu INTEGER NOT NULL DEFAULT 0,
		memory INTEGER NOT NULL DEFAULT 0,
		disk INTEGER NOT NULL DEFAULT 0,
		renewal_price INTEGER NOT NULL DEFAULT 0,
		active INTEGER NOT NULL DEFAULT 1,
		removed_at INTEGER,
		created_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsecond') * 1000 AS INTEGER))
	)`,
	sql`CREATE INDEX IF NOT EXISTS server_entitlement_server_idx ON server_entitlement (server_id)`,
	sql`CREATE INDEX IF NOT EXISTS server_entitlement_user_idx ON server_entitlement (user_id)`,
	sql`CREATE TABLE IF NOT EXISTS notification_log (
		id TEXT PRIMARY KEY NOT NULL,
		user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
		kind TEXT NOT NULL,
		title TEXT NOT NULL,
		body TEXT NOT NULL DEFAULT '',
		url TEXT,
		read_at INTEGER,
		created_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsecond') * 1000 AS INTEGER))
	)`,
	sql`CREATE INDEX IF NOT EXISTS notification_log_user_idx ON notification_log (user_id, created_at)`,
	sql`CREATE INDEX IF NOT EXISTS notification_log_created_idx ON notification_log (created_at)`,
	sql`CREATE TABLE IF NOT EXISTS afk_session (
		user_id TEXT PRIMARY KEY NOT NULL REFERENCES user(id) ON DELETE CASCADE,
		last_ping_at INTEGER,
		pending_seconds INTEGER NOT NULL DEFAULT 0,
		earned_today INTEGER NOT NULL DEFAULT 0,
		day TEXT NOT NULL DEFAULT '',
		total_earned INTEGER NOT NULL DEFAULT 0,
		strikes INTEGER NOT NULL DEFAULT 0,
		cooldown_until INTEGER,
		last_session_id TEXT,
		last_seq INTEGER NOT NULL DEFAULT 0,
		last_client_ip TEXT,
		last_user_agent TEXT,
		updated_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsecond') * 1000 AS INTEGER))
	)`,
	sql`CREATE TABLE IF NOT EXISTS earn_task (
		id TEXT PRIMARY KEY NOT NULL,
		title TEXT NOT NULL,
		description TEXT NOT NULL DEFAULT '',
		url TEXT NOT NULL,
		provider TEXT NOT NULL DEFAULT 'linkvertise',
		reward INTEGER NOT NULL DEFAULT 0,
		cooldown_hours INTEGER NOT NULL DEFAULT 24,
		min_seconds INTEGER NOT NULL DEFAULT 15,
		enabled INTEGER NOT NULL DEFAULT 1,
		sort_order INTEGER NOT NULL DEFAULT 0,
		created_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsecond') * 1000 AS INTEGER))
	)`,
	sql`CREATE INDEX IF NOT EXISTS earn_task_enabled_idx ON earn_task (enabled, sort_order)`,
	sql`CREATE TABLE IF NOT EXISTS earn_task_completion (
		id TEXT PRIMARY KEY NOT NULL,
		task_id TEXT NOT NULL REFERENCES earn_task(id) ON DELETE CASCADE,
		user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
		status TEXT NOT NULL DEFAULT 'pending',
		token TEXT,
		verified_at INTEGER,
		started_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsecond') * 1000 AS INTEGER)),
		completed_at INTEGER,
		created_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsecond') * 1000 AS INTEGER))
	)`,
	sql`CREATE INDEX IF NOT EXISTS earn_task_completion_user_idx ON earn_task_completion (user_id, task_id, created_at)`,
	sql`CREATE TABLE IF NOT EXISTS voucher (
		id TEXT PRIMARY KEY NOT NULL,
		code TEXT NOT NULL UNIQUE,
		description TEXT NOT NULL DEFAULT '',
		kind TEXT NOT NULL DEFAULT 'credits',
		credits INTEGER NOT NULL DEFAULT 0,
		cpu INTEGER NOT NULL DEFAULT 0,
		memory INTEGER NOT NULL DEFAULT 0,
		disk INTEGER NOT NULL DEFAULT 0,
		max_uses INTEGER NOT NULL DEFAULT 0,
		used_count INTEGER NOT NULL DEFAULT 0,
		expires_at INTEGER,
		enabled INTEGER NOT NULL DEFAULT 1,
		created_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsecond') * 1000 AS INTEGER))
	)`,
	sql`CREATE INDEX IF NOT EXISTS voucher_enabled_idx ON voucher (enabled)`,
	sql`CREATE TABLE IF NOT EXISTS voucher_redemption (
		id TEXT PRIMARY KEY NOT NULL,
		voucher_id TEXT NOT NULL REFERENCES voucher(id) ON DELETE CASCADE,
		user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
		created_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsecond') * 1000 AS INTEGER))
	)`,
	sql`CREATE UNIQUE INDEX IF NOT EXISTS voucher_redemption_voucher_user_idx ON voucher_redemption (voucher_id, user_id)`,
	sql`CREATE INDEX IF NOT EXISTS voucher_redemption_user_idx ON voucher_redemption (user_id)`,
	sql`CREATE TABLE IF NOT EXISTS referral_profile (
		user_id TEXT PRIMARY KEY NOT NULL REFERENCES user(id) ON DELETE CASCADE,
		code TEXT NOT NULL UNIQUE,
		created_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsecond') * 1000 AS INTEGER))
	)`,
	sql`CREATE TABLE IF NOT EXISTS referral (
		id TEXT PRIMARY KEY NOT NULL,
		inviter_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
		invitee_id TEXT NOT NULL UNIQUE REFERENCES user(id) ON DELETE CASCADE,
		code TEXT NOT NULL,
		reward_coins INTEGER NOT NULL DEFAULT 0,
		reward_cpu INTEGER NOT NULL DEFAULT 0,
		reward_memory INTEGER NOT NULL DEFAULT 0,
		reward_disk INTEGER NOT NULL DEFAULT 0,
		reward_server_slots INTEGER NOT NULL DEFAULT 0,
		created_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsecond') * 1000 AS INTEGER))
	)`,
	sql`CREATE INDEX IF NOT EXISTS referral_inviter_idx ON referral (inviter_id, created_at)`,
	sql`CREATE TABLE IF NOT EXISTS discord_profile (
		user_id TEXT PRIMARY KEY NOT NULL REFERENCES user(id) ON DELETE CASCADE,
		discord_id TEXT NOT NULL,
		username TEXT NOT NULL DEFAULT '',
		guild_id TEXT NOT NULL DEFAULT '',
		member INTEGER NOT NULL DEFAULT 0,
		roles TEXT NOT NULL DEFAULT '[]',
		verified_at INTEGER,
		last_checked_at INTEGER,
		j4r_claimed_at INTEGER
	)`,
	sql`CREATE TABLE IF NOT EXISTS discord_membership (
		user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
		guild_id TEXT NOT NULL,
		discord_id TEXT NOT NULL,
		member INTEGER NOT NULL DEFAULT 0,
		roles TEXT NOT NULL DEFAULT '[]',
		verified_at INTEGER,
		last_checked_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsecond') * 1000 AS INTEGER)),
		PRIMARY KEY (user_id, guild_id)
	)`,
	sql`CREATE INDEX IF NOT EXISTS discord_membership_discord_idx ON discord_membership (discord_id)`,
	sql`CREATE TABLE IF NOT EXISTS discord_j4r_claim (
		id TEXT PRIMARY KEY NOT NULL,
		user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
		discord_id TEXT NOT NULL,
		guild_id TEXT NOT NULL,
		reward_coins INTEGER NOT NULL DEFAULT 0,
		claimed_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsecond') * 1000 AS INTEGER))
	)`,
	sql`CREATE UNIQUE INDEX IF NOT EXISTS discord_j4r_claim_user_guild_idx ON discord_j4r_claim (user_id, guild_id)`,
	sql`CREATE UNIQUE INDEX IF NOT EXISTS discord_j4r_claim_discord_guild_idx ON discord_j4r_claim (discord_id, guild_id)`,
	sql`CREATE TABLE IF NOT EXISTS inviters (
		discord_id TEXT PRIMARY KEY NOT NULL,
		current_invite_count INTEGER NOT NULL DEFAULT 0,
		total_lifetime_invites INTEGER NOT NULL DEFAULT 0,
		created_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsecond') * 1000 AS INTEGER)),
		updated_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsecond') * 1000 AS INTEGER))
	)`,
	sql`CREATE TABLE IF NOT EXISTS invited_users (
		discord_id TEXT PRIMARY KEY NOT NULL,
		inviter_id TEXT NOT NULL REFERENCES inviters(discord_id) ON DELETE CASCADE,
		guild_id TEXT NOT NULL DEFAULT '',
		joined_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsecond') * 1000 AS INTEGER)),
		account_created_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsecond') * 1000 AS INTEGER)),
		counted INTEGER NOT NULL DEFAULT 0,
		still_in_server INTEGER NOT NULL DEFAULT 1,
		rewarded_at INTEGER,
		created_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsecond') * 1000 AS INTEGER))
	)`,
	sql`CREATE INDEX IF NOT EXISTS invited_users_inviter_idx ON invited_users (inviter_id, counted)`,
	sql`CREATE INDEX IF NOT EXISTS invited_users_guild_idx ON invited_users (guild_id)`,
	sql`CREATE TABLE IF NOT EXISTS discord_invite_claim (
		id TEXT PRIMARY KEY NOT NULL,
		user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
		inviter_id TEXT NOT NULL,
		invite_count INTEGER NOT NULL,
		reward_coins INTEGER NOT NULL DEFAULT 0,
		claimed_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsecond') * 1000 AS INTEGER))
	)`,
	sql`CREATE INDEX IF NOT EXISTS discord_invite_claim_user_idx ON discord_invite_claim (user_id, claimed_at)`,
];

const migrateUserQuota = async () => {
	const columns = new Set(
		(
			await db.all<{ name: string }>(sql`SELECT name FROM pragma_table_info('user_quota')`)
		).map(({ name }) => name)
	);

	if (!columns.has('max_databases')) {
		await db.run(sql`ALTER TABLE user_quota ADD COLUMN max_databases INTEGER`);
	}
	if (!columns.has('max_allocations')) {
		await db.run(sql`ALTER TABLE user_quota ADD COLUMN max_allocations INTEGER`);
	}
};

const migrateStorefrontItems = async () => {
	const columns = new Set(
		(await db.all<{ name: string }>(sql`SELECT name FROM pragma_table_info('storefront_item')`)).map(
			({ name }) => name
		)
	);

	if (!columns.has('kind')) {
		await db.run(sql`ALTER TABLE storefront_item ADD COLUMN kind TEXT NOT NULL DEFAULT 'server'`);
	}
	if (!columns.has('price')) {
		await db.run(sql`ALTER TABLE storefront_item ADD COLUMN price INTEGER NOT NULL DEFAULT 0`);
	}
	if (!columns.has('renewal_price')) {
		await db.run(
			sql`ALTER TABLE storefront_item ADD COLUMN renewal_price INTEGER NOT NULL DEFAULT 0`
		);
	}
	if (!columns.has('duration_days')) {
		await db.run(
			sql`ALTER TABLE storefront_item ADD COLUMN duration_days INTEGER NOT NULL DEFAULT 30`
		);
	}
	if (!columns.has('renewable')) {
		await db.run(
			sql`ALTER TABLE storefront_item ADD COLUMN renewable INTEGER NOT NULL DEFAULT 1`
		);
	}
	if (!columns.has('stackable')) {
		await db.run(
			sql`ALTER TABLE storefront_item ADD COLUMN stackable INTEGER NOT NULL DEFAULT 1`
		);
	}
	if (!columns.has('removable')) {
		await db.run(
			sql`ALTER TABLE storefront_item ADD COLUMN removable INTEGER NOT NULL DEFAULT 0`
		);
	}
};

const migrateErrorLog = async () => {	const columns = new Set(
		(await db.all<{ name: string }>(sql`SELECT name FROM pragma_table_info('error_log')`)).map(
			({ name }) => name
		)
	);

	if (!columns.has('fingerprint')) {
		await db.run(sql`ALTER TABLE error_log ADD COLUMN fingerprint TEXT`);
	}
	if (!columns.has('count')) {
		await db.run(sql`ALTER TABLE error_log ADD COLUMN count INTEGER NOT NULL DEFAULT 1`);
	}
	if (!columns.has('last_seen')) {
		await db.run(sql`ALTER TABLE error_log ADD COLUMN last_seen INTEGER NOT NULL DEFAULT 0`);
	}

	await db.run(
		sql`UPDATE error_log SET fingerprint = 'legacy:' || id WHERE fingerprint IS NULL`
	);
	await db.run(
		sql`UPDATE error_log SET last_seen = created_at WHERE last_seen = 0 OR last_seen IS NULL`
	);
	await db.run(
		sql`CREATE UNIQUE INDEX IF NOT EXISTS error_log_fingerprint_idx ON error_log (fingerprint)`
	);
	await db.run(
		sql`CREATE INDEX IF NOT EXISTS error_log_last_seen_idx ON error_log (last_seen)`
	);
};

const migrateSoftwareSettings = async () => {
	const columns = new Set(
		(await db.all<{ name: string }>(sql`SELECT name FROM pragma_table_info('software_setting')`)).map(
			({ name }) => name
		)
	);

	if (!columns.has('docker_image')) {
		await db.run(sql`ALTER TABLE software_setting ADD COLUMN docker_image TEXT NOT NULL DEFAULT ''`);
	}
	if (!columns.has('startup_command')) {
		await db.run(
			sql`ALTER TABLE software_setting ADD COLUMN startup_command TEXT NOT NULL DEFAULT ''`
		);
	}
	if (!columns.has('environment')) {
		await db.run(sql`ALTER TABLE software_setting ADD COLUMN environment TEXT NOT NULL DEFAULT '{}'`);
	}
};

const migrateUsers = async () => {
	const columns = new Set(
		(await db.all<{ name: string }>(sql`SELECT name FROM pragma_table_info('user')`)).map(
			({ name }) => name
		)
	);

	if (!columns.has('stripe_customer_id')) {
		await db.run(sql`ALTER TABLE user ADD COLUMN stripe_customer_id TEXT`);
	}
};

const migrateDiscordJ4rClaims = async () => {
	await db.run(sql`
		INSERT OR IGNORE INTO discord_j4r_claim (id, user_id, discord_id, guild_id, reward_coins, claimed_at)
		SELECT lower(hex(randomblob(16))), user_id, discord_id, guild_id, 0, j4r_claimed_at
		FROM discord_profile
		WHERE j4r_claimed_at IS NOT NULL AND guild_id <> ''
	`);
};

const migrateInvitedUsers = async () => {
	const columns = new Set(
		(
			await db.all<{ name: string }>(
				sql`SELECT name FROM pragma_table_info('invited_users')`
			)
		).map(({ name }) => name)
	);

	if (!columns.has('rewarded_at')) {
		await db.run(sql`ALTER TABLE invited_users ADD COLUMN rewarded_at INTEGER`);
	}
};

const migrateEarnTaskCompletion = async () => {
	const columns = new Set(
		(
			await db.all<{ name: string }>(
				sql`SELECT name FROM pragma_table_info('earn_task_completion')`
			)
		).map(({ name }) => name)
	);

	if (!columns.has('token')) {
		await db.run(sql`ALTER TABLE earn_task_completion ADD COLUMN token TEXT`);
	}
	if (!columns.has('verified_at')) {
		await db.run(sql`ALTER TABLE earn_task_completion ADD COLUMN verified_at INTEGER`);
	}

	await db.run(
		sql`CREATE UNIQUE INDEX IF NOT EXISTS earn_task_completion_token_idx ON earn_task_completion (token)`
	);
};

const migrateAfkSession = async () => {
	const columns = new Set(
		(await db.all<{ name: string }>(sql`SELECT name FROM pragma_table_info('afk_session')`)).map(
			({ name }) => name
		)
	);

	if (!columns.has('strikes')) {
		await db.run(sql`ALTER TABLE afk_session ADD COLUMN strikes INTEGER NOT NULL DEFAULT 0`);
	}
	if (!columns.has('cooldown_until')) {
		await db.run(sql`ALTER TABLE afk_session ADD COLUMN cooldown_until INTEGER`);
	}
	if (!columns.has('last_session_id')) {
		await db.run(sql`ALTER TABLE afk_session ADD COLUMN last_session_id TEXT`);
	}
	if (!columns.has('last_seq')) {
		await db.run(sql`ALTER TABLE afk_session ADD COLUMN last_seq INTEGER NOT NULL DEFAULT 0`);
	}
	if (!columns.has('last_client_ip')) {
		await db.run(sql`ALTER TABLE afk_session ADD COLUMN last_client_ip TEXT`);
	}
	if (!columns.has('last_user_agent')) {
		await db.run(sql`ALTER TABLE afk_session ADD COLUMN last_user_agent TEXT`);
	}
};

export const ensureOperationalSchema = () => {
	if (!ready) {
		ready = (async () => {
			for (const statement of statements) {
				await db.run(statement);
			}

			await migrateUsers();
			await migrateUserQuota();
			await migrateStorefrontItems();
			await migrateErrorLog();
			await migrateSoftwareSettings();
			await migrateInvitedUsers();
			await migrateEarnTaskCompletion();
			await migrateAfkSession();
			await migrateDiscordJ4rClaims();
		})().catch((cause) => {
			ready = undefined;
			throw cause;
		});
	}

	return ready;
};
