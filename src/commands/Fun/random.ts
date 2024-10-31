import { ApplicationCommandOptionData, ApplicationCommandOptionType, ChatInputCommandInteraction, Message } from 'discord.js';
import EgglordClient from '../../base/Egglord';
import { Command, ErrorEmbed } from '../../structures';

export default class Random extends Command {
	constructor(client: EgglordClient) {
		super(client, {
			name: 'random',
			dirname: __dirname,
			description: 'Random number or caps',
			usage: 'random',
			cooldown: 1000,
			examples: ['random'],
			slash: true,
			options: client.commandManager.subCommands.filter(c => c.help.name.startsWith('random-')).map(c => ({
				name: c.help.name.replace('random-', ''),
				description: c.help.description,
				type: ApplicationCommandOptionType.Subcommand,
				options: c.conf.options,
			})) as ApplicationCommandOptionData[],
		});
	}

	async run(client: EgglordClient, message: Message) {
		if (!message.channel.isSendable()) return;

		try {
			const { subCommand } = await client.commandManager.getArgs(this, message);
			const command = client.commandManager.get(`random-${subCommand}`);
			if (command) return command.run(client, message);
			message.channel.send({ content: 'error' });
		} catch (err: any) {
			console.log(err);
			const embed = new ErrorEmbed(client, message.guild)
				.setMessage(err);
			message.channel.send({ embeds: [embed] });
		}
	}

	async callback(client: EgglordClient, interaction: ChatInputCommandInteraction<'cached'>) {
		const command = client.commandManager.get(`random-${interaction.options.getSubcommand()}`);
		if (command) return command.callback(client, interaction);
		interaction.reply({ content: 'Error', ephemeral: true });
	}
}
