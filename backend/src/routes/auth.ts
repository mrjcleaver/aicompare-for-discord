import { Router, Request, Response } from 'express';
import passport from 'passport';
import { Strategy as DiscordStrategy } from 'passport-discord';
import { DatabaseService } from '../services/database';
import { authService } from '../middleware/auth';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { ApiResponse, DiscordUser } from '../types';

const router = Router();
const db = DatabaseService.getInstance();

// Configure Discord OAuth strategy
passport.use(new DiscordStrategy({
  clientID: process.env.DISCORD_CLIENT_ID!,
  clientSecret: process.env.DISCORD_CLIENT_SECRET!,
  callbackURL: process.env.DISCORD_REDIRECT_URI!,
  scope: ['identify', 'guilds'],
}, async (accessToken: string, refreshToken: string, profile: any, done: any) => {
  try {
    // Extract user data from Discord profile
    const discordUser: DiscordUser = {
      id: profile.id,
      username: profile.username,
      discriminator: profile.discriminator,
      avatar: profile.avatar,
      email: profile.email,
      verified: profile.verified,
      guilds: profile.guilds,
    };

    // Find or create user in database
    let user = await db.getUserByDiscordId(profile.id);

    if (!user) {
      // Create new user
      user = await db.createUser({
        discordId: profile.id,
        username: `${profile.username}#${profile.discriminator}`,
        preferences: {
          defaultModels: ['gpt-4', 'claude-3.5-sonnet'],
          notificationPreferences: 'channel',
          displayFormat: 'detailed',
          theme: 'light',
        },
      });

      console.log(`✅ Created new user: ${user.username} (${user.id})`);
    } else {
      // Update existing user's username if changed
      if (user.username !== `${profile.username}#${profile.discriminator}`) {
        await db.client.user.update({
          where: { id: user.id },
          data: { username: `${profile.username}#${profile.discriminator}` },
        });
      }
    }

    // Process guilds and create/update teams
    if (profile.guilds && Array.isArray(profile.guilds)) {
      for (const guild of profile.guilds) {
        // Only process guilds where user has manage permissions
        const permissions = parseInt(guild.permissions);
        const hasManageGuild = (permissions & 0x20) === 0x20; // MANAGE_GUILD permission

        if (hasManageGuild) {
          const team = await db.createOrUpdateTeam({
            discordServerId: guild.id,
            name: guild.name,
            settings: {
              availableModels: ['gpt-4', 'gpt-4-turbo', 'claude-3.5-sonnet', 'claude-3-haiku', 'gemini-1.5-pro', 'command-r-plus'],
              defaultModels: ['gpt-4', 'claude-3.5-sonnet'],
              maxQueriesPerHour: 100,
              allowAnonymousVoting: false,
              autoCreateThreads: true,
            },
          });

          // Ensure user is a member of the team
          await db.client.userTeam.upsert({
            where: {
              userId_teamId: {
                userId: user.id,
                teamId: team.id,
              },
            },
            update: {},
            create: {
              userId: user.id,
              teamId: team.id,
              role: guild.owner ? 'ADMIN' : 'MEMBER',
            },
          });
        }
      }
    }

    return done(null, { user, discordProfile: discordUser });
  } catch (error) {
    console.error('❌ Discord OAuth error:', error);
    return done(error, null);
  }
}));

passport.serializeUser((user: any, done) => {
  done(null, user.user.id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await db.getUserByDiscordId(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

// Initialize passport
router.use(passport.initialize());

// Start Discord OAuth flow
router.get('/discord', passport.authenticate('discord'));

// Discord OAuth callback
router.get('/discord/callback', 
  passport.authenticate('discord', { session: false }),
  asyncHandler(async (req: Request, res: Response) => {
    const authData = req.user as any;
    
    if (!authData || !authData.user) {
      throw new AppError('Authentication failed', 401, 'AUTH_FAILED');
    }

    // Generate JWT token
    const token = authService.generateToken({
      id: authData.user.id,
      discordId: authData.user.discordId,
    });

    // Log audit event
    await db.logAudit({
      userId: authData.user.id,
      action: 'USER_LOGIN',
      resource: 'auth',
      details: {
        method: 'discord_oauth',
        ip: req.ip,
      },
      ipAddress: req.ip || 'unknown',
      userAgent: req.get('User-Agent') || 'unknown',
    });

    // Redirect to frontend with token
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const redirectUrl = `${frontendUrl}/auth/callback?token=${token}`;
    
    res.redirect(redirectUrl);
  })
);

// Get current user info
router.get('/me', 
  require('../middleware/auth').authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    // Get user with teams
    const userWithTeams = await db.client.user.findUnique({
      where: { id: req.user.id },
      include: {
        userTeams: {
          include: {
            team: true,
          },
        },
      },
    });

    const response: ApiResponse<any> = {
      success: true,
      data: {
        id: userWithTeams!.id,
        discordId: userWithTeams!.discordId,
        username: userWithTeams!.username,
        preferences: userWithTeams!.preferences,
        createdAt: userWithTeams!.createdAt,
        lastActive: userWithTeams!.lastActive,
        teams: userWithTeams!.userTeams.map(ut => ({
          id: ut.team.id,
          name: ut.team.name,
          discordServerId: ut.team.discordServerId,
          role: ut.role,
          joinedAt: ut.joinedAt,
          settings: ut.team.settings,
        })),
        apiKeysConfigured: Object.keys(userWithTeams!.encryptedApiKeys as Record<string, string>),
      },
    };

    res.json(response);
  })
);

// Update user preferences
router.put('/preferences',
  require('../middleware/auth').authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw new AppError('User not found', 401, 'USER_NOT_FOUND');
    }

    const { defaultModels, notificationPreferences, displayFormat, theme } = req.body;

    // Validate preferences
    if (defaultModels && !Array.isArray(defaultModels)) {
      throw new AppError('defaultModels must be an array', 400, 'INVALID_PREFERENCES');
    }

    if (notificationPreferences && !['dm', 'channel'].includes(notificationPreferences)) {
      throw new AppError('notificationPreferences must be "dm" or "channel"', 400, 'INVALID_PREFERENCES');
    }

    if (displayFormat && !['compact', 'detailed'].includes(displayFormat)) {
      throw new AppError('displayFormat must be "compact" or "detailed"', 400, 'INVALID_PREFERENCES');
    }

    if (theme && !['light', 'dark'].includes(theme)) {
      throw new AppError('theme must be "light" or "dark"', 400, 'INVALID_PREFERENCES');
    }

    // Update user preferences
    const currentPrefs = req.user.preferences || {};
    const updatedPrefs = {
      ...currentPrefs,
      ...(defaultModels && { defaultModels }),
      ...(notificationPreferences && { notificationPreferences }),
      ...(displayFormat && { displayFormat }),
      ...(theme && { theme }),
    };

    const updatedUser = await db.client.user.update({
      where: { id: req.user.id },
      data: { preferences: updatedPrefs },
    });

    // Log audit event
    await db.logAudit({
      userId: req.user.id,
      action: 'USER_PREFERENCES_UPDATED',
      resource: 'user',
      details: { updatedFields: Object.keys(req.body) },
      ipAddress: req.ip || 'unknown',
      userAgent: req.get('User-Agent') || 'unknown',
    });

    const response: ApiResponse<any> = {
      success: true,
      data: {
        preferences: updatedUser.preferences,
      },
    };

    res.json(response);
  })
);

// Logout (invalidate token on client side)
router.post('/logout',
  require('../middleware/auth').authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    if (req.user) {
      // Log audit event
      await db.logAudit({
        userId: req.user.id,
        action: 'USER_LOGOUT',
        resource: 'auth',
        details: { method: 'api' },
        ipAddress: req.ip || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
      });
    }

    const response: ApiResponse<{ message: string }> = {
      success: true,
      data: { message: 'Logged out successfully' },
    };

    res.json(response);
  })
);

// Refresh token (generate new JWT)
router.post('/refresh',
  require('../middleware/auth').authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw new AppError('User not found', 401, 'USER_NOT_FOUND');
    }

    // Generate new token
    const token = authService.generateToken({
      id: req.user.id,
      discordId: req.user.discordId,
    });

    const response: ApiResponse<{ token: string }> = {
      success: true,
      data: { token },
    };

    res.json(response);
  })
);

// Delete user account
router.delete('/account',
  require('../middleware/auth').authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw new AppError('User not found', 401, 'USER_NOT_FOUND');
    }

    // Log audit event before deletion
    await db.logAudit({
      userId: req.user.id,
      action: 'USER_ACCOUNT_DELETED',
      resource: 'user',
      details: { deletedAt: new Date().toISOString() },
      ipAddress: req.ip || 'unknown',
      userAgent: req.get('User-Agent') || 'unknown',
    });

    // Delete user (cascade will handle related records)
    await db.client.user.delete({
      where: { id: req.user.id },
    });

    const response: ApiResponse<{ message: string }> = {
      success: true,
      data: { message: 'Account deleted successfully' },
    };

    res.json(response);
  })
);

export default router;