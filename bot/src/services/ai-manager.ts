import { BaseAIProvider, QueryParameters } from './ai-providers/base-provider';
import { OpenAIProvider } from './ai-providers/openai-provider';
import { AnthropicProvider } from './ai-providers/anthropic-provider';
import { GoogleProvider } from './ai-providers/google-provider';
import { CohereProvider } from './ai-providers/cohere-provider';
import { AIModel, AIResponse } from '../types';
import { config } from '../config';
import { aiLogger } from '../utils/logger';

export class AIServiceManager {
  private providers: Map<string, BaseAIProvider> = new Map();
  private static instance: AIServiceManager;
  
  private constructor() {}
  
  static getInstance(): AIServiceManager {
    if (!AIServiceManager.instance) {
      AIServiceManager.instance = new AIServiceManager();
    }
    return AIServiceManager.instance;
  }
  
  async initialize(): Promise<void> {
    aiLogger.info('Initializing AI providers...');
    
    // Initialize OpenAI provider
    if (config.ai.openai.apiKey) {
      try {
        const openaiProvider = new OpenAIProvider({
          apiKey: config.ai.openai.apiKey,
          baseUrl: config.ai.openai.baseUrl
        });
        
        if (await openaiProvider.validateConfig()) {
          this.providers.set('openai', openaiProvider);
          aiLogger.info('OpenAI provider initialized successfully');
        } else {
          aiLogger.warn('OpenAI provider validation failed');
        }
      } catch (error) {
        aiLogger.error('Failed to initialize OpenAI provider:', error);
      }
    }
    
    // Initialize Anthropic provider
    if (config.ai.anthropic.apiKey) {
      try {
        const anthropicProvider = new AnthropicProvider({
          apiKey: config.ai.anthropic.apiKey,
          baseUrl: config.ai.anthropic.baseUrl
        });
        
        if (await anthropicProvider.validateConfig()) {
          this.providers.set('anthropic', anthropicProvider);
          aiLogger.info('Anthropic provider initialized successfully');
        } else {
          aiLogger.warn('Anthropic provider validation failed');
        }
      } catch (error) {
        aiLogger.error('Failed to initialize Anthropic provider:', error);
      }
    }
    
    // Initialize Google provider
    if (config.ai.google.apiKey) {
      try {
        const googleProvider = new GoogleProvider({
          apiKey: config.ai.google.apiKey
        });
        
        if (await googleProvider.validateConfig()) {
          this.providers.set('google', googleProvider);
          aiLogger.info('Google provider initialized successfully');
        } else {
          aiLogger.warn('Google provider validation failed');
        }
      } catch (error) {
        aiLogger.error('Failed to initialize Google provider:', error);
      }
    }
    
    // Initialize Cohere provider
    if (config.ai.cohere.apiKey) {
      try {
        const cohereProvider = new CohereProvider({
          apiKey: config.ai.cohere.apiKey
        });
        
        if (await cohereProvider.validateConfig()) {
          this.providers.set('cohere', cohereProvider);
          aiLogger.info('Cohere provider initialized successfully');
        } else {
          aiLogger.warn('Cohere provider validation failed');
        }
      } catch (error) {
        aiLogger.error('Failed to initialize Cohere provider:', error);
      }
    }
    
    const providerCount = this.providers.size;
    if (providerCount === 0) {
      throw new Error('No AI providers were successfully initialized');
    }
    
    aiLogger.info(`AI Service Manager initialized with ${providerCount} providers`);
  }
  
  /**
   * Query multiple AI models in parallel
   */
  async queryModels(models: AIModel[], params: Omit<QueryParameters, 'model'>): Promise<AIResponse[]> {
    const queries = models.map(model => this.querySingleModel(model, { ...params, model }));
    
    // Wait for all queries to complete (with individual error handling)
    const results = await Promise.allSettled(queries);
    
    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        // Create error response for failed queries
        const model = models[index];
        return {
          id: `error_${Date.now()}_${Math.random()}`,
          model,
          content: '',
          responseTime: 0,
          tokenCount: 0,
          cost: 0,
          error: result.reason?.message || 'Unknown error occurred',
          metadata: {}
        } as AIResponse;
      }
    });
  }
  
  /**
   * Query a single AI model
   */
  async querySingleModel(model: AIModel, params: QueryParameters): Promise<AIResponse> {
    const provider = this.getProviderForModel(model);
    
    if (!provider) {
      throw new Error(`No provider available for model: ${model}`);
    }
    
    aiLogger.info(`Querying ${model} via ${provider.providerName}`, {
      prompt: params.prompt.substring(0, 100),
      temperature: params.temperature,
      maxTokens: params.maxTokens
    });
    
    const startTime = Date.now();
    
    try {
      const response = await provider.query(params);
      
      aiLogger.info(`Query completed for ${model}`, {
        responseTime: response.responseTime,
        tokenCount: response.tokenCount,
        hasError: !!response.error
      });
      
      return response;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      aiLogger.error(`Query failed for ${model}:`, {
        error: error.message,
        responseTime
      });
      
      // Return error response instead of throwing
      return {
        id: `error_${Date.now()}_${Math.random()}`,
        model,
        content: '',
        responseTime,
        tokenCount: 0,
        cost: 0,
        error: error.message,
        metadata: {}
      };
    }
  }
  
  /**
   * Get the appropriate provider for a model
   */
  private getProviderForModel(model: AIModel): BaseAIProvider | null {
    // Map models to providers
    const modelProviderMap: Record<AIModel, string> = {
      'gpt-4': 'openai',
      'gpt-4-turbo': 'openai',
      'gpt-3.5-turbo': 'openai',
      'claude-3.5-sonnet': 'anthropic',
      'claude-3-haiku': 'anthropic',
      'gemini-1.5-pro': 'google',
      'gemini-1.5-flash': 'google',
      'command-r-plus': 'cohere',
      'command-r': 'cohere'
    };
    
    const providerName = modelProviderMap[model];
    return providerName ? this.providers.get(providerName) || null : null;
  }
  
  /**
   * Get list of available models
   */
  getAvailableModels(): AIModel[] {
    const availableModels: AIModel[] = [];
    
    for (const provider of this.providers.values()) {
      availableModels.push(...provider.supportedModels);
    }
    
    return availableModels;
  }
  
  /**
   * Check if a model is available
   */
  isModelAvailable(model: AIModel): boolean {
    return this.getProviderForModel(model) !== null;
  }
  
  /**
   * Get provider status
   */
  getProviderStatus(): { [provider: string]: boolean } {
    const status: { [provider: string]: boolean } = {};
    
    for (const [name, provider] of this.providers) {
      status[name] = true; // If it's in the map, it passed validation
    }
    
    return status;
  }
  
  /**
   * Estimate cost for a query across multiple models
   */
  estimateQueryCost(models: AIModel[], promptLength: number, expectedResponseLength: number = 500): number {
    let totalCost = 0;
    
    for (const model of models) {
      const provider = this.getProviderForModel(model);
      if (provider) {
        const promptTokens = provider.estimateTokens(promptLength.toString());
        const responseTokens = provider.estimateTokens(expectedResponseLength.toString());
        totalCost += provider.estimateCost(model, promptTokens, responseTokens);
      }
    }
    
    return totalCost;
  }
}

// Export singleton instance
export const aiManager = AIServiceManager.getInstance();