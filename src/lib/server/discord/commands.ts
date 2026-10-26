import type {
	ChatInputCommandInteraction,
	Client,
	Interaction,
	RESTPostAPIChatInputApplicationCommandsJSONBody
} from 'discord.js';

type Command = {
	data: { name: string; toJSON(): RESTPostAPIChatInputApplicationCommandsJSONBody };
	execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
};

type InviteStats = { total: number; active: number; left: number };
/*
* TODO: connect this to database
*/
const getInviteStats = async (_guildId: string, _userId: string): Promise<InviteStats> => {
	throw new Error('getInviteStats is not implemented yet.');
};

let commandCache: Command[] | null = null;

const buildCommands = async (): Promise<Command[]> => {
	if (commandCache) return commandCache;

	const { EmbedBuilder, MessageFlags, SlashCommandBuilder } = await import('discord.js');

	commandCache = [
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
				.setDescription('Show invite stats for you or another member.')
				.addUserOption((option) =>
					option.setName('user').setDescription('Member to look up (defaults to you).')
				),
			execute: async (interaction) => {
				if (!interaction.guildId) return;

				await interaction.deferReply({ flags: MessageFlags.Ephemeral });

				const target = interaction.options.getUser('user') ?? interaction.user;
				const stats = await getInviteStats(interaction.guildId, target.id);

				const embed = new EmbedBuilder()
					.setTitle(`Invites for ${target.username}`)
					.setColor(0x22c55e)
					.addFields(
						{ name: 'Total', value: String(stats.total), inline: true },
						{ name: 'Active', value: String(stats.active), inline: true },
						{ name: 'Left', value: String(stats.left), inline: true }
					);

				await interaction.editReply({ embeds: [embed] });
			}
		}
	];

	return commandCache;
};

export const registerCommands = async (client: Client, guildId: string) => {
	const commands = await buildCommands();
	const guild = await client.guilds.fetch(guildId);

	await guild.commands.set(commands.map((command) => command.data.toJSON()));
	console.info(`[discord] Registered ${commands.length} slash commands in ${guild.name}.`);
};

export const handleInteraction = async (interaction: Interaction, guildId: string) => {
	if (!interaction.isChatInputCommand() || interaction.guildId !== guildId) return;

	const commands = await buildCommands();
	const command = commands.find((entry) => entry.data.name === interaction.commandName);

	if (!command) return;

	try {
		await command.execute(interaction);
	} catch (cause) {
		console.error(`[discord] Command /${interaction.commandName} failed.`, cause);

		const { MessageFlags } = await import('discord.js');
		const message = 'Something went wrong running that command.';

		if (interaction.deferred || interaction.replied) {
			await interaction.editReply({ content: message, embeds: [] }).catch(() => {});
		} else {
			await interaction.reply({ content: message, flags: MessageFlags.Ephemeral }).catch(() => {});
		}
	}
};