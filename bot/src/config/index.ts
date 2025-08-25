import { config as dotenvConfig } from 'dotenv';
import { BotConfig, ModelConfig, AIModel } from '../types';
import path from 'path';

// Load environment variables
dotenvConfig({ path: path.join(__dirname, '../../.env') });

// Validate required environment variables
const requiredEnvVars = [
  'DISCORD_TOKEN',
  'DISCORD_CLIENT_ID',
  'DATABASE_URL',
  'REDIS_URL',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'ENCRYPTION_KEY'
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

// Bot configuration
export const config: BotConfig = {
  discord: {
    token: process.env.DISCORD_TOKEN!,
    clientId: process.env.DISCORD_CLIENT_ID!,
    clientSecret: process.env.DISCORD_CLIENT_SECRET || '',
    guildIds: process.env.GUILD_IDS?.split(',') || []
  },
  database: {
    url: process.env.DATABASE_URL!,
    ssl: process.env.NODE_ENV === 'production',
    poolSize: parseInt(process.env.DB_POOL_SIZE || '10')
  },
  redis: {
    url: process.env.REDIS_URL!,
    retryAttempts: parseInt(process.env.REDIS_RETRY_ATTEMPTS || '3')
  },
  ai: {
    openai: {
      apiKey: process.env.OPENAI_API_KEY!,
      baseUrl: process.env.OPENAI_BASE_URL
    },
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY!,
      baseUrl: process.env.ANTHROPIC_BASE_URL
    },
    google: {
      apiKey: process.env.GOOGLE_API_KEY || ''
    },
    cohere: {
      apiKey: process.env.COHERE_API_KEY || ''
    }
  },
  rateLimits: {
    perUser: parseInt(process.env.RATE_LIMIT_PER_USER || '10'),
    perGuild: parseInt(process.env.RATE_LIMIT_PER_GUILD || '100'),
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '3600000') // 1 hour
  },
  security: {
    encryptionKey: process.env.ENCRYPTION_KEY!,
    jwtSecret: process.env.JWT_SECRET || 'fallback_jwt_secret'
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE
  }
};

// Model configurations
export const modelConfigs: Record<AIModel, ModelConfig> = {
  'gpt-4': {
    name: 'gpt-4',
    displayName: 'GPT-4',
    provider: 'openai',
    maxTokens: 8192,
    supportsStreaming: true,
    emoji: '🧠'
  },
  'gpt-4-turbo': {
    name: 'gpt-4-turbo',
    displayName: 'GPT-4 Turbo',
    provider: 'openai',
    maxTokens: 128000,
    supportsStreaming: true,
    emoji: '⚡'
  },
  'gpt-3.5-turbo': {
    name: 'gpt-3.5-turbo',
    displayName: 'GPT-3.5 Turbo',
    provider: 'openai',
    maxTokens: 16384,
    supportsStreaming: true,
    emoji: '🚀'
  },
  'claude-3.5-sonnet': {
    name: 'claude-3.5-sonnet',
    displayName: 'Claude-3.5 Sonnet',
    provider: 'anthropic',
    maxTokens: 200000,
    supportsStreaming: true,
    emoji: '🎭'
  },
  'claude-3-haiku': {
    name: 'claude-3-haiku',
    displayName: 'Claude-3 Haiku',
    provider: 'anthropic',
    maxTokens: 200000,
    supportsStreaming: true,
    emoji: '🌸'
  },
  'gemini-1.5-pro': {
    name: 'gemini-1.5-pro',
    displayName: 'Gemini 1.5 Pro',
    provider: 'google',
    maxTokens: 1000000,
    supportsStreaming: true,
    emoji: '💎'
  },
  'gemini-1.5-flash': {
    name: 'gemini-1.5-flash',
    displayName: 'Gemini 1.5 Flash',
    provider: 'google',
    maxTokens: 1000000,
    supportsStreaming: true,
    emoji: '⚡'
  },
  'command-r-plus': {
    name: 'command-r-plus',
    displayName: 'Command R+',
    provider: 'cohere',
    maxTokens: 128000,
    supportsStreaming: true,
    emoji: '🎯'
  },
  'command-r': {
    name: 'command-r',
    displayName: 'Command R',
    provider: 'cohere',
    maxTokens: 128000,
    supportsStreaming: true,
    emoji: '🔥'
  }
};

// Default model selections for different use cases
export const defaultModelSelections = {
  general: ['gpt-4', 'claude-3.5-sonnet'] as AIModel[],
  creative: ['gpt-4', 'claude-3.5-sonnet', 'gemini-1.5-pro'] as AIModel[],
  analytical: ['gpt-4-turbo', 'claude-3.5-sonnet', 'command-r-plus'] as AIModel[],
  fast: ['gpt-3.5-turbo', 'claude-3-haiku', 'gemini-1.5-flash'] as AIModel[],
  all: Object.keys(modelConfigs) as AIModel[]
};

// Application constants
export const constants = {
  MAX_PROMPT_LENGTH: 4000,
  MAX_RESPONSE_DISPLAY_LENGTH: 1024,
  DEFAULT_TEMPERATURE: 0.7,
  DEFAULT_MAX_TOKENS: 1000,
  QUERY_TIMEOUT_MS: 30000,
  MAX_CONCURRENT_QUERIES: 4,
  SIMILARITY_CACHE_TTL: 300, // 5 minutes
  USER_COOLDOWN_MS: 60000, // 1 minute
  EMBED_COLOR: {
    SUCCESS: 0x00AE86,
    ERROR: 0xFF4444,
    WARNING: 0xFFAA00,
    INFO: 0x3B82F6,
    PROCESSING: 0x8B5CF6
  },
  DISCORD_LIMITS: {
    EMBED_FIELD_VALUE: 1024,
    EMBED_TOTAL: 6000,
    MESSAGE_LENGTH: 2000
  }
};

// Feature flags
export const features = {
  SIMILARITY_ANALYSIS: true,
  REAL_TIME_VOTING: true,
  THREAD_CREATION: true,
  EXPORT_FUNCTIONALITY: true,
  ANALYTICS_TRACKING: process.env.NODE_ENV === 'production',
  EXPERIMENTAL_MODELS: false
};

export default config;