import { AIResponse, AIModel } from '../../types';

export interface AIProviderConfig {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
  retries?: number;
}

export interface QueryParameters {
  prompt: string;
  model: AIModel;
  temperature: number;
  maxTokens: number;
  systemPrompt?: string;
  stream?: boolean;
}

export abstract class BaseAIProvider {
  protected config: AIProviderConfig;
  
  constructor(config: AIProviderConfig) {
    this.config = config;
  }

  abstract get providerName(): string;
  abstract get supportedModels(): AIModel[];
  
  /**
   * Query the AI model and return a response
   */
  abstract query(params: QueryParameters): Promise<AIResponse>;
  
  /**
   * Check if the provider supports a specific model
   */
  supportsModel(model: AIModel): boolean {
    return this.supportedModels.includes(model);
  }
  
  /**
   * Validate the provider configuration
   */
  async validateConfig(): Promise<boolean> {
    try {
      // Test with a simple query
      const testResponse = await this.query({
        prompt: 'Hello',
        model: this.supportedModels[0],
        temperature: 0.1,
        maxTokens: 10
      });
      return !!testResponse.content;
    } catch (error) {
      return false;
    }
  }
  
  /**
   * Estimate the cost of a query (in USD)
   */
  estimateCost(model: AIModel, inputTokens: number, outputTokens: number): number {
    // Default implementation - override in specific providers
    return 0.001 * (inputTokens + outputTokens) / 1000;
  }
  
  /**
   * Calculate approximate token count for text
   */
  estimateTokens(text: string): number {
    // Rough estimation: ~4 characters per token for English text
    return Math.ceil(text.length / 4);
  }
  
  /**
   * Handle provider-specific errors
   */
  protected handleError(error: any, context: string): Error {
    let message = `${this.providerName} error: ${error.message || 'Unknown error'}`;
    
    // Common error patterns
    if (error.status === 401 || error.code === 'UNAUTHORIZED') {
      message = `${this.providerName}: Invalid API key`;
    } else if (error.status === 429 || error.code === 'RATE_LIMIT_EXCEEDED') {
      message = `${this.providerName}: Rate limit exceeded`;
    } else if (error.status === 503 || error.code === 'SERVICE_UNAVAILABLE') {
      message = `${this.providerName}: Service temporarily unavailable`;
    } else if (error.code === 'CONTENT_FILTER') {
      message = `${this.providerName}: Content filtered by safety systems`;
    } else if (error.code === 'TIMEOUT') {
      message = `${this.providerName}: Request timed out`;
    }
    
    const enhancedError = new Error(message);
    enhancedError.name = `${this.providerName}Error`;
    return enhancedError;
  }
  
  /**
   * Retry logic for failed requests
   */
  protected async withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Don't retry on certain errors
        if (error.status === 401 || error.status === 400) {
          throw lastError;
        }
        
        if (attempt < maxRetries - 1) {
          const delay = baseDelay * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError!;
  }
}