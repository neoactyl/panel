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
};

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
		title: 'AFK, tasks & gifting',
		description: 'Controls the AFK timer, task rewards and peer-to-peer gifting.',
		tab: 'economy',
		fields: [
			{ key: 'afk.coinsPerMinute', label: 'AFK credits per minute', type: 'number' },
			{ key: 'afk.dailyCapMinutes', label: 'Daily AFK cap (minutes)', type: 'number' },
			{ key: 'afk.maxPingGapSeconds', label: 'Maximum ping gap (seconds)', type: 'number' },
			{ key: 'afk.minimumPayoutMinutes', label: 'Minimum payout (minutes)', type: 'number' },
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
			'Discord OAuth credentials, guild membership verification, role perks and J4R rewards. Empty OAuth fields fall back to DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET.',
		tab: 'integrations',
		fields: [
			{ key: 'discord.clientId', label: 'Discord client ID', type: 'text' },
			{ key: 'discord.clientSecret', label: 'Discord client secret', type: 'secret' },
			{ key: 'discord.guildId', label: 'Discord guild ID', type: 'text' },
			{ key: 'discord.inviteUrl', label: 'Discord invite URL', type: 'text' },
			{ key: 'discord.botToken', label: 'Discord bot token', type: 'secret' },
			{ key: 'discord.requiredRoleId', label: 'Required role ID', type: 'text' },
			{ key: 'discord.requireMembership', label: 'Require guild membership', type: 'boolean' },
			{ key: 'discord.j4rEnabled', label: 'Enable J4R claims', type: 'boolean' },
			{ key: 'discord.j4rRewardCoins', label: 'J4R reward credits', type: 'number' }
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

const settingsShape: Record<string, z.ZodType> = {};

for (const key of SETTING_KEYS) {
  if (key === "brand.logo") continue;

  if (booleanKeys.has(key)) {
    settingsShape[key] = z.preprocess(
      (v) => v === "on" || v === true,
      z.boolean(),
    );
  } else if (numberKeys.has(key)) {
    settingsShape[key] = z.preprocess(
      (v) => Number(v),
      z
        .number({ message: `Enter a valid whole number for ${key}.` })
        .int(`Enter a valid whole number for ${key}.`)
        .min(positiveKeys.includes(key) ? 1 : 0, `${key} must be at least 1.`),
    );
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
    extraSections,
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
      return message(form, firstFormError(form), { status: 400 });
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
        return message(form, "A valid Calagopus panel URL is required.", {
          status: 400,
        });
      }

      if (!nextToken) {
        return message(form, "A panel API token is required for Calagopus.", {
          status: 400,
        });
      }
    }

    const logoEntry = fd.get("logoFile");

    if (logoEntry instanceof File && logoEntry.size > 0) {
      if (!allowedImage.has(logoEntry.type)) {
        return message(form, "Upload a PNG, JPEG, WebP, or GIF logo.", {
          status: 400,
        });
      }

      if (logoEntry.size > 512 * 1024) {
        return message(form, "The logo must be 512 KB or smaller.", {
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

    return message(form, "Settings saved.");
  },
};
