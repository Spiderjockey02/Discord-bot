// Dependencies
const { EmbedBuilder, ApplicationCommandOptionType, PermissionsBitField: { Flags } } = require('discord.js'),
	{ time: { read24hrFormat }, functions: { checkMusic } } = require('../../utils'), ;
import Command from '../../structures/Command';

/**
 * seek command
 * @extends {Command}
*/
export default class Seek extends Command {
	/**
	   * @param {Client} client The instantiating client
	   * @param {CommandData} data The data for the command
	*/
	constructor() {
		super({
			name: 'seek',
			guildOnly: true,
			dirname: __dirname,
			botPermissions: [Flags.SendMessages, Flags.EmbedLinks, Flags.Speak],
			description: 'Sets the playing track\'s position to the specified position.',
			usage: 'seek <time>',
			cooldown: 3000,
			examples: ['seek 1:00'],
			slash: true,
			options: client.subCommands.filter(c => c.help.name.startsWith('seek-')).map(c => ({
				name: c.help.name.replace('seek-', ''),
				description: c.help.description,
				type: ApplicationCommandOptionType.Subcommand,
				options: c.conf.options,
			})),
		});
	}

	/**
	   * Function for receiving message.
	   * @param {client} client The instantiating client
	   * @param {message} message The message that ran the command
	   * @readonly
  */
	async run(client, message, settings) {
		// check to make sure client can play music based on permissions
		const playable = checkMusic(message.member, client);
		if (typeof (playable) !== 'boolean') return message.channel.error(playable);

		// Make sure song isn't a stream
		const player = client.manager?.players.get(message.guild.id);
		if (!player.queue.current.isSeekable) return message.channel.error('music/seek:LIVSTREAM');

		// Make sure a time was inputted
		if (!message.args[0]) return message.channel.error('misc:INCORRECT_FORMAT', { EXAMPLE: settings.prefix.concat(message.translate('music/seek:USAGE')) });

		// update the time
		const time = read24hrFormat((message.args[0]) ? message.args[0] : '10');

		if (time > player.queue.current.duration) {
			message.channel.send(message.translate('music/seek:INVALID', { TIME: new Date(player.queue.current.duration).toISOString().slice(11, 19) }));
		} else {
			player.seek(time);
			const embed = new EmbedBuilder()
				.setColor(message.member.displayHexColor)
				.setDescription(message.translate('music/seek:UPDATED', { TIME: new Date(time).toISOString().slice(14, 19) }));
			message.channel.send({ embeds: [embed] });
		}
	}

	/**
	   * Function for receiving interaction.
	   * @param {client} client The instantiating client
	   * @param {interaction} interaction The interaction that ran the command
	   * @param {guild} guild The guild the interaction ran in
	 * @param {args} args The options provided in the command, if any
	   * @readonly
	*/
	async callback(client, interaction, guild, args) {
		const command = client.subCommands.get(`seek-${interaction.options.getSubcommand()}`);
		if (command) {
			command.callback(client, interaction, guild, args);
		} else {
			interaction.reply({ content: 'Error', ephemeral: true });
		}
	}
}
