import { SlashCommandBuilder, Collection, ChatInputCommandInteraction, ButtonInteraction, StringSelectMenuInteraction } from 'discord.js';

// Bot Command Interface
export interface Command {
  data: SlashCommandBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
  cooldown?: number;
}

// Extended Discord Client
export interface ExtendedClient {
  commands: Collection<string, Command>;
  cooldowns: Collection<string, Collection<string, number>>;
}

// AI Model Types
export type AIModel = 'gpt-4' | 'gpt-4-turbo' | 'gpt-3.5-turbo' | 'claude-3.5-sonnet' | 'claude-3-haiku' | 'gemini-1.5-pro' | 'gemini-1.5-flash' | 'command-r-plus' | 'command-r';

export interface ModelConfig {
  name: string;
  displayName: string;
  provider: 'openai' | 'anthropic' | 'google' | 'cohere';
  maxTokens: number;
  supportsStreaming: boolean;
  emoji: string;
}

// Query and Response Types
export interface QueryRequest {
  userId: string;
  guildId: string;
  channelId: string;
  messageId: string;
  prompt: string;
  models: AIModel[];
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

export interface AIResponse {
  id: string;
  model: AIModel;
  content: string;
  responseTime: number;
  tokenCount: number;
  cost: number;
  error?: string;
  metadata: {
    finishReason?: string;
    usage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
  };
}

export interface ComparisonResult {
  id: string;
  queryId: string;
  userId: string;
  guildId: string;
  prompt: string;
  responses: AIResponse[];
  metrics: SimilarityMetrics;
  votes: VoteData;
  createdAt: Date;
  updatedAt: Date;
}

export interface SimilarityMetrics {
  semantic: number;
  length: number;
  sentiment: number;
  speed: number;
  aggregate: number;
}

export interface VoteData {
  thumbsUp: number;
  thumbsDown: number;
  starRatings: { [userId: string]: number };
  modelVotes: { [model: string]: { up: number; down: number } };
}

// User and Settings Types
export interface UserSettings {
  userId: string;
  defaultModels: AIModel[];
  temperature: number;
  maxTokens: number;
  notificationPreference: 'dm' | 'channel' | 'both';
  displayFormat: 'compact' | 'detailed';
  theme: 'light' | 'dark';
}

export interface GuildSettings {
  guildId: string;
  enabledModels: AIModel[];
  rateLimitPerUser: number;
  rateLimitPerHour: number;
  allowedChannels: string[];
  moderatorRoles: string[];
  defaultSettings: Partial<UserSettings>;
}

// Database Entities
export interface User {
  id: string;
  discordId: string;
  username: string;
  encryptedApiKeys: string;
  settings: UserSettings;
  createdAt: Date;
  lastActive: Date;
}

export interface Query {
  id: string;
  userId: string;
  guildId: string;
  channelId: string;
  messageId: string;
  prompt: string;
  parameters: {
    models: AIModel[];
    temperature: number;
    maxTokens: number;
    systemPrompt?: string;
  };
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: Date;
  completedAt?: Date;
}

export interface Response {
  id: string;
  queryId: string;
  model: AIModel;
  content: string;
  metadata: AIResponse['metadata'];
  responseTime: number;
  tokenCount: number;
  cost: number;
  error?: string;
  createdAt: Date;
}

export interface Vote {
  id: string;
  userId: string;
  responseId: string;
  queryId: string;
  voteType: 'thumbs_up' | 'thumbs_down' | 'star_rating';
  value: number;
  createdAt: Date;
  updatedAt: Date;
}

// Interaction Types
export type InteractionType = 'vote' | 'rating' | 'details' | 'export' | 'settings';

export interface CustomInteraction {
  type: InteractionType;
  queryId: string;
  responseId?: string;
  data?: any;
}

// API Response Types
export interface PaginatedResponse<T> {
  data: T[];
  page: number;
  totalPages: number;
  totalCount: number;
  hasNext: boolean;
  hasPrev: boolean;
}

// Error Types
export interface BotError extends Error {
  code: string;
  context?: string;
  userId?: string;
  guildId?: string;
  timestamp: Date;
}

// Job Queue Types
export interface AIQueryJob {
  queryId: string;
  userId: string;
  guildId: string;
  channelId: string;
  messageId: string;
  prompt: string;
  models: AIModel[];
  parameters: {
    temperature: number;
    maxTokens: number;
    systemPrompt?: string;
  };
}

export interface SimilarityAnalysisJob {
  queryId: string;
  responses: AIResponse[];
}

export interface NotificationJob {
  type: 'completion' | 'error' | 'reminder';
  userId: string;
  guildId?: string;
  channelId?: string;
  messageId?: string;
  data: any;
}

// Configuration Types
export interface BotConfig {
  discord: {
    token: string;
    clientId: string;
    clientSecret: string;
    guildIds: string[];
  };
  database: {
    url: string;
    ssl: boolean;
    poolSize: number;
  };
  redis: {
    url: string;
    retryAttempts: number;
  };
  ai: {
    openai: {
      apiKey: string;
      baseUrl?: string;
    };
    anthropic: {
      apiKey: string;
      baseUrl?: string;
    };
    google: {
      apiKey: string;
    };
    cohere: {
      apiKey: string;
    };
  };
  rateLimits: {
    perUser: number;
    perGuild: number;
    windowMs: number;
  };
  security: {
    encryptionKey: string;
    jwtSecret: string;
  };
  logging: {
    level: string;
    file?: string;
  };
}

// Utility Types
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

export type OptionalFields<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;