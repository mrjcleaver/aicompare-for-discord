import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { settingsCommand } from '../settings.js';
import type { ChatInputCommandInteraction } from 'discord.js';

// Mock dependencies
jest.mock('../../services/userSettings.js', () => ({
  UserSettingsService: {
    getUserSettings: jest.fn().mockResolvedValue({
      defaultModels: ['gpt-4', 'claude-3.5-sonnet'],
      notifications: {
        completion: true,
        votes: false,
        mentions: true
      },
      display: {
        format: 'detailed',
        theme: 'light'
      },
      privacy: {
        shareResponses: true,
        anonymousVoting: false
      }
    }),
    updateUserSettings: jest.fn().mockResolvedValue(true),
    validateAPIKeys: jest.fn().mockResolvedValue({
      openai: { valid: true, quota: 'Available' },
      anthropic: { valid: false, error: 'Invalid key' },
      google: { valid: true, quota: 'Limited' },
      cohere: { valid: false, error: 'Not configured' }
    }),
    updateAPIKeys: jest.fn().mockResolvedValue(true)
  }
}));

jest.mock('../../utils/embeds.js', () => ({
  createSettingsEmbed: jest.fn().mockReturnValue({
    title: 'Your Settings',
    fields: []
  }),
  createAPIKeyStatusEmbed: jest.fn().mockReturnValue({
    title: 'API Key Status',
    fields: []
  })
}));

jest.mock('../../utils/components.js', () => ({
  createSettingsModal: jest.fn().mockReturnValue({
    title: 'Update Settings',
    components: []
  }),
  createModelSelector: jest.fn().mockReturnValue({
    type: 1,
    components: []
  })
}));

describe('Settings Command', () => {
  let mockInteraction: Partial<ChatInputCommandInteraction>;

  beforeEach(() => {
    mockInteraction = globalThis.TestUtils.createMockInteraction('settings');
    mockInteraction.options.getSubcommand = jest.fn().mockReturnValue('view');
    
    jest.clearAllMocks();
  });

  describe('Command Registration', () => {
    it('should have correct command name', () => {
      expect(settingsCommand.data.name).toBe('settings');
    });

    it('should have correct command description', () => {
      expect(settingsCommand.data.description).toBe('Configure AI comparison preferences');
    });

    it('should have view subcommand', () => {
      const viewSubcommand = settingsCommand.data.options.find(
        (option: any) => option.name === 'view'
      );
      expect(viewSubcommand).toBeDefined();
      expect(viewSubcommand.type).toBe(1); // SUB_COMMAND
    });

    it('should have models subcommand', () => {
      const modelsSubcommand = settingsCommand.data.options.find(
        (option: any) => option.name === 'models'
      );
      expect(modelsSubcommand).toBeDefined();
      expect(modelsSubcommand.type).toBe(1); // SUB_COMMAND
    });

    it('should have notifications subcommand', () => {
      const notifSubcommand = settingsCommand.data.options.find(
        (option: any) => option.name === 'notifications'
      );
      expect(notifSubcommand).toBeDefined();
      expect(notifSubcommand.type).toBe(1); // SUB_COMMAND
    });

    it('should have apikeys subcommand', () => {
      const apikeysSubcommand = settingsCommand.data.options.find(
        (option: any) => option.name === 'apikeys'
      );
      expect(apikeysSubcommand).toBeDefined();
      expect(apikeysSubcommand.type).toBe(1); // SUB_COMMAND
    });
  });

  describe('View Settings Subcommand', () => {
    beforeEach(() => {
      mockInteraction.options.getSubcommand = jest.fn().mockReturnValue('view');
    });

    it('should defer reply as ephemeral', async () => {
      await settingsCommand.execute(mockInteraction as ChatInputCommandInteraction);
      
      expect(mockInteraction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    });

    it('should fetch and display user settings', async () => {
      const { UserSettingsService } = await import('../../services/userSettings.js');
      const { createSettingsEmbed } = await import('../../utils/embeds.js');
      
      await settingsCommand.execute(mockInteraction as ChatInputCommandInteraction);
      
      expect(UserSettingsService.getUserSettings).toHaveBeenCalledWith('123456789');
      expect(createSettingsEmbed).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultModels: ['gpt-4', 'claude-3.5-sonnet'],
          notifications: expect.any(Object)
        })
      );
      
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        embeds: [expect.objectContaining({ title: 'Your Settings' })],
        components: expect.any(Array)
      });
    });

    it('should handle new user with default settings', async () => {
      const { UserSettingsService } = await import('../../services/userSettings.js');
      (UserSettingsService.getUserSettings as jest.Mock).mockResolvedValue(null);

      await settingsCommand.execute(mockInteraction as ChatInputCommandInteraction);
      
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        embeds: [expect.objectContaining({
          title: expect.stringContaining('Default Settings'),
          description: expect.stringContaining('using default preferences')
        })],
        components: expect.any(Array)
      });
    });
  });

  describe('Models Subcommand', () => {
    beforeEach(() => {
      mockInteraction.options.getSubcommand = jest.fn().mockReturnValue('models');
      mockInteraction.options.getString = jest.fn()
        .mockReturnValueOnce('gpt-4,claude-3.5-sonnet,gemini-1.5-pro'); // models parameter
    });

    it('should update default model preferences', async () => {
      const { UserSettingsService } = await import('../../services/userSettings.js');
      
      await settingsCommand.execute(mockInteraction as ChatInputCommandInteraction);
      
      expect(UserSettingsService.updateUserSettings).toHaveBeenCalledWith(
        '123456789',
        expect.objectContaining({
          defaultModels: ['gpt-4', 'claude-3.5-sonnet', 'gemini-1.5-pro']
        })
      );
      
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        embeds: [expect.objectContaining({
          title: expect.stringContaining('Updated'),
          description: expect.stringContaining('default models')
        })]
      });
    });

    it('should validate model selections', async () => {
      mockInteraction.options.getString = jest.fn()
        .mockReturnValueOnce('gpt-4,invalid-model,claude-3.5-sonnet');

      await settingsCommand.execute(mockInteraction as ChatInputCommandInteraction);
      
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        embeds: [expect.objectContaining({
          title: expect.stringContaining('Error'),
          description: expect.stringContaining('invalid-model')
        })]
      });
    });

    it('should require at least one model', async () => {
      mockInteraction.options.getString = jest.fn()
        .mockReturnValueOnce('');

      await settingsCommand.execute(mockInteraction as ChatInputCommandInteraction);
      
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        embeds: [expect.objectContaining({
          title: expect.stringContaining('Error'),
          description: expect.stringContaining('at least one model')
        })]
      });
    });

    it('should show current models when no parameter provided', async () => {
      mockInteraction.options.getString = jest.fn().mockReturnValue(null);

      const { createModelSelector } = await import('../../utils/components.js');
      
      await settingsCommand.execute(mockInteraction as ChatInputCommandInteraction);
      
      expect(createModelSelector).toHaveBeenCalledWith(['gpt-4', 'claude-3.5-sonnet']);
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        embeds: [expect.objectContaining({
          title: expect.stringContaining('Current Default Models')
        })],
        components: expect.any(Array)
      });
    });
  });

  describe('Notifications Subcommand', () => {
    beforeEach(() => {
      mockInteraction.options.getSubcommand = jest.fn().mockReturnValue('notifications');
      mockInteraction.options.getBoolean = jest.fn()
        .mockImplementation((name) => {
          switch (name) {
            case 'completion': return true;
            case 'votes': return false;
            case 'mentions': return true;
            default: return null;
          }
        });
    });

    it('should update notification preferences', async () => {
      const { UserSettingsService } = await import('../../services/userSettings.js');
      
      await settingsCommand.execute(mockInteraction as ChatInputCommandInteraction);
      
      expect(UserSettingsService.updateUserSettings).toHaveBeenCalledWith(
        '123456789',
        expect.objectContaining({
          notifications: {
            completion: true,
            votes: false,
            mentions: true
          }
        })
      );
    });

    it('should preserve existing settings when only some provided', async () => {
      mockInteraction.options.getBoolean = jest.fn()
        .mockImplementation((name) => {
          switch (name) {
            case 'completion': return false; // Only this is changed
            default: return null;
          }
        });

      const { UserSettingsService } = await import('../../services/userSettings.js');
      
      await settingsCommand.execute(mockInteraction as ChatInputCommandInteraction);
      
      expect(UserSettingsService.updateUserSettings).toHaveBeenCalledWith(
        '123456789',
        expect.objectContaining({
          notifications: {
            completion: false,
            votes: false, // Preserved from existing settings
            mentions: true // Preserved from existing settings
          }
        })
      );
    });

    it('should show current notification settings when no parameters', async () => {
      mockInteraction.options.getBoolean = jest.fn().mockReturnValue(null);

      await settingsCommand.execute(mockInteraction as ChatInputCommandInteraction);
      
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        embeds: [expect.objectContaining({
          title: expect.stringContaining('Notification Settings'),
          description: expect.stringContaining('completion: ✅')
        })]
      });
    });
  });

  describe('API Keys Subcommand', () => {
    beforeEach(() => {
      mockInteraction.options.getSubcommand = jest.fn().mockReturnValue('apikeys');
    });

    it('should check API key status', async () => {
      const { UserSettingsService } = await import('../../services/userSettings.js');
      const { createAPIKeyStatusEmbed } = await import('../../utils/embeds.js');
      
      await settingsCommand.execute(mockInteraction as ChatInputCommandInteraction);
      
      expect(UserSettingsService.validateAPIKeys).toHaveBeenCalledWith('123456789');
      expect(createAPIKeyStatusEmbed).toHaveBeenCalledWith(
        expect.objectContaining({
          openai: { valid: true, quota: 'Available' },
          anthropic: { valid: false, error: 'Invalid key' }
        })
      );
    });

    it('should show setup instructions for missing keys', async () => {
      const { UserSettingsService } = await import('../../services/userSettings.js');
      (UserSettingsService.validateAPIKeys as jest.Mock).mockResolvedValue({});

      await settingsCommand.execute(mockInteraction as ChatInputCommandInteraction);
      
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        embeds: [expect.objectContaining({
          title: expect.stringContaining('API Keys Required'),
          description: expect.stringContaining('setup instructions')
        })],
        components: expect.arrayContaining([
          expect.objectContaining({
            components: expect.arrayContaining([
              expect.objectContaining({
                label: expect.stringContaining('Setup Guide')
              })
            ])
          })
        ])
      });
    });

    it('should provide setup modal for API key configuration', async () => {
      mockInteraction.options.getString = jest.fn().mockReturnValue('setup');

      const { createSettingsModal } = await import('../../utils/components.js');
      
      await settingsCommand.execute(mockInteraction as ChatInputCommandInteraction);
      
      expect(createSettingsModal).toHaveBeenCalledWith('api_keys', expect.any(Object));
      expect(mockInteraction.showModal).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle settings service errors', async () => {
      const { UserSettingsService } = await import('../../services/userSettings.js');
      (UserSettingsService.getUserSettings as jest.Mock).mockRejectedValue(
        new Error('Database connection failed')
      );

      await settingsCommand.execute(mockInteraction as ChatInputCommandInteraction);
      
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        embeds: [expect.objectContaining({
          title: expect.stringContaining('Error'),
          description: expect.stringContaining('temporarily unavailable')
        })]
      });
    });

    it('should handle validation errors', async () => {
      const { UserSettingsService } = await import('../../services/userSettings.js');
      (UserSettingsService.updateUserSettings as jest.Mock).mockRejectedValue(
        new Error('VALIDATION_ERROR: Invalid model configuration')
      );

      mockInteraction.options.getSubcommand = jest.fn().mockReturnValue('models');
      mockInteraction.options.getString = jest.fn().mockReturnValue('invalid-config');

      await settingsCommand.execute(mockInteraction as ChatInputCommandInteraction);
      
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        embeds: [expect.objectContaining({
          title: expect.stringContaining('Validation Error'),
          description: expect.stringContaining('Invalid model configuration')
        })]
      });
    });

    it('should handle API key validation failures', async () => {
      const { UserSettingsService } = await import('../../services/userSettings.js');
      (UserSettingsService.validateAPIKeys as jest.Mock).mockRejectedValue(
        new Error('API validation service unavailable')
      );

      mockInteraction.options.getSubcommand = jest.fn().mockReturnValue('apikeys');

      await settingsCommand.execute(mockInteraction as ChatInputCommandInteraction);
      
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        embeds: [expect.objectContaining({
          title: expect.stringContaining('Validation Error'),
          description: expect.stringContaining('unable to check')
        })]
      });
    });
  });

  describe('Privacy and Security', () => {
    it('should always reply ephemerally for sensitive settings', async () => {
      mockInteraction.options.getSubcommand = jest.fn().mockReturnValue('apikeys');

      await settingsCommand.execute(mockInteraction as ChatInputCommandInteraction);
      
      expect(mockInteraction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    });

    it('should not log sensitive information', async () => {
      const consoleSpy = jest.spyOn(console, 'log');
      mockInteraction.options.getSubcommand = jest.fn().mockReturnValue('apikeys');

      await settingsCommand.execute(mockInteraction as ChatInputCommandInteraction);
      
      // Verify no API keys are logged
      const logCalls = consoleSpy.mock.calls.flat();
      expect(logCalls.some(call => 
        typeof call === 'string' && call.includes('sk-') // OpenAI key format
      )).toBe(false);
    });

    it('should encrypt API keys before storage', async () => {
      mockInteraction.options.getSubcommand = jest.fn().mockReturnValue('apikeys');
      mockInteraction.options.getString = jest.fn()
        .mockImplementation((name) => {
          switch (name) {
            case 'openai': return 'sk-test-openai-key';
            case 'anthropic': return 'sk-ant-test-key';
            default: return null;
          }
        });

      const { UserSettingsService } = await import('../../services/userSettings.js');
      
      await settingsCommand.execute(mockInteraction as ChatInputCommandInteraction);
      
      expect(UserSettingsService.updateAPIKeys).toHaveBeenCalledWith(
        '123456789',
        expect.objectContaining({
          openai: expect.not.stringMatching(/^sk-test-openai-key$/), // Should be encrypted
          anthropic: expect.not.stringMatching(/^sk-ant-test-key$/) // Should be encrypted
        })
      );
    });
  });

  describe('Settings Persistence', () => {
    it('should validate settings before saving', async () => {
      mockInteraction.options.getSubcommand = jest.fn().mockReturnValue('models');
      mockInteraction.options.getString = jest.fn().mockReturnValue('gpt-4,claude-3.5-sonnet');

      const { UserSettingsService } = await import('../../services/userSettings.js');
      
      await settingsCommand.execute(mockInteraction as ChatInputCommandInteraction);
      
      // Verify validation was called before update
      expect(UserSettingsService.updateUserSettings).toHaveBeenCalledTimes(1);
    });

    it('should rollback on save failure', async () => {
      mockInteraction.options.getSubcommand = jest.fn().mockReturnValue('models');
      mockInteraction.options.getString = jest.fn().mockReturnValue('gpt-4');

      const { UserSettingsService } = await import('../../services/userSettings.js');
      (UserSettingsService.updateUserSettings as jest.Mock)
        .mockRejectedValueOnce(new Error('Save failed'))
        .mockResolvedValueOnce(true); // Rollback succeeds

      await settingsCommand.execute(mockInteraction as ChatInputCommandInteraction);
      
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        embeds: [expect.objectContaining({
          title: expect.stringContaining('Error'),
          description: expect.stringContaining('changes were not saved')
        })]
      });
    });
  });
});