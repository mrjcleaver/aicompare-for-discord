import { PrismaClient } from '@prisma/client';

export class DatabaseService {
  private static instance: DatabaseService;
  private prisma: PrismaClient;

  private constructor() {
    this.prisma = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn'] : ['error'],
      errorFormat: 'pretty',
    });

    // Add middleware for soft deletes, audit logs, etc.
    this.addMiddleware();
  }

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  private addMiddleware(): void {
    // Add audit logging middleware
    this.prisma.$use(async (params, next) => {
      const start = Date.now();
      const result = await next(params);
      const duration = Date.now() - start;

      // Log slow queries (>1000ms)
      if (duration > 1000) {
        console.warn(`Slow query detected: ${params.model}.${params.action} took ${duration}ms`);
      }

      return result;
    });
  }

  public async connect(): Promise<void> {
    try {
      await this.prisma.$connect();
      console.log('📊 Database connected successfully');
    } catch (error) {
      console.error('❌ Database connection failed:', error);
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    try {
      await this.prisma.$disconnect();
      console.log('📊 Database disconnected successfully');
    } catch (error) {
      console.error('❌ Database disconnection failed:', error);
      throw error;
    }
  }

  public async healthCheck(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      console.error('❌ Database health check failed:', error);
      return false;
    }
  }

  public get client(): PrismaClient {
    return this.prisma;
  }

  // Utility methods for common operations
  public async createUser(data: {
    discordId: string;
    username: string;
    encryptedApiKeys?: Record<string, string>;
    preferences?: Record<string, any>;
  }) {
    return this.prisma.user.create({
      data: {
        discordId: data.discordId,
        username: data.username,
        encryptedApiKeys: data.encryptedApiKeys || {},
        preferences: data.preferences || {},
      },
    });
  }

  public async getUserByDiscordId(discordId: string) {
    return this.prisma.user.findUnique({
      where: { discordId },
      include: {
        userTeams: {
          include: {
            team: true,
          },
        },
      },
    });
  }

  public async createOrUpdateTeam(data: {
    discordServerId: string;
    name: string;
    settings?: Record<string, any>;
  }) {
    return this.prisma.team.upsert({
      where: { discordServerId: data.discordServerId },
      update: {
        name: data.name,
        settings: data.settings || {},
      },
      create: {
        discordServerId: data.discordServerId,
        name: data.name,
        settings: data.settings || {},
      },
    });
  }

  public async createQuery(data: {
    userId: string;
    teamId: string;
    prompt: string;
    parameters: Record<string, any>;
    modelsRequested: string[];
    discordMessageId?: string;
  }) {
    return this.prisma.query.create({
      data,
    });
  }

  public async getQueryWithResponses(queryId: string) {
    return this.prisma.query.findUnique({
      where: { id: queryId },
      include: {
        user: true,
        team: true,
        responses: {
          include: {
            votes: true,
          },
          orderBy: { createdAt: 'asc' },
        },
        comments: {
          include: {
            user: true,
          },
          orderBy: { createdAt: 'asc' },
        },
        comparisons: true,
      },
    });
  }

  public async createResponse(data: {
    queryId: string;
    modelName: string;
    content: string;
    metadata: Record<string, any>;
    responseTimeMs: number;
    tokenCount: number;
    costUsd: number;
    status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'TIMEOUT';
    error?: string;
  }) {
    return this.prisma.response.create({
      data,
    });
  }

  public async createVote(data: {
    userId: string;
    responseId: string;
    voteType: 'THUMBS_UP' | 'THUMBS_DOWN' | 'STAR_RATING';
    value: number;
  }) {
    return this.prisma.vote.upsert({
      where: {
        userId_responseId_voteType: {
          userId: data.userId,
          responseId: data.responseId,
          voteType: data.voteType,
        },
      },
      update: {
        value: data.value,
      },
      create: data,
    });
  }

  public async getQueryHistory(
    userId: string,
    teamId?: string,
    limit: number = 10,
    offset: number = 0
  ) {
    const where = teamId ? { userId, teamId } : { userId };

    const [queries, total] = await Promise.all([
      this.prisma.query.findMany({
        where,
        include: {
          responses: {
            select: {
              id: true,
              modelName: true,
              status: true,
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
      this.prisma.query.count({ where }),
    ]);

    return { queries, total };
  }

  public async logAudit(data: {
    userId?: string;
    action: string;
    resource: string;
    details: Record<string, any>;
    ipAddress: string;
    userAgent: string;
  }) {
    return this.prisma.auditLog.create({
      data,
    });
  }

  public async cleanupOldData(): Promise<void> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    try {
      // Delete old rate limit entries
      await this.prisma.rateLimitEntry.deleteMany({
        where: {
          resetAt: {
            lt: new Date(),
          },
        },
      });

      // Delete old audit logs (keep for 90 days)
      await this.prisma.auditLog.deleteMany({
        where: {
          createdAt: {
            lt: ninetyDaysAgo,
          },
        },
      });

      console.log('🧹 Old data cleanup completed');
    } catch (error) {
      console.error('❌ Data cleanup failed:', error);
    }
  }
}