import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from 'discord.js';
import { ComparisonResult, AIResponse, SimilarityMetrics, AIModel } from '../types';
import { modelConfigs, constants } from '../config';

export class EmbedUtils {
  
  /**
   * Create a progress embed for ongoing AI comparison
   */
  static createProgressEmbed(queryId: string, models: AIModel[], prompt: string): EmbedBuilder {
    const modelList = models.map(model => `${modelConfigs[model]?.emoji} ${modelConfigs[model]?.displayName}`).join(', ');
    
    return new EmbedBuilder()
      .setTitle('⏳ Processing AI Comparison')
      .setDescription([
        `**Query ID:** \`${queryId}\``,
        `**Models:** ${modelList}`,
        `**Prompt:** ${this.truncateText(prompt, 100)}`,
        '',
        '🔄 Querying models in parallel...'
      ].join('\n'))
      .setColor(constants.EMBED_COLOR.PROCESSING)
      .setTimestamp()
      .setFooter({ text: 'This may take up to 30 seconds' });
  }

  /**
   * Create a comparison results embed
   */
  static createComparisonEmbed(comparison: ComparisonResult): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setTitle('🤖 AI Model Comparison Results')
      .setDescription([
        `**Query ID:** \`${comparison.id}\``,
        `**Prompt:** ${this.truncateText(comparison.prompt, 200)}`,
        `**Models Compared:** ${comparison.responses.length}`,
        ''
      ].join('\n'))
      .setColor(constants.EMBED_COLOR.SUCCESS)
      .setTimestamp(comparison.createdAt)
      .setFooter({ 
        text: 'Use buttons below to vote • View full details on dashboard',
        iconURL: undefined
      });

    // Add response fields (truncated for Discord)
    comparison.responses.forEach((response, index) => {
      const model = modelConfigs[response.model];
      const fieldName = `${model?.emoji} ${model?.displayName}`;
      
      let fieldValue = '';
      
      if (response.error) {
        fieldValue = `❌ **Error:** ${response.error}`;
      } else {
        const truncatedContent = this.truncateText(response.content, 300);
        fieldValue = [
          '```',
          truncatedContent,
          '```',
          `⏱️ **Time:** ${response.responseTime}ms | 📝 **Tokens:** ${response.tokenCount}`,
          `👍 ${comparison.votes.modelVotes[response.model]?.up || 0} | 👎 ${comparison.votes.modelVotes[response.model]?.down || 0}`
        ].join('\n');
      }

      embed.addFields({
        name: fieldName,
        value: fieldValue,
        inline: false
      });
    });

    return embed;
  }

  /**
   * Create a similarity metrics embed
   */
  static createSimilarityEmbed(metrics: SimilarityMetrics): EmbedBuilder {
    return new EmbedBuilder()
      .setTitle('📊 Similarity Analysis')
      .addFields(
        {
          name: '🧠 Semantic Similarity',
          value: `${this.getProgressBar(metrics.semantic)} ${metrics.semantic}%`,
          inline: true
        },
        {
          name: '📏 Length Consistency',
          value: `${this.getProgressBar(metrics.length)} ${metrics.length}%`,
          inline: true
        },
        {
          name: '💭 Sentiment Alignment',
          value: `${this.getProgressBar(metrics.sentiment)} ${metrics.sentiment}%`,
          inline: true
        },
        {
          name: '⚡ Response Speed',
          value: `${this.getProgressBar(metrics.speed)} ${metrics.speed}%`,
          inline: true
        },
        {
          name: '🎯 Overall Score',
          value: `${this.getProgressBar(metrics.aggregate)} ${metrics.aggregate}%`,
          inline: true
        },
        {
          name: '📈 Interpretation',
          value: this.getScoreInterpretation(metrics.aggregate),
          inline: true
        }
      )
      .setColor(this.getScoreColor(metrics.aggregate))
      .setTimestamp();
  }

  /**
   * Create a query history embed
   */
  static createHistoryEmbed(queries: any[], page: number, totalPages: number): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setTitle('📚 Query History')
      .setDescription(`Page ${page} of ${totalPages}`)
      .setColor(constants.EMBED_COLOR.INFO)
      .setTimestamp();

    if (queries.length === 0) {
      embed.addFields({
        name: 'No Results',
        value: 'No previous queries found for the specified criteria.',
        inline: false
      });
      return embed;
    }

    queries.forEach((query, index) => {
      const date = new Date(query.createdAt).toLocaleDateString();
      const models = query.models?.join(', ') || 'Unknown';
      const prompt = this.truncateText(query.prompt, 50);
      
      embed.addFields({
        name: `${index + 1}. ${date}`,
        value: [
          `**Prompt:** ${prompt}`,
          `**Models:** ${models}`,
          `**ID:** \`${query.id}\``
        ].join('\n'),
        inline: false
      });
    });

    return embed;
  }

  /**
   * Create an error embed
   */
  static createErrorEmbed(title: string, description: string, details?: string): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setTitle(`❌ ${title}`)
      .setDescription(description)
      .setColor(constants.EMBED_COLOR.ERROR)
      .setTimestamp();

    if (details) {
      embed.addFields({
        name: 'Details',
        value: `\`\`\`\n${details}\n\`\`\``,
        inline: false
      });
    }

    return embed;
  }

  /**
   * Create voting components
   */
  static createVotingComponents(queryId: string, responses: AIResponse[]): ActionRowBuilder<ButtonBuilder>[] {
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];

    // Main voting row
    const mainRow = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`vote_${queryId}_thumbs_up`)
          .setLabel('👍 Helpful')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`vote_${queryId}_thumbs_down`)
          .setLabel('👎 Not Helpful')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`details_${queryId}`)
          .setLabel('📊 View Details')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`thread_${queryId}`)
          .setLabel('💬 Discuss')
          .setStyle(ButtonStyle.Secondary)
      );

    rows.push(mainRow);

    return rows;
  }

  /**
   * Create model selection dropdown
   */
  static createModelSelectionMenu(customId: string): ActionRowBuilder<StringSelectMenuBuilder> {
    const options = Object.entries(modelConfigs).map(([key, config]) =>
      new StringSelectMenuOptionBuilder()
        .setLabel(config.displayName)
        .setValue(key)
        .setEmoji(config.emoji)
        .setDescription(`${config.provider} • ${config.maxTokens} tokens`)
    );

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder('Select models to compare (up to 4)')
      .setMinValues(1)
      .setMaxValues(Math.min(4, options.length))
      .addOptions(options);

    return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
  }

  /**
   * Create settings components
   */
  static createSettingsComponents(): ActionRowBuilder<ButtonBuilder>[] {
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];

    const settingsRow = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('settings_models')
          .setLabel('🤖 Default Models')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('settings_notifications')
          .setLabel('🔔 Notifications')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('settings_display')
          .setLabel('🎨 Display')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('settings_apikeys')
          .setLabel('🔑 API Keys')
          .setStyle(ButtonStyle.Secondary)
      );

    rows.push(settingsRow);
    return rows;
  }

  /**
   * Helper methods
   */
  private static truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }

  private static getProgressBar(percentage: number): string {
    const filled = Math.round(percentage / 10);
    const empty = 10 - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  }

  private static getScoreColor(score: number): number {
    if (score >= 80) return constants.EMBED_COLOR.SUCCESS;
    if (score >= 60) return constants.EMBED_COLOR.WARNING;
    return constants.EMBED_COLOR.ERROR;
  }

  private static getScoreInterpretation(score: number): string {
    if (score >= 90) return '🟢 Excellent - Highly consistent responses';
    if (score >= 80) return '🟡 Good - Generally consistent with minor differences';
    if (score >= 60) return '🟠 Fair - Moderate consistency, some notable differences';
    if (score >= 40) return '🔴 Poor - Significant differences between responses';
    return '🔴 Very Poor - Responses are quite different';
  }
}