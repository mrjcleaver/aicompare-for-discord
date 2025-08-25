import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { compareCommand } from '../compare.js';
import type { ChatInputCommandInteraction } from 'discord.js';

// Mock dependencies
jest.mock('../../services/aiOrchestrator.js', () => ({
  AIOrchestrator: {
    queueComparison: jest.fn().mockResolvedValue('query-123'),
    getComparisonStatus: jest.fn().mockResolvedValue({
      status: 'completed',
      results: {
        responses: [
          {
            id: 'response-1',
            model: 'gpt-4',
            content: 'Test response from GPT-4',
            responseTime: 1200,
            tokenCount: 25
          },
          {
            id: 'response-2',
            model: 'claude-3.5-sonnet',
            content: 'Test response from Claude',
            responseTime: 950,
            tokenCount: 28
          }
        ]
      }
    })
  }
}));

jest.mock('../../utils/embeds.js', () => ({
  createProgressEmbed: jest.fn().mockReturnValue({
    title: 'Processing AI Comparison',
    description: 'Querying models...'
  }),
  createComparisonEmbed: jest.fn().mockReturnValue({
    title: 'AI Model Comparison Results',
    fields: []
  })
}));

jest.mock('../../utils/components.js', () => ({
  createVotingComponents: jest.fn().mockReturnValue([
    { type: 1, components: [] },
    { type: 1, components: [] }
  ])
}));

describe('Compare Command', () => {
  let mockInteraction: Partial<ChatInputCommandInteraction>;

  beforeEach(() => {
    mockInteraction = globalThis.TestUtils.createMockInteraction('compare', {
      prompt: 'Explain quantum computing',
      models: 'gpt4,claude35',
      temperature: 0.7
    });
    
    jest.clearAllMocks();
  });

  describe('Command Registration', () => {
    it('should have correct command name', () => {
      expect(compareCommand.data.name).toBe('compare');
    });

    it('should have correct command description', () => {
      expect(compareCommand.data.description).toBe('Compare AI model responses');
    });

    it('should require prompt parameter', () => {
      const promptOption = compareCommand.data.options.find(
        (option: any) => option.name === 'prompt'
      );
      expect(promptOption).toBeDefined();
      expect(promptOption.required).toBe(true);
      expect(promptOption.max_length).toBe(4000);
    });

    it('should have optional models parameter with choices', () => {
      const modelsOption = compareCommand.data.options.find(
        (option: any) => option.name === 'models'
      );
      expect(modelsOption).toBeDefined();
      expect(modelsOption.required).toBe(false);
      expect(modelsOption.choices).toHaveLength(3);
    });

    it('should have optional temperature parameter with limits', () => {
      const tempOption = compareCommand.data.options.find(
        (option: any) => option.name === 'temperature'
      );
      expect(tempOption).toBeDefined();
      expect(tempOption.min_value).toBe(0.0);
      expect(tempOption.max_value).toBe(1.0);
    });
  });

  describe('Command Execution', () => {
    it('should defer reply immediately', async () => {
      await compareCommand.execute(mockInteraction as ChatInputCommandInteraction);
      
      expect(mockInteraction.deferReply).toHaveBeenCalledWith({ ephemeral: false });
    });

    it('should extract parameters correctly', async () => {
      const { AIOrchestrator } = await import('../../services/aiOrchestrator.js');
      
      await compareCommand.execute(mockInteraction as ChatInputCommandInteraction);
      
      expect(AIOrchestrator.queueComparison).toHaveBeenCalledWith({
        userId: '123456789',
        guildId: 'guild-123',
        prompt: 'Explain quantum computing',
        models: ['gpt-4', 'claude-3.5-sonnet'],
        temperature: 0.7,
        messageId: expect.any(String)
      });
    });

    it('should use default values for optional parameters', async () => {
      mockInteraction.options.getString = jest.fn()
        .mockReturnValueOnce('Test prompt') // prompt
        .mockReturnValueOnce(null); // models (default)
      mockInteraction.options.getNumber = jest.fn().mockReturnValue(null); // temperature

      const { AIOrchestrator } = await import('../../services/aiOrchestrator.js');
      
      await compareCommand.execute(mockInteraction as ChatInputCommandInteraction);
      
      expect(AIOrchestrator.queueComparison).toHaveBeenCalledWith(
        expect.objectContaining({
          models: ['gpt-4', 'claude-3.5-sonnet'], // default models
          temperature: 0.7 // default temperature
        })
      );
    });

    it('should create and send progress embed', async () => {
      const { createProgressEmbed } = await import('../../utils/embeds.js');
      
      await compareCommand.execute(mockInteraction as ChatInputCommandInteraction);
      
      expect(createProgressEmbed).toHaveBeenCalledWith('query-123', ['gpt-4', 'claude-3.5-sonnet']);
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        embeds: [expect.objectContaining({
          title: 'Processing AI Comparison'
        })]
      });
    });

    it('should handle errors gracefully', async () => {
      const { AIOrchestrator } = await import('../../services/aiOrchestrator.js');
      (AIOrchestrator.queueComparison as jest.Mock).mockRejectedValue(
        new Error('AI service unavailable')
      );

      await compareCommand.execute(mockInteraction as ChatInputCommandInteraction);
      
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        embeds: [expect.objectContaining({
          title: expect.stringContaining('Error'),
          description: expect.stringContaining('AI service unavailable')
        })]
      });
    });

    it('should validate prompt length', async () => {
      const longPrompt = 'a'.repeat(4001);
      mockInteraction.options.getString = jest.fn()
        .mockReturnValueOnce(longPrompt);

      await compareCommand.execute(mockInteraction as ChatInputCommandInteraction);
      
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        embeds: [expect.objectContaining({
          title: expect.stringContaining('Error'),
          description: expect.stringContaining('too long')
        })]
      });
    });
  });

  describe('Model Selection Parsing', () => {
    it('should parse "all" selection correctly', async () => {
      mockInteraction.options.getString = jest.fn()
        .mockReturnValueOnce('Test prompt')
        .mockReturnValueOnce('all');

      const { AIOrchestrator } = await import('../../services/aiOrchestrator.js');
      
      await compareCommand.execute(mockInteraction as ChatInputCommandInteraction);
      
      expect(AIOrchestrator.queueComparison).toHaveBeenCalledWith(
        expect.objectContaining({
          models: ['gpt-4', 'claude-3.5-sonnet', 'gemini-1.5-pro', 'command-r-plus']
        })
      );
    });

    it('should parse custom selection correctly', async () => {
      mockInteraction.options.getString = jest.fn()
        .mockReturnValueOnce('Test prompt')
        .mockReturnValueOnce('gpt4,gemini15');

      const { AIOrchestrator } = await import('../../services/aiOrchestrator.js');
      
      await compareCommand.execute(mockInteraction as ChatInputCommandInteraction);
      
      expect(AIOrchestrator.queueComparison).toHaveBeenCalledWith(
        expect.objectContaining({
          models: ['gpt-4', 'gemini-1.5-pro']
        })
      );
    });

    it('should handle invalid model selections', async () => {
      mockInteraction.options.getString = jest.fn()
        .mockReturnValueOnce('Test prompt')
        .mockReturnValueOnce('invalidmodel');

      await compareCommand.execute(mockInteraction as ChatInputCommandInteraction);
      
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        embeds: [expect.objectContaining({
          title: expect.stringContaining('Error'),
          description: expect.stringContaining('Invalid model selection')
        })]
      });
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce user rate limits', async () => {
      // Mock rate limit exceeded
      const { AIOrchestrator } = await import('../../services/aiOrchestrator.js');
      (AIOrchestrator.queueComparison as jest.Mock).mockRejectedValue(
        new Error('RATE_LIMIT_EXCEEDED')
      );

      await compareCommand.execute(mockInteraction as ChatInputCommandInteraction);
      
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        embeds: [expect.objectContaining({
          title: expect.stringContaining('Rate Limited'),
          description: expect.stringContaining('too many requests')
        })]
      });
    });

    it('should enforce guild rate limits', async () => {
      const { AIOrchestrator } = await import('../../services/aiOrchestrator.js');
      (AIOrchestrator.queueComparison as jest.Mock).mockRejectedValue(
        new Error('GUILD_RATE_LIMIT_EXCEEDED')
      );

      await compareCommand.execute(mockInteraction as ChatInputCommandInteraction);
      
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        embeds: [expect.objectContaining({
          title: expect.stringContaining('Server Rate Limited'),
          description: expect.stringContaining('server has reached')
        })]
      });
    });
  });

  describe('Permission Checks', () => {
    it('should check user permissions in guild', async () => {
      mockInteraction.guild = null; // DM context

      await compareCommand.execute(mockInteraction as ChatInputCommandInteraction);
      
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        embeds: [expect.objectContaining({
          title: expect.stringContaining('Error'),
          description: expect.stringContaining('guild only')
        })]
      });
    });

    it('should validate API key presence', async () => {
      const { AIOrchestrator } = await import('../../services/aiOrchestrator.js');
      (AIOrchestrator.queueComparison as jest.Mock).mockRejectedValue(
        new Error('NO_API_KEYS_CONFIGURED')
      );

      await compareCommand.execute(mockInteraction as ChatInputCommandInteraction);
      
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        embeds: [expect.objectContaining({
          title: expect.stringContaining('Configuration Required'),
          description: expect.stringContaining('API keys')
        })]
      });
    });
  });
});