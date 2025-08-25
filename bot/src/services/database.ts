import { Pool, PoolConfig, PoolClient } from 'pg';
import { config } from '../config';
import { dbLogger } from '../utils/logger';
import fs from 'fs';
import path from 'path';

export class DatabaseService {
  private static pool: Pool;
  private static isInitialized = false;

  static async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    const poolConfig: PoolConfig = {
      connectionString: config.database.url,
      ssl: config.database.ssl ? {
        rejectUnauthorized: false // For development; use proper certs in production
      } : false,
      max: config.database.poolSize,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    };

    this.pool = new Pool(poolConfig);

    // Test the connection
    try {
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();
      
      dbLogger.info('Database connection established successfully');
      
      // Run schema migrations if needed
      await this.runMigrations();
      
      this.isInitialized = true;
    } catch (error) {
      dbLogger.error('Failed to connect to database:', error);
      throw error;
    }
  }

  static async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.isInitialized = false;
      dbLogger.info('Database connection closed');
    }
  }

  static async query(text: string, params?: any[]): Promise<any> {
    const start = Date.now();
    
    try {
      const result = await this.pool.query(text, params);
      const duration = Date.now() - start;
      
      dbLogger.debug('Query executed', {
        text: text.substring(0, 100),
        duration,
        rows: result.rowCount
      });
      
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      
      dbLogger.error('Query failed', {
        text: text.substring(0, 100),
        duration,
        error: error.message,
        params
      });
      
      throw error;
    }
  }

  static async getClient(): Promise<PoolClient> {
    return this.pool.connect();
  }

  static async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.getClient();
    
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private static async runMigrations(): Promise<void> {
    try {
      // Check if schema exists
      const schemaCheck = await this.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'users'
      `);

      if (schemaCheck.rowCount === 0) {
        dbLogger.info('Running initial database schema setup...');
        
        const schemaPath = path.join(__dirname, '../database/schema.sql');
        if (fs.existsSync(schemaPath)) {
          const schema = fs.readFileSync(schemaPath, 'utf8');
          await this.query(schema);
          dbLogger.info('Database schema created successfully');
        } else {
          dbLogger.warn('Schema file not found, skipping schema creation');
        }
      } else {
        dbLogger.info('Database schema already exists');
      }
    } catch (error) {
      dbLogger.error('Failed to run database migrations:', error);
      throw error;
    }
  }

  // User operations
  static async createUser(userData: {
    discordId: string;
    username: string;
    encryptedApiKeys?: string;
    settings?: any;
  }): Promise<any> {
    const result = await this.query(`
      INSERT INTO users (discord_id, username, encrypted_api_keys, settings)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (discord_id) 
      DO UPDATE SET 
        username = EXCLUDED.username,
        last_active = CURRENT_TIMESTAMP
      RETURNING *
    `, [
      userData.discordId,
      userData.username,
      JSON.stringify(userData.encryptedApiKeys || {}),
      JSON.stringify(userData.settings || {})
    ]);
    
    return result.rows[0];
  }

  static async getUserByDiscordId(discordId: string): Promise<any> {
    const result = await this.query('SELECT * FROM users WHERE discord_id = $1', [discordId]);
    return result.rows[0];
  }

  static async updateUserSettings(userId: string, settings: any): Promise<void> {
    await this.query(`
      UPDATE users 
      SET settings = $2, last_active = CURRENT_TIMESTAMP 
      WHERE id = $1
    `, [userId, JSON.stringify(settings)]);
  }

  // Query operations
  static async createQuery(queryData: {
    userId: string;
    teamId?: string;
    channelId: string;
    messageId: string;
    prompt: string;
    parameters: any;
    modelsRequested: string[];
  }): Promise<any> {
    const result = await this.query(`
      INSERT INTO queries (user_id, team_id, channel_id, message_id, prompt, parameters, models_requested)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [
      queryData.userId,
      queryData.teamId || null,
      queryData.channelId,
      queryData.messageId,
      queryData.prompt,
      JSON.stringify(queryData.parameters),
      queryData.modelsRequested
    ]);
    
    return result.rows[0];
  }

  static async updateQueryStatus(queryId: string, status: string, errorMessage?: string): Promise<void> {
    const completedAt = status === 'completed' ? 'CURRENT_TIMESTAMP' : 'NULL';
    
    await this.query(`
      UPDATE queries 
      SET status = $2, completed_at = ${completedAt}, error_message = $3
      WHERE id = $1
    `, [queryId, status, errorMessage || null]);
  }

  static async getQueryById(queryId: string): Promise<any> {
    const result = await this.query('SELECT * FROM queries WHERE id = $1', [queryId]);
    return result.rows[0];
  }

  static async getQueryHistory(params: {
    userId?: string;
    teamId?: string;
    limit?: number;
    offset?: number;
    status?: string;
  }): Promise<{ data: any[]; total: number }> {
    let whereClause = 'WHERE 1=1';
    const queryParams: any[] = [];
    let paramIndex = 1;

    if (params.userId) {
      whereClause += ` AND user_id = $${paramIndex}`;
      queryParams.push(params.userId);
      paramIndex++;
    }

    if (params.teamId) {
      whereClause += ` AND team_id = $${paramIndex}`;
      queryParams.push(params.teamId);
      paramIndex++;
    }

    if (params.status) {
      whereClause += ` AND status = $${paramIndex}`;
      queryParams.push(params.status);
      paramIndex++;
    }

    const limit = params.limit || 10;
    const offset = params.offset || 0;

    const dataQuery = `
      SELECT q.*, u.username, COUNT(r.id) as response_count
      FROM queries q
      LEFT JOIN users u ON q.user_id = u.id
      LEFT JOIN responses r ON q.id = r.query_id
      ${whereClause}
      GROUP BY q.id, u.username
      ORDER BY q.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const countQuery = `
      SELECT COUNT(*) as total FROM queries q ${whereClause}
    `;

    const [dataResult, countResult] = await Promise.all([
      this.query(dataQuery, [...queryParams, limit, offset]),
      this.query(countQuery, queryParams)
    ]);

    return {
      data: dataResult.rows,
      total: parseInt(countResult.rows[0].total)
    };
  }

  // Response operations
  static async saveResponse(responseData: {
    queryId: string;
    modelName: string;
    provider: string;
    content?: string;
    metadata: any;
    responseTime: number;
    tokenCount: number;
    estimatedCost: number;
    errorMessage?: string;
  }): Promise<any> {
    const result = await this.query(`
      INSERT INTO responses (
        query_id, model_name, provider, content, metadata, 
        response_time_ms, token_count, estimated_cost, error_message
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      responseData.queryId,
      responseData.modelName,
      responseData.provider,
      responseData.content || null,
      JSON.stringify(responseData.metadata),
      responseData.responseTime,
      responseData.tokenCount,
      responseData.estimatedCost,
      responseData.errorMessage || null
    ]);
    
    return result.rows[0];
  }

  static async getResponsesByQueryId(queryId: string): Promise<any[]> {
    const result = await this.query(`
      SELECT * FROM responses WHERE query_id = $1 ORDER BY created_at ASC
    `, [queryId]);
    
    return result.rows;
  }

  // Vote operations
  static async saveVote(voteData: {
    userId: string;
    responseId?: string;
    queryId: string;
    voteType: string;
    value: number;
  }): Promise<any> {
    const result = await this.query(`
      INSERT INTO votes (user_id, response_id, query_id, vote_type, value)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (user_id, query_id, vote_type)
      DO UPDATE SET 
        value = EXCLUDED.value,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `, [
      voteData.userId,
      voteData.responseId || null,
      voteData.queryId,
      voteData.voteType,
      voteData.value
    ]);
    
    return result.rows[0];
  }

  static async getVotesByQueryId(queryId: string): Promise<any[]> {
    const result = await this.query(`
      SELECT * FROM votes WHERE query_id = $1 ORDER BY created_at ASC
    `, [queryId]);
    
    return result.rows;
  }

  // Similarity metrics operations
  static async saveSimilarityMetrics(metricsData: {
    queryId: string;
    semanticSimilarity: number;
    lengthConsistency: number;
    sentimentAlignment: number;
    responseSpeedScore: number;
    aggregateScore: number;
  }): Promise<any> {
    const result = await this.query(`
      INSERT INTO similarity_metrics (
        query_id, semantic_similarity, length_consistency, 
        sentiment_alignment, response_speed_score, aggregate_score
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (query_id)
      DO UPDATE SET 
        semantic_similarity = EXCLUDED.semantic_similarity,
        length_consistency = EXCLUDED.length_consistency,
        sentiment_alignment = EXCLUDED.sentiment_alignment,
        response_speed_score = EXCLUDED.response_speed_score,
        aggregate_score = EXCLUDED.aggregate_score,
        calculated_at = CURRENT_TIMESTAMP
      RETURNING *
    `, [
      metricsData.queryId,
      metricsData.semanticSimilarity,
      metricsData.lengthConsistency,
      metricsData.sentimentAlignment,
      metricsData.responseSpeedScore,
      metricsData.aggregateScore
    ]);
    
    return result.rows[0];
  }

  static async getSimilarityMetricsByQueryId(queryId: string): Promise<any> {
    const result = await this.query(`
      SELECT * FROM similarity_metrics WHERE query_id = $1
    `, [queryId]);
    
    return result.rows[0];
  }

  // Team operations
  static async createOrUpdateTeam(teamData: {
    discordGuildId: string;
    name: string;
    settings?: any;
  }): Promise<any> {
    const result = await this.query(`
      INSERT INTO teams (discord_guild_id, name, settings)
      VALUES ($1, $2, $3)
      ON CONFLICT (discord_guild_id)
      DO UPDATE SET 
        name = EXCLUDED.name,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `, [
      teamData.discordGuildId,
      teamData.name,
      JSON.stringify(teamData.settings || {})
    ]);
    
    return result.rows[0];
  }

  static async getTeamByGuildId(guildId: string): Promise<any> {
    const result = await this.query(`
      SELECT * FROM teams WHERE discord_guild_id = $1
    `, [guildId]);
    
    return result.rows[0];
  }
}