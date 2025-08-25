import { createClient, RedisClientType } from 'redis';
import Bull, { Queue, Job } from 'bull';

export class RedisService {
  private static instance: RedisService;
  private client: RedisClientType;
  private queues: Map<string, Queue>;
  private isConnected: boolean = false;

  private constructor() {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    
    this.client = createClient({
      url: redisUrl,
      retry_delay_on_failover: 100,
      retry_delay_on_cluster_down: 300,
      max_attempts: 3,
    });

    this.queues = new Map();
    this.setupEventHandlers();
  }

  public static getInstance(): RedisService {
    if (!RedisService.instance) {
      RedisService.instance = new RedisService();
    }
    return RedisService.instance;
  }

  private setupEventHandlers(): void {
    this.client.on('error', (err) => {
      console.error('❌ Redis client error:', err);
    });

    this.client.on('connect', () => {
      console.log('🔌 Redis client connecting...');
    });

    this.client.on('ready', () => {
      console.log('✅ Redis client ready');
      this.isConnected = true;
    });

    this.client.on('end', () => {
      console.log('🔚 Redis client connection ended');
      this.isConnected = false;
    });

    this.client.on('reconnecting', () => {
      console.log('🔄 Redis client reconnecting...');
    });
  }

  public async connect(): Promise<void> {
    try {
      if (!this.isConnected) {
        await this.client.connect();
        console.log('✅ Redis connected successfully');
      }
    } catch (error) {
      console.error('❌ Redis connection failed:', error);
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    try {
      // Close all queues first
      for (const [name, queue] of this.queues) {
        await queue.close();
        console.log(`🔚 Queue ${name} closed`);
      }
      this.queues.clear();

      // Disconnect client
      if (this.isConnected) {
        await this.client.disconnect();
        console.log('🔚 Redis disconnected successfully');
      }
    } catch (error) {
      console.error('❌ Redis disconnection failed:', error);
      throw error;
    }
  }

  public async healthCheck(): Promise<boolean> {
    try {
      if (!this.isConnected) {
        return false;
      }
      
      const result = await this.client.ping();
      return result === 'PONG';
    } catch (error) {
      console.error('❌ Redis health check failed:', error);
      return false;
    }
  }

  public getClient(): RedisClientType {
    return this.client;
  }

  // Basic key-value operations
  public async set(key: string, value: string, ttl?: number): Promise<void> {
    try {
      if (ttl) {
        await this.client.setEx(key, ttl, value);
      } else {
        await this.client.set(key, value);
      }
    } catch (error) {
      console.error(`❌ Redis SET failed for key ${key}:`, error);
      throw error;
    }
  }

  public async get(key: string): Promise<string | null> {
    try {
      return await this.client.get(key);
    } catch (error) {
      console.error(`❌ Redis GET failed for key ${key}:`, error);
      throw error;
    }
  }

  public async del(key: string): Promise<number> {
    try {
      return await this.client.del(key);
    } catch (error) {
      console.error(`❌ Redis DEL failed for key ${key}:`, error);
      throw error;
    }
  }

  public async exists(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      console.error(`❌ Redis EXISTS failed for key ${key}:`, error);
      throw error;
    }
  }

  // Hash operations
  public async hset(key: string, field: string, value: string): Promise<number> {
    try {
      return await this.client.hSet(key, field, value);
    } catch (error) {
      console.error(`❌ Redis HSET failed for key ${key}, field ${field}:`, error);
      throw error;
    }
  }

  public async hget(key: string, field: string): Promise<string | undefined> {
    try {
      return await this.client.hGet(key, field) || undefined;
    } catch (error) {
      console.error(`❌ Redis HGET failed for key ${key}, field ${field}:`, error);
      throw error;
    }
  }

  public async hgetall(key: string): Promise<Record<string, string>> {
    try {
      return await this.client.hGetAll(key);
    } catch (error) {
      console.error(`❌ Redis HGETALL failed for key ${key}:`, error);
      throw error;
    }
  }

  // List operations
  public async lpush(key: string, ...values: string[]): Promise<number> {
    try {
      return await this.client.lPush(key, values);
    } catch (error) {
      console.error(`❌ Redis LPUSH failed for key ${key}:`, error);
      throw error;
    }
  }

  public async rpop(key: string): Promise<string | null> {
    try {
      return await this.client.rPop(key);
    } catch (error) {
      console.error(`❌ Redis RPOP failed for key ${key}:`, error);
      throw error;
    }
  }

  public async lrange(key: string, start: number, stop: number): Promise<string[]> {
    try {
      return await this.client.lRange(key, start, stop);
    } catch (error) {
      console.error(`❌ Redis LRANGE failed for key ${key}:`, error);
      throw error;
    }
  }

  // Set operations
  public async sadd(key: string, ...members: string[]): Promise<number> {
    try {
      return await this.client.sAdd(key, members);
    } catch (error) {
      console.error(`❌ Redis SADD failed for key ${key}:`, error);
      throw error;
    }
  }

  public async smembers(key: string): Promise<string[]> {
    try {
      return await this.client.sMembers(key);
    } catch (error) {
      console.error(`❌ Redis SMEMBERS failed for key ${key}:`, error);
      throw error;
    }
  }

  // Cache helpers
  public async cacheJson(key: string, data: any, ttl: number = 300): Promise<void> {
    try {
      await this.set(key, JSON.stringify(data), ttl);
    } catch (error) {
      console.error(`❌ Failed to cache JSON for key ${key}:`, error);
      throw error;
    }
  }

  public async getCachedJson(key: string): Promise<any | null> {
    try {
      const data = await this.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error(`❌ Failed to get cached JSON for key ${key}:`, error);
      return null;
    }
  }

  // Session management
  public async setSession(sessionId: string, data: any, ttl: number = 86400): Promise<void> {
    const key = `session:${sessionId}`;
    await this.cacheJson(key, data, ttl);
  }

  public async getSession(sessionId: string): Promise<any | null> {
    const key = `session:${sessionId}`;
    return this.getCachedJson(key);
  }

  public async deleteSession(sessionId: string): Promise<void> {
    const key = `session:${sessionId}`;
    await this.del(key);
  }

  // Queue operations using Bull
  public getQueue(name: string, options?: any): Queue {
    if (!this.queues.has(name)) {
      const queue = new Bull(name, process.env.REDIS_URL || 'redis://localhost:6379', {
        defaultJobOptions: {
          removeOnComplete: 100, // Keep last 100 completed jobs
          removeOnFail: 50,      // Keep last 50 failed jobs
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        },
        ...options,
      });

      // Add error handling
      queue.on('error', (error) => {
        console.error(`❌ Queue ${name} error:`, error);
      });

      queue.on('waiting', (jobId) => {
        console.log(`⏳ Job ${jobId} is waiting in queue ${name}`);
      });

      queue.on('active', (job: Job) => {
        console.log(`🔄 Job ${job.id} started processing in queue ${name}`);
      });

      queue.on('completed', (job: Job) => {
        console.log(`✅ Job ${job.id} completed in queue ${name}`);
      });

      queue.on('failed', (job: Job, err: Error) => {
        console.error(`❌ Job ${job.id} failed in queue ${name}:`, err.message);
      });

      this.queues.set(name, queue);
    }

    return this.queues.get(name)!;
  }

  public async addJob(queueName: string, jobName: string, data: any, options?: any): Promise<Job> {
    const queue = this.getQueue(queueName);
    
    return queue.add(jobName, data, {
      priority: options?.priority || 0,
      delay: options?.delay || 0,
      repeat: options?.repeat,
      ...options,
    });
  }

  // Utility methods
  public async flushAll(): Promise<void> {
    if (process.env.NODE_ENV !== 'production') {
      await this.client.flushAll();
      console.log('🧹 Redis database flushed');
    } else {
      console.warn('⚠️ Cannot flush Redis in production mode');
    }
  }

  public async getKeys(pattern: string = '*'): Promise<string[]> {
    try {
      return await this.client.keys(pattern);
    } catch (error) {
      console.error(`❌ Redis KEYS failed for pattern ${pattern}:`, error);
      throw error;
    }
  }

  public async getInfo(): Promise<string> {
    try {
      return await this.client.info();
    } catch (error) {
      console.error('❌ Redis INFO failed:', error);
      throw error;
    }
  }

  // Cleanup old keys
  public async cleanup(): Promise<void> {
    try {
      const patterns = [
        'session:*',
        'rate_limit:*',
        'cache:*',
        'temp:*',
      ];

      for (const pattern of patterns) {
        const keys = await this.getKeys(pattern);
        if (keys.length > 0) {
          // Check TTL and delete expired keys
          for (const key of keys) {
            const ttl = await this.client.ttl(key);
            if (ttl === -1) { // No TTL set, but it's a temporary key
              await this.del(key);
            }
          }
        }
      }

      console.log('🧹 Redis cleanup completed');
    } catch (error) {
      console.error('❌ Redis cleanup failed:', error);
    }
  }
}