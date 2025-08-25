import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { RedisService } from '../services/redis';
import { ApiResponse, RateLimitInfo } from '../types';

class RedisStore {
  private redis: RedisService;

  constructor() {
    this.redis = RedisService.getInstance();
  }

  async increment(key: string, windowMs: number): Promise<{ totalHits: number; resetTime?: Date }> {
    const multi = this.redis.getClient().multi();
    const resetTime = new Date(Date.now() + windowMs);
    
    multi.incr(key);
    multi.expire(key, Math.ceil(windowMs / 1000));
    
    const results = await multi.exec();
    const totalHits = results?.[0]?.[1] as number || 1;
    
    return { totalHits, resetTime };
  }

  async decrement(key: string): Promise<void> {
    await this.redis.getClient().decr(key);
  }

  async resetKey(key: string): Promise<void> {
    await this.redis.getClient().del(key);
  }

  async get(key: string): Promise<number> {
    const value = await this.redis.get(key);
    return value ? parseInt(value, 10) : 0;
  }
}

const redisStore = new RedisStore();

// General API rate limiter
export const rateLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'), // 1 minute
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '60'), // 60 requests per minute
  
  // Use Redis store for distributed rate limiting
  store: {
    incr: async (key: string) => {
      const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000');
      const result = await redisStore.increment(key, windowMs);
      return result;
    },
    decrement: async (key: string) => {
      await redisStore.decrement(key);
    },
    resetKey: async (key: string) => {
      await redisStore.resetKey(key);
    },
  } as any,

  // Key generator (IP + User ID if available)
  keyGenerator: (req: Request): string => {
    const userId = (req as any).user?.id || 'anonymous';
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    return `rate_limit:${ip}:${userId}`;
  },

  // Custom response
  handler: (req: Request, res: Response) => {
    const response: ApiResponse<null> = {
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please try again later.',
        details: {
          limit: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '60'),
          windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'),
          retryAfter: Math.ceil(parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000') / 1000),
        },
      },
    };

    res.status(429).json(response);
  },

  // Add rate limit info to response headers
  onLimitReached: (req: Request, res: Response) => {
    console.warn(`Rate limit exceeded for ${req.ip} - ${req.method} ${req.path}`);
  },

  // Skip rate limiting for certain conditions
  skip: (req: Request) => {
    // Skip for health checks
    if (req.path === '/health') {
      return true;
    }

    // Skip if rate limiting is disabled
    if (process.env.NODE_ENV === 'test') {
      return true;
    }

    return false;
  },

  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Strict rate limiter for query endpoints
export const queryRateLimiter = rateLimit({
  windowMs: 60000, // 1 minute
  max: parseInt(process.env.RATE_LIMIT_USER_QUERIES_PER_MINUTE || '10'), // 10 queries per minute per user

  keyGenerator: (req: Request): string => {
    const userId = (req as any).user?.id || 'anonymous';
    return `query_rate_limit:${userId}`;
  },

  handler: (req: Request, res: Response) => {
    const response: ApiResponse<null> = {
      success: false,
      error: {
        code: 'QUERY_RATE_LIMIT_EXCEEDED',
        message: 'Query rate limit exceeded. Please wait before submitting more queries.',
        details: {
          limit: parseInt(process.env.RATE_LIMIT_USER_QUERIES_PER_MINUTE || '10'),
          windowMs: 60000,
          retryAfter: 60,
        },
      },
    };

    res.status(429).json(response);
  },

  skip: (req: Request) => process.env.NODE_ENV === 'test',
});

// Server-level rate limiter (per Discord server)
export const createServerRateLimiter = (windowMs: number = 3600000, max: number = 100) => {
  return rateLimit({
    windowMs, // 1 hour default
    max, // 100 queries per hour per server

    keyGenerator: (req: Request): string => {
      const serverId = req.body.teamId || req.query.teamId || 'unknown';
      return `server_rate_limit:${serverId}`;
    },

    handler: (req: Request, res: Response) => {
      const response: ApiResponse<null> = {
        success: false,
        error: {
          code: 'SERVER_RATE_LIMIT_EXCEEDED',
          message: 'Server query limit exceeded. Your Discord server has reached the hourly query limit.',
          details: {
            limit: max,
            windowMs,
            retryAfter: Math.ceil(windowMs / 1000),
          },
        },
      };

      res.status(429).json(response);
    },

    skip: (req: Request) => process.env.NODE_ENV === 'test',
  });
};

// Advanced rate limiter with different limits based on user tier
export class AdvancedRateLimiter {
  private static instance: AdvancedRateLimiter;
  private redisStore: RedisStore;

  private constructor() {
    this.redisStore = redisStore;
  }

  public static getInstance(): AdvancedRateLimiter {
    if (!AdvancedRateLimiter.instance) {
      AdvancedRateLimiter.instance = new AdvancedRateLimiter();
    }
    return AdvancedRateLimiter.instance;
  }

  async checkLimit(
    userId: string,
    action: string,
    limit: number,
    windowMs: number
  ): Promise<{ allowed: boolean; remaining: number; resetTime: Date }> {
    const key = `advanced_rate_limit:${userId}:${action}`;
    const current = await this.redisStore.get(key);
    const resetTime = new Date(Date.now() + windowMs);

    if (current >= limit) {
      return {
        allowed: false,
        remaining: 0,
        resetTime,
      };
    }

    await this.redisStore.increment(key, windowMs);

    return {
      allowed: true,
      remaining: Math.max(0, limit - current - 1),
      resetTime,
    };
  }

  middleware(action: string, getLimits: (req: Request) => { limit: number; windowMs: number }) {
    return async (req: Request, res: Response, next: Function) => {
      try {
        const userId = (req as any).user?.id;
        if (!userId) {
          return next(); // Skip if no user
        }

        const { limit, windowMs } = getLimits(req);
        const result = await this.checkLimit(userId, action, limit, windowMs);

        // Add rate limit headers
        res.set({
          'X-RateLimit-Limit': limit.toString(),
          'X-RateLimit-Remaining': result.remaining.toString(),
          'X-RateLimit-Reset': result.resetTime.getTime().toString(),
        });

        if (!result.allowed) {
          const response: ApiResponse<null> = {
            success: false,
            error: {
              code: 'RATE_LIMIT_EXCEEDED',
              message: `Rate limit exceeded for ${action}`,
              details: {
                limit,
                windowMs,
                resetTime: result.resetTime,
              },
            },
          };

          return res.status(429).json(response);
        }

        next();
      } catch (error) {
        console.error('Rate limiter error:', error);
        next(); // Allow request to continue if rate limiter fails
      }
    };
  }
}

export const advancedRateLimiter = AdvancedRateLimiter.getInstance();