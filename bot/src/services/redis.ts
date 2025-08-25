import { createClient, RedisClientType } from 'redis';
import { config } from '../config';
import { dbLogger } from '../utils/logger';

export class RedisService {
  private static client: RedisClientType;
  private static isInitialized = false;

  static async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    this.client = createClient({
      url: config.redis.url,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > config.redis.retryAttempts) {
            return new Error('Redis max retry attempts exceeded');
          }
          return Math.min(retries * 100, 3000);
        }
      }
    });

    this.client.on('error', (err) => {
      dbLogger.error('Redis Client Error:', err);
    });

    this.client.on('connect', () => {
      dbLogger.info('Redis client connected');
    });

    this.client.on('ready', () => {
      dbLogger.info('Redis client ready');
    });

    this.client.on('reconnecting', () => {
      dbLogger.warn('Redis client reconnecting...');
    });

    try {
      await this.client.connect();
      this.isInitialized = true;
      dbLogger.info('Redis connection established successfully');
    } catch (error) {
      dbLogger.error('Failed to connect to Redis:', error);
      throw error;
    }
  }

  static async close(): Promise<void> {
    if (this.client && this.isInitialized) {
      await this.client.quit();
      this.isInitialized = false;
      dbLogger.info('Redis connection closed');
    }
  }

  // Basic operations
  static async set(key: string, value: string, ttl?: number): Promise<void> {
    try {
      if (ttl) {
        await this.client.setEx(key, ttl, value);
      } else {
        await this.client.set(key, value);
      }
    } catch (error) {
      dbLogger.error('Redis SET error:', { key, error });
      throw error;
    }
  }

  static async get(key: string): Promise<string | null> {
    try {
      return await this.client.get(key);
    } catch (error) {
      dbLogger.error('Redis GET error:', { key, error });
      throw error;
    }
  }

  static async del(key: string): Promise<number> {
    try {
      return await this.client.del(key);
    } catch (error) {
      dbLogger.error('Redis DEL error:', { key, error });
      throw error;
    }
  }

  static async exists(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(key);
      return result > 0;
    } catch (error) {
      dbLogger.error('Redis EXISTS error:', { key, error });
      throw error;
    }
  }

  static async expire(key: string, seconds: number): Promise<boolean> {
    try {
      const result = await this.client.expire(key, seconds);
      return result;
    } catch (error) {
      dbLogger.error('Redis EXPIRE error:', { key, seconds, error });
      throw error;
    }
  }

  // JSON operations
  static async setJSON(key: string, value: any, ttl?: number): Promise<void> {
    const jsonString = JSON.stringify(value);
    await this.set(key, jsonString, ttl);
  }

  static async getJSON<T>(key: string): Promise<T | null> {
    const value = await this.get(key);
    if (value === null) return null;
    
    try {
      return JSON.parse(value) as T;
    } catch (error) {
      dbLogger.error('JSON parse error:', { key, value, error });
      return null;
    }
  }

  // Hash operations
  static async hSet(key: string, field: string, value: string): Promise<number> {
    try {
      return await this.client.hSet(key, field, value);
    } catch (error) {
      dbLogger.error('Redis HSET error:', { key, field, error });
      throw error;
    }
  }

  static async hGet(key: string, field: string): Promise<string | null> {
    try {
      return await this.client.hGet(key, field);
    } catch (error) {
      dbLogger.error('Redis HGET error:', { key, field, error });
      throw error;
    }
  }

  static async hGetAll(key: string): Promise<Record<string, string>> {
    try {
      return await this.client.hGetAll(key);
    } catch (error) {
      dbLogger.error('Redis HGETALL error:', { key, error });
      throw error;
    }
  }

  static async hDel(key: string, field: string): Promise<number> {
    try {
      return await this.client.hDel(key, field);
    } catch (error) {
      dbLogger.error('Redis HDEL error:', { key, field, error });
      throw error;
    }
  }

  // List operations
  static async lPush(key: string, value: string): Promise<number> {
    try {
      return await this.client.lPush(key, value);
    } catch (error) {
      dbLogger.error('Redis LPUSH error:', { key, error });
      throw error;
    }
  }

  static async rPop(key: string): Promise<string | null> {
    try {
      return await this.client.rPop(key);
    } catch (error) {
      dbLogger.error('Redis RPOP error:', { key, error });
      throw error;
    }
  }

  static async lRange(key: string, start: number, stop: number): Promise<string[]> {
    try {
      return await this.client.lRange(key, start, stop);
    } catch (error) {
      dbLogger.error('Redis LRANGE error:', { key, start, stop, error });
      throw error;
    }
  }

  // Set operations
  static async sAdd(key: string, members: string[]): Promise<number> {
    try {
      return await this.client.sAdd(key, members);
    } catch (error) {
      dbLogger.error('Redis SADD error:', { key, members, error });
      throw error;
    }
  }

  static async sMembers(key: string): Promise<string[]> {
    try {
      return await this.client.sMembers(key);
    } catch (error) {
      dbLogger.error('Redis SMEMBERS error:', { key, error });
      throw error;
    }
  }

  static async sRem(key: string, members: string[]): Promise<number> {
    try {
      return await this.client.sRem(key, members);
    } catch (error) {
      dbLogger.error('Redis SREM error:', { key, members, error });
      throw error;
    }
  }

  // Specialized methods for our use cases

  // Rate limiting
  static async checkRateLimit(key: string, limit: number, windowMs: number): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
    const now = Date.now();
    const windowKey = `${key}:${Math.floor(now / windowMs)}`;
    
    try {
      const current = await this.client.incr(windowKey);
      
      if (current === 1) {
        // First request in this window, set expiration
        await this.client.expire(windowKey, Math.ceil(windowMs / 1000));
      }
      
      const remaining = Math.max(0, limit - current);
      const resetTime = Math.ceil(now / windowMs) * windowMs + windowMs;
      
      return {
        allowed: current <= limit,
        remaining,
        resetTime
      };
    } catch (error) {
      dbLogger.error('Rate limit check error:', { key, limit, windowMs, error });
      // Default to allowing request on Redis error
      return {
        allowed: true,
        remaining: limit - 1,
        resetTime: now + windowMs
      };
    }
  }

  // Cache query results
  static async cacheQueryResult(queryId: string, result: any, ttl: number = 3600): Promise<void> {
    const key = `query:${queryId}`;
    await this.setJSON(key, result, ttl);
  }

  static async getCachedQueryResult(queryId: string): Promise<any | null> {
    const key = `query:${queryId}`;
    return await this.getJSON(key);
  }

  // Cache user settings
  static async cacheUserSettings(userId: string, settings: any, ttl: number = 1800): Promise<void> {
    const key = `user:${userId}:settings`;
    await this.setJSON(key, settings, ttl);
  }

  static async getCachedUserSettings(userId: string): Promise<any | null> {
    const key = `user:${userId}:settings`;
    return await this.getJSON(key);
  }

  static async clearUserSettingsCache(userId: string): Promise<void> {
    const key = `user:${userId}:settings`;
    await this.del(key);
  }

  // Cache team settings
  static async cacheTeamSettings(teamId: string, settings: any, ttl: number = 1800): Promise<void> {
    const key = `team:${teamId}:settings`;
    await this.setJSON(key, settings, ttl);
  }

  static async getCachedTeamSettings(teamId: string): Promise<any | null> {
    const key = `team:${teamId}:settings`;
    return await this.getJSON(key);
  }

  // Session management
  static async createSession(sessionId: string, data: any, ttl: number = 7200): Promise<void> {
    const key = `session:${sessionId}`;
    await this.setJSON(key, data, ttl);
  }

  static async getSession(sessionId: string): Promise<any | null> {
    const key = `session:${sessionId}`;
    return await this.getJSON(key);
  }

  static async destroySession(sessionId: string): Promise<void> {
    const key = `session:${sessionId}`;
    await this.del(key);
  }

  // Queue management for AI processing
  static async queueAIQuery(queryId: string, priority: number = 0): Promise<void> {
    const queueKey = 'ai:queue';
    const priorityScore = Date.now() + (priority * 1000000); // Higher priority = processed first
    
    try {
      await this.client.zAdd(queueKey, { score: priorityScore, value: queryId });
    } catch (error) {
      dbLogger.error('Queue AI query error:', { queryId, priority, error });
      throw error;
    }
  }

  static async dequeueAIQuery(): Promise<string | null> {
    const queueKey = 'ai:queue';
    
    try {
      const result = await this.client.zPopMin(queueKey);
      return result?.value || null;
    } catch (error) {
      dbLogger.error('Dequeue AI query error:', error);
      return null;
    }
  }

  static async getQueueLength(): Promise<number> {
    const queueKey = 'ai:queue';
    
    try {
      return await this.client.zCard(queueKey);
    } catch (error) {
      dbLogger.error('Get queue length error:', error);
      return 0;
    }
  }

  // Lock mechanism for preventing duplicate processing
  static async acquireLock(resource: string, ttl: number = 30): Promise<boolean> {
    const lockKey = `lock:${resource}`;
    
    try {
      const result = await this.client.setNX(lockKey, Date.now().toString());
      if (result) {
        await this.client.expire(lockKey, ttl);
        return true;
      }
      return false;
    } catch (error) {
      dbLogger.error('Acquire lock error:', { resource, ttl, error });
      return false;
    }
  }

  static async releaseLock(resource: string): Promise<void> {
    const lockKey = `lock:${resource}`;
    
    try {
      await this.del(lockKey);
    } catch (error) {
      dbLogger.error('Release lock error:', { resource, error });
    }
  }
}