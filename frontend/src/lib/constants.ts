export const MODEL_INFO = {
  'gpt-4': {
    id: 'gpt-4',
    name: 'GPT-4',
    provider: 'OpenAI',
    emoji: '🧠',
    description: 'Most capable GPT model, great for complex tasks',
    capabilities: ['reasoning', 'coding', 'writing', 'analysis'],
    pricing: { input: 0.03, output: 0.06, unit: '1K tokens' }
  },
  'gpt-4-turbo': {
    id: 'gpt-4-turbo',
    name: 'GPT-4 Turbo',
    provider: 'OpenAI',
    emoji: '⚡',
    description: 'Faster and more cost-effective than GPT-4',
    capabilities: ['reasoning', 'coding', 'writing', 'analysis', 'vision'],
    pricing: { input: 0.01, output: 0.03, unit: '1K tokens' }
  },
  'gpt-3.5-turbo': {
    id: 'gpt-3.5-turbo',
    name: 'GPT-3.5 Turbo',
    provider: 'OpenAI',
    emoji: '🚀',
    description: 'Fast and efficient for most tasks',
    capabilities: ['writing', 'coding', 'conversation'],
    pricing: { input: 0.0015, output: 0.002, unit: '1K tokens' }
  },
  'claude-3-sonnet': {
    id: 'claude-3-sonnet',
    name: 'Claude 3 Sonnet',
    provider: 'Anthropic',
    emoji: '🎭',
    description: 'Balanced model with strong reasoning and creativity',
    capabilities: ['reasoning', 'writing', 'analysis', 'coding'],
    pricing: { input: 0.003, output: 0.015, unit: '1K tokens' }
  },
  'claude-3-haiku': {
    id: 'claude-3-haiku',
    name: 'Claude 3 Haiku',
    provider: 'Anthropic',
    emoji: '🌸',
    description: 'Fastest Claude model for simple tasks',
    capabilities: ['writing', 'conversation', 'simple reasoning'],
    pricing: { input: 0.00025, output: 0.00125, unit: '1K tokens' }
  },
  'gemini-1.5-pro': {
    id: 'gemini-1.5-pro',
    name: 'Gemini 1.5 Pro',
    provider: 'Google',
    emoji: '💎',
    description: 'Google\'s most capable model with large context',
    capabilities: ['reasoning', 'coding', 'multimodal', 'large-context'],
    pricing: { input: 0.00035, output: 0.0105, unit: '1K tokens' }
  },
  'command-r-plus': {
    id: 'command-r-plus',
    name: 'Command R+',
    provider: 'Cohere',
    emoji: '⚡',
    description: 'Enterprise-focused model with strong RAG capabilities',
    capabilities: ['reasoning', 'rag', 'search', 'analysis'],
    pricing: { input: 0.003, output: 0.015, unit: '1K tokens' }
  }
} as const;

export const SIMILARITY_THRESHOLDS = {
  EXCELLENT: 80,
  GOOD: 60,
  FAIR: 40,
  POOR: 0
} as const;

export const WEBSOCKET_EVENTS = {
  COMPARISON_UPDATE: 'comparison_update',
  VOTE_UPDATE: 'vote_update',
  NEW_COMPARISON: 'new_comparison',
  MODEL_RATING: 'model_rating'
} as const;

export const API_ENDPOINTS = {
  BASE_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
  WS_URL: process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001',
  COMPARISONS: '/api/comparisons',
  AUTH: '/api/auth',
  USER: '/api/user',
  SETTINGS: '/api/settings'
} as const;

export const LOCAL_STORAGE_KEYS = {
  AUTH_TOKEN: 'auth-token',
  USER_DATA: 'user-data',
  THEME: 'theme',
  SIDEBAR_COLLAPSED: 'sidebar-collapsed'
} as const;

export const BREAKPOINTS = {
  xs: '0px',
  sm: '576px',
  md: '768px',
  lg: '992px',
  xl: '1200px',
  xxl: '1400px'
} as const;