import { SlashCommandBuilder, ChatInputCommandInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { Command } from '../types';
import { commandLogger } from '../utils/logger';
import { EmbedUtils } from '../utils/embed-builder';
import { constants } from '../config';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('history')
    .setDescription('View your previous AI comparisons')
    .addIntegerOption(option =>
      option.setName('limit')
        .setDescription('Number of results to show (1-25)')
        .setMinValue(1)
        .setMaxValue(25)
    )
    .addStringOption(option =>
      option.setName('filter')
        .setDescription('Filter results by criteria')
        .addChoices(
          { name: 'All queries', value: 'all' },
          { name: 'Last 24 hours', value: '24h' },
          { name: 'Last week', value: '7d' },
          { name: 'Last month', value: '30d' },
          { name: 'Failed queries only', value: 'failed' },
          { name: 'Successful only', value: 'success' }
        )
    )
    .addStringOption(option =>
      option.setName('models')
        .setDescription('Filter by models used')
        .addChoices(
          { name: 'GPT models only', value: 'openai' },
          { name: 'Claude models only', value: 'anthropic' },
          { name: 'Gemini models only', value: 'google' },
          { name: 'Cohere models only', value: 'cohere' }
        )
    )
    .addBooleanOption(option =>
      option.setName('shared')
        .setDescription('Show results shared with this server (default: your queries only)')
    ),
  
  cooldown: 5, // 5 second cooldown
  
  async execute(interaction: ChatInputCommandInteraction) {
    try {
      await interaction.deferReply({ ephemeral: true });

      const limit = interaction.options.getInteger('limit') ?? 10;
      const filter = interaction.options.getString('filter') ?? 'all';
      const modelFilter = interaction.options.getString('models');
      const showShared = interaction.options.getBoolean('shared') ?? false;

      commandLogger.info(`History command executed`, {
        userId: interaction.user.id,
        guildId: interaction.guild?.id,
        limit,
        filter,
        modelFilter,
        showShared
      });

      // Import query service
      const { QueryService } = await import('../services/query-service');
      const queryService = new QueryService();

      // Build query parameters
      const queryParams = {
        userId: showShared ? undefined : interaction.user.id,
        guildId: showShared ? interaction.guild?.id : undefined,
        limit,
        page: 1,
        filter,
        modelFilter
      };

      // Fetch query history
      const historyResult = await queryService.getQueryHistory(queryParams);

      if (!historyResult || historyResult.data.length === 0) {
        const noResultsEmbed = EmbedUtils.createErrorEmbed(
          'No Results Found',
          showShared 
            ? 'No shared comparisons found in this server with the specified criteria.'
            : 'You haven\'t made any comparisons yet, or none match your filter criteria.',
          'Try using the `/compare` command to create your first comparison!'
        );

        await interaction.editReply({ embeds: [noResultsEmbed] });
        return;
      }

      // Create history embed
      const historyEmbed = EmbedUtils.createHistoryEmbed(
        historyResult.data,
        historyResult.page,
        historyResult.totalPages
      );

      // Add filter information to embed
      if (filter !== 'all' || modelFilter || showShared) {
        const filterInfo = [];
        if (filter !== 'all') filterInfo.push(`Time: ${filter}`);
        if (modelFilter) filterInfo.push(`Models: ${modelFilter}`);
        if (showShared) filterInfo.push('Scope: Server-wide');
        else filterInfo.push('Scope: Your queries only');
        
        historyEmbed.setFooter({ 
          text: `Filters: ${filterInfo.join(' | ')} • Page ${historyResult.page}/${historyResult.totalPages}` 
        });
      }

      // Create navigation buttons if there are multiple pages
      const components = [];
      
      if (historyResult.totalPages > 1) {
        const navigationRow = new ActionRowBuilder<ButtonBuilder>()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`history_${interaction.id}_prev_${historyResult.page - 1}`)
              .setLabel('← Previous')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(!historyResult.hasPrev),
            new ButtonBuilder()
              .setCustomId(`history_${interaction.id}_next_${historyResult.page + 1}`)
              .setLabel('Next →')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(!historyResult.hasNext),
            new ButtonBuilder()
              .setCustomId(`history_${interaction.id}_refresh`)
              .setLabel('🔄 Refresh')
              .setStyle(ButtonStyle.Primary)
          );
        
        components.push(navigationRow);
      }

      // Add action buttons
      const actionRow = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`history_${interaction.id}_export`)
            .setLabel('📄 Export History')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId(`history_${interaction.id}_stats`)
            .setLabel('📊 View Stats')
            .setStyle(ButtonStyle.Secondary)
        );
      
      components.push(actionRow);

      await interaction.editReply({
        embeds: [historyEmbed],
        components
      });

      commandLogger.info(`History displayed for user ${interaction.user.id}`, {
        resultCount: historyResult.data.length,
        totalPages: historyResult.totalPages
      });

    } catch (error) {
      commandLogger.error('History command error:', {
        error: error.message,
        userId: interaction.user.id,
        guildId: interaction.guild?.id
      });

      const errorEmbed = EmbedUtils.createErrorEmbed(
        'History Fetch Failed',
        'Failed to retrieve your query history. Please try again later.',
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