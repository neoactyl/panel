import { Buffer } from "node:buffer";
import { z } from "zod";
import { resetAdapter } from "#lib/server/panel/adapter.ts";
import { requireAdmin } from "#lib/server/auth/admin.ts";
import { logActivity } from "#lib/server/system/logs.ts";
import {
  BOOLEAN_SETTINGS,
  NUMBER_SETTINGS,
  SECRET_SETTINGS,
  SERVER_FEATURES,
  SETTING_KEYS,
  isSecretSetting,
  type SettingKey,
  getBranding,
  getPanelConfig,
  getSetting,
  loadSettings,
  updateSettings,
} from "#lib/server/config/settings.ts";
import { inviteTiersSchema } from "#lib/server/rewards/config.ts";
import { message, superValidate } from "sveltekit-superforms/server";
import { zod4 } from "sveltekit-superforms/adapters";
import { firstFormError } from "#lib/server/form-error.ts";
import type { Actions, PageServerLoad } from "./$types";

const positiveKeys: SettingKey[] = [
  "quota.cpu",
  "quota.memory",
  "quota.disk",
  "server.default.cpu",
  "server.default.memory",
  "server.default.disk",
  "credits.intervalDays",
  "credits.topupPricePerCredit",
  "credits.topupMinCredits",
  "credits.topupMaxCredits",
];

type ExtraField = {
  key: SettingKey;
  label: string;
  type: "text" | "number" | "boolean" | "secret";
  placeholder?: string;
  help?: string;
  min?: number;
  max?: number;
};

const afkField = (
  key: SettingKey,
  label: string,
  type: "number" | "boolean",
  help: string,
): ExtraField => ({ key, label, type, help });

type SettingsTab =
  "general" | "infrastructure" | "economy" | "integrations" | "security";

type ExtraSection = {
  title: string;
  description: string;
  tab: SettingsTab;
  fields: ExtraField[];
};

const extraSections: ExtraSection[] = [
	{
		title: 'Stripe credit top-ups',
		description:
			'Stripe keys, checkout currency and custom top-up amounts. Leave the keys blank to use the STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET environment variables. Point the Stripe webhook at /api/auth/stripe/webhook and subscribe to checkout.session.completed.',
		tab: 'economy',
		fields: [
			{
				key: 'stripe.secretKey',
				label: 'Stripe secret key',
				type: 'secret',
				placeholder: 'sk_live_...'
			},
			{
				key: 'stripe.webhookSecret',
				label: 'Stripe webhook signing secret',
				type: 'secret',
				placeholder: 'whsec_...'
			},
			{
				key: 'credits.topupCurrency',
				label: 'Checkout currency',
				type: 'text',
				placeholder: 'usd'
			},
			{
				key: 'credits.topupPricePerCredit',
				label: 'Custom price per credit (cents)',
				type: 'number'
			},
			{ key: 'credits.topupMinCredits', label: 'Minimum custom credits', type: 'number' },
			{ key: 'credits.topupMaxCredits', label: 'Maximum custom credits', type: 'number' },
			{ key: 'credits.topupCustomEnabled', label: 'Allow custom amounts', type: 'boolean' },
			{ key: 'credits.topupAllowPromoCodes', label: 'Allow promotion codes', type: 'boolean' }
		]
	},
	{
		title: 'AFK earning & anti-abuse',
		description:
			'Server-authoritative WebSocket AFK. The server measures every interval itself; the browser only sends presence heartbeats. Changes apply live at the next heartbeat.',
		tab: 'economy',
		fields: [
			afkField('afk.enabled', 'Enable AFK earning', 'boolean', 'Also requires credits and earning to be enabled.'),
			afkField('afk.coinsPerMinute', 'Credits per minute', 'number', 'Awarded in whole minutes. Set 0 to disable payouts.'),
			afkField('afk.dailyCapMinutes', 'Daily cap (minutes)', 'number', '0 means no daily cap. The cap resets at the configured UTC hour.'),
			afkField('afk.minimumPayoutMinutes', 'Minimum payout (minutes)', 'number', 'Accumulated seconds are paid in whole blocks of at least this size.'),
			afkField('afk.heartbeatSeconds', 'Heartbeat interval (seconds)', 'number', 'How often the browser reports presence. Allowed range: 5-120.'),
			afkField('afk.minHeartbeatGapSeconds', 'Minimum heartbeat gap (seconds)', 'number', 'Faster reports are ignored and never earn time.'),
			afkField('afk.maxHeartbeatGapSeconds', 'Maximum heartbeat gap (seconds)', 'number', 'Time beyond this gap is never credited, even if the tab was open.'),
			afkField('afk.idleTimeoutSeconds', 'Idle timeout (seconds)', 'number', 'No input for this long pauses earnings. 0 requires input on every heartbeat.'),
			afkField('afk.requireVisible', 'Require visible tab', 'boolean', 'Hidden tabs stop the timer on the next heartbeat.'),
			afkField('afk.requireFocus', 'Require focused window', 'boolean', 'Unfocused windows stop the timer on the next heartbeat.'),
			afkField('afk.requireInteraction', 'Require user interaction', 'boolean', 'The session only earns while recent mouse, touch, scroll or keyboard input is present.'),
			afkField('afk.minInteractionsPerBeat', 'Minimum interactions per beat', 'number', 'Used when the idle timeout is 0.'),
			afkField('afk.challengeEnabled', 'Enable presence checks', 'boolean', 'Random interactive challenges are the main anti-script gate.'),
			afkField('afk.challengeMinSeconds', 'Minimum time between checks (seconds)', 'number', 'Lower bound for the random challenge schedule.'),
			afkField('afk.challengeMaxSeconds', 'Maximum time between checks (seconds)', 'number', 'Upper bound for the random challenge schedule.'),
			afkField('afk.challengeWindowSeconds', 'Presence check window (seconds)', 'number', 'How long the user has to answer before the check fails.'),
			afkField('afk.challengeMinResponseMs', 'Minimum response time (ms)', 'number', 'Answers faster than this are treated as automated and fail.'),
			afkField('afk.maxStrikes', 'Strikes before cooldown', 'number', 'Missed or incorrect checks add strikes. At this count the account is paused.'),
			afkField('afk.cooldownMinutes', 'Strike cooldown (minutes)', 'number', 'How long earning is blocked after the strike limit. 0 disables the cooldown.'),
			afkField('afk.sessionTicketSeconds', 'Session ticket lifetime (seconds)', 'number', 'Short-lived, single-use WebSocket ticket lifetime.'),
			afkField('afk.maxSessionsPerIp', 'Maximum sessions per IP', 'number', 'Caps simultaneous AFK sockets from one network.'),
			afkField('afk.bindSessionToIp', 'Bind ticket to IP', 'boolean', 'Rejects a ticket used from a different network. Disable if users switch mobile networks.'),
			afkField('afk.bindSessionToUserAgent', 'Bind ticket to browser', 'boolean', 'Rejects a ticket replayed from a different browser signature.'),
			afkField('afk.dayResetHourUtc', 'Daily reset hour (UTC)', 'number', '0-23. The daily cap rolls over at this hour.')
		]
	},
	{
		title: 'Tasks, vouchers & gifting',
		description: 'Task rewards, Linkvertise verification, vouchers and peer-to-peer gifting.',
		tab: 'economy',
		fields: [
			{ key: 'tasks.enabled', label: 'Enable tasks', type: 'boolean' },
			{ key: 'tasks.defaultReward', label: 'Default task reward', type: 'number' },
			{ key: 'tasks.cooldownHours', label: 'Default task cooldown (hours)', type: 'number' },
			{
				key: 'tasks.linkvertiseUserId',
				label: 'Linkvertise publisher ID',
				type: 'text',
				placeholder: 'Numeric Linkvertise user ID'
			},
			{
				key: 'tasks.linkvertiseApiKey',
				label: 'Linkvertise API key',
				type: 'secret',
				placeholder: 'Optional'
			},
			{ key: 'vouchers.enabled', label: 'Enable vouchers', type: 'boolean' },
			{ key: 'credits.giftEnabled', label: 'Enable credit gifting', type: 'boolean' },
			{ key: 'credits.giftMin', label: 'Minimum gift amount', type: 'number' }
		]
	},
	{
		title: 'Referral rewards',
		description: 'Rewards granted to the inviter when a referred account registers.',
		tab: 'economy',
		fields: [
			{ key: 'invites.enabled', label: 'Enable referrals', type: 'boolean' },
			{ key: 'invites.rewardCoins', label: 'Referral credits', type: 'number' },
			{ key: 'invites.rewardCpu', label: 'Referral CPU (%)', type: 'number' },
			{ key: 'invites.rewardMemory', label: 'Referral memory (MB)', type: 'number' },
			{ key: 'invites.rewardDisk', label: 'Referral disk (MB)', type: 'number' },
			{ key: 'invites.rewardServerSlots', label: 'Referral server slots', type: 'number' },
			{ key: 'nav.rewards', label: 'Show Rewards page', type: 'boolean' },
			{ key: 'nav.invites', label: 'Show Invite page', type: 'boolean' }
		]
	},
	{
		title: 'Discord & join-for-resources',
		description:
			'Discord OAuth credentials, guild membership verification, role perks, J4R rewards and the embedded invite tracking bot. Empty OAuth fields fall back to DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET.',
		tab: 'integrations',
		fields: [
			{ key: 'discord.clientId', label: 'Discord client ID', type: 'text' },
			{ key: 'discord.clientSecret', label: 'Discord client secret', type: 'secret' },
			{
				key: 'discord.guildId',
				label: 'Primary Discord guild ID (invite tracking)',
				type: 'text'
			},
			{
				key: 'discord.j4rGuildIds',
				label: 'J4R guild IDs',
				type: 'text',
				placeholder: 'Comma-separated; falls back to the primary guild'
			},
			{ key: 'discord.inviteUrl', label: 'Discord invite URL', type: 'text' },
			{
				key: 'discord.botToken',
				label: 'Discord bot token (membership + invite tracking)',
				type: 'secret'
			},
			{ key: 'discord.requiredRoleId', label: 'Required role ID', type: 'text' },
			{ key: 'discord.requireMembership', label: 'Require guild membership', type: 'boolean' },
			{ key: 'discord.j4rEnabled', label: 'Enable J4R claims', type: 'boolean' },
			{ key: 'discord.j4rRewardCoins', label: 'J4R reward credits', type: 'number' },
			{
				key: 'discord.inviteTrackingEnabled',
				label: 'Enable embedded Discord invite bot',
				type: 'boolean'
			},
			{
				key: 'discord.inviteMinAccountAgeDays',
				label: 'Minimum invitee account age (days)',
				type: 'number'
			},
			{
				key: 'discord.inviteRequireStillMember',
				label: 'Require invitee to still be in server',
				type: 'boolean'
			},
			{
				key: 'discord.inviteTiers',
				label: 'Invite reward tiers (JSON)',
				type: 'text',
				placeholder: '[{"invites":1,"coins":10}]'
			}
		]
	},
	{
		title: 'Anti-abuse & addons',
		description: 'Registration limits, sign-in lockouts, VPN checks and addon installs.',
		tab: 'security',
		fields: [
			{ key: 'security.blockVpn', label: 'Block VPN/proxy registrations', type: 'boolean' },
			{ key: 'security.maxAccountsPerIp', label: 'Max accounts per IP', type: 'number' },
			{ key: 'security.registrationWindowHours', label: 'Registration window (hours)', type: 'number' },
			{ key: 'security.maxFailedLogins', label: 'Max failed logins', type: 'number' },
			{ key: 'security.lockoutMinutes', label: 'Lockout duration (minutes)', type: 'number' },
			{ key: 'addons.enabled', label: 'Enable addon installer', type: 'boolean' },
			{
				key: 'addons.curseforgeKey',
				label: 'CurseForge API key',
				type: 'secret',
				placeholder: 'Optional'
			},
			{ key: 'monitor.slowMs', label: 'Slow call threshold (ms)', type: 'number' }
		]
	}
];

const booleanKeys: ReadonlySet<string> = new Set(BOOLEAN_SETTINGS);
const numberKeys: ReadonlySet<string> = new Set(NUMBER_SETTINGS);

const numberBounds: Partial<Record<SettingKey, { min?: number; max?: number }>> = {
  'afk.coinsPerMinute': { min: 0, max: 100_000 },
  'afk.dailyCapMinutes': { min: 0, max: 100_000 },
  'afk.minimumPayoutMinutes': { min: 1, max: 1_440 },
  'afk.heartbeatSeconds': { min: 5, max: 120 },
  'afk.minHeartbeatGapSeconds': { min: 2, max: 119 },
  'afk.maxHeartbeatGapSeconds': { min: 5, max: 600 },
  'afk.idleTimeoutSeconds': { min: 0, max: 86_400 },
  'afk.minInteractionsPerBeat': { min: 0, max: 100 },
  'afk.challengeMinSeconds': { min: 10, max: 86_400 },
  'afk.challengeMaxSeconds': { min: 10, max: 86_400 },
  'afk.challengeWindowSeconds': { min: 5, max: 300 },
  'afk.challengeMinResponseMs': { min: 0, max: 10_000 },
  'afk.maxStrikes': { min: 1, max: 100 },
  'afk.cooldownMinutes': { min: 0, max: 10_080 },
  'afk.sessionTicketSeconds': { min: 10, max: 600 },
  'afk.maxSessionsPerIp': { min: 1, max: 1_000 },
  'afk.dayResetHourUtc': { min: 0, max: 23 }
};

const settingsShape: Record<string, z.ZodType> = {};

for (const key of SETTING_KEYS) {
  if (key === "brand.logo") continue;

  if (booleanKeys.has(key)) {
    settingsShape[key] = z.preprocess(
      (v) => v === "on" || v === true,
      z.boolean(),
    );
  } else if (numberKeys.has(key)) {
    const bounds = numberBounds[key];
    const min = bounds?.min ?? (positiveKeys.includes(key) ? 1 : 0);
    let schema = z
      .number({ message: `Enter a valid whole number for ${key}.` })
      .int(`Enter a valid whole number for ${key}.`)
      .min(min, `${key} must be at least ${min}.`);

    if (bounds?.max !== undefined) {
      schema = schema.max(bounds.max, `${key} must be at most ${bounds.max}.`);
    }

    settingsShape[key] = z.preprocess((v) => Number(v), schema);
  } else if (key === "brand.name") {
    settingsShape[key] = z
      .string()
      .trim()
      .min(2, "The app name must be at least 2 characters.")
      .max(48, "The app name must be 48 characters or fewer.");
  } else if (key === "brand.description") {
    settingsShape[key] = z
      .string()
      .trim()
      .max(160, "The description is too long.");
  } else if (key === "panel.adapter") {
    settingsShape[key] = z.enum(["mock", "calagopus"], {
      message: "Choose a valid panel adapter.",
    });
  } else if (key === "discord.inviteTiers") {
    settingsShape[key] = z
      .string()
      .trim()
      .refine(
        (value) => {
          try {
            const parsed: unknown = JSON.parse(value);
            return inviteTiersSchema.safeParse(parsed).success;
          } catch {
            return false;
          }
        },
        { message: "Enter a valid non-empty JSON array of invite tiers." },
      );
  } else {
    settingsShape[key] = z.string().trim();
  }
}

const settingsSchema = z.object(settingsShape);

export const load: PageServerLoad = async () => {
  const current: Record<string, string> = {};
  const secretSet: Record<string, boolean> = {};

  for (const key of SETTING_KEYS) {
    if (isSecretSetting(key)) {
      secretSet[key] = Boolean(getSetting(key));
      current[key] = "";
      continue;
    }

    current[key] = getSetting(key);
  }

  const logo = current["brand.logo"] ?? "";
  current["brand.logo"] = logo.startsWith("data:") ? "" : logo;

  const settingsForm = await superValidate(zod4(settingsSchema), {
    id: "settings",
  });

  return {
    current,
    tokenSet: Boolean(getPanelConfig().token),
    secretSet,
    logoData: logo.startsWith("data:"),
    logoPreview: getBranding().logo,
    features: SERVER_FEATURES.map((feature) => ({
      key: feature.key,
      label: feature.label,
    })),
    booleans: BOOLEAN_SETTINGS,
    extraSections: extraSections.map((section) => ({
      ...section,
      fields: section.fields.map((field) => {
        if (field.type !== "number") return field;
        const bounds = numberBounds[field.key];
        return bounds ? { ...field, ...bounds } : field;
      }),
    })),
    settingsForm,
  };
};

const allowedImage = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

export const actions: Actions = {
  default: async ({ locals, request }) => {
    requireAdmin(locals);
    const fd = await request.formData();
    const form = await superValidate(fd, zod4(settingsSchema), {
      id: "settings",
      allowFiles: true,
    });

    if (!form.valid) {
      return message(form, { status: "error", text: firstFormError(form) }, { status: 400 });
    }

    const data = form.data as Record<string, unknown>;
    const values: Partial<Record<SettingKey, string>> = {};

    for (const key of SETTING_KEYS) {
      if (key === "brand.logo") continue;

      if (booleanKeys.has(key)) {
        values[key] = data[key] === true ? "true" : "false";
      } else if (numberKeys.has(key)) {
        values[key] = String(data[key]);
      } else {
        values[key] = String(data[key] ?? "");
      }
    }

    const tokenInput = String(data["panel.token"] ?? "").trim();
    const currentToken = getPanelConfig().token;

    if (fd.get("clearPanelToken")) {
      values["panel.token"] = "";
    } else if (tokenInput) {
      values["panel.token"] = tokenInput;
    }

    for (const key of SECRET_SETTINGS) {
      if (key === "panel.token") continue;
    
      if (fd.get(`clear-${key}`)) {
        values[key] = "";
        continue;
      }
    
      const input = String(data[key] ?? "").trim();
      // Only update if there's new input, otherwise keep the existing value
      if (input) {
        values[key] = input;
      } else {
        // If no new input, keep the existing value
        const currentValue = getSetting(key);
        if (currentValue) {
          values[key] = currentValue;
        }
      }
    }

    const nextToken = values["panel.token"] ?? currentToken;

    if (values["panel.adapter"] === "calagopus") {
      if (!/^https?:\/\/.+/i.test(values["panel.url"] ?? "")) {
        return message(form, { status: "error", text: "A valid Calagopus panel URL is required." }, {
          status: 400,
        });
      }

      if (!nextToken) {
        return message(form, { status: "error", text: "A panel API token is required for Calagopus." }, {
          status: 400,
        });
      }
    }

    const logoEntry = fd.get("logoFile");

    if (logoEntry instanceof File && logoEntry.size > 0) {
      if (!allowedImage.has(logoEntry.type)) {
        return message(form, { status: "error", text: "Upload a PNG, JPEG, WebP, or GIF logo." }, {
          status: 400,
        });
      }

      if (logoEntry.size > 512 * 1024) {
        return message(form, { status: "error", text: "The logo must be 512 KB or smaller." }, {
          status: 400,
        });
      }

      const buffer = Buffer.from(await logoEntry.arrayBuffer());
      values["brand.logo"] =
        `data:${logoEntry.type};base64,${buffer.toString("base64")}`;
    } else if (fd.get("clearLogo")) {
      values["brand.logo"] = "";
    } else {
      const logoUrl = String(data["brand.logo"] ?? "").trim();
      if (logoUrl) values["brand.logo"] = logoUrl;
    }

    await updateSettings(values);
    await loadSettings(true);
    resetAdapter();

    logActivity({
      userId: locals.user?.id,
      action: "admin.settings.update",
      message: "Updated panel settings",
      metadata: { keys: Object.keys(values) },
    });

    return message(form, { status: "success", text: "Settings saved." });
  },
};
