import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { Command, AIModel } from '../types';
import { commandLogger } from '../utils/logger';
import ValidationUtils from '../utils/validation';
import { EmbedUtils } from '../utils/embed-builder';
import { constants, defaultModelSelections } from '../config';
import { v4 as uuidv4 } from 'uuid';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('compare')
    .setDescription('Compare AI model responses to your prompt')
    .addStringOption(option =>
      option.setName('prompt')
        .setDescription('Your query for AI models')
        .setRequired(true)
        .setMaxLength(constants.MAX_PROMPT_LENGTH)
    )
    .addStringOption(option =>
      option.setName('models')
        .setDescription('Select model combination')
        .setRequired(false)
        .addChoices(
          { name: '🧠 GPT-4 + 🎭 Claude-3.5 (Recommended)', value: 'gpt-4,claude-3.5-sonnet' },
          { name: '⚡ Fast: GPT-3.5 + Claude Haiku + Gemini Flash', value: 'gpt-3.5-turbo,claude-3-haiku,gemini-1.5-flash' },
          { name: '🎯 Analytical: GPT-4 Turbo + Claude + Command R+', value: 'gpt-4-turbo,claude-3.5-sonnet,command-r-plus' },
          { name: '🎨 Creative: GPT-4 + Claude + Gemini Pro', value: 'gpt-4,claude-3.5-sonnet,gemini-1.5-pro' },
          { name: '🚀 All Models', value: 'all' },
          { name: '🎛️ Custom Selection', value: 'custom' }
        )
    )
    .addNumberOption(option =>
      option.setName('temperature')
        .setDescription('Model creativity (0.0 = focused, 1.0 = creative)')
        .setMinValue(0.0)
        .setMaxValue(1.0)
    )
    .addIntegerOption(option =>
      option.setName('max_tokens')
        .setDescription('Maximum response length (tokens)')
        .setMinValue(50)
        .setMaxValue(4000)
    )
    .addStringOption(option =>
      option.setName('system_prompt')
        .setDescription('Additional instructions for the AI models')
        .setMaxLength(500)
    ),
  
  cooldown: 30, // 30 second cooldown between uses
  
  async execute(interaction: ChatInputCommandInteraction) {
    try {
      // Defer reply immediately to avoid timeout
      await interaction.deferReply({ ephemeral: false });

      const prompt = interaction.options.getString('prompt', true);
      const modelSelection = interaction.options.getString('models') || 'gpt-4,claude-3.5-sonnet';
      const temperature = interaction.options.getNumber('temperature') ?? constants.DEFAULT_TEMPERATURE;
      const maxTokens = interaction.options.getInteger('max_tokens') ?? constants.DEFAULT_MAX_TOKENS;
      const systemPrompt = interaction.options.getString('system_prompt') ?? undefined;

      commandLogger.info(`Compare command executed`, {
        userId: interaction.user.id,
        guildId: interaction.guild?.id,
        prompt: prompt.substring(0, 100),
        models: modelSelection,
        temperature,
        maxTokens
      });

      // Validate inputs
      ValidationUtils.validatePrompt(prompt);
      const validatedTemperature = ValidationUtils.validateTemperature(temperature);
      
      // Parse model selection
      let selectedModels: AIModel[];
      
      if (modelSelection === 'custom') {
        // Show model selection menu for custom selection
        const embed = EmbedUtils.createErrorEmbed(
          'Custom Model Selection',
          'Custom model selection is not yet implemented in this command. Please use one of the preset options or contact an admin.',
          'Use the dropdown menu that should appear below to select your models.'
        );
        
        await interaction.editReply({ embeds: [embed] });
        return;
      } else if (modelSelection === 'all') {
        selectedModels = defaultModelSelections.all;
      } else {
        const modelNames = modelSelection.split(',');
        selectedModels = ValidationUtils.validateModels(modelNames);
      }

      const validatedMaxTokens = ValidationUtils.validateMaxTokens(maxTokens, selectedModels);

      // Generate unique query ID
      const queryId = uuidv4();

      // Create initial progress embed
      const progressEmbed = EmbedUtils.createProgressEmbed(queryId, selectedModels, prompt);
      await interaction.editReply({ embeds: [progressEmbed] });

      // Queue the AI comparison job
      const { QueryService } = await import('../services/query-service');
      const queryService = new QueryService();

      await queryService.createQuery({
        userId: interaction.user.id,
        guildId: interaction.guild?.id || 'dm',
        channelId: interaction.channelId,
        messageId: interaction.id,
        prompt,
        models: selectedModels,
        temperature: validatedTemperature,
        maxTokens: validatedMaxTokens,
        systemPrompt
      });

      commandLogger.info(`Query ${queryId} queued for processing`, {
        userId: interaction.user.id,
        modelsCount: selectedModels.length
      });

    } catch (error) {
      commandLogger.error('Compare command error:', {
        error: error.message,
        userId: interaction.user.id,
        guildId: interaction.guild?.id
      });

      let errorMessage = 'An unexpected error occurred while processing your request.';
      
      if (error instanceof Error) {
        // Handle validation errors with user-friendly messages
        if (error.name === 'ValidationError') {
          errorMessage = error.message;
        }
      }

      const errorEmbed = EmbedUtils.createErrorEmbed(
        'Comparison Failed',
        errorMessage,
        process.env.NODE_ENV === 'development' ? error.stack : undefined
      );

      if (interaction.deferred) {
        await interaction.editReply({ embeds: [errorEmbed] });
      } else {
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }
    }
  },
};

export default command;