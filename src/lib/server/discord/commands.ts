import { and, eq } from 'drizzle-orm';
import {
	EmbedBuilder,
	MessageFlags,
	SlashCommandBuilder,
	type ChatInputCommandInteraction,
	type Guild,
	type Interaction,
	type RESTPostAPIChatInputApplicationCommandsJSONBody
} from 'discord.js';
import { db } from '#lib/server/db/index.ts';
import { invitedUser } from '#lib/server/db/ops.ts';
import {
	byRecency,
	summarizeInvites,
	type InviteSummary,
	type TrackedInvite
} from '#lib/server/rewards/invite-stats.ts';
import { getDiscordRewardConfig } from '#lib/server/rewards/config.ts';

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
