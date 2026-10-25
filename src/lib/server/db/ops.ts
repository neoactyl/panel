import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { user } from './auth.schema';

const timestamp = (name: string) =>
	integer(name, { mode: 'timestamp_ms' })
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
		.notNull();

export const userQuota = sqliteTable('user_quota', {
	userId: text('user_id')
		.primaryKey()
		.references(() => user.id, { onDelete: 'cascade' }),
	cpu: integer('cpu'),
	memory: integer('memory'),
	disk: integer('disk'),
	maxServers: integer('max_servers'),
	maxDatabases: integer('max_databases'),
	maxAllocations: integer('max_allocations'),
	updatedAt: timestamp('updated_at')
});

export const activityLog = sqliteTable(
	'activity_log',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
		action: text('action').notNull(),
		severity: text('severity').notNull().default('info'),
		message: text('message').notNull(),
		metadata: text('metadata'),
		ip: text('ip'),
		path: text('path'),
		createdAt: timestamp('created_at')
	},
	(table) => [
		index('activity_log_created_at_idx').on(table.createdAt),
		index('activity_log_user_id_idx').on(table.userId)
	]
);

export const errorLog = sqliteTable(
	'error_log',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		fingerprint: text('fingerprint').notNull().unique(),
		reference: text('reference').notNull().unique(),
		userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
		status: integer('status').notNull().default(500),
		method: text('method'),
		path: text('path'),
		message: text('message').notNull(),
		stack: text('stack'),
		metadata: text('metadata'),
		count: integer('count').notNull().default(1),
		createdAt: timestamp('created_at'),
		lastSeen: timestamp('last_seen')
	},
	(table) => [
		index('error_log_created_at_idx').on(table.createdAt),
		index('error_log_last_seen_idx').on(table.lastSeen)
	]
);

export const creditAccount = sqliteTable('credit_account', {
	userId: text('user_id')
		.primaryKey()
		.references(() => user.id, { onDelete: 'cascade' }),
	balance: integer('balance').notNull().default(0),
	updatedAt: timestamp('updated_at')
});

export const creditTransaction = sqliteTable(
	'credit_transaction',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		amount: integer('amount').notNull(),
		balanceAfter: integer('balance_after').notNull(),
		kind: text('kind').notNull(),
		reference: text('reference').notNull().unique(),
		description: text('description').notNull().default(''),
		metadata: text('metadata'),
		createdAt: timestamp('created_at')
	},
	(table) => [
		index('credit_transaction_user_idx').on(table.userId, table.createdAt),
		index('credit_transaction_created_idx').on(table.createdAt)
	]
);

export const creditTopupOption = sqliteTable(
	'credit_topup_option',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		label: text('label').notNull(),
		description: text('description').notNull().default(''),
		badge: text('badge').notNull().default(''),
		credits: integer('credits').notNull(),
		priceCents: integer('price_cents').notNull(),
		enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
		sortOrder: integer('sort_order').notNull().default(0),
		createdAt: timestamp('created_at'),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [index('credit_topup_option_sort_idx').on(table.sortOrder, table.createdAt)]
);

export const serverBilling = sqliteTable(
	'server_billing',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		serverId: text('server_id').notNull().unique(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		storefrontItemId: text('storefront_item_id').references(() => storefrontItem.id, {
			onDelete: 'set null'
		}),
		intervalDays: integer('interval_days').notNull().default(30),
		baseRenewalPrice: integer('base_renewal_price').notNull().default(0),
		renewalPrice: integer('renewal_price').notNull().default(0),
		nextRenewalAt: integer('next_renewal_at', { mode: 'timestamp_ms' }).notNull(),
		autoRenew: integer('auto_renew', { mode: 'boolean' }).notNull().default(true),
		status: text('status').notNull().default('active'),
		suspendedAt: integer('suspended_at', { mode: 'timestamp_ms' }),
		deleteAt: integer('delete_at', { mode: 'timestamp_ms' }),
		lastRenewedAt: integer('last_renewed_at', { mode: 'timestamp_ms' }),
		lastNotifiedAt: integer('last_notified_at', { mode: 'timestamp_ms' }),
		createdAt: timestamp('created_at'),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [
		index('server_billing_renewal_idx').on(table.nextRenewalAt),
		index('server_billing_user_idx').on(table.userId),
		index('server_billing_status_idx').on(table.status)
	]
);

export const serverEntitlement = sqliteTable(
	'server_entitlement',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		serverId: text('server_id').notNull(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		storefrontItemId: text('storefront_item_id').references(() => storefrontItem.id, {
			onDelete: 'set null'
		}),
		cpu: integer('cpu').notNull().default(0),
		memory: integer('memory').notNull().default(0),
		disk: integer('disk').notNull().default(0),
		renewalPrice: integer('renewal_price').notNull().default(0),
		active: integer('active', { mode: 'boolean' }).notNull().default(true),
		removedAt: integer('removed_at', { mode: 'timestamp_ms' }),
		createdAt: timestamp('created_at')
	},
	(table) => [
		index('server_entitlement_server_idx').on(table.serverId),
		index('server_entitlement_user_idx').on(table.userId)
	]
);

export const notificationLog = sqliteTable(
	'notification_log',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		kind: text('kind').notNull(),
		title: text('title').notNull(),
		body: text('body').notNull().default(''),
		url: text('url'),
		readAt: integer('read_at', { mode: 'timestamp_ms' }),
		createdAt: timestamp('created_at')
	},
	(table) => [
		index('notification_log_user_idx').on(table.userId, table.createdAt),
		index('notification_log_created_idx').on(table.createdAt)
	]
);

export const afkSession = sqliteTable('afk_session', {
	userId: text('user_id')
		.primaryKey()
		.references(() => user.id, { onDelete: 'cascade' }),
	lastPingAt: integer('last_ping_at', { mode: 'timestamp_ms' }),
	pendingSeconds: integer('pending_seconds').notNull().default(0),
	earnedToday: integer('earned_today').notNull().default(0),
	day: text('day').notNull().default(''),
	totalEarned: integer('total_earned').notNull().default(0),
	updatedAt: timestamp('updated_at')
});

export const earnTask = sqliteTable(
	'earn_task',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		title: text('title').notNull(),
		description: text('description').notNull().default(''),
		url: text('url').notNull(),
		provider: text('provider').notNull().default('linkvertise'),
		reward: integer('reward').notNull().default(0),
		cooldownHours: integer('cooldown_hours').notNull().default(24),
		minSeconds: integer('min_seconds').notNull().default(15),
		enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
		sortOrder: integer('sort_order').notNull().default(0),
		createdAt: timestamp('created_at')
	},
	(table) => [index('earn_task_enabled_idx').on(table.enabled, table.sortOrder)]
);

export const earnTaskCompletion = sqliteTable(
	'earn_task_completion',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		taskId: text('task_id')
			.notNull()
			.references(() => earnTask.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		status: text('status').notNull().default('pending'),
		token: text('token'),
		verifiedAt: integer('verified_at', { mode: 'timestamp_ms' }),
		startedAt: timestamp('started_at'),
		completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
		createdAt: timestamp('created_at')
	},
	(table) => [
		index('earn_task_completion_user_idx').on(table.userId, table.taskId, table.createdAt),
		uniqueIndex('earn_task_completion_token_idx').on(table.token)
	]
);

export const voucher = sqliteTable(
	'voucher',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		code: text('code').notNull().unique(),
		description: text('description').notNull().default(''),
		kind: text('kind').notNull().default('credits'),
		credits: integer('credits').notNull().default(0),
		cpu: integer('cpu').notNull().default(0),
		memory: integer('memory').notNull().default(0),
		disk: integer('disk').notNull().default(0),
		maxUses: integer('max_uses').notNull().default(0),
		usedCount: integer('used_count').notNull().default(0),
		expiresAt: integer('expires_at', { mode: 'timestamp_ms' }),
		enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
		createdAt: timestamp('created_at')
	},
	(table) => [index('voucher_enabled_idx').on(table.enabled)]
);

export const voucherRedemption = sqliteTable(
	'voucher_redemption',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		voucherId: text('voucher_id')
			.notNull()
			.references(() => voucher.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		createdAt: timestamp('created_at')
	},
	(table) => [
		uniqueIndex('voucher_redemption_voucher_user_idx').on(table.voucherId, table.userId),
		index('voucher_redemption_user_idx').on(table.userId)
	]
);

export const referralProfile = sqliteTable('referral_profile', {
	userId: text('user_id')
		.primaryKey()
		.references(() => user.id, { onDelete: 'cascade' }),
	code: text('code').notNull().unique(),
	createdAt: timestamp('created_at')
});

export const referral = sqliteTable(
	'referral',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		inviterId: text('inviter_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		inviteeId: text('invitee_id')
			.notNull()
			.unique()
			.references(() => user.id, { onDelete: 'cascade' }),
		code: text('code').notNull(),
		rewardCoins: integer('reward_coins').notNull().default(0),
		rewardCpu: integer('reward_cpu').notNull().default(0),
		rewardMemory: integer('reward_memory').notNull().default(0),
		rewardDisk: integer('reward_disk').notNull().default(0),
		rewardServerSlots: integer('reward_server_slots').notNull().default(0),
		createdAt: timestamp('created_at')
	},
	(table) => [index('referral_inviter_idx').on(table.inviterId, table.createdAt)]
);

export const discordProfile = sqliteTable('discord_profile', {
	userId: text('user_id')
		.primaryKey()
		.references(() => user.id, { onDelete: 'cascade' }),
	discordId: text('discord_id').notNull(),
	username: text('username').notNull().default(''),
	guildId: text('guild_id').notNull().default(''),
	member: integer('member', { mode: 'boolean' }).notNull().default(false),
	roles: text('roles').notNull().default('[]'),
	verifiedAt: integer('verified_at', { mode: 'timestamp_ms' }),
	lastCheckedAt: integer('last_checked_at', { mode: 'timestamp_ms' }),
	j4rClaimedAt: integer('j4r_claimed_at', { mode: 'timestamp_ms' })
});

export const storefrontItem = sqliteTable(
	'storefront_item',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		name: text('name').notNull(),
		description: text('description').notNull().default(''),
		icon: text('icon').notNull().default('package'),
		kind: text('kind').notNull().default('server'),
		enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
		oncePerUser: integer('once_per_user', { mode: 'boolean' }).notNull().default(true),
		price: integer('price').notNull().default(0),
		renewalPrice: integer('renewal_price').notNull().default(0),
		durationDays: integer('duration_days').notNull().default(30),
		renewable: integer('renewable', { mode: 'boolean' }).notNull().default(true),
		stackable: integer('stackable', { mode: 'boolean' }).notNull().default(true),
		removable: integer('removable', { mode: 'boolean' }).notNull().default(false),
		cpu: integer('cpu').notNull(),
		memory: integer('memory').notNull(),
		disk: integer('disk').notNull(),
		node: text('node').notNull().default(''),
		softwareGroup: integer('software_group'),
		software: integer('software'),
		successMode: text('success_mode').notNull().default('console'),
		successUrl: text('success_url').notNull().default(''),
		successMessage: text('success_message').notNull().default(''),
		sortOrder: integer('sort_order').notNull().default(0),
		createdAt: timestamp('created_at'),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [index('storefront_item_sort_idx').on(table.sortOrder, table.createdAt)]
);

export const softwareSetting = sqliteTable(
	'software_setting',
	{
		key: text('key').primaryKey(),
		groupId: integer('group_id').notNull(),
		softwareId: integer('software_id'),
		visible: integer('visible', { mode: 'boolean' }).notNull().default(true),
		minCpu: integer('min_cpu'),
		maxCpu: integer('max_cpu'),
		minMemory: integer('min_memory'),
		maxMemory: integer('max_memory'),
		minDisk: integer('min_disk'),
		maxDisk: integer('max_disk'),
		editableVariables: text('editable_variables').notNull().default('[]'),
		dockerImage: text('docker_image').notNull().default(''),
		startupCommand: text('startup_command').notNull().default(''),
		environment: text('environment').notNull().default('{}'),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [
		index('software_setting_group_idx').on(table.groupId),
		index('software_setting_software_idx').on(table.softwareId)
	]
);

export const storefrontRedemption = sqliteTable(
	'storefront_redemption',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		itemId: text('item_id')
			.notNull()
			.references(() => storefrontItem.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		serverId: text('server_id'),
		status: text('status').notNull().default('completed'),
		message: text('message').notNull().default(''),
		createdAt: timestamp('created_at')
	},
	(table) => [
		index('storefront_redemption_item_idx').on(table.itemId),
		index('storefront_redemption_user_idx').on(table.userId)
	]
);
