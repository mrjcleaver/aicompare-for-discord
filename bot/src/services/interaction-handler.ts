import { ButtonInteraction, StringSelectMenuInteraction, ModalSubmitInteraction } from 'discord.js';
import { DatabaseService } from './database';
import { QueryService } from './query-service';
import { EmbedUtils } from '../utils/embed-builder';
import { eventLogger } from '../utils/logger';
import ValidationUtils from '../utils/validation';

export class InteractionHandler {
  private queryService = new QueryService();

  async handleVote(interaction: ButtonInteraction, queryId: string, voteData: string): Promise<void> {
    try {
      await interaction.deferReply({ ephemeral: true });

      // Parse vote data
      const voteType = voteData; // e.g., 'thumbs_up' or 'thumbs_down'
      const validatedVote = ValidationUtils.validateVote(voteType);

      // Get user
      const user = await DatabaseService.getUserByDiscordId(interaction.user.id);
      if (!user) {
        await interaction.editReply({
          content: '❌ User not found. Please try using a command first to register.'
        });
        return;
      }

      // Save vote
      await DatabaseService.saveVote({
        userId: user.id,
        queryId,
        voteType: validatedVote.type,
        value: validatedVote.value
      });

      // Clear cached query result so it refreshes with new votes
      await import('./redis').then(({ RedisService }) => {
        RedisService.del(`query:${queryId}`);
      });

      const voteEmoji = voteType === 'thumbs_up' ? '👍' : '👎';
      await interaction.editReply({
        content: `${voteEmoji} Your vote has been recorded! Thank you for the feedback.`
      });

      eventLogger.info(`Vote recorded for query ${queryId}`, {
        userId: interaction.user.id,
        voteType,
        value: validatedVote.value
      });

    } catch (error) {
      eventLogger.error('Vote handling error:', error);
      
      const errorMessage = error.message || 'Failed to record your vote. Please try again.';
      
      if (interaction.deferred) {
        await interaction.editReply({ content: `❌ ${errorMessage}` });
      } else {
        await interaction.reply({ content: `❌ ${errorMessage}`, ephemeral: true });
      }
    }
  }

  async handleDetails(interaction: ButtonInteraction, queryId: string): Promise<void> {
    try {
      await interaction.deferReply({ ephemeral: true });

      const comparisonResult = await this.queryService.getComparisonResult(queryId);
      
      if (!comparisonResult) {
        await interaction.editReply({
          content: '❌ Comparison not found or may have expired.'
        });
        return;
      }

      // Create detailed view
      const detailedEmbed = EmbedUtils.createComparisonEmbed(comparisonResult);
      detailedEmbed.setTitle('🔍 Detailed Comparison View');
      
      // Add similarity metrics if available
      if (comparisonResult.metrics.aggregate > 0) {
        const metricsEmbed = EmbedUtils.createSimilarityEmbed(comparisonResult.metrics);
        
        await interaction.editReply({
          embeds: [detailedEmbed, metricsEmbed]
        });
      } else {
        await interaction.editReply({
          embeds: [detailedEmbed]
        });
      }

      eventLogger.info(`Details viewed for query ${queryId}`, {
        userId: interaction.user.id
      });

    } catch (error) {
      eventLogger.error('Details handling error:', error);
      
      if (interaction.deferred) {
        await interaction.editReply({ 
          content: '❌ Failed to load detailed view. Please try again.' 
        });
      } else {
        await interaction.reply({ 
          content: '❌ Failed to load detailed view. Please try again.', 
          ephemeral: true 
        });
      }
    }
  }

  async handleThreadCreation(interaction: ButtonInteraction, queryId: string): Promise<void> {
    try {
      await interaction.deferReply({ ephemeral: false });

      if (!interaction.guild || !interaction.channel) {
        await interaction.editReply({
          content: '❌ Thread creation is only available in server channels.'
        });
        return;
      }

      const comparisonResult = await this.queryService.getComparisonResult(queryId);
      
      if (!comparisonResult) {
        await interaction.editReply({
          content: '❌ Comparison not found or may have expired.'
        });
        return;
      }

      // Create thread
      const threadName = `AI Comparison: ${comparisonResult.prompt.substring(0, 50)}...`;
      
      if ('threads' in interaction.channel) {
        const thread = await interaction.channel.threads.create({
          name: threadName,
          autoArchiveDuration: 1440, // 24 hours
          reason: `Discussion thread for AI comparison ${queryId}`
        });

        // Send summary to thread
        const summaryEmbed = EmbedUtils.createComparisonEmbed(comparisonResult);
        summaryEmbed.setTitle('💬 Discussion Thread Started');
        summaryEmbed.setDescription([
          `**Original Query:** ${comparisonResult.prompt}`,
          `**Models:** ${comparisonResult.responses.map(r => r.model).join(', ')}`,
          `**Similarity Score:** ${comparisonResult.metrics.aggregate}%`,
          '',
          'Discuss the comparison results below!'
        ].join('\n'));

        await thread.send({ embeds: [summaryEmbed] });

        await interaction.editReply({
          content: `✅ Discussion thread created: ${thread}`
        });

        eventLogger.info(`Thread created for query ${queryId}`, {
          userId: interaction.user.id,
          threadId: thread.id,
          threadName
        });
      } else {
        await interaction.editReply({
          content: '❌ Cannot create threads in this channel type.'
        });
      }

    } catch (error) {
      eventLogger.error('Thread creation error:', error);
      
      if (interaction.deferred) {
        await interaction.editReply({ 
          content: '❌ Failed to create discussion thread. Please try again.' 
        });
      } else {
        await interaction.reply({ 
          content: '❌ Failed to create discussion thread. Please try again.', 
          ephemeral: true 
        });
      }
    }
  }

  async handleSettings(interaction: ButtonInteraction, settingType: string): Promise<void> {
    try {
      await interaction.deferReply({ ephemeral: true });

      // Import settings service dynamically
      const { SettingsService } = await import('./settings-service');
      const settingsService = new SettingsService();

      switch (settingType) {
        case 'models':
          await this.showModelSettings(interaction, settingsService);
          break;
        case 'notifications':
          await this.showNotificationSettings(interaction, settingsService);
          break;
        case 'display':
          await this.showDisplaySettings(interaction, settingsService);
          break;
        case 'apikeys':
          await this.showAPIKeySettings(interaction, settingsService);
          break;
        default:
          await interaction.editReply({
            content: '❌ Unknown settings type.'
          });
      }

    } catch (error) {
      eventLogger.error('Settings handling error:', error);
      
      if (interaction.deferred) {
        await interaction.editReply({ 
          content: '❌ Failed to load settings. Please try again.' 
        });
      } else {
        await interaction.reply({ 
          content: '❌ Failed to load settings. Please try again.', 
          ephemeral: true 
        });
      }
    }
  }

  async handleExport(interaction: ButtonInteraction, queryId: string): Promise<void> {
    try {
      await interaction.deferReply({ ephemeral: true });

      const comparisonResult = await this.queryService.getComparisonResult(queryId);
      
      if (!comparisonResult) {
        await interaction.editReply({
          content: '❌ Comparison not found or may have expired.'
        });
        return;
      }

      // Create export data
      const exportData = {
        queryId: comparisonResult.id,
        prompt: comparisonResult.prompt,
        timestamp: comparisonResult.createdAt,
        models: comparisonResult.responses.map(r => ({
          model: r.model,
          content: r.content,
          responseTime: r.responseTime,
          tokenCount: r.tokenCount,
          cost: r.cost,
          error: r.error
        })),
        metrics: comparisonResult.metrics,
        votes: comparisonResult.votes
      };

      const exportJson = JSON.stringify(exportData, null, 2);
      const Buffer = (await import('buffer')).Buffer;
      
      const attachment = {
        attachment: Buffer.from(exportJson),
        name: `aicompare-${queryId}-${Date.now()}.json`
      };

      await interaction.editReply({
        content: '📄 Your comparison data has been exported!',
        files: [attachment]
      });

      eventLogger.info(`Export generated for query ${queryId}`, {
        userId: interaction.user.id,
        dataSize: exportJson.length
      });

    } catch (error) {
      eventLogger.error('Export handling error:', error);
      
      if (interaction.deferred) {
        await interaction.editReply({ 
          content: '❌ Failed to export data. Please try again.' 
        });
      } else {
        await interaction.reply({ 
          content: '❌ Failed to export data. Please try again.', 
          ephemeral: true 
        });
      }
    }
  }

  async handleModelRating(interaction: StringSelectMenuInteraction, queryId: string, selectedModels: string[]): Promise<void> {
    try {
      await interaction.deferReply({ ephemeral: true });
      
      await interaction.editReply({
        content: `⭐ Rating interface for models: ${selectedModels.join(', ')}\n\nModel rating functionality coming soon!`
      });

    } catch (error) {
      eventLogger.error('Model rating error:', error);
      
      if (interaction.deferred) {
        await interaction.editReply({ 
          content: '❌ Failed to process model rating. Please try again.' 
        });
      } else {
        await interaction.reply({ 
          content: '❌ Failed to process model rating. Please try again.', 
          ephemeral: true 
        });
      }
    }
  }

  async handleModelSelection(interaction: StringSelectMenuInteraction, selectedModels: string[]): Promise<void> {
    try {
      await interaction.deferReply({ ephemeral: true });
      
      await interaction.editReply({
        content: `🤖 You selected: ${selectedModels.join(', ')}\n\nCustom model selection functionality coming soon!`
      });

    } catch (error) {
      eventLogger.error('Model selection error:', error);
      
      if (interaction.deferred) {
        await interaction.editReply({ 
          content: '❌ Failed to process model selection. Please try again.' 
        });
      } else {
        await interaction.reply({ 
          content: '❌ Failed to process model selection. Please try again.', 
          ephemeral: true 
        });
      }
    }
  }

  async handleHistoryFilter(interaction: StringSelectMenuInteraction, filter: string): Promise<void> {
    try {
      await interaction.deferReply({ ephemeral: true });
      
      await interaction.editReply({
        content: `🔍 Applying filter: ${filter}\n\nHistory filtering functionality coming soon!`
      });

    } catch (error) {
      eventLogger.error('History filter error:', error);
      
      if (interaction.deferred) {
        await interaction.editReply({ 
          content: '❌ Failed to apply filter. Please try again.' 
        });
      } else {
        await interaction.reply({ 
          content: '❌ Failed to apply filter. Please try again.', 
          ephemeral: true 
        });
      }
    }
  }

  // Private helper methods for settings
  private async showModelSettings(interaction: ButtonInteraction, settingsService: any): Promise<void> {
    const settings = await settingsService.getUserSettings(interaction.user.id);
    
    const embed = EmbedUtils.createHistoryEmbed([], 1, 1);
    embed.setTitle('🤖 Model Settings');
    embed.setDescription('Configure your default AI model preferences');
    embed.addFields([
      {
        name: 'Current Default Models',
        value: settings?.defaultModels?.join(', ') || 'gpt-4, claude-3.5-sonnet',
        inline: false
      },
      {
        name: 'Temperature',
        value: (settings?.temperature || 0.7).toString(),
        inline: true
      },
      {
        name: 'Max Tokens',
        value: (settings?.maxTokens || 1000).toString(),
        inline: true
      }
    ]);

    await interaction.editReply({ embeds: [embed] });
  }

  private async showNotificationSettings(interaction: ButtonInteraction, settingsService: any): Promise<void> {
    const settings = await settingsService.getUserSettings(interaction.user.id);
    
    const embed = EmbedUtils.createHistoryEmbed([], 1, 1);
    embed.setTitle('🔔 Notification Settings');
    embed.setDescription('Configure how you receive notifications');
    embed.addFields([
      {
        name: 'Notification Type',
        value: settings?.notificationPreference || 'channel',
        inline: true
      },
      {
        name: 'Completion Alerts',
        value: settings?.completionNotifications ? 'Enabled' : 'Disabled',
        inline: true
      },
      {
        name: 'Error Alerts',
        value: settings?.errorNotifications ? 'Enabled' : 'Disabled',
        inline: true
      }
    ]);

    await interaction.editReply({ embeds: [embed] });
  }

  private async showDisplaySettings(interaction: ButtonInteraction, settingsService: any): Promise<void> {
    const settings = await settingsService.getUserSettings(interaction.user.id);
    
    const embed = EmbedUtils.createHistoryEmbed([], 1, 1);
    embed.setTitle('🎨 Display Settings');
    embed.setDescription('Customize how results are displayed');
    embed.addFields([
      {
        name: 'Display Format',
        value: settings?.displayFormat || 'detailed',
        inline: true
      },
      {
        name: 'Show Metrics',
        value: settings?.showMetrics ? 'Yes' : 'No',
        inline: true
      },
      {
        name: 'Show Costs',
        value: settings?.showCosts ? 'Yes' : 'No',
        inline: true
      }
    ]);

    await interaction.editReply({ embeds: [embed] });
  }

  private async showAPIKeySettings(interaction: ButtonInteraction, settingsService: any): Promise<void> {
    // For security, always redirect API key management to DMs
    try {
      const user = interaction.user;
      const dmChannel = await user.createDM();
      
      const embed = EmbedUtils.createHistoryEmbed([], 1, 1);
      embed.setTitle('🔑 API Key Management');
      embed.setDescription([
        'For security, API key management is done via DM.',
        '',
        '**Available Commands:**',
        '• `!setkey openai YOUR_KEY_HERE` - Set OpenAI key',
        '• `!setkey anthropic YOUR_KEY_HERE` - Set Anthropic key',
        '• `!removekey openai` - Remove OpenAI key',
        '• `!status` - Check which keys are configured'
      ].join('\n'));
      
      await dmChannel.send({ embeds: [embed] });
      
      await interaction.editReply({
        content: '🔑 API key management instructions have been sent to your DMs.'
      });
    } catch (error) {
      await interaction.editReply({
        content: '❌ Failed to send DM. Please enable DMs from server members.'
      });
    }
  }
}