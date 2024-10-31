import { ApplicationCommandOptionData, ApplicationCommandOptionType, ApplicationCommandPermissionType, Collection, Message, PermissionsBitField } from 'discord.js';
import { Command, ErrorEmbed } from '../structures';
import EgglordClient from './Egglord';
import { Setting } from '@prisma/client';
import GuildManager from '../accessors/Guild';
import defaultGuildSettings from '../assets/json/defaultGuildSettings.json';

export default class CommandManager {
	aliases: Collection<string, Command>;
	commands: Collection<string, Command>;
	subCommands: Collection<string, Command>;
	cooldowns: Set<string>;

	constructor() {
		this.aliases = new Collection();
		this.commands = new Collection();
		this.subCommands = new Collection();
		this.cooldowns = new Set();
	}

	add(cmd: Command) {
		// Check if it's a sub command or not
		if (cmd.conf.isSubCmd) {
			this.subCommands.set(cmd.help.name, cmd);
		} else {
			this.commands.set(cmd.help.name, cmd);
		}

		// Add the aliases
		for (const alias of cmd.help.aliases) {
			this.aliases.set(alias, cmd);
		}
	}

	async verify(message: Message) {
		const args = message.content.split(' ');
		const settings = message.guild?.settings ?? defaultGuildSettings;

		// Does not start with the command prefix
		if (!message.content.startsWith(settings.prefix)) return false;

		// Not a valid command
		const command = this.commands.get(args[0].slice(settings.prefix.length).toLowerCase());
		if (!command) return false;

		// Check if user is in cooldown
		if (this.cooldowns.has(message.author.id)) return false;

		// Check if user is not allowed to interact with the bot (right to restrict processing, abuse etc)

		// Check if command is guildOnly but has been ran in DM
		if (command.conf.guildOnly && message.guild == null) {
			if (message.deletable) message.delete();
			return message.channel.isSendable() ? message.channel.send('events/message:GUILD_ONLY') : false;
		}

		const applicationCommands = await message.guild?.commands.fetch();
		const applicationCommand = applicationCommands?.find(c => c.name == command.help.name);

		// Follow the rules of the application command
		if (applicationCommand) {
			const permissionOverwrites = await message.client.application.commands.permissions.fetch({ guild: `${message.guild?.id}` });
			const cmdPermissions = permissionOverwrites.get(applicationCommand.id);

			for (const permission of cmdPermissions ?? []) {
				switch (permission.type) {
					case ApplicationCommandPermissionType.Channel:
						// Check for banned channels
						if (message.channel.id == permission.id && !permission.permission) {
							return message.channel.isSendable() ? message.channel.send('You can\'t run this command in this channel') : false;
						}
						break;
					case ApplicationCommandPermissionType.Role:
						// Check for banned role
						break;
					case ApplicationCommandPermissionType.User:
						if (message.author.id == permission.id && !permission.permission) {
							return message.channel.isSendable() ? message.channel.send('You are blocked from running this command in this server.') : false;
						}
						break;
				}
			}
		} else if (message.inGuild()) {
			const neededPermissions: bigint[] = [];
			command.conf.userPermissions.forEach((perm) => {
				if (message.member && !message.channel.permissionsFor(message.member).has(perm)) {
					neededPermissions.push(perm);
				}
			});

			if (neededPermissions.length > 0) {
				const perms = new PermissionsBitField();
				neededPermissions.forEach((item) => perms.add(item));
				if (message.deletable) message.delete();

				const embed = new ErrorEmbed(message.client, message.guild)
					.setMessage('misc:USER_PERMISSION', { PERMISSIONS: perms.toArray().map((p) => message.client.languageManager.translate(message.guild, `permissions:${p}`)).join(', ') });
				return message.channel.send({ embeds: [embed] });
			}
		}

		// Run the command
		command.run(message.client as EgglordClient, message as Message<true>, settings as Setting);
		this.cooldowns.add(message.author.id);

		// Remove from user from cooldown once finished
		setTimeout(() => {
			this.cooldowns.delete(message.author.id);
		}, message.author.isPremiumTo !== null ? command.conf.cooldown * 0.75 : command.conf.cooldown);
		return true;
	}

	async getArgs(command: Command, message: Message) {
		const response: {[key: string]: any} = {};

		// Get the command options and the user input
		let options = command.conf.options;
		let args = message.content.split(' ').slice(1);

		// If the command is a sub-command, then remove the first arg which would have been the sub command name
		if (command.conf.isSubCmd) args = args.slice(1);

		for (let i = 0; i < options.length; i++) {
			const option = options[i];
			const arg = args[i];

			switch (option.type) {
				case ApplicationCommandOptionType.User: {
					const user = await message.guild?.members.fetch(arg);
					if (!user) throw new Error(`${arg} is not a valid user.`);
					response[option.name] = user;
					break;
				}
				case ApplicationCommandOptionType.Role: {
					const role = await message.guild?.roles.fetch(arg);
					if (!role) throw new Error(`${arg} is not a valid role.`);
					response[option.name] = role;
					break;
				}
				case ApplicationCommandOptionType.String:
					response[option.name] = args;
					break;
				case ApplicationCommandOptionType.Number:
				case ApplicationCommandOptionType.Integer:
					if (isNaN(Number(arg))) throw new Error(`${arg} is not a number.`);
					if (option.minValue && Number(arg) < option.minValue) throw new Error(`${arg} must be higher than ${option.minValue}.`);
					if (option.maxValue && Number(arg) > option.maxValue) throw new Error(`${arg} must be lower than ${option.maxValue}.`);
					response[option.name] = Number.parseInt(arg);
					break;
				case ApplicationCommandOptionType.Boolean:
					response[option.name] = Boolean(arg);
					break;
				case ApplicationCommandOptionType.Channel: {
					const channel = await message.guild?.channels.fetch(arg);
					if (!channel) throw new Error(`${arg} is not a valid channel.`);
					if (option.channelTypes?.includes(channel.type)) throw new Error(`${arg} is the correct channel type.`);
					response[option.name] = channel;
					break;
				}
				case ApplicationCommandOptionType.Subcommand: {
					const subCommandNames = command.conf.options.filter(c => c.type == ApplicationCommandOptionType.Subcommand).map(c => c.name);
					if (!subCommandNames.includes(arg)) throw new Error(`${arg} is not a valid sub command`);

					// Re-update options for the selected sub-command
					const selectedSubCommand = command.conf.options.find(c => c.name === arg);

					// @ts-ignore stuff
					if (selectedSubCommand && selectedSubCommand.options) {
						// @ts-ignore stuff
						options = selectedSubCommand.options as ApplicationCommandOptionData;
						args = args.slice(1);
						i = -1;
					}

					response['subCommand'] = arg;
					break;
				}
			}
		}

		return response;
	}

	get(cmd: string) {
		return this.commands.get(cmd) || this.subCommands.get(cmd) || this.aliases.get(cmd);
	}

	allNames() {
		return [...this.commands.keys(), ...this.subCommands.keys(), ...this.aliases.keys()];
	}

	async fetchByGuildId(guildId: string) {
		return new GuildManager().fetchCommandsById(guildId);
	}
}