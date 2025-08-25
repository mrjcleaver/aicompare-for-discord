import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { DatabaseService } from '../services/database';
import { AppError, asyncHandler } from './errorHandler';
import { User } from '../types';

// Extend Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export interface JwtPayload {
  id: string;
  discordId: string;
  iat: number;
  exp: number;
}

class AuthService {
  private db: DatabaseService;

  constructor() {
    this.db = DatabaseService.getInstance();
  }

  generateToken(user: { id: string; discordId: string }): string {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET is not configured');
    }

    return jwt.sign(
      { 
        id: user.id, 
        discordId: user.discordId 
      },
      secret,
      { 
        expiresIn: '7d',
        issuer: 'aicompare-api',
        audience: 'aicompare-client',
      }
    );
  }

  verifyToken(token: string): JwtPayload {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET is not configured');
    }

    try {
      return jwt.verify(token, secret) as JwtPayload;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new AppError('Token has expired', 401, 'TOKEN_EXPIRED');
      } else if (error instanceof jwt.JsonWebTokenError) {
        throw new AppError('Invalid token', 401, 'INVALID_TOKEN');
      }
      throw error;
    }
  }

  async getUserById(id: string): Promise<User | null> {
    const user = await this.db.client.user.findUnique({
      where: { id },
      include: {
        userTeams: {
          include: {
            team: true,
          },
        },
      },
    });

    if (!user) return null;

    return {
      id: user.id,
      discordId: user.discordId,
      username: user.username,
      encryptedApiKeys: user.encryptedApiKeys as Record<string, string>,
      preferences: user.preferences as any,
      createdAt: user.createdAt,
      lastActive: user.lastActive,
    };
  }

  async updateLastActive(userId: string): Promise<void> {
    await this.db.client.user.update({
      where: { id: userId },
      data: { lastActive: new Date() },
    });
  }
}

const authService = new AuthService();

// Main authentication middleware
export const authMiddleware = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  // Extract token from Authorization header
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AppError('No authentication token provided', 401, 'NO_TOKEN');
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix

  // Verify and decode token
  const payload = authService.verifyToken(token);

  // Get user from database
  const user = await authService.getUserById(payload.id);
  
  if (!user) {
    throw new AppError('User not found', 401, 'USER_NOT_FOUND');
  }

  // Update last active timestamp
  await authService.updateLastActive(user.id);

  // Attach user to request
  req.user = user;

  next();
});

// Optional authentication middleware (doesn't throw if no token)
export const optionalAuthMiddleware = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(); // Continue without user
  }

  try {
    const token = authHeader.substring(7);
    const payload = authService.verifyToken(token);
    const user = await authService.getUserById(payload.id);
    
    if (user) {
      req.user = user;
      await authService.updateLastActive(user.id);
    }
  } catch (error) {
    // Log error but don't block request
    console.warn('Optional auth failed:', error);
  }

  next();
});

// Role-based authorization middleware
export const requireRole = (role: 'admin' | 'member' | 'viewer') => {
  return asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
    }

    // Check if user has required role in the team context
    const teamId = req.params.teamId || req.body.teamId || req.query.teamId;
    
    if (!teamId) {
      throw new AppError('Team context required', 400, 'TEAM_REQUIRED');
    }

    const userTeam = await authService.db.client.userTeam.findUnique({
      where: {
        userId_teamId: {
          userId: req.user.id,
          teamId: teamId as string,
        },
      },
    });

    if (!userTeam) {
      throw new AppError('Access denied: not a member of this team', 403, 'NOT_TEAM_MEMBER');
    }

    // Role hierarchy: admin > member > viewer
    const roleHierarchy = { admin: 3, member: 2, viewer: 1 };
    const requiredLevel = roleHierarchy[role];
    const userLevel = roleHierarchy[userTeam.role.toLowerCase() as keyof typeof roleHierarchy];

    if (userLevel < requiredLevel) {
      throw new AppError(`Access denied: ${role} role required`, 403, 'INSUFFICIENT_ROLE');
    }

    next();
  });
};

// Team membership check middleware
export const requireTeamMembership = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }

  const teamId = req.params.teamId || req.body.teamId || req.query.teamId;
  
  if (!teamId) {
    throw new AppError('Team ID required', 400, 'TEAM_ID_REQUIRED');
  }

  const userTeam = await authService.db.client.userTeam.findUnique({
    where: {
      userId_teamId: {
        userId: req.user.id,
        teamId: teamId as string,
      },
    },
    include: {
      team: true,
    },
  });

  if (!userTeam) {
    throw new AppError('Access denied: not a member of this team', 403, 'NOT_TEAM_MEMBER');
  }

  // Attach team info to request
  (req as any).team = userTeam.team;
  (req as any).userRole = userTeam.role;

  next();
});

// Resource ownership check middleware
export const requireResourceOwnership = (resourceType: 'query' | 'vote' | 'comment') => {
  return asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
    }

    const resourceId = req.params.id;
    
    if (!resourceId) {
      throw new AppError('Resource ID required', 400, 'RESOURCE_ID_REQUIRED');
    }

    let resource;
    
    switch (resourceType) {
      case 'query':
        resource = await authService.db.client.query.findUnique({
          where: { id: resourceId },
        });
        break;
      case 'vote':
        resource = await authService.db.client.vote.findUnique({
          where: { id: resourceId },
        });
        break;
      case 'comment':
        resource = await authService.db.client.comment.findUnique({
          where: { id: resourceId },
        });
        break;
      default:
        throw new AppError('Invalid resource type', 400, 'INVALID_RESOURCE_TYPE');
    }

    if (!resource) {
      throw new AppError('Resource not found', 404, 'RESOURCE_NOT_FOUND');
    }

    if (resource.userId !== req.user.id) {
      throw new AppError('Access denied: not the resource owner', 403, 'NOT_RESOURCE_OWNER');
    }

    next();
  });
};

// API key validation middleware for system-level access
export const requireApiKey = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.headers['x-api-key'] as string;
  
  if (!apiKey) {
    throw new AppError('API key required', 401, 'API_KEY_REQUIRED');
  }

  // In a real implementation, you'd validate against a database
  // For now, we'll use a simple environment variable check
  const validApiKeys = (process.env.SYSTEM_API_KEYS || '').split(',').filter(Boolean);
  
  if (!validApiKeys.includes(apiKey)) {
    throw new AppError('Invalid API key', 401, 'INVALID_API_KEY');
  }

  next();
});

// Rate limit bypass for system calls
export const rateLimitBypass = (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.headers['x-api-key'] as string;
  const systemApiKeys = (process.env.SYSTEM_API_KEYS || '').split(',').filter(Boolean);
  
  if (apiKey && systemApiKeys.includes(apiKey)) {
    (req as any).skipRateLimit = true;
  }
  
  next();
};

export { authService };