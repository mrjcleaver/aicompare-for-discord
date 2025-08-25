/**
 * Test Database Setup and Management
 * Provides utilities for setting up and managing test databases
 */

import { Client } from 'pg';
import { Redis } from 'redis';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

export interface RedisConfig {
  host: string;
  port: number;
  db: number;
}

export class TestDatabaseManager {
  private pgClient: Client | null = null;
  private redisClient: Redis | null = null;
  private pgConfig: DatabaseConfig;
  private redisConfig: RedisConfig;

  constructor() {
    this.pgConfig = {
      host: process.env.TEST_DB_HOST || 'localhost',
      port: parseInt(process.env.TEST_DB_PORT || '5432'),
      database: process.env.TEST_DB_NAME || 'aicompare_test',
      user: process.env.TEST_DB_USER || 'postgres',
      password: process.env.TEST_DB_PASSWORD || 'postgres'
    };

    this.redisConfig = {
      host: process.env.TEST_REDIS_HOST || 'localhost',
      port: parseInt(process.env.TEST_REDIS_PORT || '6379'),
      db: parseInt(process.env.TEST_REDIS_DB || '15')
    };
  }

  /**
   * Initialize test databases
   */
  async initialize(): Promise<void> {
    console.log('🔧 Initializing test databases...');

    try {
      await this.setupPostgreSQL();
      await this.setupRedis();
      console.log('✅ Test databases initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize test databases:', error);
      throw error;
    }
  }

  /**
   * Setup PostgreSQL test database
   */
  private async setupPostgreSQL(): Promise<void> {
    // First, connect to postgres database to create test database
    const adminClient = new Client({
      ...this.pgConfig,
      database: 'postgres' // Connect to default database first
    });

    try {
      await adminClient.connect();

      // Drop existing test database if it exists
      try {
        await adminClient.query(`DROP DATABASE IF EXISTS "${this.pgConfig.database}"`);
      } catch (error) {
        // Ignore errors if database doesn't exist
      }

      // Create fresh test database
      await adminClient.query(`CREATE DATABASE "${this.pgConfig.database}"`);
      console.log(`✅ Created PostgreSQL test database: ${this.pgConfig.database}`);

    } finally {
      await adminClient.end();
    }

    // Connect to the test database and run migrations
    this.pgClient = new Client(this.pgConfig);
    await this.pgClient.connect();

    // Run database migrations
    await this.runMigrations();

    console.log('✅ PostgreSQL test database ready');
  }

  /**
   * Setup Redis test database
   */
  private async setupRedis(): Promise<void> {
    this.redisClient = new Redis({
      host: this.redisConfig.host,
      port: this.redisConfig.port,
      db: this.redisConfig.db
    });

    // Clear the test Redis database
    await this.redisClient.flushDb();

    console.log(`✅ Redis test database ready (DB ${this.redisConfig.db})`);
  }

  /**
   * Run database migrations
   */
  private async runMigrations(): Promise<void> {
    if (!this.pgClient) {
      throw new Error('PostgreSQL client not initialized');
    }

    console.log('📊 Running database migrations...');

    // Create extensions
    await this.pgClient.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await this.pgClient.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

    // Users table
    await this.pgClient.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        discord_id BIGINT UNIQUE NOT NULL,
        username VARCHAR(255) NOT NULL,
        avatar VARCHAR(255),
        encrypted_api_keys JSONB DEFAULT '{}',
        preferences JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        last_active TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Teams table
    await this.pgClient.query(`
      CREATE TABLE IF NOT EXISTS teams (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        discord_guild_id BIGINT UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        settings JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // User-Team relationships
    await this.pgClient.query(`
      CREATE TABLE IF NOT EXISTS user_teams (
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
        role VARCHAR(50) DEFAULT 'member',
        joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        PRIMARY KEY (user_id, team_id)
      )
    `);

    // Queries table
    await this.pgClient.query(`
      CREATE TABLE IF NOT EXISTS queries (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
        prompt TEXT NOT NULL,
        parameters JSONB DEFAULT '{}',
        models_requested TEXT[] NOT NULL,
        status VARCHAR(50) DEFAULT 'queued',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        completed_at TIMESTAMP WITH TIME ZONE,
        discord_message_id BIGINT,
        discord_channel_id BIGINT
      )
    `);

    // Responses table
    await this.pgClient.query(`
      CREATE TABLE IF NOT EXISTS responses (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        query_id UUID REFERENCES queries(id) ON DELETE CASCADE,
        model_name VARCHAR(100) NOT NULL,
        content TEXT NOT NULL,
        metadata JSONB DEFAULT '{}',
        response_time_ms INTEGER NOT NULL,
        token_count INTEGER NOT NULL,
        cost_usd DECIMAL(10,6) DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Votes table
    await this.pgClient.query(`
      CREATE TABLE IF NOT EXISTS votes (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        response_id UUID REFERENCES responses(id) ON DELETE CASCADE,
        vote_type VARCHAR(20) CHECK (vote_type IN ('thumbs_up', 'thumbs_down', 'star_rating')),
        value INTEGER NOT NULL CHECK (value BETWEEN 1 AND 5),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(user_id, response_id, vote_type)
      )
    `);

    // Comments table
    await this.pgClient.query(`
      CREATE TABLE IF NOT EXISTS comments (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        query_id UUID REFERENCES queries(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        discord_thread_id BIGINT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Comparison metrics table
    await this.pgClient.query(`
      CREATE TABLE IF NOT EXISTS comparison_metrics (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        query_id UUID REFERENCES queries(id) ON DELETE CASCADE,
        semantic_similarity INTEGER CHECK (semantic_similarity BETWEEN 0 AND 100),
        length_consistency INTEGER CHECK (length_consistency BETWEEN 0 AND 100),
        sentiment_alignment INTEGER CHECK (sentiment_alignment BETWEEN 0 AND 100),
        response_speed_score INTEGER CHECK (response_speed_score BETWEEN 0 AND 100),
        calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // API usage tracking
    await this.pgClient.query(`
      CREATE TABLE IF NOT EXISTS api_usage (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        provider VARCHAR(50) NOT NULL,
        model VARCHAR(100) NOT NULL,
        tokens_used INTEGER NOT NULL,
        cost_usd DECIMAL(10,6) NOT NULL,
        request_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Create indexes for better performance
    await this.createIndexes();

    console.log('✅ Database migrations completed');
  }

  /**
   * Create database indexes
   */
  private async createIndexes(): Promise<void> {
    if (!this.pgClient) return;

    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_users_discord_id ON users(discord_id)',
      'CREATE INDEX IF NOT EXISTS idx_teams_discord_guild_id ON teams(discord_guild_id)',
      'CREATE INDEX IF NOT EXISTS idx_queries_user_id ON queries(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_queries_team_id ON queries(team_id)',
      'CREATE INDEX IF NOT EXISTS idx_queries_created_at ON queries(created_at)',
      'CREATE INDEX IF NOT EXISTS idx_responses_query_id ON responses(query_id)',
      'CREATE INDEX IF NOT EXISTS idx_responses_model_name ON responses(model_name)',
      'CREATE INDEX IF NOT EXISTS idx_votes_response_id ON votes(response_id)',
      'CREATE INDEX IF NOT EXISTS idx_votes_user_id ON votes(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_comments_query_id ON comments(query_id)',
      'CREATE INDEX IF NOT EXISTS idx_api_usage_user_id ON api_usage(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_api_usage_timestamp ON api_usage(request_timestamp)'
    ];

    for (const indexSQL of indexes) {
      await this.pgClient.query(indexSQL);
    }

    console.log('✅ Database indexes created');
  }

  /**
   * Seed test data
   */
  async seedTestData(): Promise<void> {
    if (!this.pgClient) {
      throw new Error('PostgreSQL client not initialized');
    }

    console.log('🌱 Seeding test data...');

    // Insert test users
    const testUsers = [
      {
        discord_id: '123456789',
        username: 'testuser',
        avatar: 'test-avatar.png',
        preferences: {
          defaultModels: ['gpt-4', 'claude-3.5-sonnet'],
          notifications: { completion: true, votes: false },
          theme: 'light'
        }
      },
      {
        discord_id: '987654321',
        username: 'testuser2',
        avatar: 'test-avatar2.png',
        preferences: {
          defaultModels: ['claude-3.5-sonnet', 'gemini-1.5-pro'],
          notifications: { completion: false, votes: true },
          theme: 'dark'
        }
      }
    ];

    for (const user of testUsers) {
      await this.pgClient.query(`
        INSERT INTO users (discord_id, username, avatar, preferences)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (discord_id) DO UPDATE SET
          username = EXCLUDED.username,
          avatar = EXCLUDED.avatar,
          preferences = EXCLUDED.preferences,
          updated_at = NOW()
      `, [user.discord_id, user.username, user.avatar, JSON.stringify(user.preferences)]);
    }

    // Insert test team
    await this.pgClient.query(`
      INSERT INTO teams (discord_guild_id, name, settings)
      VALUES ($1, $2, $3)
      ON CONFLICT (discord_guild_id) DO UPDATE SET
        name = EXCLUDED.name,
        settings = EXCLUDED.settings,
        updated_at = NOW()
    `, [
      'guild-123',
      'Test Guild',
      JSON.stringify({
        allowedModels: ['gpt-4', 'claude-3.5-sonnet', 'gemini-1.5-pro'],
        maxQueriesPerHour: 100,
        requireApproval: false
      })
    ]);

    // Get user and team IDs for relationships
    const userResult = await this.pgClient.query('SELECT id FROM users WHERE discord_id = $1', ['123456789']);
    const teamResult = await this.pgClient.query('SELECT id FROM teams WHERE discord_guild_id = $1', ['guild-123']);

    const userId = userResult.rows[0]?.id;
    const teamId = teamResult.rows[0]?.id;

    if (userId && teamId) {
      // Link user to team
      await this.pgClient.query(`
        INSERT INTO user_teams (user_id, team_id, role)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id, team_id) DO NOTHING
      `, [userId, teamId, 'admin']);

      // Insert sample query
      const queryResult = await this.pgClient.query(`
        INSERT INTO queries (user_id, team_id, prompt, models_requested, status, parameters)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
      `, [
        userId,
        teamId,
        'Explain quantum computing in simple terms',
        ['gpt-4', 'claude-3.5-sonnet'],
        'completed',
        JSON.stringify({ temperature: 0.7, maxTokens: 1000 })
      ]);

      const queryId = queryResult.rows[0]?.id;

      if (queryId) {
        // Insert sample responses
        const responses = [
          {
            model: 'gpt-4',
            content: 'Quantum computing is a revolutionary technology that uses quantum mechanical phenomena to process information...',
            responseTime: 1200,
            tokenCount: 215,
            cost: 0.0043
          },
          {
            model: 'claude-3.5-sonnet',
            content: 'Quantum computing represents a fundamental shift in computational paradigms, leveraging quantum bits...',
            responseTime: 950,
            tokenCount: 195,
            cost: 0.0024
          }
        ];

        for (const response of responses) {
          await this.pgClient.query(`
            INSERT INTO responses (query_id, model_name, content, response_time_ms, token_count, cost_usd, metadata)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
          `, [
            queryId,
            response.model,
            response.content,
            response.responseTime,
            response.tokenCount,
            response.cost,
            JSON.stringify({ model: response.model, provider: response.model.includes('gpt') ? 'openai' : 'anthropic' })
          ]);
        }

        // Insert comparison metrics
        await this.pgClient.query(`
          INSERT INTO comparison_metrics (query_id, semantic_similarity, length_consistency, sentiment_alignment, response_speed_score)
          VALUES ($1, $2, $3, $4, $5)
        `, [queryId, 87, 91, 85, 92]);
      }
    }

    console.log('✅ Test data seeded');
  }

  /**
   * Clean all test data
   */
  async cleanDatabase(): Promise<void> {
    if (!this.pgClient) {
      throw new Error('PostgreSQL client not initialized');
    }

    console.log('🧹 Cleaning test database...');

    // Clean in reverse dependency order
    const tables = [
      'api_usage',
      'comparison_metrics',
      'comments',
      'votes',
      'responses',
      'queries',
      'user_teams',
      'teams',
      'users'
    ];

    for (const table of tables) {
      await this.pgClient.query(`TRUNCATE TABLE ${table} CASCADE`);
    }

    console.log('✅ Test database cleaned');
  }

  /**
   * Clean Redis cache
   */
  async cleanRedis(): Promise<void> {
    if (!this.redisClient) {
      throw new Error('Redis client not initialized');
    }

    await this.redisClient.flushDb();
    console.log('✅ Test Redis cache cleaned');
  }

  /**
   * Get PostgreSQL client for direct queries
   */
  getPostgreSQLClient(): Client {
    if (!this.pgClient) {
      throw new Error('PostgreSQL client not initialized');
    }
    return this.pgClient;
  }

  /**
   * Get Redis client for direct operations
   */
  getRedisClient(): Redis {
    if (!this.redisClient) {
      throw new Error('Redis client not initialized');
    }
    return this.redisClient;
  }

  /**
   * Close all database connections
   */
  async close(): Promise<void> {
    console.log('🔌 Closing database connections...');

    if (this.pgClient) {
      await this.pgClient.end();
      this.pgClient = null;
    }

    if (this.redisClient) {
      await this.redisClient.quit();
      this.redisClient = null;
    }

    console.log('✅ Database connections closed');
  }

  /**
   * Health check for database connections
   */
  async healthCheck(): Promise<{ postgres: boolean; redis: boolean }> {
    let postgres = false;
    let redis = false;

    try {
      if (this.pgClient) {
        await this.pgClient.query('SELECT 1');
        postgres = true;
      }
    } catch (error) {
      console.warn('PostgreSQL health check failed:', error);
    }

    try {
      if (this.redisClient) {
        await this.redisClient.ping();
        redis = true;
      }
    } catch (error) {
      console.warn('Redis health check failed:', error);
    }

    return { postgres, redis };
  }
}

// Singleton instance for tests
export const testDatabaseManager = new TestDatabaseManager();

// Utility functions for common test scenarios

/**
 * Setup clean test environment
 */
export async function setupTestEnvironment(): Promise<void> {
  await testDatabaseManager.initialize();
  await testDatabaseManager.cleanDatabase();
  await testDatabaseManager.cleanRedis();
  await testDatabaseManager.seedTestData();
}

/**
 * Cleanup test environment
 */
export async function cleanupTestEnvironment(): Promise<void> {
  await testDatabaseManager.cleanDatabase();
  await testDatabaseManager.cleanRedis();
  await testDatabaseManager.close();
}

/**
 * Create a test transaction for isolated testing
 */
export async function withTestTransaction<T>(
  callback: (client: Client) => Promise<T>
): Promise<T> {
  const client = testDatabaseManager.getPostgreSQLClient();
  
  await client.query('BEGIN');
  
  try {
    const result = await callback(client);
    await client.query('ROLLBACK'); // Always rollback in tests
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}