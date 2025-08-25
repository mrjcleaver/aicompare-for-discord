import { Router, Request, Response } from 'express';
import Joi from 'joi';
import { DatabaseService } from '../services/database';
import { LLMService } from '../services/llm';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { requireRole } from '../middleware/auth';
import { ApiResponse } from '../types';

const router = Router();
const db = DatabaseService.getInstance();
const llmService = LLMService.getInstance();

// Validation schemas
const updateUserSettingsSchema = Joi.object({
  defaultModels: Joi.array().items(Joi.string().valid(
    'gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo',
    'claude-3.5-sonnet', 'claude-3-haiku',
    'gemini-1.5-pro', 'gemini-1.5-flash',
    'command-r-plus', 'command-r'
  )).optional(),
  notificationPreferences: Joi.string().valid('dm', 'channel').optional(),
  displayFormat: Joi.string().valid('compact', 'detailed').optional(),
  theme: Joi.string().valid('light', 'dark').optional(),
});

const updateTeamSettingsSchema = Joi.object({
  availableModels: Joi.array().items(Joi.string().valid(
    'gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo',
    'claude-3.5-sonnet', 'claude-3-haiku',
    'gemini-1.5-pro', 'gemini-1.5-flash',
    'command-r-plus', 'command-r'
  )).optional(),
  defaultModels: Joi.array().items(Joi.string().valid(
    'gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo',
    'claude-3.5-sonnet', 'claude-3-haiku',
    'gemini-1.5-pro', 'gemini-1.5-flash',
    'command-r-plus', 'command-r'
  )).optional(),
  maxQueriesPerHour: Joi.number().min(1).max(1000).optional(),
  allowAnonymousVoting: Joi.boolean().optional(),
  autoCreateThreads: Joi.boolean().optional(),
});

const addApiKeySchema = Joi.object({
  provider: Joi.string().valid('openai', 'anthropic', 'google', 'cohere').required(),
  apiKey: Joi.string().required().min(10),
});

// Get user settings
router.get('/user',
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
    }

    const user = await db.client.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        preferences: true,
        encryptedApiKeys: true,
        createdAt: true,
        lastActive: true,
      },
    });

    if (!user) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    // Get usage statistics
    const usageStats = await llmService.getUsageStats(req.user.id, 30);

    const result = {
      preferences: user.preferences || {
        defaultModels: ['gpt-4', 'claude-3.5-sonnet'],
        notificationPreferences: 'channel',
        displayFormat: 'detailed',
        theme: 'light',
      },
      apiKeysConfigured: Object.keys(user.encryptedApiKeys as Record<string, string>),
      accountInfo: {
        createdAt: user.createdAt,
        lastActive: user.lastActive,
      },
      usageStats,
    };

    const response: ApiResponse<typeof result> = {
      success: true,
      data: result,
    };

    res.json(response);
  })
);

// Update user settings
router.put('/user',
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
    }

    // Validate request body
    const { error, value } = updateUserSettingsSchema.validate(req.body);
    if (error) {
      throw new AppError(error.details[0].message, 400, 'VALIDATION_ERROR');
    }

    const updates = value;

    // Get current user preferences
    const user = await db.client.user.findUnique({
      where: { id: req.user.id },
      select: { preferences: true },
    });

    if (!user) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    // Merge with existing preferences
    const currentPrefs = user.preferences as any || {};
    const updatedPrefs = {
      ...currentPrefs,
      ...updates,
    };

    // Update user preferences
    const updatedUser = await db.client.user.update({
      where: { id: req.user.id },
      data: { preferences: updatedPrefs },
      select: { preferences: true },
    });

    // Log audit event
    await db.logAudit({
      userId: req.user.id,
      action: 'USER_SETTINGS_UPDATED',
      resource: 'user',
      details: { updatedFields: Object.keys(updates) },
      ipAddress: req.ip || 'unknown',
      userAgent: req.get('User-Agent') || 'unknown',
    });

    const response: ApiResponse<{ preferences: any }> = {
      success: true,
      data: {
        preferences: updatedUser.preferences,
      },
    };

    res.json(response);
  })
);

// Get team settings
router.get('/team/:teamId',
  requireRole('viewer'),
  asyncHandler(async (req: Request, res: Response) => {
    const teamId = req.params.teamId;

    const team = await db.client.team.findUnique({
      where: { id: teamId },
      include: {
        userTeams: {
          include: {
            user: {
              select: { id: true, username: true, lastActive: true },
            },
          },
        },
      },
    });

    if (!team) {
      throw new AppError('Team not found', 404, 'TEAM_NOT_FOUND');
    }

    // Get team statistics
    const [totalQueries, activeUsers, recentQueries] = await Promise.all([
      db.client.query.count({ where: { teamId } }),
      db.client.userTeam.count({ where: { teamId } }),
      db.client.query.count({
        where: {
          teamId,
          createdAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
          },
        },
      }),
    ]);

    const result = {
      id: team.id,
      name: team.name,
      discordServerId: team.discordServerId,
      settings: team.settings || {
        availableModels: ['gpt-4', 'claude-3.5-sonnet'],
        defaultModels: ['gpt-4', 'claude-3.5-sonnet'],
        maxQueriesPerHour: 100,
        allowAnonymousVoting: false,
        autoCreateThreads: true,
      },
      members: team.userTeams.map(ut => ({
        id: ut.user.id,
        username: ut.user.username,
        role: ut.role,
        joinedAt: ut.joinedAt,
        lastActive: ut.user.lastActive,
      })),
      statistics: {
        totalQueries,
        activeUsers,
        recentQueries,
      },
      createdAt: team.createdAt,
      updatedAt: team.updatedAt,
    };

    const response: ApiResponse<typeof result> = {
      success: true,
      data: result,
    };

    res.json(response);
  })
);

// Update team settings (admin only)
router.put('/team/:teamId',
  requireRole('admin'),
  asyncHandler(async (req: Request, res: Response) => {
    const teamId = req.params.teamId;

    // Validate request body
    const { error, value } = updateTeamSettingsSchema.validate(req.body);
    if (error) {
      throw new AppError(error.details[0].message, 400, 'VALIDATION_ERROR');
    }

    const updates = value;

    // Get current team settings
    const team = await db.client.team.findUnique({
      where: { id: teamId },
      select: { settings: true },
    });

    if (!team) {
      throw new AppError('Team not found', 404, 'TEAM_NOT_FOUND');
    }

    // Merge with existing settings
    const currentSettings = team.settings as any || {};
    const updatedSettings = {
      ...currentSettings,
      ...updates,
    };

    // Validate that defaultModels is a subset of availableModels
    if (updates.defaultModels && updates.availableModels) {
      const invalidModels = updates.defaultModels.filter(model => 
        !updates.availableModels.includes(model)
      );
      if (invalidModels.length > 0) {
        throw new AppError(
          `Default models must be available: ${invalidModels.join(', ')}`,
          400,
          'INVALID_DEFAULT_MODELS'
        );
      }
    }

    // Update team settings
    const updatedTeam = await db.client.team.update({
      where: { id: teamId },
      data: { settings: updatedSettings },
      select: { settings: true, name: true },
    });

    // Log audit event
    await db.logAudit({
      userId: req.user!.id,
      action: 'TEAM_SETTINGS_UPDATED',
      resource: 'team',
      details: { 
        teamId,
        teamName: updatedTeam.name,
        updatedFields: Object.keys(updates),
      },
      ipAddress: req.ip || 'unknown',
      userAgent: req.get('User-Agent') || 'unknown',
    });

    const response: ApiResponse<{ settings: any }> = {
      success: true,
      data: {
        settings: updatedTeam.settings,
      },
    };

    res.json(response);
  })
);

// Add/Update API key
router.put('/api-keys',
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
    }

    // Validate request body
    const { error, value } = addApiKeySchema.validate(req.body);
    if (error) {
      throw new AppError(error.details[0].message, 400, 'VALIDATION_ERROR');
    }

    const { provider, apiKey } = value;

    try {
      // Add the API key using LLM service (includes validation and encryption)
      await llmService.updateUserApiKey(req.user.id, provider, apiKey);

      // Log audit event (without the actual key)
      await db.logAudit({
        userId: req.user.id,
        action: 'API_KEY_UPDATED',
        resource: 'user',
        details: { provider },
        ipAddress: req.ip || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
      });

      const response: ApiResponse<{ message: string; provider: string }> = {
        success: true,
        data: {
          message: `API key for ${provider} updated successfully`,
          provider,
        },
      };

      res.json(response);
    } catch (error) {
      const errorMessage = (error as Error).message;
      throw new AppError(
        `Failed to update API key: ${errorMessage}`,
        400,
        'API_KEY_UPDATE_FAILED'
      );
    }
  })
);

// Remove API key
router.delete('/api-keys/:provider',
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
    }

    const provider = req.params.provider;

    // Validate provider
    const validProviders = ['openai', 'anthropic', 'google', 'cohere'];
    if (!validProviders.includes(provider)) {
      throw new AppError('Invalid provider', 400, 'INVALID_PROVIDER');
    }

    try {
      // Remove the API key using LLM service
      await llmService.removeUserApiKey(req.user.id, provider);

      // Log audit event
      await db.logAudit({
        userId: req.user.id,
        action: 'API_KEY_REMOVED',
        resource: 'user',
        details: { provider },
        ipAddress: req.ip || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
      });

      const response: ApiResponse<{ message: string }> = {
        success: true,
        data: {
          message: `API key for ${provider} removed successfully`,
        },
      };

      res.json(response);
    } catch (error) {
      const errorMessage = (error as Error).message;
      throw new AppError(
        `Failed to remove API key: ${errorMessage}`,
        400,
        'API_KEY_REMOVAL_FAILED'
      );
    }
  })
);

// Test API key
router.post('/api-keys/test',
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
    }

    const { provider, apiKey } = req.body;

    if (!provider || !apiKey) {
      throw new AppError('Provider and API key are required', 400, 'MISSING_PARAMETERS');
    }

    // Validate provider
    const validProviders = ['openai', 'anthropic', 'google', 'cohere'];
    if (!validProviders.includes(provider)) {
      throw new AppError('Invalid provider', 400, 'INVALID_PROVIDER');
    }

    try {
      // Test the API key
      const isValid = await llmService.validateUserApiKey(req.user.id, provider, apiKey);

      const response: ApiResponse<{ valid: boolean; provider: string }> = {
        success: true,
        data: {
          valid: isValid,
          provider,
        },
      };

      res.json(response);
    } catch (error) {
      const errorMessage = (error as Error).message;
      throw new AppError(
        `Failed to test API key: ${errorMessage}`,
        400,
        'API_KEY_TEST_FAILED'
      );
    }
  })
);

// Get available models and providers
router.get('/models',
  asyncHandler(async (req: Request, res: Response) => {
    const supportedModels = llmService.getSupportedModels();
    const providers = llmService.getProviderNames();

    const modelsByProvider = {};
    for (const providerName of providers) {
      const provider = llmService['providers'].get(providerName);
      if (provider) {
        modelsByProvider[providerName] = provider.getSupportedModels();
      }
    }

    const response: ApiResponse<{
      allModels: string[];
      modelsByProvider: Record<string, string[]>;
      providers: string[];
    }> = {
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

// Update team member role (admin only)
router.put('/team/:teamId/members/:userId/role',
  requireRole('admin'),
  asyncHandler(async (req: Request, res: Response) => {
    const { teamId, userId } = req.params;
    const { role } = req.body;

    // Validate role
    if (!['admin', 'member', 'viewer'].includes(role)) {
      throw new AppError('Invalid role', 400, 'INVALID_ROLE');
    }

    // Update user role
    const userTeam = await db.client.userTeam.update({
      where: {
        userId_teamId: {
          userId,
          teamId,
        },
      },
      data: { role: role.toUpperCase() },
      include: {
        user: {
          select: { username: true },
        },
        team: {
          select: { name: true },
        },
      },
    });

    // Log audit event
    await db.logAudit({
      userId: req.user!.id,
      action: 'TEAM_MEMBER_ROLE_UPDATED',
      resource: 'team',
      details: {
        teamId,
        teamName: userTeam.team.name,
        targetUserId: userId,
        targetUsername: userTeam.user.username,
        newRole: role,
      },
      ipAddress: req.ip || 'unknown',
      userAgent: req.get('User-Agent') || 'unknown',
    });

    const response: ApiResponse<{ message: string }> = {
      success: true,
      data: {
        message: `User role updated to ${role} successfully`,
      },
    };

    res.json(response);
  })
);

export default router;