import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import dotenv from 'dotenv';

// Import middleware
import { errorHandler } from './middleware/errorHandler';
import { rateLimiter } from './middleware/rateLimiter';
import { authMiddleware } from './middleware/auth';

// Import routes
import authRoutes from './routes/auth';
import queryRoutes from './routes/queries';
import voteRoutes from './routes/votes';
import settingsRoutes from './routes/settings';
import healthRoutes from './routes/health';

// Import services
import { RedisService } from './services/redis';
import { WebSocketService } from './services/websocket';
import { DatabaseService } from './services/database';

// Load environment variables
dotenv.config();

class Server {
  private app: express.Application;
  private httpServer: any;
  private io: SocketIOServer;
  private port: number;

  constructor() {
    this.app = express();
    this.port = parseInt(process.env.PORT || '3001', 10);
    this.httpServer = createServer(this.app);
    this.io = new SocketIOServer(this.httpServer, {
      cors: {
        origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
        methods: ['GET', 'POST']
      }
    });

    this.initializeMiddleware();
    this.initializeRoutes();
    this.initializeErrorHandling();
    this.initializeServices();
  }

  private initializeMiddleware(): void {
    // Security middleware
    this.app.use(helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'", "wss:", "ws:"]
        }
      }
    }));

    // CORS configuration
    this.app.use(cors({
      origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    }));

    // Compression and parsing
    this.app.use(compression());
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Logging
    if (process.env.NODE_ENV !== 'test') {
      this.app.use(morgan('combined'));
    }

    // Rate limiting
    this.app.use('/api/', rateLimiter);

    // Trust proxy for accurate client IP
    this.app.set('trust proxy', 1);
  }

  private initializeRoutes(): void {
    // Health check (no auth required)
    this.app.use('/health', healthRoutes);

    // Authentication routes
    this.app.use('/auth', authRoutes);

    // API routes (protected)
    this.app.use('/api/queries', authMiddleware, queryRoutes);
    this.app.use('/api/votes', authMiddleware, voteRoutes);
    this.app.use('/api/settings', authMiddleware, settingsRoutes);

    // Default route
    this.app.get('/', (req, res) => {
      res.json({
        message: 'AI Compare Backend API',
        version: '1.0.0',
        status: 'running',
        timestamp: new Date().toISOString()
      });
    });

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `Route ${req.originalUrl} not found`
        }
      });
    });
  }

  private initializeErrorHandling(): void {
    this.app.use(errorHandler);
  }

  private async initializeServices(): Promise<void> {
    try {
      // Initialize Redis
      await RedisService.getInstance().connect();
      console.log('✅ Redis service initialized');

      // Initialize Database
      await DatabaseService.getInstance().connect();
      console.log('✅ Database service initialized');

      // Initialize WebSocket service
      WebSocketService.getInstance().initialize(this.io);
      console.log('✅ WebSocket service initialized');

    } catch (error) {
      console.error('❌ Failed to initialize services:', error);
      process.exit(1);
    }
  }

  public async start(): Promise<void> {
    try {
      this.httpServer.listen(this.port, '0.0.0.0', () => {
        console.log(`🚀 Server running on http://localhost:${this.port}`);
        console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
        console.log(`🔌 WebSocket server ready`);
      });

      // Graceful shutdown
      process.on('SIGTERM', this.gracefulShutdown.bind(this));
      process.on('SIGINT', this.gracefulShutdown.bind(this));

    } catch (error) {
      console.error('❌ Failed to start server:', error);
      process.exit(1);
    }
  }

  private async gracefulShutdown(signal: string): Promise<void> {
    console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);

    // Close HTTP server
    this.httpServer.close((err: any) => {
      if (err) {
        console.error('❌ Error closing HTTP server:', err);
      } else {
        console.log('✅ HTTP server closed');
      }
    });

    // Close WebSocket server
    this.io.close(() => {
      console.log('✅ WebSocket server closed');
    });

    try {
      // Close database connections
      await DatabaseService.getInstance().disconnect();
      console.log('✅ Database connections closed');

      // Close Redis connections
      await RedisService.getInstance().disconnect();
      console.log('✅ Redis connections closed');

      console.log('✅ Graceful shutdown complete');
      process.exit(0);
    } catch (error) {
      console.error('❌ Error during graceful shutdown:', error);
      process.exit(1);
    }
  }
}

// Start server if this file is run directly
if (require.main === module) {
  const server = new Server();
  server.start().catch((error) => {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  });
}

export default Server;