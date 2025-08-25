import { Router, Request, Response } from 'express';
import Joi from 'joi';
import { DatabaseService } from '../services/database';
import { WebSocketService } from '../services/websocket';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { ApiResponse } from '../types';

const router = Router();
const db = DatabaseService.getInstance();
const wsService = WebSocketService.getInstance();

// Validation schemas
const createVoteSchema = Joi.object({
  responseId: Joi.string().required(),
  voteType: Joi.string().valid('THUMBS_UP', 'THUMBS_DOWN', 'STAR_RATING').required(),
  value: Joi.when('voteType', {
    is: 'STAR_RATING',
    then: Joi.number().min(1).max(5).required(),
    otherwise: Joi.number().valid(1).default(1),
  }),
});

const getVotesSchema = Joi.object({
  responseId: Joi.string().optional(),
  queryId: Joi.string().optional(),
  userId: Joi.string().optional(),
  voteType: Joi.string().valid('THUMBS_UP', 'THUMBS_DOWN', 'STAR_RATING').optional(),
  limit: Joi.number().min(1).max(100).default(20),
  offset: Joi.number().min(0).default(0),
});

// Create or update a vote
router.post('/',
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
    }

    // Validate request body
    const { error, value } = createVoteSchema.validate(req.body);
    if (error) {
      throw new AppError(error.details[0].message, 400, 'VALIDATION_ERROR');
    }

    const { responseId, voteType, value: voteValue } = value;

    // Check if response exists and get associated query/team info
    const response = await db.client.response.findUnique({
      where: { id: responseId },
      include: {
        query: {
          include: {
            team: true,
          },
        },
      },
    });

    if (!response) {
      throw new AppError('Response not found', 404, 'RESPONSE_NOT_FOUND');
    }

    // Check team membership
    const userTeam = await db.client.userTeam.findUnique({
      where: {
        userId_teamId: {
          userId: req.user.id,
          teamId: response.query.teamId,
        },
      },
    });

    if (!userTeam) {
      throw new AppError('Access denied: not a member of this team', 403, 'NOT_TEAM_MEMBER');
    }

    // Check team settings for anonymous voting
    const teamSettings = response.query.team.settings as any;
    const allowAnonymousVoting = teamSettings.allowAnonymousVoting || false;

    // Create or update vote
    const vote = await db.createVote({
      userId: req.user.id,
      responseId,
      voteType: voteType as 'THUMBS_UP' | 'THUMBS_DOWN' | 'STAR_RATING',
      value: voteValue,
    });

    // Get updated vote summary for this response
    const allVotes = await db.client.vote.findMany({
      where: { responseId },
      include: {
        user: {
          select: { id: true, username: true },
        },
      },
    });

    const votesSummary = {
      thumbsUp: allVotes.filter(v => v.voteType === 'THUMBS_UP').length,
      thumbsDown: allVotes.filter(v => v.voteType === 'THUMBS_DOWN').length,
      starRatings: allVotes.filter(v => v.voteType === 'STAR_RATING'),
      averageStars: allVotes.filter(v => v.voteType === 'STAR_RATING').length > 0
        ? allVotes.filter(v => v.voteType === 'STAR_RATING').reduce((sum, v) => sum + v.value, 0) / allVotes.filter(v => v.voteType === 'STAR_RATING').length
        : 0,
      totalVotes: allVotes.length,
    };

    // Log audit event
    await db.logAudit({
      userId: req.user.id,
      action: 'VOTE_CREATED',
      resource: 'vote',
      details: {
        voteId: vote.id,
        responseId,
        queryId: response.query.id,
        voteType,
        value: voteValue,
      },
      ipAddress: req.ip || 'unknown',
      userAgent: req.get('User-Agent') || 'unknown',
    });

    // Emit WebSocket event to team members
    wsService.emitToTeam(response.query.teamId, 'vote_updated', {
      responseId,
      queryId: response.query.id,
      votesSummary,
      newVote: {
        id: vote.id,
        voteType,
        value: voteValue,
        user: allowAnonymousVoting ? null : {
          id: req.user.id,
          username: req.user.username,
        },
        createdAt: vote.createdAt,
      },
      timestamp: new Date(),
    });

    const responseData = {
      id: vote.id,
      responseId,
      voteType,
      value: voteValue,
      createdAt: vote.createdAt,
      updatedAt: vote.updatedAt,
      votesSummary,
    };

    const response_data: ApiResponse<typeof responseData> = {
      success: true,
      data: responseData,
    };

    res.status(201).json(response_data);
  })
);

// Get votes for a response or query
router.get('/',
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
    }

    // Validate query parameters
    const { error, value } = getVotesSchema.validate(req.query);
    if (error) {
      throw new AppError(error.details[0].message, 400, 'VALIDATION_ERROR');
    }

    const { responseId, queryId, userId, voteType, limit, offset } = value;

    // Build where clause
    const where: any = {};

    if (responseId) {
      where.responseId = responseId;
    }

    if (queryId) {
      // Get all response IDs for this query
      const responses = await db.client.response.findMany({
        where: { queryId },
        select: { id: true },
      });
      where.responseId = { in: responses.map(r => r.id) };
    }

    if (userId) {
      where.userId = userId;
    }

    if (voteType) {
      where.voteType = voteType;
    }

    // Check access permissions - user must be a team member for any responses being queried
    if (responseId || queryId) {
      const checkQuery = responseId 
        ? await db.client.response.findUnique({
            where: { id: responseId },
            include: { query: true },
          })
        : await db.client.query.findUnique({
            where: { id: queryId },
          });

      if (!checkQuery) {
        throw new AppError('Resource not found', 404, 'RESOURCE_NOT_FOUND');
      }

      const query = 'query' in checkQuery ? checkQuery.query : checkQuery;

      const userTeam = await db.client.userTeam.findUnique({
        where: {
          userId_teamId: {
            userId: req.user.id,
            teamId: query.teamId,
          },
        },
      });

      if (!userTeam) {
        throw new AppError('Access denied: not a member of this team', 403, 'NOT_TEAM_MEMBER');
      }
    }

    // Get votes
    const [votes, total] = await Promise.all([
      db.client.vote.findMany({
        where,
        include: {
          user: {
            select: { id: true, username: true },
          },
          response: {
            select: { 
              id: true, 
              modelName: true,
              query: {
                select: { id: true, team: { select: { settings: true } } },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      db.client.vote.count({ where }),
    ]);

    // Check team settings for anonymous voting
    const processedVotes = votes.map(vote => {
      const teamSettings = vote.response.query.team.settings as any;
      const allowAnonymousVoting = teamSettings.allowAnonymousVoting || false;

      return {
        id: vote.id,
        responseId: vote.responseId,
        voteType: vote.voteType,
        value: vote.value,
        createdAt: vote.createdAt,
        updatedAt: vote.updatedAt,
        modelName: vote.response.modelName,
        user: allowAnonymousVoting ? null : vote.user,
        isOwnVote: vote.userId === req.user!.id,
      };
    });

    const result = {
      votes: processedVotes,
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

// Get vote summary for a response
router.get('/summary/:responseId',
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
    }

    const responseId = req.params.responseId;

    // Check if response exists and get associated query/team info
    const response = await db.client.response.findUnique({
      where: { id: responseId },
      include: {
        query: {
          include: {
            team: true,
          },
        },
      },
    });

    if (!response) {
      throw new AppError('Response not found', 404, 'RESPONSE_NOT_FOUND');
    }

    // Check team membership
    const userTeam = await db.client.userTeam.findUnique({
      where: {
        userId_teamId: {
          userId: req.user.id,
          teamId: response.query.teamId,
        },
      },
    });

    if (!userTeam) {
      throw new AppError('Access denied: not a member of this team', 403, 'NOT_TEAM_MEMBER');
    }

    // Get all votes for this response
    const votes = await db.client.vote.findMany({
      where: { responseId },
      include: {
        user: {
          select: { id: true, username: true },
        },
      },
    });

    const teamSettings = response.query.team.settings as any;
    const allowAnonymousVoting = teamSettings.allowAnonymousVoting || false;

    // Calculate summary statistics
    const thumbsUpVotes = votes.filter(v => v.voteType === 'THUMBS_UP');
    const thumbsDownVotes = votes.filter(v => v.voteType === 'THUMBS_DOWN');
    const starRatings = votes.filter(v => v.voteType === 'STAR_RATING');

    const summary = {
      responseId,
      modelName: response.modelName,
      totalVotes: votes.length,
      thumbsUp: thumbsUpVotes.length,
      thumbsDown: thumbsDownVotes.length,
      starRatings: {
        count: starRatings.length,
        average: starRatings.length > 0 
          ? starRatings.reduce((sum, v) => sum + v.value, 0) / starRatings.length 
          : 0,
        distribution: {
          1: starRatings.filter(v => v.value === 1).length,
          2: starRatings.filter(v => v.value === 2).length,
          3: starRatings.filter(v => v.value === 3).length,
          4: starRatings.filter(v => v.value === 4).length,
          5: starRatings.filter(v => v.value === 5).length,
        },
      },
      userVote: votes.find(v => v.userId === req.user!.id) || null,
      recentVotes: allowAnonymousVoting 
        ? votes.slice(-5).map(v => ({
            id: v.id,
            voteType: v.voteType,
            value: v.value,
            createdAt: v.createdAt,
          }))
        : votes.slice(-5).map(v => ({
            id: v.id,
            voteType: v.voteType,
            value: v.value,
            createdAt: v.createdAt,
            user: v.user,
          })),
    };

    const responseData: ApiResponse<typeof summary> = {
      success: true,
      data: summary,
    };

    res.json(responseData);
  })
);

// Delete a vote
router.delete('/:id',
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
    }

    const voteId = req.params.id;

    // Find the vote and check ownership
    const vote = await db.client.vote.findUnique({
      where: { id: voteId },
      include: {
        response: {
          include: {
            query: true,
          },
        },
      },
    });

    if (!vote) {
      throw new AppError('Vote not found', 404, 'VOTE_NOT_FOUND');
    }

    if (vote.userId !== req.user.id) {
      throw new AppError('Access denied: not the vote owner', 403, 'NOT_VOTE_OWNER');
    }

    // Delete the vote
    await db.client.vote.delete({
      where: { id: voteId },
    });

    // Log audit event
    await db.logAudit({
      userId: req.user.id,
      action: 'VOTE_DELETED',
      resource: 'vote',
      details: {
        voteId,
        responseId: vote.responseId,
        queryId: vote.response.query.id,
      },
      ipAddress: req.ip || 'unknown',
      userAgent: req.get('User-Agent') || 'unknown',
    });

    // Get updated vote summary
    const remainingVotes = await db.client.vote.findMany({
      where: { responseId: vote.responseId },
    });

    const votesSummary = {
      thumbsUp: remainingVotes.filter(v => v.voteType === 'THUMBS_UP').length,
      thumbsDown: remainingVotes.filter(v => v.voteType === 'THUMBS_DOWN').length,
      starRatings: remainingVotes.filter(v => v.voteType === 'STAR_RATING'),
      averageStars: remainingVotes.filter(v => v.voteType === 'STAR_RATING').length > 0
        ? remainingVotes.filter(v => v.voteType === 'STAR_RATING').reduce((sum, v) => sum + v.value, 0) / remainingVotes.filter(v => v.voteType === 'STAR_RATING').length
        : 0,
      totalVotes: remainingVotes.length,
    };

    // Emit WebSocket event
    wsService.emitToTeam(vote.response.query.teamId, 'vote_deleted', {
      responseId: vote.responseId,
      queryId: vote.response.query.id,
      votesSummary,
      deletedVoteId: voteId,
      timestamp: new Date(),
    });

    const response: ApiResponse<{ message: string; votesSummary: typeof votesSummary }> = {
      success: true,
      data: { 
        message: 'Vote deleted successfully',
        votesSummary,
      },
    };

    res.json(response);
  })
);

export default router;