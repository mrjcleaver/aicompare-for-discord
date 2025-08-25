import { REST, Routes } from 'discord.js';
import { config } from './config';
import fs from 'fs';
import path from 'path';
import logger from './utils/logger';

const commands = [];

// Load all command files
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js') || file.endsWith('.ts'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  
  if ('data' in command.default) {
    commands.push(command.default.data.toJSON());
    logger.info(`Loaded command: ${command.default.data.name}`);
  } else {
    logger.warn(`Command at ${filePath} is missing a required "data" property.`);
  }
}

// Construct and prepare an instance of the REST module
const rest = new REST().setToken(config.discord.token);

// Deploy commands
async function deployCommands() {
  try {
    logger.info(`Started refreshing ${commands.length} application (/) commands.`);

    if (config.discord.guildIds.length > 0) {
      // Deploy to specific guilds (development)
      for (const guildId of config.discord.guildIds) {
        const data = await rest.put(
          Routes.applicationGuildCommands(config.discord.clientId, guildId),
          { body: commands }
        ) as any[];
        
        logger.info(`Successfully reloaded ${data.length} guild commands for ${guildId}.`);
      }
    } else {
      // Deploy globally (production)
      const data = await rest.put(
        Routes.applicationCommands(config.discord.clientId),
        { body: commands }
      ) as any[];
      
      logger.info(`Successfully reloaded ${data.length} global application (/) commands.`);
    }

    logger.info('Command deployment completed!');
  } catch (error) {
    logger.error('Error deploying commands:', error);
    process.exit(1);
  }
}

// Clean up commands (useful for removing old commands)
async function clearCommands() {
  try {
    logger.info('Started clearing application (/) commands.');

    if (config.discord.guildIds.length > 0) {
      // Clear guild commands
      for (const guildId of config.discord.guildIds) {
        await rest.put(
          Routes.applicationGuildCommands(config.discord.clientId, guildId),
          { body: [] }
        );
        
        logger.info(`Successfully cleared guild commands for ${guildId}.`);
      }
    } else {
      // Clear global commands
      await rest.put(
        Routes.applicationCommands(config.discord.clientId),
        { body: [] }
      );
      
      logger.info('Successfully cleared global application (/) commands.');
    }

    logger.info('Command cleanup completed!');
  } catch (error) {
    logger.error('Error clearing commands:', error);
    process.exit(1);
  }
}

// Check command line arguments
const args = process.argv.slice(2);

if (args.includes('--clear')) {
  clearCommands();
} else {
  deployCommands();
}

export { deployCommands, clearCommands };