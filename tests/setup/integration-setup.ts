import { beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { Client } from 'pg';
import { Redis } from 'redis';
import fastify, { FastifyInstance } from 'fastify';

// Test database setup
let testDbClient: Client;
let testRedisClient: Redis;
let testApiServer: FastifyInstance;

// Test database configuration
const TEST_DB_CONFIG = {
  host: process.env.TEST_DB_HOST || 'localhost',
  port: parseInt(process.env.TEST_DB_PORT || '5432'),
  database: process.env.TEST_DB_NAME || 'aicompare_test',
  user: process.env.TEST_DB_USER || 'postgres',
  password: process.env.TEST_DB_PASSWORD || 'postgres'
};

// Test Redis configuration
const TEST_REDIS_CONFIG = {
  url: process.env.TEST_REDIS_URL || 'redis://localhost:6379/1'
};

// Global integration test utilities
globalThis.IntegrationTestUtils = {
  // Database utilities
  async cleanDatabase() {
    await testDbClient.query('TRUNCATE TABLE votes, responses, queries, users, teams CASCADE');
  },

  async seedTestData() {
    // Insert test user
    await testDbClient.query(`
      INSERT INTO users (id, discord_id, username, encrypted_api_keys, preferences, created_at, last_active)
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      ON CONFLICT (discord_id) DO NOTHING
    `, [
      'user-test-123',
      '123456789',
      'testuser',
      JSON.stringify({}),
      JSON.stringify({ defaultModels: ['gpt-4', 'claude-3.5-sonnet'] })
    ]);

    // Insert test team
    await testDbClient.query(`
      INSERT INTO teams (id, discord_guild_id, name, settings, created_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (discord_guild_id) DO NOTHING
    `, [
      'team-test-123',
      'guild-123',
      'Test Guild',
      JSON.stringify({ allowedModels: ['gpt-4', 'claude-3.5-sonnet', 'gemini-1.5-pro'] })
    ]);
  },

  // Redis utilities
  async clearRedisCache() {
    await testRedisClient.flushDb();
  },

  // API test utilities
  async makeAuthenticatedRequest(method: string, url: string, payload?: any) {
    const token = await this.generateTestJWT();
    const response = await testApiServer.inject({
      method,
      url,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json'
      },
      payload: payload ? JSON.stringify(payload) : undefined
    });
    return response;
  },

  async generateTestJWT() {
    const jwt = testApiServer.jwt;
    return jwt.sign({
      userId: 'user-test-123',
      discordId: '123456789',
      username: 'testuser'
    });
  },

  // Mock AI provider responses
  mockAIProviderResponses: {
    openai: {
      'gpt-4': {
        id: 'chatcmpl-test123',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: 'This is a test response from GPT-4'
          },
          finish_reason: 'stop'
        }],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 8,
          total_tokens: 18
        }
      }
    },
    anthropic: {
      'claude-3.5-sonnet': {
        id: 'msg_test123',
        type: 'message',
        role: 'assistant',
        content: [{
          type: 'text',
          text: 'This is a test response from Claude 3.5 Sonnet'
        }],
        model: 'claude-3-5-sonnet-20240620',
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: {
          input_tokens: 10,
          output_tokens: 10
        }
      }
    },
    google: {
      'gemini-1.5-pro': {
        candidates: [{
          content: {
            parts: [{
              text: 'This is a test response from Gemini 1.5 Pro'
            }]
          },
          finishReason: 'STOP'
        }],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 9,
          totalTokenCount: 19
        }
      }
    },
    cohere: {
      'command-r-plus': {
        id: 'test-generation-123',
        generations: [{
          id: 'gen-123',
          text: 'This is a test response from Command R+',
          finish_reason: 'COMPLETE'
        }],
        meta: {
          api_version: {
            version: '1'
          },
          billed_units: {
            input_tokens: 10,
            output_tokens: 8
          }
        }
      }
    }
  }
};

// Integration test setup
beforeAll(async () => {
  console.log('Setting up integration test environment...');

  // Setup test database connection
  testDbClient = new Client(TEST_DB_CONFIG);
  await testDbClient.connect();

  // Run database migrations for tests
  await runTestMigrations(testDbClient);

  // Setup test Redis connection
  testRedisClient = new Redis(TEST_REDIS_CONFIG.url);

  // Setup test API server
  testApiServer = fastify({ logger: false });
  
  // Register plugins and routes (this would import your actual API setup)
  // await testApiServer.register(import('../packages/api-server/src/app'));

  console.log('Integration test environment ready');
}, 30000);

beforeEach(async () => {
  // Clean database and cache before each test
  await globalThis.IntegrationTestUtils.cleanDatabase();
  await globalThis.IntegrationTestUtils.clearRedisCache();
  
  // Seed basic test data
  await globalThis.IntegrationTestUtils.seedTestData();
}, 10000);

afterEach(async () => {
  // Clean up after each test
  await globalThis.IntegrationTestUtils.cleanDatabase();
  await globalThis.IntegrationTestUtils.clearRedisCache();
}, 10000);

afterAll(async () => {
  console.log('Tearing down integration test environment...');
  
  // Close all connections
  if (testDbClient) {
    await testDbClient.end();
  }
  
  if (testRedisClient) {
    await testRedisClient.quit();
  }
  
  if (testApiServer) {
    await testApiServer.close();
  }
  
  console.log('Integration test environment torn down');
}, 30000);

// Database migration helper for tests
async function runTestMigrations(client: Client) {
  // Create test tables
  await client.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      discord_id BIGINT UNIQUE NOT NULL,
      username VARCHAR(255) NOT NULL,
      encrypted_api_keys JSONB DEFAULT '{}',
      preferences JSONB DEFAULT '{}',
      created_at TIMESTAMP DEFAULT NOW(),
      last_active TIMESTAMP DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS teams (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      discord_guild_id BIGINT UNIQUE NOT NULL,
      name VARCHAR(255) NOT NULL,
      settings JSONB DEFAULT '{}',
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS queries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id),
      team_id UUID REFERENCES teams(id),
      prompt TEXT NOT NULL,
      parameters JSONB DEFAULT '{}',
      models_requested TEXT[] NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      discord_message_id BIGINT
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS responses (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      query_id UUID REFERENCES queries(id),
      model_name VARCHAR(100) NOT NULL,
      content TEXT NOT NULL,
      metadata JSONB DEFAULT '{}',
      response_time_ms INTEGER NOT NULL,
      token_count INTEGER NOT NULL,
      cost_usd DECIMAL(10,6) DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS votes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id),
      response_id UUID REFERENCES responses(id),
      vote_type VARCHAR(20) CHECK (vote_type IN ('thumbs_up', 'thumbs_down', 'star_rating')),
      value INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);
}