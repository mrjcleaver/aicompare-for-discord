import { beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { jest } from '@jest/globals';

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.DISCORD_TOKEN = 'test_discord_token';
process.env.DISCORD_CLIENT_ID = 'test_client_id';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/aicompare_test';
process.env.REDIS_URL = 'redis://localhost:6379/1';
process.env.JWT_SECRET = 'test_jwt_secret';
process.env.OPENAI_API_KEY = 'test_openai_key';
process.env.ANTHROPIC_API_KEY = 'test_anthropic_key';
process.env.GOOGLE_API_KEY = 'test_google_key';
process.env.COHERE_API_KEY = 'test_cohere_key';

// Global test utilities
globalThis.TestUtils = {
  createMockUser: () => ({
    id: 'user-123',
    discordId: '123456789',
    username: 'testuser',
    avatar: 'test-avatar.png',
    preferences: {
      defaultModels: ['gpt-4', 'claude-3.5-sonnet'],
      notifications: true,
      theme: 'light'
    },
    createdAt: new Date(),
    lastActive: new Date()
  }),

  createMockQuery: () => ({
    id: 'query-123',
    userId: 'user-123',
    guildId: 'guild-123',
    prompt: 'Test prompt for AI comparison',
    parameters: {
      temperature: 0.7,
      maxTokens: 1000
    },
    modelsRequested: ['gpt-4', 'claude-3.5-sonnet'],
    createdAt: new Date(),
    discordMessageId: '987654321'
  }),

  createMockResponse: (model: string = 'gpt-4') => ({
    id: 'response-123',
    queryId: 'query-123',
    modelName: model,
    content: 'This is a test response from ' + model,
    metadata: {
      model: model,
      usage: {
        promptTokens: 10,
        completionTokens: 15,
        totalTokens: 25
      }
    },
    responseTimeMs: 1500,
    tokenCount: 25,
    costUsd: 0.001,
    createdAt: new Date()
  }),

  createMockComparison: () => ({
    id: 'comparison-123',
    query: globalThis.TestUtils.createMockQuery(),
    responses: [
      globalThis.TestUtils.createMockResponse('gpt-4'),
      globalThis.TestUtils.createMockResponse('claude-3.5-sonnet')
    ],
    metrics: {
      semantic: 85,
      length: 92,
      sentiment: 78,
      speed: 88
    },
    votes: {
      'response-123': {
        thumbsUp: 5,
        thumbsDown: 1,
        starRatings: [4, 5, 4, 5, 3]
      }
    },
    createdAt: new Date()
  }),

  // Mock Discord.js components
  createMockInteraction: (commandName: string, options: any = {}) => ({
    commandName,
    user: {
      id: '123456789',
      username: 'testuser',
      avatar: 'test-avatar.png'
    },
    guild: {
      id: 'guild-123',
      name: 'Test Guild'
    },
    options: {
      getString: jest.fn((name: string) => options[name] || null),
      getInteger: jest.fn((name: string) => options[name] || null),
      getNumber: jest.fn((name: string) => options[name] || null)
    },
    deferReply: jest.fn().mockResolvedValue(undefined),
    editReply: jest.fn().mockResolvedValue(undefined),
    reply: jest.fn().mockResolvedValue(undefined)
  }),

  // Test database helpers
  delay: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
  
  generateRandomId: () => Math.random().toString(36).substring(2, 15)
};

// Global test setup
beforeAll(() => {
  // Mock console methods to reduce noise during tests
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'info').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

beforeEach(() => {
  // Clear all mocks before each test
  jest.clearAllMocks();
});

afterEach(() => {
  // Clean up any timers or async operations
  jest.clearAllTimers();
  jest.useRealTimers();
});

afterAll(() => {
  // Restore console methods
  jest.restoreAllMocks();
});