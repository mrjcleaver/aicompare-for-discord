// Shared types for Multi-AI Query & Comparison Tool

import { z } from 'zod';

// ===================================================================
// USER TYPES
// ===================================================================

export const UserSchema = z.object({
  id: z.string().uuid(),
  discordId: z.string(),
  username: z.string(),
  avatar: z.string().nullable(),
  email: z.string().email().nullable(),
  preferences: z.record(z.unknown()).default({}),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type User = z.infer<typeof UserSchema>;

export const UserPreferencesSchema = z.object({
  defaultModels: z.array(z.string()).default([]),
  defaultTemperature: z.number().min(0).max(1).default(0.7),
  defaultMaxTokens: z.number().min(1).max(4000).default(2000),
  notificationSettings: z.object({
    dmNotifications: z.boolean().default(true),
    channelNotifications: z.boolean().default(true),
  }),
  displaySettings: z.object({
    compactMode: z.boolean().default(false),
    showMetrics: z.boolean().default(true),
  }),
});

export type UserPreferences = z.infer<typeof UserPreferencesSchema>;

// ===================================================================
// AI MODEL TYPES
// ===================================================================

export enum ModelProvider {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  GOOGLE = 'google',
  COHERE = 'cohere',
}

export enum ModelName {
  // OpenAI models
  GPT_4 = 'gpt-4',
  GPT_4_TURBO = 'gpt-4-turbo',
  GPT_3_5_TURBO = 'gpt-3.5-turbo',
  
  // Anthropic models
  CLAUDE_3_5_SONNET = 'claude-3-5-sonnet-20241022',
  CLAUDE_3_HAIKU = 'claude-3-haiku-20240307',
  
  // Google models
  GEMINI_1_5_PRO = 'gemini-1.5-pro',
  GEMINI_1_5_FLASH = 'gemini-1.5-flash',
  
  // Cohere models
  COMMAND_R_PLUS = 'command-r-plus',
  COMMAND_R = 'command-r',
}

export const ModelConfigSchema = z.object({
  name: z.nativeEnum(ModelName),
  provider: z.nativeEnum(ModelProvider),
  displayName: z.string(),
  description: z.string(),
  maxTokens: z.number(),
  supportsStreaming: z.boolean(),
  costPer1kTokensInput: z.number(),
  costPer1kTokensOutput: z.number(),
  enabled: z.boolean().default(true),
});

export type ModelConfig = z.infer<typeof ModelConfigSchema>;

// ===================================================================
// QUERY TYPES
// ===================================================================

export const QueryParametersSchema = z.object({
  temperature: z.number().min(0).max(1).default(0.7),
  maxTokens: z.number().min(1).max(4000).default(2000),
  systemPrompt: z.string().optional(),
  models: z.array(z.nativeEnum(ModelName)),
});

export type QueryParameters = z.infer<typeof QueryParametersSchema>;

export const CreateQuerySchema = z.object({
  prompt: z.string().min(1).max(4000),
  parameters: QueryParametersSchema,
  userId: z.string().uuid(),
  guildId: z.string().optional(),
  channelId: z.string().optional(),
  messageId: z.string().optional(),
});

export type CreateQuery = z.infer<typeof CreateQuerySchema>;

export enum QueryStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export const QuerySchema = z.object({
  id: z.string().uuid(),
  prompt: z.string(),
  parameters: QueryParametersSchema,
  status: z.nativeEnum(QueryStatus),
  userId: z.string().uuid(),
  guildId: z.string().nullable(),
  channelId: z.string().nullable(),
  messageId: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  completedAt: z.date().nullable(),
});

export type Query = z.infer<typeof QuerySchema>;

// ===================================================================
// RESPONSE TYPES
// ===================================================================

export enum ResponseStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  TIMEOUT = 'timeout',
}

export const ResponseMetadataSchema = z.object({
  tokenCount: z.number(),
  promptTokens: z.number(),
  completionTokens: z.number(),
  responseTimeMs: z.number(),
  costUsd: z.number(),
  model: z.string(),
  finishReason: z.string().optional(),
  error: z.string().optional(),
});

export type ResponseMetadata = z.infer<typeof ResponseMetadataSchema>;

export const AIResponseSchema = z.object({
  id: z.string().uuid(),
  queryId: z.string().uuid(),
  model: z.nativeEnum(ModelName),
  provider: z.nativeEnum(ModelProvider),
  content: z.string(),
  status: z.nativeEnum(ResponseStatus),
  metadata: ResponseMetadataSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
  completedAt: z.date().nullable(),
});

export type AIResponse = z.infer<typeof AIResponseSchema>;

// ===================================================================
// VOTING TYPES
// ===================================================================

export enum VoteType {
  THUMBS_UP = 'thumbs_up',
  THUMBS_DOWN = 'thumbs_down',
  STAR_RATING = 'star_rating',
}

export const VoteSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  responseId: z.string().uuid(),
  type: z.nativeEnum(VoteType),
  value: z.number().min(1).max(5), // 1-5 for star ratings, 1 for thumbs up/down
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Vote = z.infer<typeof VoteSchema>;

export const VoteAggregateSchema = z.object({
  responseId: z.string().uuid(),
  thumbsUp: z.number().default(0),
  thumbsDown: z.number().default(0),
  averageRating: z.number().nullable(),
  totalVotes: z.number().default(0),
});

export type VoteAggregate = z.infer<typeof VoteAggregateSchema>;

// ===================================================================
// COMPARISON TYPES
// ===================================================================

export const SimilarityMetricsSchema = z.object({
  semantic: z.number().min(0).max(100), // Semantic similarity percentage
  length: z.number().min(0).max(100),   // Length consistency percentage
  sentiment: z.number().min(0).max(100), // Sentiment alignment percentage
  speed: z.number().min(0).max(100),     // Relative response speed percentage
});

export type SimilarityMetrics = z.infer<typeof SimilarityMetricsSchema>;

export const ComparisonSchema = z.object({
  id: z.string().uuid(),
  query: QuerySchema,
  responses: z.array(AIResponseSchema),
  votes: z.array(VoteAggregateSchema),
  metrics: SimilarityMetricsSchema,
  participantCount: z.number().default(0),
  threadId: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Comparison = z.infer<typeof ComparisonSchema>;

// ===================================================================
// API TYPES
// ===================================================================

export const PaginationSchema = z.object({
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(10),
  total: z.number(),
  pages: z.number(),
});

export type Pagination = z.infer<typeof PaginationSchema>;

export const PaginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    data: z.array(itemSchema),
    pagination: PaginationSchema,
  });

export type PaginatedResponse<T> = {
  data: T[];
  pagination: Pagination;
};

// ===================================================================
// ERROR TYPES
// ===================================================================

export enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR = 'AUTHORIZATION_ERROR',
  NOT_FOUND_ERROR = 'NOT_FOUND_ERROR',
  RATE_LIMIT_ERROR = 'RATE_LIMIT_ERROR',
  AI_API_ERROR = 'AI_API_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

export const AppErrorSchema = z.object({
  code: z.nativeEnum(ErrorCode),
  message: z.string(),
  details: z.record(z.unknown()).optional(),
  timestamp: z.date(),
  requestId: z.string().optional(),
});

export type AppError = z.infer<typeof AppErrorSchema>;

// ===================================================================
// WEBSOCKET TYPES
// ===================================================================

export enum WebSocketEventType {
  QUERY_UPDATE = 'query_update',
  RESPONSE_UPDATE = 'response_update',
  VOTE_UPDATE = 'vote_update',
  COMPARISON_UPDATE = 'comparison_update',
  USER_JOIN = 'user_join',
  USER_LEAVE = 'user_leave',
  ERROR = 'error',
}

export const WebSocketMessageSchema = z.object({
  type: z.nativeEnum(WebSocketEventType),
  data: z.unknown(),
  timestamp: z.date(),
  userId: z.string().uuid().optional(),
});

export type WebSocketMessage = z.infer<typeof WebSocketMessageSchema>;

// ===================================================================
// ANALYTICS TYPES
// ===================================================================

export const UsageStatsSchema = z.object({
  totalQueries: z.number(),
  totalResponses: z.number(),
  totalVotes: z.number(),
  averageResponseTime: z.number(),
  popularModels: z.array(z.object({
    model: z.nativeEnum(ModelName),
    count: z.number(),
    percentage: z.number(),
  })),
  dailyUsage: z.array(z.object({
    date: z.string(),
    queries: z.number(),
  })),
});

export type UsageStats = z.infer<typeof UsageStatsSchema>;

// ===================================================================
// EXPORT ALL SCHEMAS
// ===================================================================

export const schemas = {
  User: UserSchema,
  UserPreferences: UserPreferencesSchema,
  ModelConfig: ModelConfigSchema,
  QueryParameters: QueryParametersSchema,
  CreateQuery: CreateQuerySchema,
  Query: QuerySchema,
  ResponseMetadata: ResponseMetadataSchema,
  AIResponse: AIResponseSchema,
  Vote: VoteSchema,
  VoteAggregate: VoteAggregateSchema,
  SimilarityMetrics: SimilarityMetricsSchema,
  Comparison: ComparisonSchema,
  Pagination: PaginationSchema,
  AppError: AppErrorSchema,
  WebSocketMessage: WebSocketMessageSchema,
  UsageStats: UsageStatsSchema,
};