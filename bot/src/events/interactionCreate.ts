import { Events, Interaction, InteractionType, Collection } from 'discord.js';
import { ExtendedClient, Command } from '../types';
import { eventLogger, errorLogger } from '../utils/logger';
import ValidationUtils from '../utils/validation';
import { constants } from '../config';

// Rate limiting storage
const userCooldowns = new Map<string, Map<string, number>>();

export default {
  name: Events.InteractionCreate,
  async execute(interaction: Interaction, client: ExtendedClient) {
    try {
      if (interaction.isChatInputCommand()) {
        await handleSlashCommand(interaction, client);
      } else if (interaction.isButton()) {
        await handleButtonInteraction(interaction, client);
      } else if (interaction.isStringSelectMenu()) {
        await handleSelectMenuInteraction(interaction, client);
      }
    } catch (error) {
      errorLogger.error('Error handling interaction:', {
        error,
        interactionType: interaction.type,
        userId: interaction.user.id,
        guildId: interaction.guild?.id,
      });

      const errorMessage = 'An error occurred while processing your request. Please try again later.';
      
      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.followUp({ content: errorMessage, ephemeral: true });
        } else {
          await interaction.reply({ content: errorMessage, ephemeral: true });
        }
      } catch (replyError) {
        errorLogger.error('Failed to send error message:', replyError);
      }
    }
  },
};

async function handleSlashCommand(interaction: any, client: ExtendedClient) {
  const command = client.commands.get(interaction.commandName) as Command;

  if (!command) {
    eventLogger.warn(`Command ${interaction.commandName} not found`);
    await interaction.reply({ 
      content: '❌ Command not found. Please try again or contact support.',
      ephemeral: true 
    });
    return;
  }

  // Check cooldowns
  if (!checkCooldown(interaction, command)) {
    return;
  }

  // Validate user permissions
  try {
    ValidationUtils.validateUserPermissions(interaction.user.id, interaction.guild?.id || '');
  } catch (error) {
    await interaction.reply({
      content: `❌ ${error.message}`,
      ephemeral: true
    });
    return;
  }

  // Execute command
  try {
    eventLogger.info(`Executing command ${interaction.commandName} for user ${interaction.user.tag} in guild ${interaction.guild?.name || 'DM'}`);
    await command.execute(interaction);
  } catch (error) {
    errorLogger.error(`Command ${interaction.commandName} execution failed:`, {
      error,
      userId: interaction.user.id,
      guildId: interaction.guild?.id,
    });

    const errorMessage = 'There was an error while executing this command!';
    
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: errorMessage, ephemeral: true });
    } else {
      await interaction.reply({ content: errorMessage, ephemeral: true });
    }
  }
}

async function handleButtonInteraction(interaction: any, client: ExtendedClient) {
  try {
    const { type, queryId, data } = ValidationUtils.validateInteractionData(interaction.customId);
    
    eventLogger.info(`Button interaction: ${type} for query ${queryId} by user ${interaction.user.tag}`);

    // Import interaction handlers dynamically
    const { InteractionHandler } = await import('../services/interaction-handler');
    const handler = new InteractionHandler();

    switch (type) {
      case 'vote':
        await handler.handleVote(interaction, queryId, data);
        break;
      case 'details':
        await handler.handleDetails(interaction, queryId);
        break;
      case 'thread':
        await handler.handleThreadCreation(interaction, queryId);
        break;
      case 'settings':
        await handler.handleSettings(interaction, data);
        break;
      case 'export':
        await handler.handleExport(interaction, queryId);
        break;
      default:
        await interaction.reply({
          content: '❌ Unknown interaction type.',
          ephemeral: true
        });
    }
  } catch (error) {
    errorLogger.error('Button interaction error:', error);
    
    await interaction.reply({
      content: '❌ Failed to process button interaction. Please try again.',
      ephemeral: true
    });
  }
}

async function handleSelectMenuInteraction(interaction: any, client: ExtendedClient) {
  try {
    const { type, queryId, data } = ValidationUtils.validateInteractionData(interaction.customId);
    
    eventLogger.info(`Select menu interaction: ${type} for query ${queryId} by user ${interaction.user.tag}`);

    const { InteractionHandler } = await import('../services/interaction-handler');
    const handler = new InteractionHandler();

    switch (type) {
      case 'rate':
        await handler.handleModelRating(interaction, queryId, interaction.values);
        break;
      case 'models':
        await handler.handleModelSelection(interaction, interaction.values);
        break;
      case 'filter':
        await handler.handleHistoryFilter(interaction, interaction.values[0]);
        break;
      default:
        await interaction.reply({
          content: '❌ Unknown interaction type.',
          ephemeral: true
        });
    }
  } catch (error) {
    errorLogger.error('Select menu interaction error:', error);
    
    await interaction.reply({
      content: '❌ Failed to process selection. Please try again.',
      ephemeral: true
    });
  }
}

function checkCooldown(interaction: any, command: Command): boolean {
  const cooldownAmount = (command.cooldown ?? 0) * 1000; // Convert to milliseconds
  
  if (cooldownAmount <= 0) return true;

  const now = Date.now();
  const userId = interaction.user.id;
  const commandName = command.data.name;

  if (!userCooldowns.has(userId)) {
    userCooldowns.set(userId, new Collection());
  }

  const userCooldownMap = userCooldowns.get(userId)!;
  const expirationTime = userCooldownMap.get(commandName);

  if (expirationTime && now < expirationTime) {
    const timeLeft = (expirationTime - now) / 1000;
    
    interaction.reply({
      content: `⏳ Please wait ${timeLeft.toFixed(1)} more seconds before using the \`${commandName}\` command again.`,
      ephemeral: true
    });
    
    return false;
  }

  userCooldownMap.set(commandName, now + cooldownAmount);
  
  // Clean up expired cooldowns
  setTimeout(() => {
    userCooldownMap.delete(commandName);
    if (userCooldownMap.size === 0) {
      userCooldowns.delete(userId);
    }
  }, cooldownAmount);

  return true;
}