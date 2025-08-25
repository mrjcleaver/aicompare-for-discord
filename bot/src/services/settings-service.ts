import { DatabaseService } from './database';
import { RedisService } from './redis';
import { UserSettings, GuildSettings } from '../types';
import { dbLogger } from '../utils/logger';
import { defaultModelSelections } from '../config';

export class SettingsService {
  
  async getUserSettings(discordId: string): Promise<UserSettings | null> {
    try {
      // Try cache first
      const cached = await RedisService.getCachedUserSettings(discordId);
      if (cached) {
        return cached;
      }

      // Get from database
      const user = await DatabaseService.getUserByDiscordId(discordId);
      if (!user || !user.settings) {
        return null;
      }

      const settings = typeof user.settings === 'string' ? JSON.parse(user.settings) : user.settings;
      
      // Cache for 30 minutes
      await RedisService.cacheUserSettings(discordId, settings, 1800);
      
      return settings;
    } catch (error) {
      dbLogger.error('Failed to get user settings:', { discordId, error: error.message });
      return null;
    }
  }

  async updateUserSettings(discordId: string, updates: Partial<UserSettings>): Promise<void> {
    try {
      // Get current settings
      let currentSettings = await this.getUserSettings(discordId);
      
      if (!currentSettings) {
        // Create default settings if user doesn't exist
        currentSettings = this.getDefaultUserSettings();
      }

      // Merge updates
      const newSettings = { ...currentSettings, ...updates };

      // Validate settings
      this.validateUserSettings(newSettings);

      // Get or create user
      let user = await DatabaseService.getUserByDiscordId(discordId);
      if (!user) {
        user = await DatabaseService.createUser({
          discordId,
          username: 'Discord User',
          settings: newSettings
        });
      } else {
        // Update settings
        await DatabaseService.updateUserSettings(user.id, newSettings);
      }

      // Clear cache
      await RedisService.clearUserSettingsCache(discordId);

      dbLogger.info('User settings updated', { discordId, updates });
    } catch (error) {
      dbLogger.error('Failed to update user settings:', { discordId, updates, error: error.message });
      throw error;
    }
  }

  async setModelPreset(discordId: string, preset: string): Promise<void> {
    const presetModels = {
      balanced: defaultModelSelections.general,
      fast: defaultModelSelections.fast,
      creative: defaultModelSelections.creative,
      analytical: defaultModelSelections.analytical
    };

    const models = presetModels[preset as keyof typeof presetModels];
    if (!models) {
      throw new Error(`Invalid preset: ${preset}`);
    }

    await this.updateUserSettings(discordId, { defaultModels: models });
  }

  async updateNotificationSettings(discordId: string, settings: {
    type?: string;
    completion?: boolean;
    errors?: boolean;
  }): Promise<void> {
    const updates: Partial<UserSettings> = {};
    
    if (settings.type) {
      updates.notificationPreference = settings.type as 'dm' | 'channel' | 'both';
    }
    
    // Add other notification settings as needed
    await this.updateUserSettings(discordId, updates);
  }

  async updateDisplaySettings(discordId: string, settings: {
    format?: string;
    showMetrics?: boolean;
    showCosts?: boolean;
  }): Promise<void> {
    const updates: Partial<UserSettings> = {};
    
    if (settings.format) {
      updates.displayFormat = settings.format as 'compact' | 'detailed';
    }
    
    // Add other display settings as needed
    await this.updateUserSettings(discordId, updates);
  }

  async resetUserSettings(discordId: string): Promise<void> {
    const defaultSettings = this.getDefaultUserSettings();
    await this.updateUserSettings(discordId, defaultSettings);
  }

  async exportUserData(discordId: string, format: string = 'json'): Promise<string> {
    try {
      const user = await DatabaseService.getUserByDiscordId(discordId);
      if (!user) {
        throw new Error('User not found');
      }

      // Get user's queries
      const queries = await DatabaseService.getQueryHistory({
        userId: user.id,
        limit: 1000 // Large limit for export
      });

      const exportData = {
        user: {
          id: user.id,
          discordId: user.discord_id,
          username: user.username,
          settings: user.settings,
          createdAt: user.created_at,
          lastActive: user.last_active
        },
        queries: queries.data,
        exportedAt: new Date().toISOString(),
        format: format
      };

      switch (format.toLowerCase()) {
        case 'json':
          return JSON.stringify(exportData, null, 2);
          
        case 'csv':
          return this.convertToCSV(queries.data);
          
        case 'markdown':
          return this.convertToMarkdown(exportData);
          
        default:
          throw new Error(`Unsupported export format: ${format}`);
      }
    } catch (error) {
      dbLogger.error('Failed to export user data:', { discordId, format, error: error.message });
      throw error;
    }
  }

  // Guild/Team Settings
  async getGuildSettings(guildId: string): Promise<GuildSettings | null> {
    try {
      const cached = await RedisService.getCachedTeamSettings(guildId);
      if (cached) {
        return cached;
      }

      const team = await DatabaseService.getTeamByGuildId(guildId);
      if (!team || !team.settings) {
        return null;
      }

      const settings = typeof team.settings === 'string' ? JSON.parse(team.settings) : team.settings;
      
      // Cache for 30 minutes
      await RedisService.cacheTeamSettings(guildId, settings, 1800);
      
      return {
        guildId,
        ...settings
      };
    } catch (error) {
      dbLogger.error('Failed to get guild settings:', { guildId, error: error.message });
      return null;
    }
  }

  async updateGuildSettings(guildId: string, updates: Partial<GuildSettings>): Promise<void> {
    try {
      let team = await DatabaseService.getTeamByGuildId(guildId);
      
      if (!team) {
        // Create team with default settings
        team = await DatabaseService.createOrUpdateTeam({
          discordGuildId: guildId,
          name: 'Discord Server',
          settings: this.getDefaultGuildSettings()
        });
      }

      const currentSettings = typeof team.settings === 'string' ? JSON.parse(team.settings) : team.settings;
      const newSettings = { ...currentSettings, ...updates };

      // Update in database
      await DatabaseService.createOrUpdateTeam({
        discordGuildId: guildId,
        name: team.name,
        settings: newSettings
      });

      // Clear cache
      const { RedisService } = await import('./redis');
      await RedisService.del(`team:${guildId}:settings`);

      dbLogger.info('Guild settings updated', { guildId, updates });
    } catch (error) {
      dbLogger.error('Failed to update guild settings:', { guildId, updates, error: error.message });
      throw error;
    }
  }

  // Private helper methods
  private getDefaultUserSettings(): UserSettings {
    return {
      userId: '', // Will be set when saving
      defaultModels: defaultModelSelections.general,
      temperature: 0.7,
      maxTokens: 1000,
      notificationPreference: 'channel',
      displayFormat: 'detailed',
      theme: 'light'
    };
  }

  private getDefaultGuildSettings(): Partial<GuildSettings> {
    return {
      enabledModels: defaultModelSelections.all,
      rateLimitPerUser: 10,
      rateLimitPerHour: 100,
      allowedChannels: [],
      moderatorRoles: []
    };
  }

  private validateUserSettings(settings: UserSettings): void {
    if (!settings.defaultModels || settings.defaultModels.length === 0) {
      throw new Error('At least one default model must be selected');
    }

    if (settings.temperature < 0 || settings.temperature > 1) {
      throw new Error('Temperature must be between 0 and 1');
    }

    if (settings.maxTokens < 1 || settings.maxTokens > 8000) {
      throw new Error('Max tokens must be between 1 and 8000');
    }

    const validNotificationTypes = ['dm', 'channel', 'both'];
    if (!validNotificationTypes.includes(settings.notificationPreference)) {
      throw new Error(`Invalid notification preference: ${settings.notificationPreference}`);
    }

    const validDisplayFormats = ['compact', 'detailed'];
    if (!validDisplayFormats.includes(settings.displayFormat)) {
      throw new Error(`Invalid display format: ${settings.displayFormat}`);
    }
  }

  private convertToCSV(queries: any[]): string {
    if (queries.length === 0) {
      return 'No data to export';
    }

    const headers = ['ID', 'Prompt', 'Models', 'Status', 'Created At', 'Response Count'];
    const rows = queries.map(query => [
      query.id,
      `"${query.prompt.replace(/"/g, '""')}"`, // Escape quotes
      query.models_requested?.join(';') || '',
      query.status,
      query.created_at,
      query.response_count || 0
    ]);

    return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
  }

  private convertToMarkdown(exportData: any): string {
    const { user, queries } = exportData;
    
    const markdown = [
      '# AI Compare Export',
      '',
      `**User:** ${user.username} (${user.discordId})`,
      `**Exported:** ${exportData.exportedAt}`,
      '',
      '## Settings',
      '',
      `- **Default Models:** ${user.settings.defaultModels?.join(', ') || 'None'}`,
      `- **Temperature:** ${user.settings.temperature || 0.7}`,
      `- **Max Tokens:** ${user.settings.maxTokens || 1000}`,
      '',
      '## Query History',
      ''
    ];

    if (queries.data && queries.data.length > 0) {
      queries.data.forEach((query: any, index: number) => {
        markdown.push(`### ${index + 1}. ${query.created_at}`);
        markdown.push('');
        markdown.push(`**Prompt:** ${query.prompt}`);
        markdown.push(`**Models:** ${query.models_requested?.join(', ') || 'Unknown'}`);
        markdown.push(`**Status:** ${query.status}`);
        markdown.push(`**Responses:** ${query.response_count || 0}`);
        markdown.push('');
      });
    } else {
      markdown.push('No queries found.');
    }

    return markdown.join('\n');
  }
}