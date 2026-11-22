import { and, count, eq, sql } from 'drizzle-orm';
import {
	EmbedBuilder,
	MessageFlags,
	PermissionFlagsBits,
	SlashCommandBuilder,
	type ChatInputCommandInteraction,
	type Guild,
	type Interaction,
	type RESTPostAPIChatInputApplicationCommandsJSONBody
} from 'discord.js';
import { addCredits, getCreditBalance } from '#lib/server/billing/credits.ts';
import { db } from '#lib/server/db/index.ts';
import { account, user } from '#lib/server/db/auth.schema.ts';
import { creditAccount, invitedUser, serverBilling } from '#lib/server/db/ops.ts';
import {
	byRecency,
	summarizeInvites,
	type InviteSummary,
	type TrackedInvite
} from '#lib/server/rewards/invite-stats.ts';
import { getSetting } from '#lib/server/config/settings.ts';
import { getDiscordRewardConfig } from '#lib/server/rewards/config.ts';
import {
	InviteRewardError,
	adjustDiscordInvites
} from '#lib/server/rewards/invites.ts';
import { logActivity } from '#lib/server/system/logs.ts';

type Command = {
	data: { name: string; toJSON(): RESTPostAPIChatInputApplicationCommandsJSONBody };
	execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
};

type InviteStats = {
	summary: InviteSummary;
	invitees: TrackedInvite[];
	requireStillMember: boolean;
	minAccountAgeDays: number;
};

const MAX_LISTED_INVITEES = 12;

// Discord expires an interaction 3 seconds after it is created and rejects any
// late acknowledgement with these codes. They are expected while the gateway is
// reconnecting, so they are handled without noise.
const EXPIRED_INTERACTION_CODES = new Set([10062, 40060]);

const isExpiredInteraction = (cause: unknown): boolean => {
	if (typeof cause !== 'object' || cause === null) return false;

	const code = (cause as { code?: unknown }).code;

	return typeof code === 'number' && EXPIRED_INTERACTION_CODES.has(code);
};

const parseIdList = (value: string): Set<string> =>
	new Set(
		value
			.split(/[,\s]+/)
			.map((entry) => entry.trim())
			.filter(Boolean)
	);

const memberRoleIds = (interaction: ChatInputCommandInteraction): Set<string> => {
	const roles: unknown = interaction.member?.roles;

	if (Array.isArray(roles)) return new Set(roles as string[]);

	if (
		roles &&
		typeof roles === 'object' &&
		'keys' in roles &&
		typeof roles.keys === 'function'
	) {
		return new Set((roles as Map<string, unknown>).keys());
	}

	if (roles && typeof roles === 'object' && 'cache' in roles) {
		const cache = (roles as { cache: Map<string, unknown> }).cache;
		return new Set(cache.keys());
	}

	return new Set();
};

/**
 * Panel-management commands require both Discord guild management permissions
 * and an explicit panel-admin allowlist. `setDefaultMemberPermissions` hides
 * them from everyone else, but this runtime check is the actual gate.
 */
const isPanelAdmin = (interaction: ChatInputCommandInteraction) => {
	const permissions = interaction.memberPermissions;
	const hasGuildPermission = Boolean(
		permissions &&
			(permissions.has(PermissionFlagsBits.Administrator) ||
				permissions.has(PermissionFlagsBits.ManageGuild))
	);

	if (!hasGuildPermission) return false;

	const allowedUsers = parseIdList(getSetting('discord.panelAdminUserIds'));
	if (allowedUsers.has(interaction.user.id)) return true;

	const allowedRoles = parseIdList(getSetting('discord.panelAdminRoleIds'));
	if (allowedRoles.size === 0) return false;

	return [...memberRoleIds(interaction)].some((roleId) => allowedRoles.has(roleId));
};

const refuseNonAdmin = async (interaction: ChatInputCommandInteraction) => {
	if (isPanelAdmin(interaction)) return false;

	await interaction.reply({
		content:
			'You need **Manage Server** permission and an allowed panel-admin role or user ID to use this command.',
		flags: MessageFlags.Ephemeral
	});

	return true;
};

const getInviteStats = async (guildId: string, userId: string): Promise<InviteStats> => {
	const config = getDiscordRewardConfig();

	const invitees = await db
		.select({
			discordId: invitedUser.discordId,
			joinedAt: invitedUser.joinedAt,
			stillInServer: invitedUser.stillInServer,
			counted: invitedUser.counted,
			rewardedAt: invitedUser.rewardedAt
		})
		.from(invitedUser)
		.where(and(eq(invitedUser.inviterId, userId), eq(invitedUser.guildId, guildId)))
		.all();

	return {
		summary: summarizeInvites(invitees, {
			requireStillMember: config.inviteRequireStillMember
		}),
		invitees,
		requireStillMember: config.inviteRequireStillMember,
		minAccountAgeDays: config.inviteMinAccountAgeDays
	};
};

const describeInvitee = (
	invitee: TrackedInvite,
	interaction: ChatInputCommandInteraction
): string => {
	const name =
		interaction.guild?.members.cache.get(invitee.discordId)?.displayName ??
		interaction.client.users.cache.get(invitee.discordId)?.username;
	const who = name ? `**${name}**` : `<@${invitee.discordId}>`;
	const presence = invitee.stillInServer ? 'in server' : 'left';
	const reward =
		invitee.rewardedAt !== null ? 'rewarded' : invitee.counted ? 'unclaimed' : 'pending age';
	const joined = invitee.joinedAt
		? ` · <t:${Math.floor(invitee.joinedAt.getTime() / 1000)}:R>`
		: '';

	return `• ${who} — ${presence} · ${reward}${joined}`;
};

const linkedPanelUser = (discordId: string) =>
	db
		.select({
			id: user.id,
			name: user.name,
			email: user.email,
			role: user.role,
			banned: user.banned,
			createdAt: user.createdAt
		})
		.from(account)
		.innerJoin(user, eq(account.userId, user.id))
		.where(and(eq(account.providerId, 'discord'), eq(account.accountId, discordId)))
		.get();

const relative = (date: Date) => `<t:${Math.floor(date.getTime() / 1000)}:R>`;

// Built once at import time so an incoming interaction is dispatched without any
// lazy module loading between Discord firing the event and our first await.
const commands: Command[] = [
	{
		data: new SlashCommandBuilder().setName('ping').setDescription('Check that the bot is alive.'),
		execute: async (interaction) => {
			await interaction.reply({
				content: `Pong! ${Math.round(interaction.client.ws.ping)}ms`,
				flags: MessageFlags.Ephemeral
			});
		}
	},
	{
		data: new SlashCommandBuilder()
			.setName('invites')
			.setDescription('Show the invites you (or another member) have tracked.')
			.addUserOption((option) =>
				option.setName('user').setDescription('Member to look up (defaults to you).')
			),
		execute: async (interaction) => {
			if (!interaction.guildId) return;

			// Acknowledge immediately; the database work happens inside the 15 minute
			// follow-up window instead of the 3 second acknowledgement window.
			await interaction.deferReply({ flags: MessageFlags.Ephemeral });

			const target = interaction.options.getUser('user') ?? interaction.user;
			const { summary, invitees, requireStillMember, minAccountAgeDays } = await getInviteStats(
				interaction.guildId,
				target.id
			);

			const ordered = [...invitees].sort(byRecency);
			const listed = ordered.slice(0, MAX_LISTED_INVITEES);
			const lines = listed.map((invitee) => describeInvitee(invitee, interaction));

			if (ordered.length > listed.length) {
				lines.push(`…and ${ordered.length - listed.length} more`);
			}

			const embed = new EmbedBuilder()
				.setTitle(`Invites for ${target.username}`)
				.setColor(0x22c55e)
				.setDescription(
					`Invites count once the invited account is at least ${minAccountAgeDays} day(s) old` +
						`${requireStillMember ? ' and inviters only keep credit while the member stays' : ''}. ` +
						'Leaving and rejoining never restores an already rewarded invite.'
				)
				.addFields(
					{ name: 'Invited', value: String(summary.total), inline: true },
					{ name: 'Valid', value: String(summary.valid), inline: true },
					{ name: 'Pending age', value: String(summary.pending), inline: true },
					{ name: 'In server', value: String(summary.active), inline: true },
					{ name: 'Left', value: String(summary.left), inline: true },
					{ name: 'Unclaimed', value: String(summary.claimable), inline: true },
					{ name: 'Rewarded', value: String(summary.rewarded), inline: true },
					{
						name: 'Invited members',
						value: lines.length ? lines.join('\n').slice(0, 1024) : 'No invites tracked yet.'
					}
				);

			await interaction.editReply({ embeds: [embed] });
		}
	},
	{
		data: new SlashCommandBuilder()
			.setName('invites-admin')
			.setDescription('Clear or deduct a member’s claimable invites.')
			.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
			.addSubcommand((subcommand) =>
				subcommand
					.setName('clear')
					.setDescription('Remove every claimable invite and adjust lifetime invites.')
					.addUserOption((option) =>
						option.setName('user').setDescription('Member to reset.').setRequired(true)
					)
			)
			.addSubcommand((subcommand) =>
				subcommand
					.setName('deduct')
					.setDescription('Remove a number of claimable invites.')
					.addUserOption((option) =>
						option.setName('user').setDescription('Member to adjust.').setRequired(true)
					)
					.addIntegerOption((option) =>
						option
							.setName('amount')
							.setDescription('How many claimable invites to remove.')
							.setMinValue(1)
							.setRequired(true)
					)
			),
		execute: async (interaction) => {
			if (!interaction.guildId || (await refuseNonAdmin(interaction))) return;

			await interaction.deferReply({ flags: MessageFlags.Ephemeral });

			const target = interaction.options.getUser('user', true);
			const action = interaction.options.getSubcommand(true) as 'clear' | 'deduct';
			const amount = action === 'deduct' ? interaction.options.getInteger('amount', true) : 0;

			try {
				const result = await adjustDiscordInvites({
					guildId: interaction.guildId,
					discordId: target.id,
					action,
					amount
				});

				await interaction.editReply({
					embeds: [
						new EmbedBuilder()
							.setTitle(action === 'clear' ? 'Invites cleared' : 'Invites deducted')
							.setColor(0xf59e0b)
							.setDescription(
								action === 'clear'
									? `Removed **${result.affected}** claimable invite(s) from ${target}.`
									: `Removed **${result.affected}** claimable invite(s) from ${target}.`
							)
							.addFields(
								{ name: 'Remaining', value: String(result.remaining), inline: true },
								{ name: 'Lifetime', value: String(result.lifetime), inline: true }
							)
					]
				});

				logActivity({
					action: `discord.invites.${action}`,
					message: `Discord admin ${interaction.user.username} ${action === 'clear' ? 'cleared' : 'deducted'} invites for ${target.username}.`,
					metadata: {
						actorDiscordId: interaction.user.id,
						targetDiscordId: target.id,
						guildId: interaction.guildId,
						amount,
						affected: result.affected,
						remaining: result.remaining
					}
				});
			} catch (cause) {
				const message =
					cause instanceof InviteRewardError
						? cause.message
						: 'Unable to adjust that member’s invites.';

				await interaction.editReply({ content: message });
			}
		}
	},
	{
		data: new SlashCommandBuilder()
			.setName('panel-stats')
			.setDescription('Show panel-wide account, server and credit totals.')
			.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
		execute: async (interaction) => {
			if (await refuseNonAdmin(interaction)) return;

			await interaction.deferReply({ flags: MessageFlags.Ephemeral });

			const [accounts, linked, servers, credits] = await Promise.all([
				db.select({ value: count() }).from(user).get(),
				db
					.select({ value: count() })
					.from(account)
					.where(eq(account.providerId, 'discord'))
					.get(),
				db.select({ value: count() }).from(serverBilling).get(),
				db
					.select({ value: sql<number>`coalesce(sum(${creditAccount.balance}), 0)` })
					.from(creditAccount)
					.get()
			]);

			await interaction.editReply({
				embeds: [
					new EmbedBuilder()
						.setTitle('Panel statistics')
						.setColor(0x6366f1)
						.addFields(
							{ name: 'Accounts', value: String(accounts?.value ?? 0), inline: true },
							{ name: 'Linked Discord', value: String(linked?.value ?? 0), inline: true },
							{ name: 'Billed servers', value: String(servers?.value ?? 0), inline: true },
							{
								name: 'Credits in circulation',
								value: String(credits?.value ?? 0),
								inline: true
							}
						)
						.setFooter({ text: 'Billed servers only includes servers with renewal billing.' })
				]
			});
		}
	},
	{
		data: new SlashCommandBuilder()
			.setName('panel-user')
			.setDescription('Look up the panel account linked to a Discord member.')
			.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
			.addUserOption((option) =>
				option.setName('user').setDescription('Discord member to look up.').setRequired(true)
			),
		execute: async (interaction) => {
			if (await refuseNonAdmin(interaction)) return;

			await interaction.deferReply({ flags: MessageFlags.Ephemeral });

			const target = interaction.options.getUser('user', true);
			const linked = await linkedPanelUser(target.id);

			if (!linked) {
				await interaction.editReply({
					content: `${target} does not have a linked panel account.`
				});
				return;
			}

			const balance = await getCreditBalance(linked.id);

			await interaction.editReply({
				embeds: [
					new EmbedBuilder()
						.setTitle(`Panel account for ${target.username}`)
						.setColor(0x0ea5e9)
						.addFields(
							{ name: 'Name', value: linked.name, inline: true },
							{ name: 'Role', value: linked.role || 'user', inline: true },
							{ name: 'Banned', value: linked.banned ? 'Yes' : 'No', inline: true },
							{ name: 'Credits', value: String(balance), inline: true },
							{ name: 'Email', value: linked.email },
							{ name: 'Registered', value: relative(linked.createdAt), inline: true }
						)
				]
			});
		}
	},
	{
		data: new SlashCommandBuilder()
			.setName('panel-grant')
			.setDescription('Grant credits to a linked panel account.')
			.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
			.addUserOption((option) =>
				option.setName('user').setDescription('Discord member to credit.').setRequired(true)
			)
			.addIntegerOption((option) =>
				option
					.setName('amount')
					.setDescription('Credits to add.')
					.setMinValue(1)
					.setRequired(true)
			)
			.addStringOption((option) =>
				option.setName('reason').setDescription('Shown in the credit history.').setMaxLength(200)
			),
		execute: async (interaction) => {
			if (await refuseNonAdmin(interaction)) return;

			await interaction.deferReply({ flags: MessageFlags.Ephemeral });

			const target = interaction.options.getUser('user', true);
			const amount = interaction.options.getInteger('amount', true);
			const reason = interaction.options.getString('reason')?.trim();
			const linked = await linkedPanelUser(target.id);

			if (!linked) {
				await interaction.editReply({
					content: `${target} does not have a linked panel account.`
				});
				return;
			}

			const granted = await addCredits({
				userId: linked.id,
				amount,
				kind: 'discord_grant',
				reference: `discord-grant:${interaction.id}`,
				description: reason ? `Discord grant: ${reason}` : 'Granted from Discord',
				metadata: {
					actorDiscordId: interaction.user.id,
					targetDiscordId: target.id,
					guildId: interaction.guildId
				}
			});

			await interaction.editReply({
				embeds: [
					new EmbedBuilder()
						.setTitle('Credits granted')
						.setColor(0x22c55e)
						.setDescription(`Added **${amount}** credits to **${linked.name}** (${target}).`)
						.addFields({ name: 'New balance', value: String(granted.balance), inline: true })
						.setFooter({
							text: `By ${interaction.user.username}${reason ? ` · ${reason}` : ''}`
						})
				]
			});

			logActivity({
				userId: linked.id,
				action: 'discord.credits.grant',
				message: `Discord admin ${interaction.user.username} granted ${amount} credits.`,
				metadata: {
					actorDiscordId: interaction.user.id,
					targetDiscordId: target.id,
					guildId: interaction.guildId,
					amount,
					reason: reason ?? null
				}
			});
		}
	}
];

export const registerCommands = async (guild: Guild) => {
	await guild.commands.set(commands.map((command) => command.data.toJSON()));
	console.info(`[discord] Registered ${commands.length} slash commands in ${guild.name}.`);
};

const reportFailure = async (interaction: ChatInputCommandInteraction, message: string) => {
	try {
		if (interaction.deferred || interaction.replied) {
			await interaction.editReply({ content: message, embeds: [] });
		} else {
			await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
		}
	} catch (cause) {
		if (!isExpiredInteraction(cause)) {
			console.error('[discord] Unable to report a command failure.', cause);
		}
	}
};

export const handleInteraction = async (interaction: Interaction) => {
	if (!interaction.isChatInputCommand() || !interaction.guildId) return;

	const command = commands.find((entry) => entry.data.name === interaction.commandName);

	if (!command) return;

	try {
		await command.execute(interaction);
	} catch (cause) {
		if (isExpiredInteraction(cause)) {
			console.warn(
				`[discord] /${interaction.commandName} was not answered in time (interaction expired).`
			);
			return;
		}

		console.error(`[discord] Command /${interaction.commandName} failed.`, cause);
		await reportFailure(interaction, 'Something went wrong running that command.');
	}
};
