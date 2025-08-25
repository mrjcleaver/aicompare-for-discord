import { Router, Request, Response } from 'express';
import { DatabaseService } from '../services/database';
import { RedisService } from '../services/redis';
import { LLMService } from '../services/llm';
import { ApiResponse } from '../types';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  uptime: number;
  services: {
    database: {
      status: 'connected' | 'disconnected' | 'error';
      responseTime?: number;
    };
    redis: {
      status: 'connected' | 'disconnected' | 'error';
      responseTime?: number;
    };
    llm: {
      status: 'available' | 'unavailable';
      supportedModels: string[];
    };
  };
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  version: string;
}

// Basic health check
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const startTime = Date.now();

  const health: HealthStatus = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {
      database: { status: 'disconnected' },
      redis: { status: 'disconnected' },
      llm: { status: 'unavailable', supportedModels: [] },
    },
    memory: {
      used: 0,
      total: 0,
      percentage: 0,
    },
    version: process.env.npm_package_version || '1.0.0',
  };

  // Check database
  try {
    const dbStart = Date.now();
    const dbHealthy = await DatabaseService.getInstance().healthCheck();
    const dbResponseTime = Date.now() - dbStart;

    health.services.database = {
      status: dbHealthy ? 'connected' : 'error',
      responseTime: dbResponseTime,
    };
  } catch (error) {
    health.services.database.status = 'error';
    health.status = 'degraded';
  }

  // Check Redis
  try {
    const redisStart = Date.now();
    const redisHealthy = await RedisService.getInstance().healthCheck();
    const redisResponseTime = Date.now() - redisStart;

    health.services.redis = {
      status: redisHealthy ? 'connected' : 'error',
      responseTime: redisResponseTime,
    };
  } catch (error) {
    health.services.redis.status = 'error';
    health.status = 'degraded';
  }

  // Check LLM service
  try {
    const llmService = LLMService.getInstance();
    const supportedModels = llmService.getSupportedModels();

    health.services.llm = {
      status: supportedModels.length > 0 ? 'available' : 'unavailable',
      supportedModels,
    };
  } catch (error) {
    health.services.llm.status = 'unavailable';
    health.status = 'degraded';
  }

  // Memory usage
  const memUsage = process.memoryUsage();
  health.memory = {
    used: memUsage.heapUsed,
    total: memUsage.heapTotal,
    percentage: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100),
  };

  // Determine overall status
  const allServicesHealthy = 
    health.services.database.status === 'connected' &&
    health.services.redis.status === 'connected' &&
    health.services.llm.status === 'available';

  if (!allServicesHealthy && health.status === 'healthy') {
    health.status = 'degraded';
  }

  const responseTime = Date.now() - startTime;
  const statusCode = health.status === 'healthy' ? 200 : 
                    health.status === 'degraded' ? 200 : 503;

  const response: ApiResponse<HealthStatus> = {
    success: health.status !== 'unhealthy',
    data: health,
    meta: {
      execution_time: responseTime,
    },
  };

  res.status(statusCode).json(response);
}));

// Detailed health check with more information
router.get('/detailed', asyncHandler(async (req: Request, res: Response) => {
  const startTime = Date.now();
  const detailed: any = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    pid: process.pid,
    uptime: process.uptime(),
  };

  // System resources
  detailed.resources = {
    memory: process.memoryUsage(),
    cpu: process.cpuUsage(),
  };

  // Database details
  try {
    const db = DatabaseService.getInstance();
    const dbHealthy = await db.healthCheck();
    detailed.database = {
      status: dbHealthy ? 'connected' : 'error',
      url: process.env.DATABASE_URL ? 'configured' : 'not configured',
    };
  } catch (error) {
    detailed.database = {
      status: 'error',
      error: (error as Error).message,
    };
  }

  // Redis details
  try {
    const redis = RedisService.getInstance();
    const redisHealthy = await redis.healthCheck();
    const redisInfo = redisHealthy ? await redis.getInfo() : null;
    
    detailed.redis = {
      status: redisHealthy ? 'connected' : 'error',
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      info: redisInfo ? redisInfo.split('\r\n').slice(0, 10) : null, // First 10 lines only
    };
  } catch (error) {
    detailed.redis = {
      status: 'error',
      error: (error as Error).message,
    };
  }

  // LLM providers
  try {
    const llmService = LLMService.getInstance();
    detailed.llm = {
      supportedModels: llmService.getSupportedModels(),
      providers: llmService.getProviderNames(),
      apiKeysConfigured: {
        openai: !!process.env.OPENAI_API_KEY,
        anthropic: !!process.env.ANTHROPIC_API_KEY,
        google: !!process.env.GOOGLE_API_KEY,
        cohere: !!process.env.COHERE_API_KEY,
      },
    };
  } catch (error) {
    detailed.llm = {
      status: 'error',
      error: (error as Error).message,
    };
  }

  const responseTime = Date.now() - startTime;

  const response: ApiResponse<typeof detailed> = {
    success: true,
    data: detailed,
    meta: {
      execution_time: responseTime,
    },
  };

  res.json(response);
}));

// Readiness probe (for Kubernetes)
router.get('/ready', asyncHandler(async (req: Request, res: Response) => {
  const checks = await Promise.allSettled([
    DatabaseService.getInstance().healthCheck(),
    RedisService.getInstance().healthCheck(),
  ]);

  const allReady = checks.every(check => 
    check.status === 'fulfilled' && check.value === true
  );

  if (allReady) {
    res.status(200).json({ ready: true, timestamp: new Date().toISOString() });
  } else {
    res.status(503).json({ ready: false, timestamp: new Date().toISOString() });
  }
}));

// Liveness probe (for Kubernetes)
router.get('/live', (req: Request, res: Response) => {
  res.status(200).json({ alive: true, timestamp: new Date().toISOString() });
});

// Metrics endpoint (basic)
router.get('/metrics', asyncHandler(async (req: Request, res: Response) => {
  const metrics = {
    timestamp: new Date().toISOString(),
    uptime_seconds: process.uptime(),
    memory_usage_bytes: process.memoryUsage(),
    cpu_usage: process.cpuUsage(),
    event_loop_lag: process.hrtime.bigint(),
  };

  // Format for Prometheus if requested
  const acceptHeader = req.headers.accept;
  if (acceptHeader && acceptHeader.includes('text/plain')) {
    let prometheusFormat = '';
    prometheusFormat += `# HELP uptime_seconds Process uptime in seconds\n`;
    prometheusFormat += `# TYPE uptime_seconds counter\n`;
    prometheusFormat += `uptime_seconds ${metrics.uptime_seconds}\n\n`;
    
    prometheusFormat += `# HELP memory_usage_bytes Memory usage in bytes\n`;
    prometheusFormat += `# TYPE memory_usage_bytes gauge\n`;
    prometheusFormat += `memory_usage_bytes{type="heap_used"} ${metrics.memory_usage_bytes.heapUsed}\n`;
    prometheusFormat += `memory_usage_bytes{type="heap_total"} ${metrics.memory_usage_bytes.heapTotal}\n`;
    prometheusFormat += `memory_usage_bytes{type="rss"} ${metrics.memory_usage_bytes.rss}\n\n`;

    res.set('Content-Type', 'text/plain');
    res.send(prometheusFormat);
  } else {
    res.json(metrics);
  }
}));

export default router;