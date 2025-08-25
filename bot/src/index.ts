import { Client, Collection, GatewayIntentBits, Partials } from 'discord.js';
import { Command, ExtendedClient } from './types';
import { config } from './config';
import logger from './utils/logger';
import fs from 'fs';
import path from 'path';

// Create extended Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction,
  ]
}) as ExtendedClient;

// Initialize collections
client.commands = new Collection();
client.cooldowns = new Collection();

// Load commands
const loadCommands = async () => {
  const commandsPath = path.join(__dirname, 'commands');
  
  if (!fs.existsSync(commandsPath)) {
    logger.warn('Commands directory not found, creating it...');
    fs.mkdirSync(commandsPath, { recursive: true });
    return;
  }

  const commandFiles = fs.readdirSync(commandsPath).filter(file => 
    file.endsWith('.js') || file.endsWith('.ts')
  );

  for (const file of commandFiles) {
    try {
      const command = await import(path.join(commandsPath, file));
      const commandData = command.default || command;
      
      if ('data' in commandData && 'execute' in commandData) {
        client.commands.set(commandData.data.name, commandData);
        logger.info(`Loaded command: ${commandData.data.name}`);
      } else {
        logger.warn(`Command ${file} is missing required "data" or "execute" property`);
      }
    } catch (error) {
      logger.error(`Error loading command ${file}:`, error);
    }
  }

  logger.info(`Successfully loaded ${client.commands.size} commands`);
};

// Load events
const loadEvents = async () => {
  const eventsPath = path.join(__dirname, 'events');
  
  if (!fs.existsSync(eventsPath)) {
    logger.warn('Events directory not found, creating it...');
    fs.mkdirSync(eventsPath, { recursive: true });
    return;
  }

  const eventFiles = fs.readdirSync(eventsPath).filter(file => 
    file.endsWith('.js') || file.endsWith('.ts')
  );

  for (const file of eventFiles) {
    try {
      const event = await import(path.join(eventsPath, file));
      const eventData = event.default || event;
      
      if ('name' in eventData && 'execute' in eventData) {
        if (eventData.once) {
          client.once(eventData.name, (...args) => eventData.execute(...args, client));
        } else {
          client.on(eventData.name, (...args) => eventData.execute(...args, client));
        }
        logger.info(`Loaded event: ${eventData.name}`);
      } else {
        logger.warn(`Event ${file} is missing required "name" or "execute" property`);
      }
    } catch (error) {
      logger.error(`Error loading event ${file}:`, error);
    }
  }

  logger.info(`Successfully loaded ${eventFiles.length} events`);
};

// Initialize services
const initializeServices = async () => {
  try {
    // Initialize database connection
    const { DatabaseService } = await import('./services/database');
    await DatabaseService.initialize();
    
    // Initialize Redis connection
    const { RedisService } = await import('./services/redis');
    await RedisService.initialize();
    
    // Initialize AI services
    const { AIServiceManager } = await import('./services/ai-manager');
    await AIServiceManager.initialize();
    
    logger.info('All services initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize services:', error);
    throw error;
  }
};

// Graceful shutdown handler
const shutdown = async (signal: string) => {
  logger.info(`Received ${signal}, shutting down gracefully...`);
  
  try {
    // Destroy Discord client
    client.destroy();
    
    // Clean up services
    const { DatabaseService } = await import('./services/database');
    const { RedisService } = await import('./services/redis');
    
    await DatabaseService.close();
    await RedisService.close();
    
    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
};

// Error handlers
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Graceful shutdown handlers
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Initialize and start the bot
const start = async () => {
  try {
    logger.info('Starting AI Compare Discord Bot...');
    
    // Load commands and events
    await loadCommands();
    await loadEvents();
    
    // Initialize services
    await initializeServices();
    
    // Login to Discord
    await client.login(config.discord.token);
    
    logger.info('Bot started successfully!');
  } catch (error) {
    logger.error('Failed to start bot:', error);
    process.exit(1);
  }
};

// Start the bot
start();

export { client };