import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { historyCommand } from '../history.js';
import type { ChatInputCommandInteraction } from 'discord.js';

// Mock dependencies
jest.mock('../../services/queryHistory.js', () => ({
  QueryHistoryService: {
    getQueryHistory: jest.fn().mockResolvedValue({
      queries: [
        {
          id: 'query-1',
          prompt: 'Explain machine learning',
          modelsUsed: ['gpt-4', 'claude-3.5-sonnet'],
          createdAt: new Date('2023-12-01T10:00:00Z'),
          responses: [
            { model: 'gpt-4', votes: { thumbsUp: 5, thumbsDown: 1 } },
            { model: 'claude-3.5-sonnet', votes: { thumbsUp: 3, thumbsDown: 0 } }
          ]
        },
        {
          id: 'query-2',
          prompt: 'Best practices for API design',
          modelsUsed: ['gpt-4'],
          createdAt: new Date('2023-12-01T09:00:00Z'),
          responses: [
            { model: 'gpt-4', votes: { thumbsUp: 8, thumbsDown: 2 } }
          ]
        }
      ],
      totalCount: 15,
      page: 1,
      totalPages: 2,
      hasNext: true,
      hasPrevious: false
    }),
    getUserQueryStats: jest.fn().mockResolvedValue({
      totalQueries: 15,
      thisWeek: 3,
      favoriteModels: ['gpt-4', 'claude-3.5-sonnet'],
      averageResponseTime: 1250
    })
  }
}));

jest.mock('../../utils/embeds.js', () => ({
  createHistoryEmbed: jest.fn().mockReturnValue({
    title: 'Query History',
    fields: []
  }),
  createStatsEmbed: jest.fn().mockReturnValue({
    title: 'Your Statistics',
    fields: []
  })
}));

jest.mock('../../utils/components.js', () => ({
  createHistoryNavigation: jest.fn().mockReturnValue({
    type: 1,
    components: []
  }),
  createHistoryFilters: jest.fn().mockReturnValue({
    type: 1,
    components: []
  })
}));

describe('History Command', () => {
  let mockInteraction: Partial<ChatInputCommandInteraction>;

  beforeEach(() => {
    mockInteraction = globalThis.TestUtils.createMockInteraction('history', {
      limit: 10,
      filter: null
    });
    
    jest.clearAllMocks();
  });

  describe('Command Registration', () => {
    it('should have correct command name', () => {
      expect(historyCommand.data.name).toBe('history');
    });

    it('should have correct command description', () => {
      expect(historyCommand.data.description).toBe('View previous AI comparisons');
    });

    it('should have optional limit parameter with bounds', () => {
      const limitOption = historyCommand.data.options.find(
        (option: any) => option.name === 'limit'
      );
      expect(limitOption).toBeDefined();
      expect(limitOption.required).toBe(false);
      expect(limitOption.min_value).toBe(1);
      expect(limitOption.max_value).toBe(25);
    });

    it('should have optional filter parameter', () => {
      const filterOption = historyCommand.data.options.find(
        (option: any) => option.name === 'filter'
      );
      expect(filterOption).toBeDefined();
      expect(filterOption.required).toBe(false);
    });

    it('should have stats subcommand', () => {
      const statsSubcommand = historyCommand.data.options.find(
        (option: any) => option.name === 'stats'
      );
      expect(statsSubcommand).toBeDefined();
      expect(statsSubcommand.type).toBe(1); // SUB_COMMAND
    });
  });

  describe('Basic History Retrieval', () => {
    it('should defer reply as ephemeral', async () => {
      await historyCommand.execute(mockInteraction as ChatInputCommandInteraction);
      
      expect(mockInteraction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    });

    it('should fetch history with default parameters', async () => {
      mockInteraction.options.getInteger = jest.fn().mockReturnValue(null);
      mockInteraction.options.getString = jest.fn().mockReturnValue(null);

      const { QueryHistoryService } = await import('../../services/queryHistory.js');
      
      await historyCommand.execute(mockInteraction as ChatInputCommandInteraction);
      
      expect(QueryHistoryService.getQueryHistory).toHaveBeenCalledWith({
        guildId: 'guild-123',
        userId: '123456789',
        limit: 10,
        filter: null,
        page: 1
      });
    });

    it('should respect limit parameter', async () => {
      mockInteraction.options.getInteger = jest.fn().mockReturnValue(15);
      mockInteraction.options.getString = jest.fn().mockReturnValue(null);

      const { QueryHistoryService } = await import('../../services/queryHistory.js');
      
      await historyCommand.execute(mockInteraction as ChatInputCommandInteraction);
      
      expect(QueryHistoryService.getQueryHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 15
        })
      );
    });

    it('should apply filter parameter', async () => {
      mockInteraction.options.getInteger = jest.fn().mockReturnValue(null);
      mockInteraction.options.getString = jest.fn().mockReturnValue('gpt-4');

      const { QueryHistoryService } = await import('../../services/queryHistory.js');
      
      await historyCommand.execute(mockInteraction as ChatInputCommandInteraction);
      
      expect(QueryHistoryService.getQueryHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: 'gpt-4'
        })
      );
    });
  });

  describe('History Display', () => {
    it('should create and send history embed with navigation', async () => {
      const { createHistoryEmbed, createHistoryNavigation } = await import('../../utils/embeds.js');
      
      await historyCommand.execute(mockInteraction as ChatInputCommandInteraction);
      
      expect(createHistoryEmbed).toHaveBeenCalledWith(
        expect.objectContaining({
          queries: expect.any(Array),
          totalCount: 15,
          page: 1
        })
      );
      
      expect(createHistoryNavigation).toHaveBeenCalledWith(1, 2, true, false);
      
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        embeds: [expect.objectContaining({ title: 'Query History' })],
        components: [expect.objectContaining({ type: 1 })]
      });
    });

    it('should handle empty history', async () => {
      const { QueryHistoryService } = await import('../../services/queryHistory.js');
      (QueryHistoryService.getQueryHistory as jest.Mock).mockResolvedValue({
        queries: [],
        totalCount: 0,
        page: 1,
        totalPages: 0,
        hasNext: false,
        hasPrevious: false
      });

      await historyCommand.execute(mockInteraction as ChatInputCommandInteraction);
      
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        embeds: [expect.objectContaining({
          title: expect.stringContaining('No History'),
          description: expect.stringContaining('no previous comparisons')
        })],
        components: []
      });
    });

    it('should format history entries correctly', async () => {
      const { createHistoryEmbed } = await import('../../utils/embeds.js');
      
      await historyCommand.execute(mockInteraction as ChatInputCommandInteraction);
      
      const historyData = (createHistoryEmbed as jest.Mock).mock.calls[0][0];
      
      expect(historyData.queries).toHaveLength(2);
      expect(historyData.queries[0]).toMatchObject({
        id: 'query-1',
        prompt: 'Explain machine learning',
        modelsUsed: ['gpt-4', 'claude-3.5-sonnet']
      });
    });
  });

  describe('Statistics Subcommand', () => {
    beforeEach(() => {
      mockInteraction.options.getSubcommand = jest.fn().mockReturnValue('stats');
    });

    it('should fetch and display user statistics', async () => {
      const { QueryHistoryService } = await import('../../services/queryHistory.js');
      const { createStatsEmbed } = await import('../../utils/embeds.js');
      
      await historyCommand.execute(mockInteraction as ChatInputCommandInteraction);
      
      expect(QueryHistoryService.getUserQueryStats).toHaveBeenCalledWith(
        '123456789',
        'guild-123'
      );
      
      expect(createStatsEmbed).toHaveBeenCalledWith(
        expect.objectContaining({
          totalQueries: 15,
          thisWeek: 3,
          favoriteModels: ['gpt-4', 'claude-3.5-sonnet']
        })
      );
    });

    it('should handle new users with no stats', async () => {
      const { QueryHistoryService } = await import('../../services/queryHistory.js');
      (QueryHistoryService.getUserQueryStats as jest.Mock).mockResolvedValue({
        totalQueries: 0,
        thisWeek: 0,
        favoriteModels: [],
        averageResponseTime: 0
      });

      await historyCommand.execute(mockInteraction as ChatInputCommandInteraction);
      
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        embeds: [expect.objectContaining({
          title: expect.stringContaining('Statistics'),
          description: expect.stringContaining('no comparisons yet')
        })]
      });
    });
  });

  describe('Filtering and Search', () => {
    it('should filter by model name', async () => {
      mockInteraction.options.getString = jest.fn().mockReturnValue('claude');

      const { QueryHistoryService } = await import('../../services/queryHistory.js');
      
      await historyCommand.execute(mockInteraction as ChatInputCommandInteraction);
      
      expect(QueryHistoryService.getQueryHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: 'claude'
        })
      );
    });

    it('should filter by date range', async () => {
      mockInteraction.options.getString = jest.fn().mockReturnValue('last-week');

      const { QueryHistoryService } = await import('../../services/queryHistory.js');
      
      await historyCommand.execute(mockInteraction as ChatInputCommandInteraction);
      
      expect(QueryHistoryService.getQueryHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: 'last-week'
        })
      );
    });

    it('should handle invalid filter values', async () => {
      mockInteraction.options.getString = jest.fn().mockReturnValue('invalid-filter');

      const { QueryHistoryService } = await import('../../services/queryHistory.js');
      (QueryHistoryService.getQueryHistory as jest.Mock).mockRejectedValue(
        new Error('INVALID_FILTER')
      );

      await historyCommand.execute(mockInteraction as ChatInputCommandInteraction);
      
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        embeds: [expect.objectContaining({
          title: expect.stringContaining('Error'),
          description: expect.stringContaining('Invalid filter')
        })]
      });
    });
  });

  describe('Pagination', () => {
    it('should handle pagination navigation', async () => {
      const { createHistoryNavigation } = await import('../../utils/components.js');
      
      await historyCommand.execute(mockInteraction as ChatInputCommandInteraction);
      
      expect(createHistoryNavigation).toHaveBeenCalledWith(1, 2, true, false);
    });

    it('should disable navigation on single page', async () => {
      const { QueryHistoryService } = await import('../../services/queryHistory.js');
      (QueryHistoryService.getQueryHistory as jest.Mock).mockResolvedValue({
        queries: [{ id: 'query-1' }],
        totalCount: 5,
        page: 1,
        totalPages: 1,
        hasNext: false,
        hasPrevious: false
      });

      const { createHistoryNavigation } = await import('../../utils/components.js');
      
      await historyCommand.execute(mockInteraction as ChatInputCommandInteraction);
      
      expect(createHistoryNavigation).toHaveBeenCalledWith(1, 1, false, false);
    });
  });

  describe('Permission and Privacy', () => {
    it('should only show user own queries by default', async () => {
      const { QueryHistoryService } = await import('../../services/queryHistory.js');
      
      await historyCommand.execute(mockInteraction as ChatInputCommandInteraction);
      
      expect(QueryHistoryService.getQueryHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: '123456789' // User's own queries only
        })
      );
    });

    it('should handle guild admin permissions for all queries', async () => {
      mockInteraction.member = {
        permissions: {
          has: jest.fn().mockReturnValue(true) // ADMINISTRATOR permission
        }
      };
      mockInteraction.options.getBoolean = jest.fn()
        .mockImplementation((name) => name === 'all-users' ? true : null);

      const { QueryHistoryService } = await import('../../services/queryHistory.js');
      
      await historyCommand.execute(mockInteraction as ChatInputCommandInteraction);
      
      expect(QueryHistoryService.getQueryHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: null // All users' queries
        })
      );
    });

    it('should deny access to all queries for non-admin users', async () => {
      mockInteraction.member = {
        permissions: {
          has: jest.fn().mockReturnValue(false)
        }
      };
      mockInteraction.options.getBoolean = jest.fn()
        .mockImplementation((name) => name === 'all-users' ? true : null);

      await historyCommand.execute(mockInteraction as ChatInputCommandInteraction);
      
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        embeds: [expect.objectContaining({
          title: expect.stringContaining('Permission Denied'),
          description: expect.stringContaining('administrator')
        })]
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection errors', async () => {
      const { QueryHistoryService } = await import('../../services/queryHistory.js');
      (QueryHistoryService.getQueryHistory as jest.Mock).mockRejectedValue(
        new Error('Database connection failed')
      );

      await historyCommand.execute(mockInteraction as ChatInputCommandInteraction);
      
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        embeds: [expect.objectContaining({
          title: expect.stringContaining('Error'),
          description: expect.stringContaining('temporarily unavailable')
        })]
      });
    });

    it('should handle timeout errors', async () => {
      const { QueryHistoryService } = await import('../../services/queryHistory.js');
      (QueryHistoryService.getQueryHistory as jest.Mock).mockRejectedValue(
        new Error('TIMEOUT')
      );

      await historyCommand.execute(mockInteraction as ChatInputCommandInteraction);
      
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        embeds: [expect.objectContaining({
          title: expect.stringContaining('Timeout'),
          description: expect.stringContaining('took too long')
        })]
      });
    });
  });
});