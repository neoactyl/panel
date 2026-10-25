import { eq, sql } from 'drizzle-orm';
import { decryptSecret, encryptSecret, isEncryptedSecret } from '#lib/server/auth/crypto.ts';
import { db } from '#lib/server/db/index.ts';
import { settings } from '#lib/server/db/settings.ts';
import { recordSettingsCache } from '#lib/server/system/metrics.ts';

export const SETTING_DEFAULTS = {
	'brand.name': 'Neoactyl',
	'brand.logo': '',
	'brand.description': 'Game server management',
	'panel.adapter': 'mock',
	'panel.url': '',
	'panel.token': '',
	'panel.linkAccounts': 'true',
	'panel.createAccounts': 'true',
	'auth.registration': 'true',
	'quota.cpu': '400',
	'quota.memory': '8192',
	'quota.disk': '51200',
	'quota.databases': '0',
	'quota.allocations': '0',
	'server.default.cpu': '100',
	'server.default.memory': '2048',
	'server.default.disk': '10240',
	'server.allowCreate': 'true',
	'server.maxPerUser': '0',
	'nav.afk': 'true',
	'nav.j4r': 'true',
	'nav.storefront': 'true',
	'nav.rewards': 'true',
	'nav.invites': 'true',
	'feature.console': 'true',
	'feature.filemanager': 'true',
	'feature.databases': 'true',
	'feature.allocations': 'true',
	'feature.backups': 'true',
	'feature.schedules': 'true',
	'feature.startup': 'true',
	'feature.subusers': 'true',
	'feature.activities': 'true',
	'feature.settings': 'true',
	'feature.addons': 'true',
	'credits.enabled': 'true',
	'credits.currency': 'Credits',
	'credits.creationCostEnabled': 'true',
	'credits.creationCost': '0',
	'credits.defaultRenewalPrice': '0',
	'credits.intervalDays': '30',
	'credits.retryHours': '24',
	'credits.deleteAfterDays': '7',
	'credits.allowPurchase': 'false',
	'credits.allowEarn': 'true',
	'credits.giftEnabled': 'true',
	'credits.giftMin': '1',
	'afk.coinsPerMinute': '1',
	'afk.dailyCapMinutes': '120',
	'afk.maxPingGapSeconds': '90',
	'afk.minimumPayoutMinutes': '1',
	'tasks.enabled': 'true',
	'tasks.defaultReward': '10',
	'tasks.cooldownHours': '24',
	'tasks.linkvertiseUserId': '',
	'tasks.linkvertiseApiKey': '',
	'vouchers.enabled': 'true',
	'invites.enabled': 'true',
	'invites.rewardCoins': '0',
	'invites.rewardCpu': '0',
	'invites.rewardMemory': '0',
	'invites.rewardDisk': '0',
	'invites.rewardServerSlots': '0',
	'discord.clientId': '',
	'discord.clientSecret': '',
	'discord.guildId': '',
	'discord.inviteUrl': '',
	'discord.botToken': '',
	'discord.requiredRoleId': '',
	'discord.j4rEnabled': 'true',
	'discord.j4rRewardCoins': '0',
	'discord.requireMembership': 'true',
	'discord.roleRewardCoins': '0',
	'security.blockVpn': 'false',
	'security.maxAccountsPerIp': '3',
	'security.registrationWindowHours': '24',
	'security.maxFailedLogins': '10',
	'security.lockoutMinutes': '15',
	'addons.enabled': 'true',
	'addons.curseforgeKey': '',
	'monitor.slowMs': '750'
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;

const defaults: Record<SettingKey, string> = { ...SETTING_DEFAULTS };
let cache: Record<string, string> = { ...defaults };
let loaded = false;
let loadFailureLogged = false;

export const SETTING_KEYS = Object.keys(SETTING_DEFAULTS) as SettingKey[];

export const SECRET_SETTINGS = [
	'panel.token',
	'discord.clientSecret',
	'discord.botToken',
	'tasks.linkvertiseApiKey',
	'addons.curseforgeKey'
] as const satisfies readonly SettingKey[];

export const isSecretSetting = (key: string): boolean =>
	(SECRET_SETTINGS as readonly string[]).includes(key);

export const BOOLEAN_SETTINGS = SETTING_KEYS.filter((key) => defaults[key] === 'true' || defaults[key] === 'false');

export const NUMBER_SETTINGS = SETTING_KEYS.filter(
	(key) => /^\d+$/.test(defaults[key]) && key !== 'panel.token'
);

export const SERVER_FEATURES = [
	{ key: 'feature.console', slug: 'console', label: 'Console' },
	{ key: 'feature.filemanager', slug: 'filemanager', label: 'File Manager' },
	{ key: 'feature.databases', slug: 'databases', label: 'Databases' },
	{ key: 'feature.allocations', slug: 'allocations', label: 'Allocations' },
	{ key: 'feature.backups', slug: 'backups', label: 'Backups' },
	{ key: 'feature.schedules', slug: 'schedules', label: 'Schedules' },
	{ key: 'feature.startup', slug: 'startup', label: 'Startup' },
	{ key: 'feature.subusers', slug: 'subusers', label: 'Subusers' },
	{ key: 'feature.activities', slug: 'activities', label: 'Activities' },
	{ key: 'feature.addons', slug: 'addons', label: 'Addon Installer' },
	{ key: 'feature.settings', slug: 'settings', label: 'Settings' }
] as const satisfies readonly { key: SettingKey; slug: string; label: string }[];

export const loadSettings = async (force = false) => {
	if (loaded && !force) {
		recordSettingsCache(true);
		return;
	}

	recordSettingsCache(false);

	try {
		const rows = await db.select().from(settings);
		const next: Record<string, string> = { ...defaults };
		const plaintextSecrets: Array<{ key: SettingKey; value: string }> = [];

		for (const row of rows) {
			if (!(row.key in defaults)) continue;

			const key = row.key as SettingKey;

			if (!isSecretSetting(key)) {
				next[key] = row.value;
				continue;
			}

			try {
				next[key] = decryptSecret(row.value);
				if (row.value && !isEncryptedSecret(row.value)) {
					plaintextSecrets.push({ key, value: next[key] });
				}
			} catch (cause) {
				console.error(`Unable to decrypt the stored "${key}" setting.`, cause);
				next[key] = '';
			}
		}

		cache = next;
		loaded = true;
		loadFailureLogged = false;

		for (const secret of plaintextSecrets) {
			try {
				await db
					.update(settings)
					.set({ value: encryptSecret(secret.value), updatedAt: new Date() })
					.where(eq(settings.key, secret.key))
					.run();
			} catch (cause) {
				console.error(`Unable to encrypt the stored "${secret.key}" setting.`, cause);
			}
		}
	} catch (cause) {
		if (!loadFailureLogged) {
			console.error('Unable to load settings; using defaults.', cause);
			loadFailureLogged = true;
		}
	}
};

export const getSetting = (key: SettingKey): string => cache[key] ?? defaults[key] ?? '';

export const getNumber = (key: SettingKey): number => {
	const value = Number(getSetting(key));
	return Number.isFinite(value) ? value : Number(defaults[key] ?? 0);
};

export const getBool = (key: SettingKey): boolean =>
	['true', '1', 'yes', 'on'].includes(getSetting(key).trim().toLowerCase());

export const getPanelConfig = () => ({
	adapter: getSetting('panel.adapter').trim().toLowerCase() || 'mock',
	url: getSetting('panel.url').trim(),
	token: getSetting('panel.token')
});

const publicLogo = (value: string) => {
	if (!value) return '';
	if (value.startsWith('data:')) return '/api/branding/logo';
	return value;
};

export const getBranding = () => ({
	name: getSetting('brand.name') || 'Neoactyl',
	logo: publicLogo(getSetting('brand.logo')),
	description: getSetting('brand.description')
});

export const getPublicSettings = () => ({
	branding: getBranding(),
	registration: getBool('auth.registration'),
	nav: {
		afk: getBool('nav.afk'),
		j4r: getBool('nav.j4r'),
		storefront: getBool('nav.storefront'),
		rewards: getBool('nav.rewards'),
		invites: getBool('nav.invites')
	},
	features: {
		rewards: getBool('credits.allowEarn') && (getBool('tasks.enabled') || getBool('vouchers.enabled')),
		gifts: getBool('credits.enabled') && getBool('credits.giftEnabled'),
		invites: getBool('invites.enabled'),
		addons: getBool('addons.enabled')
	}
});

export const getServerFeatures = () => {
	const features: Record<string, boolean> = {};

	for (const feature of SERVER_FEATURES) {
		features[feature.slug] = getBool(feature.key);
	}

	return features;
};

export const serverFeatureEnabled = (slug: string) => {
	const feature = SERVER_FEATURES.find((entry) => entry.slug === slug);
	return feature ? getBool(feature.key) : true;
};

export const getQuota = () => ({
	cpu: getNumber('quota.cpu'),
	memory: getNumber('quota.memory'),
	disk: getNumber('quota.disk'),
	maxDatabases: getNumber('quota.databases'),
	maxAllocations: getNumber('quota.allocations')
});

export const getDefaultServerLimits = () => ({
	cpu: getNumber('server.default.cpu'),
	memory: getNumber('server.default.memory'),
	disk: getNumber('server.default.disk')
});

export const updateSettings = async (values: Partial<Record<SettingKey, string>>) => {
	const entries = Object.entries(values)
		.filter(([key]) => key in defaults)
		.map(([key, value]) => ({ key, value: String(value ?? '') }));

	if (entries.length === 0) return;

	const rows = entries.map((entry) => ({
		key: entry.key,
		value: isSecretSetting(entry.key) && entry.value ? encryptSecret(entry.value) : entry.value,
		updatedAt: new Date()
	}));

	await db
		.insert(settings)
		.values(rows)
		.onConflictDoUpdate({
			target: settings.key,
			set: {
				value: sql`excluded.value`,
				updatedAt: sql`excluded.updated_at`
			}
		})
		.run();

	for (const entry of entries) {
		cache[entry.key] = entry.value;
	}

	loaded = true;
};
