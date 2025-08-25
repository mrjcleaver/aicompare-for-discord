import dotenv from 'dotenv';
import { DatabaseService } from './services/database';
import { RedisService } from './services/redis';
import { QueueService } from './services/queue';
import { EncryptionService } from './services/encryption';

// Load environment variables
dotenv.config();

class Worker {
  private db: DatabaseService;
  private redis: RedisService;
  private queueService: QueueService;
  private encryption: EncryptionService;

  constructor() {
    this.db = DatabaseService.getInstance();
    this.redis = RedisService.getInstance();
    this.queueService = QueueService.getInstance();
    this.encryption = EncryptionService.getInstance();
  }

  public async start(): Promise<void> {
    try {
      console.log('🚀 Starting AI Compare Queue Worker...');
      console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);

      // Initialize services
      await this.initializeServices();

      // Start processing queues
      console.log('✅ Queue worker started successfully');
      console.log('🔄 Processing jobs...');

      // Keep the process running
      this.setupGracefulShutdown();
      
      // Log worker stats every 30 seconds
      setInterval(() => {
        this.logWorkerStats();
      }, 30000);

    } catch (error) {
      console.error('❌ Failed to start queue worker:', error);
      process.exit(1);
    }
  }

  private async initializeServices(): Promise<void> {
    try {
      // Initialize Database
      await this.db.connect();
      console.log('✅ Database service initialized');

      // Initialize Redis
      await this.redis.connect();
      console.log('✅ Redis service initialized');

      // Test encryption service
      const encryptionTest = await this.encryption.test();
      if (!encryptionTest) {
        throw new Error('Encryption service test failed');
      }
      console.log('✅ Encryption service initialized');

      // Queue service is initialized automatically when instantiated
      console.log('✅ Queue service initialized');

    } catch (error) {
      console.error('❌ Failed to initialize services:', error);
      throw error;
    }
  }

  private async logWorkerStats(): Promise<void> {
    try {
      const queueNames = this.queueService.getQueueNames();
      const stats: Record<string, any> = {};

      for (const queueName of queueNames) {
        try {
          stats[queueName] = await this.queueService.getQueueStats(queueName);
        } catch (error) {
          console.error(`Failed to get stats for queue ${queueName}:`, error);
        }
      }

      console.log('📊 Queue Worker Stats:', JSON.stringify(stats, null, 2));

      // Memory usage
      const memUsage = process.memoryUsage();
      console.log('💾 Memory Usage:', {
        rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
        external: `${Math.round(memUsage.external / 1024 / 1024)}MB`,
      });

    } catch (error) {
      console.error('Failed to log worker stats:', error);
    }
  }

  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);

      try {
        // Stop processing new jobs
        console.log('⏹️ Stopping queue processing...');

        // Close database connections
        await this.db.disconnect();
        console.log('✅ Database connections closed');

        // Close Redis connections
        await this.redis.disconnect();
        console.log('✅ Redis connections closed');

        console.log('✅ Graceful shutdown complete');
        process.exit(0);

      } catch (error) {
        console.error('❌ Error during graceful shutdown:', error);
        process.exit(1);
      }
    };

    // Handle shutdown signals
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('💥 Uncaught Exception:', error);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
      process.exit(1);
    });
  }
}

// Start worker if this file is run directly
if (require.main === module) {
  const worker = new Worker();
  worker.start().catch((error) => {
    console.error('❌ Failed to start worker:', error);
    process.exit(1);
  });
}

export default Worker;