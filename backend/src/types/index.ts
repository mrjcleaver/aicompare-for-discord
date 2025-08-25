export interface User {
  id: string;
  discordId: string;
  username: string;
  encryptedApiKeys: Record<string, string>;
  preferences: UserPreferences;
  createdAt: Date;
  lastActive: Date;
}

export interface UserPreferences {
  defaultModels: LLMModel[];
  notificationPreferences: 'dm' | 'channel';
  displayFormat: 'compact' | 'detailed';
  theme: 'light' | 'dark';
}

export interface Team {
  id: string;
  discordServerId: string;
  name: string;
  settings: TeamSettings;
  createdAt: Date;
}

export interface TeamSettings {
  availableModels: LLMModel[];
  defaultModels: LLMModel[];
  maxQueriesPerHour: number;
  allowAnonymousVoting: boolean;
  autoCreateThreads: boolean;
}

export interface Query {
  id: string;
  userId: string;
  teamId: string;
  prompt: string;
  parameters: QueryParameters;
  modelsRequested: LLMModel[];
  createdAt: Date;
  discordMessageId?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
}

export interface QueryParameters {
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  topP?: number;
  topK?: number;
}

export interface Response {
  id: string;
  queryId: string;
  modelName: LLMModel;
  content: string;
  metadata: ResponseMetadata;
  responseTimeMs: number;
  tokenCount: number;
  costUsd: number;
  createdAt: Date;
  status: 'pending' | 'completed' | 'failed' | 'timeout';
  error?: string;
}

export interface ResponseMetadata {
  model: string;
  version: string;
  finishReason: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  safety?: {
    blocked: boolean;
    categories: string[];
  };
}

export interface Vote {
  id: string;
  userId: string;
  responseId: string;
  voteType: 'thumbs_up' | 'thumbs_down' | 'star_rating';
  value: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Comment {
  id: string;
  userId: string;
  queryId: string;
  content: string;
  discordThreadId?: string;
  createdAt: Date;
}

export interface ComparisonMetrics {
  semanticSimilarity: number;
  lengthComparison: number;
  sentimentAlignment: number;
  factualConsistency: number;
  responseTimeComparison: number;
  aggregateScore: number;
}

export interface SimilarityScore {
  score: number;
  explanation: string;
  category: 'high' | 'medium' | 'low';
}

export type LLMModel = 
  | 'gpt-4'
  | 'gpt-4-turbo'
  | 'gpt-3.5-turbo'
  | 'claude-3.5-sonnet'
  | 'claude-3-haiku'
  | 'gemini-1.5-pro'
  | 'gemini-1.5-flash'
  | 'command-r-plus'
  | 'command-r';

export interface LLMProvider {
  name: string;
  models: LLMModel[];
  query: (model: LLMModel, prompt: string, parameters: QueryParameters) => Promise<Response>;
  validateApiKey: (apiKey: string) => Promise<boolean>;
}

export interface WebSocketMessage {
  type: 'query_update' | 'response_received' | 'comparison_complete' | 'vote_update';
  queryId: string;
  data: any;
  timestamp: Date;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta?: {
    pagination?: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
    execution_time?: number;
  };
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: Date;
}

export interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  email?: string;
  verified?: boolean;
  guilds?: DiscordGuild[];
}

export interface DiscordGuild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
}

export interface JobData {
  queryId: string;
  userId: string;
  models: LLMModel[];
  prompt: string;
  parameters: QueryParameters;
}

export interface QueueJob {
  id: string;
  type: 'llm_query' | 'similarity_calculation' | 'notification';
  data: JobData | any;
  priority: number;
  attempts: number;
  createdAt: Date;
}