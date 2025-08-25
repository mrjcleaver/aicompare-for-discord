import { Client, Events, ActivityType } from 'discord.js';
import { ExtendedClient } from '../types';
import { eventLogger } from '../utils/logger';
import { config } from '../config';

export default {
  name: Events.ClientReady,
  once: true,
  async execute(client: ExtendedClient) {
    if (!client.user) {
      eventLogger.error('Client user is not available');
      return;
    }

    eventLogger.info(`Bot is ready! Logged in as ${client.user.tag}`);
    eventLogger.info(`Serving ${client.guilds.cache.size} guilds with ${client.users.cache.size} users`);

    // Set bot presence
    client.user.setPresence({
      activities: [{
        name: 'AI model comparisons',
        type: ActivityType.Watching
      }],
      status: 'online'
    });

    // Log guild information
    client.guilds.cache.forEach(guild => {
      eventLogger.info(`Guild: ${guild.name} (${guild.id}) - ${guild.memberCount} members`);
    });

    // Register slash commands if in development mode or specific guilds
    if (config.discord.guildIds.length > 0) {
      await registerGuildCommands(client);
    } else {
      await registerGlobalCommands(client);
    }
  },
};

async function registerGuildCommands(client: ExtendedClient) {
  if (!client.application) {
    eventLogger.error('Client application is not available for command registration');
    return;
  }

  const commands = Array.from(client.commands.values()).map(command => command.data.toJSON());
  
  for (const guildId of config.discord.guildIds) {
    try {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) {
        eventLogger.warn(`Guild ${guildId} not found, skipping command registration`);
        continue;
      }

      await guild.commands.set(commands);
      eventLogger.info(`Successfully registered ${commands.length} commands for guild ${guild.name}`);
    } catch (error) {
      eventLogger.error(`Failed to register commands for guild ${guildId}:`, error);
    }
  }
}

async function registerGlobalCommands(client: ExtendedClient) {
  if (!client.application) {
    eventLogger.error('Client application is not available for command registration');
    return;
  }

  try {
    const commands = Array.from(client.commands.values()).map(command => command.data.toJSON());
    await client.application.commands.set(commands);
    eventLogger.info(`Successfully registered ${commands.length} global commands`);
  } catch (error) {
    eventLogger.error('Failed to register global commands:', error);
  }
}