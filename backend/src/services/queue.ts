import { Queue, Job, JobOptions } from 'bull';
import { RedisService } from './redis';
import { LLMService } from './llm';
import { SimilarityService } from './similarity';
import { WebSocketService } from './websocket';
import { DatabaseService } from './database';
import { JobData, QueryParameters } from '../types';

export class QueueService {
  private static instance: QueueService;
  private redis: RedisService;
  private llmService: LLMService;
  private similarityService: SimilarityService;
  private wsService: WebSocketService;
  private db: DatabaseService;

  private constructor() {
    this.redis = RedisService.getInstance();
    this.llmService = LLMService.getInstance();
    this.similarityService = SimilarityService.getInstance();
    this.wsService = WebSocketService.getInstance();
    this.db = DatabaseService.getInstance();
    
    this.setupQueues();
  }

  public static getInstance(): QueueService {
    if (!QueueService.instance) {
      QueueService.instance = new QueueService();
    }
    return QueueService.instance;
  }

  private setupQueues(): void {
    // LLM Query Processing Queue
    const llmQueue = this.redis.getQueue('llm-queries', {
      defaultJobOptions: {
        attempts: 2,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: 50,
        removeOnFail: 20,
      },
    });

    llmQueue.process('parallel-query', 5, this.processParallelQuery.bind(this));

    // Similarity Calculation Queue
    const similarityQueue = this.redis.getQueue('similarity-calculations', {
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    });

    similarityQueue.process('calculate-comparison', 10, this.processComparisonCalculation.bind(this));

    // Notification Queue
    const notificationQueue = this.redis.getQueue('notifications', {
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: 200,
        removeOnFail: 100,
      },
    });

    notificationQueue.process('send-notification', 20, this.processNotification.bind(this));

    // Cleanup Queue (scheduled tasks)
    const cleanupQueue = this.redis.getQueue('cleanup', {
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: 10,
        removeOnFail: 10,
      },
    });

    cleanupQueue.process('database-cleanup', this.processDatabaseCleanup.bind(this));
    cleanupQueue.process('cache-cleanup', this.processCacheCleanup.bind(this));

    // Schedule recurring cleanup tasks
    cleanupQueue.add('database-cleanup', {}, {
      repeat: { cron: '0 2 * * *' }, // Daily at 2 AM
    });

    cleanupQueue.add('cache-cleanup', {}, {
      repeat: { cron: '0 */6 * * *' }, // Every 6 hours
    });

    console.log('✅ Queue processors initialized');
  }

  /**
   * Process parallel LLM queries
   */
  private async processParallelQuery(job: Job<JobData>): Promise<void> {
    const { queryId, userId, models, prompt, parameters } = job.data;

    try {
      console.log(`🔄 Processing parallel query ${queryId} with ${models.length} models`);

      // Update query status
      await this.db.client.query.update({
        where: { id: queryId },
        data: { status: 'PROCESSING' },
      });

      // Notify via WebSocket
      this.wsService.notifyQueryUpdate(queryId, {
        status: 'processing',
        progress: 0,
        message: 'Starting query execution...',
      });

      // Execute parallel queries
      const responses = await this.llmService.executeParallelQueries(
        queryId,
        userId,
        models,
        prompt,
        parameters
      );

      // Calculate progress updates
      let completedResponses = 0;
      const totalResponses = models.length;

      for (const response of responses) {
        completedResponses++;
        const progress = Math.round((completedResponses / totalResponses) * 100);

        // Notify of individual response completion
        this.wsService.notifyResponseReceived(queryId, {
          id: response.id,
          modelName: response.modelName,
          status: response.status,
          responseTime: response.responseTimeMs,
        });

        // Update progress
        this.wsService.notifyQueryUpdate(queryId, {
          status: 'processing',
          progress,
          message: `Completed ${completedResponses}/${totalResponses} models`,
        });
      }

      // Schedule comparison calculation
      await this.redis.addJob('similarity-calculations', 'calculate-comparison', {
        queryId,
        responses: responses.filter(r => r.status === 'COMPLETED'),
      }, {
        delay: 1000, // 1 second delay to ensure all responses are saved
      });

      console.log(`✅ Completed parallel query ${queryId}`);

    } catch (error) {
      console.error(`❌ Failed to process parallel query ${queryId}:`, error);

      // Update query status to failed
      await this.db.client.query.update({
        where: { id: queryId },
        data: { status: 'FAILED' },
      });

      // Notify via WebSocket
      this.wsService.notifyQueryUpdate(queryId, {
        status: 'failed',
        message: 'Query execution failed',
      });

      throw error;
    }
  }

  /**
   * Process similarity comparison calculation
   */
  private async processComparisonCalculation(job: Job): Promise<void> {
    const { queryId, responses } = job.data;

    try {
      console.log(`🔄 Calculating comparison for query ${queryId}`);

      if (!responses || responses.length < 2) {
        console.log(`⚠️ Skipping comparison for query ${queryId} - not enough responses`);
        return;
      }

      // Calculate comparison metrics
      const comparisonMetrics = await this.similarityService.calculateComparison(responses);

      // Save to database
      await this.db.client.comparison.upsert({
        where: { queryId },
        update: {
          semanticSimilarity: comparisonMetrics.semanticSimilarity,
          lengthComparison: comparisonMetrics.lengthComparison,
          sentimentAlignment: comparisonMetrics.sentimentAlignment,
          factualConsistency: comparisonMetrics.factualConsistency,
          responseTimeComp: comparisonMetrics.responseTimeComparison,
          aggregateScore: comparisonMetrics.aggregateScore,
          metadata: comparisonMetrics,
        },
        create: {
          queryId,
          semanticSimilarity: comparisonMetrics.semanticSimilarity,
          lengthComparison: comparisonMetrics.lengthComparison,
          sentimentAlignment: comparisonMetrics.sentimentAlignment,
          factualConsistency: comparisonMetrics.factualConsistency,
          responseTimeComp: comparisonMetrics.responseTimeComparison,
          aggregateScore: comparisonMetrics.aggregateScore,
          metadata: comparisonMetrics,
        },
      });

      // Generate explanation
      const explanation = this.similarityService.generateSimilarityExplanation(comparisonMetrics);

      // Notify via WebSocket
      this.wsService.notifyComparisonComplete(queryId, {
        ...comparisonMetrics,
        explanation,
      });

      // Clear query cache
      await this.redis.del(`query_details:${queryId}`);

      console.log(`✅ Completed comparison calculation for query ${queryId}`);

    } catch (error) {
      console.error(`❌ Failed to calculate comparison for query ${queryId}:`, error);
      throw error;
    }
  }

  /**
   * Process notifications
   */
  private async processNotification(job: Job): Promise<void> {
    const { type, recipient, data } = job.data;

    try {
      console.log(`🔔 Processing ${type} notification for ${recipient}`);

      switch (type) {
        case 'query_completed':
          await this.sendQueryCompletedNotification(recipient, data);
          break;
        case 'new_comment':
          await this.sendNewCommentNotification(recipient, data);
          break;
        case 'vote_received':
          await this.sendVoteReceivedNotification(recipient, data);
          break;
        default:
          console.warn(`Unknown notification type: ${type}`);
      }

      console.log(`✅ Sent ${type} notification to ${recipient}`);

    } catch (error) {
      console.error(`❌ Failed to send notification:`, error);
      throw error;
    }
  }

  private async sendQueryCompletedNotification(userId: string, data: any): Promise<void> {
    // Send WebSocket notification
    this.wsService.emitToUser(userId, 'query_completed_notification', {
      queryId: data.queryId,
      prompt: data.prompt.substring(0, 100) + (data.prompt.length > 100 ? '...' : ''),
      completedResponses: data.completedResponses,
      totalResponses: data.totalResponses,
    });
  }

  private async sendNewCommentNotification(userId: string, data: any): Promise<void> {
    // Send WebSocket notification
    this.wsService.emitToUser(userId, 'new_comment_notification', {
      queryId: data.queryId,
      comment: data.comment,
      author: data.author,
    });
  }

  private async sendVoteReceivedNotification(userId: string, data: any): Promise<void> {
    // Send WebSocket notification
    this.wsService.emitToUser(userId, 'vote_received_notification', {
      responseId: data.responseId,
      queryId: data.queryId,
      voteType: data.voteType,
      voter: data.voter,
    });
  }

  /**
   * Process database cleanup
   */
  private async processDatabaseCleanup(job: Job): Promise<void> {
    try {
      console.log('🧹 Starting database cleanup');

      await this.db.cleanupOldData();

      console.log('✅ Database cleanup completed');

    } catch (error) {
      console.error('❌ Database cleanup failed:', error);
      throw error;
    }
  }

  /**
   * Process cache cleanup
   */
  private async processCacheCleanup(job: Job): Promise<void> {
    try {
      console.log('🧹 Starting cache cleanup');

      await this.redis.cleanup();

      console.log('✅ Cache cleanup completed');

    } catch (error) {
      console.error('❌ Cache cleanup failed:', error);
      throw error;
    }
  }

  /**
   * Add a job to a queue
   */
  public async addJob(
    queueName: string,
    jobName: string,
    data: any,
    options?: JobOptions
  ): Promise<Job> {
    return this.redis.addJob(queueName, jobName, data, options);
  }

  /**
   * Get queue statistics
   */
  public async getQueueStats(queueName: string): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  }> {
    const queue = this.redis.getQueue(queueName);
    
    const [waiting, active, completed, failed] = await Promise.all([
      queue.getWaiting(),
      queue.getActive(),
      queue.getCompleted(),
      queue.getFailed(),
    ]);

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
    };
  }

  /**
   * Clear a queue
   */
  public async clearQueue(queueName: string): Promise<void> {
    const queue = this.redis.getQueue(queueName);
    await queue.empty();
    console.log(`🧹 Cleared queue: ${queueName}`);
  }

  /**
   * Pause a queue
   */
  public async pauseQueue(queueName: string): Promise<void> {
    const queue = this.redis.getQueue(queueName);
    await queue.pause();
    console.log(`⏸️ Paused queue: ${queueName}`);
  }

  /**
   * Resume a queue
   */
  public async resumeQueue(queueName: string): Promise<void> {
    const queue = this.redis.getQueue(queueName);
    await queue.resume();
    console.log(`▶️ Resumed queue: ${queueName}`);
  }

  /**
   * Get all queue names
   */
  public getQueueNames(): string[] {
    return ['llm-queries', 'similarity-calculations', 'notifications', 'cleanup'];
  }
}