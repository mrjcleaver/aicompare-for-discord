import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { DatabaseService } from './database';
import { WebSocketMessage, User } from '../types';

export class WebSocketService {
  private static instance: WebSocketService;
  private io: SocketIOServer | null = null;
  private db: DatabaseService;
  private connectedUsers: Map<string, { socket: Socket; user: User }> = new Map();
  private teamRooms: Map<string, Set<string>> = new Map(); // teamId -> Set of socketIds

  private constructor() {
    this.db = DatabaseService.getInstance();
  }

  public static getInstance(): WebSocketService {
    if (!WebSocketService.instance) {
      WebSocketService.instance = new WebSocketService();
    }
    return WebSocketService.instance;
  }

  public initialize(io: SocketIOServer): void {
    this.io = io;
    this.setupMiddleware();
    this.setupEventHandlers();
    console.log('✅ WebSocket service initialized');
  }

  private setupMiddleware(): void {
    if (!this.io) return;

    // Authentication middleware
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
          return next(new Error('Authentication token required'));
        }

        // Verify JWT token
        const secret = process.env.JWT_SECRET;
        if (!secret) {
          return next(new Error('JWT_SECRET not configured'));
        }

        const payload = jwt.verify(token, secret) as any;
        
        // Get user from database
        const user = await this.db.client.user.findUnique({
          where: { id: payload.id },
          include: {
            userTeams: {
              include: {
                team: true,
              },
            },
          },
        });

        if (!user) {
          return next(new Error('User not found'));
        }

        // Attach user to socket
        (socket as any).user = {
          id: user.id,
          discordId: user.discordId,
          username: user.username,
          encryptedApiKeys: user.encryptedApiKeys,
          preferences: user.preferences,
          createdAt: user.createdAt,
          lastActive: user.lastActive,
        };

        // Attach user teams
        (socket as any).teams = user.userTeams.map(ut => ({
          id: ut.team.id,
          name: ut.team.name,
          role: ut.role,
        }));

        next();
      } catch (error) {
        console.error('WebSocket authentication error:', error);
        next(new Error('Authentication failed'));
      }
    });

    // Rate limiting middleware
    this.io.use((socket, next) => {
      const rateLimitKey = `ws_rate_limit:${socket.handshake.address}`;
      // Implement rate limiting logic here if needed
      next();
    });
  }

  private setupEventHandlers(): void {
    if (!this.io) return;

    this.io.on('connection', (socket: Socket) => {
      const user = (socket as any).user as User;
      const userTeams = (socket as any).teams as Array<{ id: string; name: string; role: string }>;

      console.log(`🔌 User ${user.username} connected (${socket.id})`);

      // Store connected user
      this.connectedUsers.set(socket.id, { socket, user });

      // Join team rooms
      userTeams.forEach(team => {
        socket.join(`team:${team.id}`);
        
        // Track team membership
        if (!this.teamRooms.has(team.id)) {
          this.teamRooms.set(team.id, new Set());
        }
        this.teamRooms.get(team.id)!.add(socket.id);
      });

      // Send welcome message
      socket.emit('connected', {
        message: 'Connected to AI Compare WebSocket',
        user: {
          id: user.id,
          username: user.username,
        },
        teams: userTeams,
        timestamp: new Date(),
      });

      // Handle joining specific query room
      socket.on('join_query', async (data: { queryId: string }) => {
        try {
          const { queryId } = data;

          // Verify user has access to this query
          const query = await this.db.client.query.findUnique({
            where: { id: queryId },
          });

          if (!query) {
            socket.emit('error', { message: 'Query not found' });
            return;
          }

          // Check if user is a member of the query's team
          const userTeam = await this.db.client.userTeam.findUnique({
            where: {
              userId_teamId: {
                userId: user.id,
                teamId: query.teamId,
              },
            },
          });

          if (!userTeam) {
            socket.emit('error', { message: 'Access denied' });
            return;
          }

          // Join query room
          socket.join(`query:${queryId}`);
          
          socket.emit('joined_query', {
            queryId,
            message: 'Joined query room for real-time updates',
            timestamp: new Date(),
          });

          console.log(`📺 User ${user.username} joined query room ${queryId}`);
        } catch (error) {
          console.error('Error joining query room:', error);
          socket.emit('error', { message: 'Failed to join query room' });
        }
      });

      // Handle leaving query room
      socket.on('leave_query', (data: { queryId: string }) => {
        const { queryId } = data;
        socket.leave(`query:${queryId}`);
        
        socket.emit('left_query', {
          queryId,
          message: 'Left query room',
          timestamp: new Date(),
        });

        console.log(`📺 User ${user.username} left query room ${queryId}`);
      });

      // Handle typing indicators for comments
      socket.on('typing_start', (data: { queryId: string }) => {
        socket.to(`query:${data.queryId}`).emit('user_typing', {
          queryId: data.queryId,
          user: {
            id: user.id,
            username: user.username,
          },
          timestamp: new Date(),
        });
      });

      socket.on('typing_stop', (data: { queryId: string }) => {
        socket.to(`query:${data.queryId}`).emit('user_stopped_typing', {
          queryId: data.queryId,
          user: {
            id: user.id,
            username: user.username,
          },
          timestamp: new Date(),
        });
      });

      // Handle presence updates
      socket.on('update_presence', (data: { status: 'online' | 'away' | 'busy' }) => {
        // Broadcast presence to all user's teams
        userTeams.forEach(team => {
          socket.to(`team:${team.id}`).emit('user_presence_updated', {
            user: {
              id: user.id,
              username: user.username,
            },
            status: data.status,
            timestamp: new Date(),
          });
        });
      });

      // Handle ping/pong for connection health
      socket.on('ping', () => {
        socket.emit('pong', { timestamp: new Date() });
      });

      // Handle disconnection
      socket.on('disconnect', (reason) => {
        console.log(`🔌 User ${user.username} disconnected (${socket.id}): ${reason}`);

        // Remove from connected users
        this.connectedUsers.delete(socket.id);

        // Remove from team rooms tracking
        userTeams.forEach(team => {
          const teamSockets = this.teamRooms.get(team.id);
          if (teamSockets) {
            teamSockets.delete(socket.id);
            if (teamSockets.size === 0) {
              this.teamRooms.delete(team.id);
            }
          }
        });

        // Notify team members of disconnection
        userTeams.forEach(team => {
          socket.to(`team:${team.id}`).emit('user_disconnected', {
            user: {
              id: user.id,
              username: user.username,
            },
            timestamp: new Date(),
          });
        });

        // Update last active timestamp
        this.db.client.user.update({
          where: { id: user.id },
          data: { lastActive: new Date() },
        }).catch(console.error);
      });

      // Error handling
      socket.on('error', (error) => {
        console.error(`WebSocket error for user ${user.username}:`, error);
      });
    });
  }

  // Public methods for emitting events

  public emitToTeam(teamId: string, event: string, data: any): void {
    if (!this.io) return;

    this.io.to(`team:${teamId}`).emit(event, {
      ...data,
      timestamp: new Date(),
    });

    console.log(`📡 Emitted ${event} to team ${teamId}`);
  }

  public emitToQuery(queryId: string, event: string, data: any): void {
    if (!this.io) return;

    this.io.to(`query:${queryId}`).emit(event, {
      ...data,
      timestamp: new Date(),
    });

    console.log(`📡 Emitted ${event} to query ${queryId}`);
  }

  public emitToUser(userId: string, event: string, data: any): void {
    if (!this.io) return;

    // Find user's socket
    for (const [socketId, { socket, user }] of this.connectedUsers) {
      if (user.id === userId) {
        socket.emit(event, {
          ...data,
          timestamp: new Date(),
        });
        console.log(`📡 Emitted ${event} to user ${user.username}`);
        break;
      }
    }
  }

  public broadcast(event: string, data: any): void {
    if (!this.io) return;

    this.io.emit(event, {
      ...data,
      timestamp: new Date(),
    });

    console.log(`📡 Broadcasted ${event} to all connected users`);
  }

  // Query-specific events
  public notifyQueryUpdate(queryId: string, update: {
    status: string;
    progress?: number;
    message?: string;
  }): void {
    this.emitToQuery(queryId, 'query_update', {
      queryId,
      ...update,
    });
  }

  public notifyResponseReceived(queryId: string, response: {
    id: string;
    modelName: string;
    status: string;
    responseTime?: number;
  }): void {
    this.emitToQuery(queryId, 'response_received', {
      queryId,
      response,
    });
  }

  public notifyComparisonComplete(queryId: string, comparison: any): void {
    this.emitToQuery(queryId, 'comparison_complete', {
      queryId,
      comparison,
    });
  }

  public notifyVoteUpdate(queryId: string, voteUpdate: {
    responseId: string;
    votesSummary: any;
  }): void {
    this.emitToQuery(queryId, 'vote_update', {
      queryId,
      ...voteUpdate,
    });
  }

  public notifyNewComment(queryId: string, comment: {
    id: string;
    content: string;
    user: { id: string; username: string };
  }): void {
    this.emitToQuery(queryId, 'new_comment', {
      queryId,
      comment,
    });
  }

  // Statistics and monitoring
  public getStats(): {
    connectedUsers: number;
    activeTeams: number;
    totalConnections: number;
  } {
    return {
      connectedUsers: this.connectedUsers.size,
      activeTeams: this.teamRooms.size,
      totalConnections: this.io?.engine?.clientsCount || 0,
    };
  }

  public getConnectedUsersForTeam(teamId: string): Array<{ id: string; username: string }> {
    const teamSockets = this.teamRooms.get(teamId) || new Set();
    const users: Array<{ id: string; username: string }> = [];

    for (const socketId of teamSockets) {
      const connection = this.connectedUsers.get(socketId);
      if (connection) {
        users.push({
          id: connection.user.id,
          username: connection.user.username,
        });
      }
    }

    return users;
  }

  public isUserOnline(userId: string): boolean {
    for (const [, { user }] of this.connectedUsers) {
      if (user.id === userId) {
        return true;
      }
    }
    return false;
  }

  // Health check
  public healthCheck(): boolean {
    return this.io !== null && this.connectedUsers.size >= 0;
  }

  // Cleanup
  public async cleanup(): Promise<void> {
    if (this.io) {
      // Disconnect all sockets
      this.io.disconnectSockets();
      
      // Clear tracking maps
      this.connectedUsers.clear();
      this.teamRooms.clear();
      
      console.log('🧹 WebSocket service cleaned up');
    }
  }
}