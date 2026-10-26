import type {
	Client,
	Guild,
	GuildMember,
	Invite
} from 'discord.js';
import type { DiscordInviteEvent } from '#lib/server/rewards/invites.ts';

type DiscordRuntime = typeof import('discord.js');
type BotState = {
	client: Client | null;
	starting: boolean;
	started: boolean;
	attempted: boolean;
	warned: boolean;
	disabled: boolean;
};

const botGlobals = globalThis as typeof globalThis & {
	__neoactylDiscordBot?: BotState;
};

const state = (botGlobals.__neoactylDiscordBot ??= {
	client: null,
	starting: false,
	started: false,
	attempted: false,
	warned: false,
	disabled: false
});

const inviteCache = new Map<string, Map<string, number>>();
const queue: DiscordInviteEvent[] = [];
let draining = false;

const sleep = (milliseconds: number) =>
	new Promise((resolve) => setTimeout(resolve, milliseconds));

const refreshInvites = async (guild: Guild, manageGuildPermission: bigint) => {
	const me = guild.members.me;

	if (!me?.permissions.has(manageGuildPermission)) {
		console.warn(`[discord] Missing Manage Guild permission in ${guild.id}; cannot track invites.`);
		return new Map<string, number>();
	}

	const invites = await guild.invites.fetch();
	const next = new Map<string, number>();

	for (const [code, invite] of invites) {
		next.set(code, invite.uses ?? 0);
	}

	inviteCache.set(guild.id, next);
	return next;
};

const findInviter = (
	previous: Map<string, number>,
	invites: Map<string, Invite>
): string | null => {
	let best: { inviterId: string; uses: number } | null = null;

	for (const [code, invite] of invites) {
		const before = previous.get(code) ?? 0;
		const uses = invite.uses ?? 0;
		const delta = uses - before;

		if (delta > 0 && invite.inviter && (!best || delta > best.uses)) {
			best = { inviterId: invite.inviter.id, uses: delta };
		}
	}

	return best?.inviterId ?? null;
};

const deliverEvent = async (event: DiscordInviteEvent) => {	const { recordInviteJoin, recordInviteLeave } = await import(
		'#lib/server/rewards/invites.ts'
	);
	let lastError: unknown;

	for (let attempt = 1; attempt <= 3; attempt += 1) {
		try {
			if (event.type === 'member_join') {
				const result = await recordInviteJoin(event);

				if (!result.recorded) {
					console.info(`[discord] Invite not recorded (${result.reason}) for ${event.memberId}.`);
				}
			} else {
				await recordInviteLeave(event);
			}

			return;
		} catch (cause) {
			lastError = cause;

			if (attempt < 3) {
				await sleep(attempt * 1000);
			}
		}
	}

	throw lastError instanceof Error ? lastError : new Error('Discord event delivery failed.');
};

const drainQueue = async () => {
	if (draining) return;

	draining = true;

	while (queue.length > 0) {
		const event = queue.shift();

		if (!event) continue;

		try {
			await deliverEvent(event);
		} catch (cause) {
			console.error('[discord] Unable to record an invite event after retries.', cause);
		}
	}

	draining = false;
};

const enqueue = (event: DiscordInviteEvent) => {
	queue.push(event);
	void drainQueue();
};

const handleMemberAdd = async (
	member: GuildMember,
	trackedGuildId: string,
	manageGuildPermission: bigint
) => {
	if (member.user.bot || member.guild.id !== trackedGuildId) return;

	const previous = inviteCache.get(member.guild.id) ?? new Map<string, number>();
	let invites: Map<string, Invite>;

	try {
		const fetched = await member.guild.invites.fetch();
		invites = new Map(fetched.map((invite) => [invite.code, invite]));
	} catch (cause) {
		console.error('[discord] Unable to fetch invites after a member joined.', cause);
		return;
	}

	let inviterId = findInviter(previous, invites);

	if (!inviterId) {
		await sleep(1000);

		try {
			const retry = await member.guild.invites.fetch();
			invites = new Map(retry.map((invite) => [invite.code, invite]));
			inviterId = findInviter(previous, invites);
		} catch (cause) {
			console.error('[discord] Unable to retry invite lookup.', cause);
		}
	}

	await refreshInvites(member.guild, manageGuildPermission).catch((cause) => {
		console.error('[discord] Unable to refresh the invite cache.', cause);
	});

	if (!inviterId) {
		console.warn(`[discord] Could not attribute an inviter for member ${member.id}.`);
		return;
	}

	if (inviterId === member.id) return;

	enqueue({
		type: 'member_join',
		guildId: member.guild.id,
		memberId: member.id,
		inviterId,
		memberIsBot: false,
		joinedAt: (member.joinedAt ?? new Date()).toISOString()
	});
};

const startDiscordClient = async (token: string, guildId: string) => {
	const { Client, Events, GatewayIntentBits, PermissionFlagsBits } = await import('discord.js');
	const manageGuildPermission = PermissionFlagsBits.ManageGuild;
	const client = new Client({
		intents: [
			GatewayIntentBits.Guilds,
			GatewayIntentBits.GuildMembers,
			GatewayIntentBits.GuildInvites
		]
	});

	state.client = client;

	client.once(Events.ClientReady, async (ready) => {
		try {
			const guild = await ready.guilds.fetch(guildId);
			await refreshInvites(guild, manageGuildPermission);
			console.info(`[discord] Tracking invites for ${guild.name} (${guild.id}).`);
		} catch (cause) {
			console.error('[discord] Unable to initialise invite tracking.', cause);
		}
	});

	client.on(Events.GuildMemberAdd, (member) => {
		void handleMemberAdd(member, guildId, manageGuildPermission).catch((cause) => {
			console.error('[discord] Unexpected member join handler failure.', cause);
		});
	});

	client.on(Events.GuildMemberRemove, (member) => {
		if (member.user.bot || member.guild.id !== guildId) return;

		enqueue({
			type: 'member_leave',
			guildId: member.guild.id,
			memberId: member.id
		});
	});

	client.on(Events.InviteCreate, (invite) => {
		if (invite.guild?.id !== guildId) return;

		const cached = inviteCache.get(guildId) ?? new Map<string, number>();
		cached.set(invite.code, invite.uses ?? 0);
		inviteCache.set(guildId, cached);
	});

	client.on(Events.InviteDelete, (invite) => {
		inviteCache.get(guildId)?.delete(invite.code);
	});

	client.on(Events.Error, (cause) => {
		console.error('[discord] Discord client error.', cause);
	});

	try {
		await client.login(token);
		state.started = true;
		console.info(`[discord] Embedded invite bot connected; tracking guild ${guildId}.`);
		return client;
	} catch (cause) {
		state.client = null;
		state.attempted = true;
		console.error('[discord] Unable to log in to Discord.', cause);

		try {
			await client.destroy();
		} catch {
			// Ignore cleanup failures after a failed login.
		}

		return null;
	}
};

export const startDiscordBot = async (): Promise<Client | null> => {
	if (state.started) return state.client;
	if (state.starting || state.attempted || state.disabled) return state.client;

	state.starting = true;

	try {
		const { getBool, getSetting, loadSettings } = await import('#lib/server/config/settings.ts');
		const { serverEnv } = await import('#lib/server/config/env.ts');

		await loadSettings();

		if (!getBool('discord.inviteTrackingEnabled')) {
			if (!state.warned) {
				console.info('[discord] Invite tracking is disabled; embedded bot not started.');
				state.warned = true;
			}

			state.disabled = true;
			return null;
		}

		const token =
			(serverEnv.DISCORD_BOT_TOKEN ?? '').trim() || getSetting('discord.botToken').trim();
		const guildId =
			(serverEnv.DISCORD_GUILD_ID ?? '').trim() ||
			getSetting('discord.guildId').trim() ||
			getSetting('discord.j4rGuildIds')
				.split(/[\s,]+/)
				.map((value) => value.trim())
				.find(Boolean) ??
				'';

		if (!token || !guildId) {
			if (!state.warned) {
				console.info(
					'[discord] Invite bot disabled because the Discord bot token and primary guild ID are not configured.'
				);
				state.warned = true;
			}

			state.disabled = true;
			return null;
		}

		state.disabled = false;
		await (await import('#lib/server/db/bootstrap.ts')).ensureOperationalSchema();

		return await startDiscordClient(token, guildId);
	} finally {
		state.starting = false;
	}
};

export const stopDiscordBot = async () => {
	const client = state.client;

	state.client = null;
	state.started = false;
	state.attempted = false;

	if (client) {
		await client.destroy();
	}
};

export const restartDiscordBot = async () => {
	await stopDiscordBot();
	state.warned = false;
	state.disabled = false;
	return startDiscordBot();
};
