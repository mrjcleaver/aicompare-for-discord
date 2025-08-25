import { Router, Request, Response } from 'express';
import Joi from 'joi';
import { DatabaseService } from '../services/database';
import { LLMService } from '../services/llm';
import { RedisService } from '../services/redis';
import { WebSocketService } from '../services/websocket';
import { SimilarityService } from '../services/similarity';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { requireTeamMembership, requireResourceOwnership } from '../middleware/auth';
import { queryRateLimiter } from '../middleware/rateLimiter';
import { ApiResponse, LLMModel, QueryParameters } from '../types';

const router = Router();
const db = DatabaseService.getInstance();
const llmService = LLMService.getInstance();
const redis = RedisService.getInstance();
const wsService = WebSocketService.getInstance();
const similarityService = SimilarityService.getInstance();

// Validation schemas
const createQuerySchema = Joi.object({
  prompt: Joi.string().required().min(1).max(4000),
  teamId: Joi.string().required(),
  models: Joi.array().items(Joi.string().valid(
    'gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo',
    'claude-3.5-sonnet', 'claude-3-haiku',
    'gemini-1.5-pro', 'gemini-1.5-flash',
    'command-r-plus', 'command-r'
  )).min(2).max(8).required(),
  parameters: Joi.object({
    temperature: Joi.number().min(0).max(2).optional(),
    maxTokens: Joi.number().min(1).max(4000).optional(),
    systemPrompt: Joi.string().max(1000).optional(),
    topP: Joi.number().min(0).max(1).optional(),
    topK: Joi.number().min(1).max(100).optional(),
  }).optional(),
  discordMessageId: Joi.string().optional(),
});

const getQueriesSchema = Joi.object({
  teamId: Joi.string().optional(),
  limit: Joi.number().min(1).max(50).default(10),
  offset: Joi.number().min(0).default(0),
  status: Joi.string().valid('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED').optional(),
  modelFilter: Joi.string().optional(),
});

// Create a new comparison query
router.post('/',
  queryRateLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
    }

    // Validate request body
    const { error, value } = createQuerySchema.validate(req.body);
    if (error) {
      throw new AppError(error.details[0].message, 400, 'VALIDATION_ERROR');
    }

    const { prompt, teamId, models, parameters = {}, discordMessageId } = value;

    // Check team membership
    const userTeam = await db.client.userTeam.findUnique({
      where: {
        userId_teamId: {
          userId: req.user.id,
          teamId,
        },
      },
      include: { team: true },
    });

    if (!userTeam) {
      throw new AppError('Access denied: not a member of this team', 403, 'NOT_TEAM_MEMBER');
    }

    // Check team settings for model availability
    const teamSettings = userTeam.team.settings as any;
    const availableModels = teamSettings.availableModels || [];
    
    for (const model of models) {
      if (!availableModels.includes(model)) {
        throw new AppError(`Model ${model} is not available for this team`, 400, 'MODEL_NOT_AVAILABLE');
      }
    }

    // Create query record
    const query = await db.createQuery({
      userId: req.user.id,
      teamId,
      prompt,
      parameters,
      modelsRequested: models,
      discordMessageId,
    });

    // Log audit event
    await db.logAudit({
      userId: req.user.id,
      action: 'QUERY_CREATED',
      resource: 'query',
      details: {
        queryId: query.id,
        models,
        prompt: prompt.substring(0, 100) + (prompt.length > 100 ? '...' : ''),
      },
      ipAddress: req.ip || 'unknown',
      userAgent: req.get('User-Agent') || 'unknown',
    });

    // Start parallel query execution in background
    const jobData = {
      queryId: query.id,
      userId: req.user.id,
      models,
      prompt,
      parameters,
    };

    await redis.addJob('llm-queries', 'parallel-query', jobData, {
      priority: 1,
      delay: 0,
    });

    // Notify via WebSocket
    wsService.emitToTeam(teamId, 'query_created', {
      queryId: query.id,
      prompt: prompt.substring(0, 100) + (prompt.length > 100 ? '...' : ''),
      models,
      user: {
        id: req.user.id,
        username: req.user.username,
      },
      timestamp: query.createdAt,
    });

    const response: ApiResponse<any> = {
      success: true,
      data: {
        id: query.id,
        status: query.status,
        prompt: query.prompt,
        models: query.modelsRequested,
        parameters: query.parameters,
        createdAt: query.createdAt,
        estimatedCompletionTime: new Date(Date.now() + 30000), // 30 seconds estimate
      },
    };

    res.status(201).json(response);
  })
);

// Get query details with responses
router.get('/:id',
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
    }

    const queryId = req.params.id;

    // Check cache first
    const cachedResult = await redis.getCachedJson(`query_details:${queryId}`);
    if (cachedResult) {
      return res.json({
        success: true,
        data: cachedResult,
        meta: { cached: true },
      });
    }

    const query = await db.getQueryWithResponses(queryId);

    if (!query) {
      throw new AppError('Query not found', 404, 'QUERY_NOT_FOUND');
    }

    // Check access permissions
    const userTeam = await db.client.userTeam.findUnique({
      where: {
        userId_teamId: {
          userId: req.user.id,
          teamId: query.teamId,
        },
      },
    });

    if (!userTeam) {
      throw new AppError('Access denied', 403, 'ACCESS_DENIED');
    }

    // Calculate comparison metrics if query is completed and has multiple responses
    let comparisonMetrics = null;
    if (query.status === 'COMPLETED' && query.responses.length >= 2) {
      try {
        comparisonMetrics = await similarityService.calculateComparison(query.responses);
        
        // Cache the comparison results
        await db.client.comparison.upsert({
          where: { queryId: query.id },
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
            queryId: query.id,
            semanticSimilarity: comparisonMetrics.semanticSimilarity,
            lengthComparison: comparisonMetrics.lengthComparison,
            sentimentAlignment: comparisonMetrics.sentimentAlignment,
            factualConsistency: comparisonMetrics.factualConsistency,
            responseTimeComp: comparisonMetrics.responseTimeComparison,
            aggregateScore: comparisonMetrics.aggregateScore,
            metadata: comparisonMetrics,
          },
        });
      } catch (error) {
        console.error('Failed to calculate comparison metrics:', error);
      }
    }

    // Calculate vote summaries
    const responsesWithVotes = query.responses.map(response => {
      const votes = response.votes || [];
      const votesSummary = {
        thumbsUp: votes.filter(v => v.voteType === 'THUMBS_UP').length,
        thumbsDown: votes.filter(v => v.voteType === 'THUMBS_DOWN').length,
        starRating: votes.filter(v => v.voteType === 'STAR_RATING'),
        averageStars: votes.filter(v => v.voteType === 'STAR_RATING').length > 0
          ? votes.filter(v => v.voteType === 'STAR_RATING').reduce((sum, v) => sum + v.value, 0) / votes.filter(v => v.voteType === 'STAR_RATING').length
          : 0,
      };

      return {
        ...response,
        votes: votesSummary,
        userVote: votes.find(v => v.userId === req.user!.id),
      };
    });

    const result = {
      id: query.id,
      prompt: query.prompt,
      parameters: query.parameters,
      models: query.modelsRequested,
      status: query.status,
      createdAt: query.createdAt,
      user: {
        id: query.user.id,
        username: query.user.username,
      },
      team: {
        id: query.team.id,
        name: query.team.name,
      },
      responses: responsesWithVotes,
      comments: query.comments.map(comment => ({
        id: comment.id,
        content: comment.content,
        createdAt: comment.createdAt,
        user: {
          id: comment.user.id,
          username: comment.user.username,
        },
        discordThreadId: comment.discordThreadId,
      })),
      comparisonMetrics,
      statistics: {
        totalResponses: query.responses.length,
        completedResponses: query.responses.filter(r => r.status === 'COMPLETED').length,
        failedResponses: query.responses.filter(r => r.status === 'FAILED').length,
        averageResponseTime: query.responses.length > 0
          ? query.responses.reduce((sum, r) => sum + r.responseTimeMs, 0) / query.responses.length
          : 0,
        totalCost: query.responses.reduce((sum, r) => sum + r.costUsd.toNumber(), 0),
        totalTokens: query.responses.reduce((sum, r) => sum + r.tokenCount, 0),
      },
    };

    // Cache the result
    await redis.cacheJson(`query_details:${queryId}`, result, 300); // 5 minutes

    const response: ApiResponse<typeof result> = {
      success: true,
      data: result,
    };

    res.json(response);
  })
);

// Get user's query history
router.get('/',
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
    }

    // Validate query parameters
    const { error, value } = getQueriesSchema.validate(req.query);
    if (error) {
      throw new AppError(error.details[0].message, 400, 'VALIDATION_ERROR');
    }

    const { teamId, limit, offset, status, modelFilter } = value;

    // Build where clause
    const where: any = { userId: req.user.id };
    
    if (teamId) {
      // Check team membership
      const userTeam = await db.client.userTeam.findUnique({
        where: {
          userId_teamId: {
            userId: req.user.id,
            teamId,
          },
        },
      });

      if (!userTeam) {
        throw new AppError('Access denied: not a member of this team', 403, 'NOT_TEAM_MEMBER');
      }

      where.teamId = teamId;
    }

    if (status) {
      where.status = status;
    }

    if (modelFilter) {
      where.modelsRequested = {
        has: modelFilter,
      };
    }

    const [queries, total] = await Promise.all([
      db.client.query.findMany({
        where,
        include: {
          team: {
            select: { id: true, name: true },
          },
          responses: {
            select: {
              id: true,
              modelName: true,
              status: true,
              responseTimeMs: true,
              costUsd: true,
            },
          },
          _count: {
            select: {
              comments: true,
              responses: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      db.client.query.count({ where }),
    ]);

    const result = {
      queries: queries.map(query => ({
        id: query.id,
        prompt: query.prompt.substring(0, 100) + (query.prompt.length > 100 ? '...' : ''),
        status: query.status,
        models: query.modelsRequested,
        createdAt: query.createdAt,
        team: query.team,
        statistics: {
          totalResponses: query._count.responses,
          completedResponses: query.responses.filter(r => r.status === 'COMPLETED').length,
          totalComments: query._count.comments,
          averageResponseTime: query.responses.length > 0
            ? query.responses.reduce((sum, r) => sum + r.responseTimeMs, 0) / query.responses.length
            : 0,
          totalCost: query.responses.reduce((sum, r) => sum + r.costUsd.toNumber(), 0),
        },
      })),
      pagination: {
        total,
        offset,
        limit,
        hasMore: offset + limit < total,
      },
    };

    const response: ApiResponse<typeof result> = {
      success: true,
      data: result,
      meta: {
        pagination: {
          page: Math.floor(offset / limit) + 1,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    };

    res.json(response);
  })
);

// Cancel a pending/processing query
router.delete('/:id',
  requireResourceOwnership('query'),
  asyncHandler(async (req: Request, res: Response) => {
    const queryId = req.params.id;

    const query = await db.client.query.findUnique({
      where: { id: queryId },
    });

    if (!query) {
      throw new AppError('Query not found', 404, 'QUERY_NOT_FOUND');
    }

    if (query.status === 'COMPLETED') {
      throw new AppError('Cannot cancel completed query', 400, 'QUERY_ALREADY_COMPLETED');
    }

    // Update query status to cancelled/failed
    await db.client.query.update({
      where: { id: queryId },
      data: { status: 'FAILED' },
    });

    // Log audit event
    await db.logAudit({
      userId: req.user!.id,
      action: 'QUERY_CANCELLED',
      resource: 'query',
      details: { queryId },
      ipAddress: req.ip || 'unknown',
      userAgent: req.get('User-Agent') || 'unknown',
    });

    // Notify via WebSocket
    wsService.emitToQuery(queryId, 'query_cancelled', {
      queryId,
      timestamp: new Date(),
    });

    const response: ApiResponse<{ message: string }> = {
      success: true,
      data: { message: 'Query cancelled successfully' },
    };

    res.json(response);
  })
);

// Get supported models
router.get('/models/supported',
  asyncHandler(async (req: Request, res: Response) => {
    const supportedModels = llmService.getSupportedModels();
    const providers = llmService.getProviderNames();

    const modelsByProvider = providers.reduce((acc, providerName) => {
      const provider = llmService.getProviderForModel(supportedModels.find(model => 
        llmService.getProviderForModel(model)?.getProviderName().toLowerCase() === providerName
      )!);
      
      if (provider) {
        acc[providerName] = provider.getSupportedModels();
      }
      
      return acc;
    }, {} as Record<string, LLMModel[]>);

    const response: ApiResponse<any> = {
      success: true,
      data: {
        allModels: supportedModels,
        modelsByProvider,
        providers,
      },
    };

    res.json(response);
  })
);

export default router;