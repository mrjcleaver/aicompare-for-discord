export interface Comparison {
  id: string;
  prompt: string;
  responses: AIResponse[];
  metrics: ComparisonMetrics;
  votes: ComparisonVotes;
  userId: string;
  guildId?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: string;
  completedAt?: string;
}

export interface AIResponse {
  id: string;
  model: string;
  content: string;
  responseTime: number;
  tokenCount: number;
  votes: ResponseVotes;
  ratings: ModelRating[];
  metadata: ResponseMetadata;
}

export interface ResponseMetadata {
  temperature: number;
  maxTokens?: number;
  finishReason: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface ComparisonMetrics {
  semantic: number;
  length: number;
  sentiment: number;
  speed: number;
  coherence?: number;
  creativity?: number;
}

export interface ComparisonVotes {
  helpful: number;
  notHelpful: number;
  totalVoters: number;
}

export interface ResponseVotes {
  thumbsUp: number;
  thumbsDown: number;
  voters: string[];
}

export interface ModelRating {
  userId: string;
  rating: number; // 1-5 stars
  comment?: string;
  createdAt: string;
}

export interface Vote {
  type: 'thumbs_up' | 'thumbs_down';
  userId: string;
  responseId?: string;
  comparisonId: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  emoji: string;
  description: string;
  capabilities: string[];
  pricing: {
    input: number;
    output: number;
    unit: string;
  };
}

// WebSocket message types
export interface WebSocketMessage {
  type: 'comparison_update' | 'vote_update' | 'new_comparison' | 'model_rating';
  data: any;
}

export type ComparisonStatus = 'pending' | 'processing' | 'completed' | 'failed';