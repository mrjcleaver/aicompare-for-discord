import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js';
import { Command } from '../types';
import { commandLogger } from '../utils/logger';
import { EmbedUtils } from '../utils/embed-builder';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('settings')
    .setDescription('Configure AI comparison preferences')
    .addSubcommand(subcommand =>
      subcommand
        .setName('models')
        .setDescription('Set your default model preferences')
        .addStringOption(option =>
          option.setName('preset')
            .setDescription('Choose a preset configuration')
            .addChoices(
              { name: '🧠 Balanced (GPT-4 + Claude)', value: 'balanced' },
              { name: '⚡ Fast (Turbo models)', value: 'fast' },
              { name: '🎨 Creative (All major models)', value: 'creative' },
              { name: '🎯 Analytical (Logic-focused)', value: 'analytical' }
            )
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('notifications')
        .setDescription('Configure how you receive notifications')
        .addStringOption(option =>
          option.setName('type')
            .setDescription('Where to receive notifications')
            .setRequired(true)
            .addChoices(
              { name: '📱 Direct Messages', value: 'dm' },
              { name: '💬 Channel (where command was used)', value: 'channel' },
              { name: '🔔 Both DM and Channel', value: 'both' },
              { name: '🔕 Disable notifications', value: 'none' }
            )
        )
        .addBooleanOption(option =>
          option.setName('completion')
            .setDescription('Notify when AI comparison completes')
        )
        .addBooleanOption(option =>
          option.setName('errors')
            .setDescription('Notify when errors occur')
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('display')
        .setDescription('Customize how results are displayed')
        .addStringOption(option =>
          option.setName('format')
            .setDescription('Choose display format')
            .addChoices(
              { name: '📋 Compact (summary only)', value: 'compact' },
              { name: '📄 Detailed (full responses)', value: 'detailed' },
              { name: '🎨 Rich (with metrics)', value: 'rich' }
            )
        )
        .addBooleanOption(option =>
          option.setName('show_metrics')
            .setDescription('Show similarity metrics by default')
        )
        .addBooleanOption(option =>
          option.setName('show_costs')
            .setDescription('Show estimated costs')
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('apikeys')
        .setDescription('Manage your AI provider API keys (sent via DM)')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('server')
        .setDescription('Configure server-wide settings (Admin only)')
        .addStringOption(option =>
          option.setName('action')
            .setDescription('Server setting to modify')
            .setRequired(true)
            .addChoices(
              { name: '🤖 Enable/Disable Models', value: 'models' },
              { name: '⏰ Rate Limits', value: 'limits' },
              { name: '📢 Default Channel', value: 'channel' },
              { name: '👥 Moderator Roles', value: 'roles' }
            )
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('export')
        .setDescription('Export your settings and data')
        .addStringOption(option =>
          option.setName('format')
            .setDescription('Export format')
            .addChoices(
              { name: '📄 JSON (complete data)', value: 'json' },
              { name: '📊 CSV (query history)', value: 'csv' },
              { name: '📝 Markdown (readable format)', value: 'markdown' }
            )
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('reset')
        .setDescription('Reset settings to defaults')
        .addBooleanOption(option =>
          option.setName('confirm')
            .setDescription('Confirm you want to reset all settings')
            .setRequired(true)
        )
    ),
  
  cooldown: 10, // 10 second cooldown
  
  async execute(interaction: ChatInputCommandInteraction) {
    try {
      const subcommand = interaction.options.getSubcommand();
      
      commandLogger.info(`Settings command executed: ${subcommand}`, {
        userId: interaction.user.id,
        guildId: interaction.guild?.id
      });

      // Import settings service
      const { SettingsService } = await import('../services/settings-service');
      const settingsService = new SettingsService();

      switch (subcommand) {
        case 'models':
          await handleModelSettings(interaction, settingsService);
          break;
        case 'notifications':
          await handleNotificationSettings(interaction, settingsService);
          break;
        case 'display':
          await handleDisplaySettings(interaction, settingsService);
          break;
        case 'apikeys':
          await handleAPIKeySettings(interaction, settingsService);
          break;
        case 'server':
          await handleServerSettings(interaction, settingsService);
          break;
        case 'export':
          await handleExportSettings(interaction, settingsService);
          break;
        case 'reset':
          await handleResetSettings(interaction, settingsService);
          break;
        default:
          await interaction.reply({
            content: '❌ Unknown settings subcommand.',
            ephemeral: true
          });
      }

    } catch (error) {
      commandLogger.error('Settings command error:', {
        error: error.message,
        userId: interaction.user.id,
        guildId: interaction.guild?.id
      });

      const errorMessage = 'Failed to update settings. Please try again later.';
      
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: errorMessage, ephemeral: true });
      } else {
        await interaction.reply({ content: errorMessage, ephemeral: true });
      }
    }
  },
};

async function handleModelSettings(interaction: ChatInputCommandInteraction, settingsService: any) {
  await interaction.deferReply({ ephemeral: true });
  
  const preset = interaction.options.getString('preset');
  
  if (preset) {
    await settingsService.setModelPreset(interaction.user.id, preset);
    
    const successEmbed = EmbedUtils.createComparisonEmbed({
      id: 'settings',
      prompt: `Model preset updated to: ${preset}`,
      responses: [],
      metrics: { semantic: 0, length: 0, sentiment: 0, speed: 0, aggregate: 0 },
      votes: { thumbsUp: 0, thumbsDown: 0, starRatings: {}, modelVotes: {} },
      userId: interaction.user.id,
      guildId: interaction.guild?.id || '',
      queryId: '',
      createdAt: new Date(),
      updatedAt: new Date()
    });
    
    successEmbed.setTitle('✅ Model Settings Updated');
    successEmbed.setDescription(`Your default model preset has been set to **${preset}**.`);
    
    await interaction.editReply({ embeds: [successEmbed] });
  } else {
    // Show current settings and options to change
    const currentSettings = await settingsService.getUserSettings(interaction.user.id);
    
    const settingsEmbed = EmbedUtils.createHistoryEmbed([], 1, 1);
    settingsEmbed.setTitle('🤖 Model Settings');
    settingsEmbed.setDescription('Your current model preferences:');
    settingsEmbed.addFields([
      {
        name: 'Default Models',
        value: currentSettings?.defaultModels?.join(', ') || 'Not set',
        inline: false
      },
      {
        name: 'Temperature',
        value: (currentSettings?.temperature ?? 0.7).toString(),
        inline: true
      },
      {
        name: 'Max Tokens',
        value: (currentSettings?.maxTokens ?? 1000).toString(),
        inline: true
      }
    ]);
    
    const components = EmbedUtils.createSettingsComponents();
    
    await interaction.editReply({
      embeds: [settingsEmbed],
      components
    });
  }
}

async function handleNotificationSettings(interaction: ChatInputCommandInteraction, settingsService: any) {
  await interaction.deferReply({ ephemeral: true });
  
  const type = interaction.options.getString('type', true);
  const completion = interaction.options.getBoolean('completion');
  const errors = interaction.options.getBoolean('errors');
  
  await settingsService.updateNotificationSettings(interaction.user.id, {
    type,
    completion,
    errors
  });
  
  await interaction.editReply({
    content: `✅ Notification settings updated!\n• Type: ${type}\n• Completion notifications: ${completion ?? 'unchanged'}\n• Error notifications: ${errors ?? 'unchanged'}`
  });
}

async function handleDisplaySettings(interaction: ChatInputCommandInteraction, settingsService: any) {
  await interaction.deferReply({ ephemeral: true });
  
  const format = interaction.options.getString('format');
  const showMetrics = interaction.options.getBoolean('show_metrics');
  const showCosts = interaction.options.getBoolean('show_costs');
  
  await settingsService.updateDisplaySettings(interaction.user.id, {
    format,
    showMetrics,
    showCosts
  });
  
  await interaction.editReply({
    content: `✅ Display settings updated!\n• Format: ${format || 'unchanged'}\n• Show metrics: ${showMetrics ?? 'unchanged'}\n• Show costs: ${showCosts ?? 'unchanged'}`
  });
}

async function handleAPIKeySettings(interaction: ChatInputCommandInteraction, settingsService: any) {
  // Always send API key management via DM for security
  await interaction.reply({
    content: '🔑 API key management instructions have been sent to your DMs for security.',
    ephemeral: true
  });
  
  try {
    const user = interaction.user;
    const dmChannel = await user.createDM();
    
    const apiKeyEmbed = EmbedUtils.createHistoryEmbed([], 1, 1);
    apiKeyEmbed.setTitle('🔑 API Key Management');
    apiKeyEmbed.setDescription([
      'To use your own API keys with AI Compare, you can set them up here.',
      '',
      '**Security Notice:** Your API keys are encrypted and stored securely.',
      '',
      '**Available Providers:**',
      '• OpenAI (GPT models)',
      '• Anthropic (Claude models)',
      '• Google (Gemini models)',
      '• Cohere (Command models)',
      '',
      '**Commands:**',
      '• `set openai sk-...` - Set OpenAI API key',
      '• `set anthropic ant-...` - Set Anthropic API key',
      '• `remove openai` - Remove OpenAI API key',
      '• `status` - Check which keys are set'
    ].join('\n'));
    
    await dmChannel.send({ embeds: [apiKeyEmbed] });
  } catch (error) {
    await interaction.followUp({
      content: '❌ Failed to send DM. Please make sure you allow DMs from server members.',
      ephemeral: true
    });
  }
}

async function handleServerSettings(interaction: ChatInputCommandInteraction, settingsService: any) {
  // Check if user has admin permissions
  if (!interaction.guild || !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({
      content: '❌ You need Administrator permissions to modify server settings.',
      ephemeral: true
    });
    return;
  }
  
  await interaction.deferReply({ ephemeral: true });
  
  const action = interaction.options.getString('action', true);
  
  // Implementation would depend on the specific action
  await interaction.editReply({
    content: `⚠️ Server settings management for "${action}" is not yet implemented. Coming soon!`
  });
}

async function handleExportSettings(interaction: ChatInputCommandInteraction, settingsService: any) {
  await interaction.deferReply({ ephemeral: true });
  
  const format = interaction.options.getString('format') ?? 'json';
  
  try {
    const exportData = await settingsService.exportUserData(interaction.user.id, format);
    
    // Send the exported data as a file attachment
    const Buffer = (await import('buffer')).Buffer;
    const attachment = {
      attachment: Buffer.from(exportData),
      name: `aicompare-export-${interaction.user.id}-${Date.now()}.${format}`
    };
    
    await interaction.editReply({
      content: `✅ Your data has been exported in ${format.toUpperCase()} format.`,
      files: [attachment]
    });
  } catch (error) {
    await interaction.editReply({
      content: '❌ Failed to export data. Please try again later.'
    });
  }
}

async function handleResetSettings(interaction: ChatInputCommandInteraction, settingsService: any) {
  const confirm = interaction.options.getBoolean('confirm', true);
  
  if (!confirm) {
    await interaction.reply({
      content: '❌ You must confirm that you want to reset your settings.',
      ephemeral: true
    });
    return;
  }
  
  await interaction.deferReply({ ephemeral: true });
  
  await settingsService.resetUserSettings(interaction.user.id);
  
  await interaction.editReply({
    content: '✅ All your settings have been reset to defaults.'
  });
}

export default command;