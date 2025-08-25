import { BaseLLMProvider } from './base';
import { OpenAIProvider } from './openai';
import { AnthropicProvider } from './anthropic';
import { GoogleProvider } from './google';
import { CohereProvider } from './cohere';
import { LLMModel, QueryParameters, Response, User } from '../../types';
import { DatabaseService } from '../database';
import { RedisService } from '../redis';
import { EncryptionService } from '../encryption';

export class LLMService {
  private static instance: LLMService;
  private providers: Map<string, BaseLLMProvider>;
  private db: DatabaseService;
  private redis: RedisService;
  private encryption: EncryptionService;

  private constructor() {
    this.providers = new Map();
    this.db = DatabaseService.getInstance();
    this.redis = RedisService.getInstance();
    this.encryption = EncryptionService.getInstance();
    
    this.initializeProviders();
  }

  public static getInstance(): LLMService {
    if (!LLMService.instance) {
      LLMService.instance = new LLMService();
    }
    return LLMService.instance;
  }

  private initializeProviders(): void {
    this.providers.set('openai', new OpenAIProvider());
    this.providers.set('anthropic', new AnthropicProvider());
    this.providers.set('google', new GoogleProvider());
    this.providers.set('cohere', new CohereProvider());
  }

  public getSupportedModels(): LLMModel[] {
    const allModels: LLMModel[] = [];
    
    this.providers.forEach(provider => {
      allModels.push(...provider.getSupportedModels());
    });

    return Array.from(new Set(allModels));
  }

  public getProviderForModel(model: LLMModel): BaseLLMProvider | null {
    for (const [, provider] of this.providers) {
      if (provider.getSupportedModels().includes(model)) {
        return provider;
      }
    }
    return null;
  }

  public async executeParallelQueries(
    queryId: string,
    userId: string,
    models: LLMModel[],
    prompt: string,
    parameters: QueryParameters
  ): Promise<Response[]> {
    console.log(`🚀 Executing parallel queries for ${models.length} models`);

    // Get user's API keys
    const user = await this.db.client.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new Error('User not found');
    }

    const decryptedApiKeys = await this.decryptUserApiKeys(user.encryptedApiKeys as Record<string, string>);

    // Execute queries in parallel
    const queryPromises = models.map(model => 
      this.executeQuery(queryId, model, prompt, parameters, decryptedApiKeys)
    );

    const results = await Promise.allSettled(queryPromises);

    // Process results and save to database
    const responses: Response[] = [];
    
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const model = models[i];

      let response: Partial<Response>;

      if (result.status === 'fulfilled') {
        response = result.value;
      } else {
        console.error(`Query failed for ${model}:`, result.reason);
        response = {
          status: 'failed',
          content: '',
          responseTimeMs: 0,
          tokenCount: 0,
          costUsd: 0,
          error: result.reason?.message || 'Query failed',
          metadata: {
            model,
            version: '',
            finishReason: 'error',
            usage: {
              promptTokens: 0,
              completionTokens: 0,
              totalTokens: 0,
            },
          },
        };
      }

      // Save response to database
      const savedResponse = await this.db.createResponse({
        queryId,
        modelName: model,
        content: response.content || '',
        metadata: response.metadata || {},
        responseTimeMs: response.responseTimeMs || 0,
        tokenCount: response.tokenCount || 0,
        costUsd: response.costUsd || 0,
        status: (response.status?.toUpperCase() as any) || 'FAILED',
        error: response.error,
      });

      responses.push(savedResponse as Response);
    }

    // Cache results
    await this.cacheQueryResults(queryId, responses);

    // Update query status
    await this.db.client.query.update({
      where: { id: queryId },
      data: { status: 'COMPLETED' },
    });

    console.log(`✅ Completed parallel queries: ${responses.filter(r => r.status === 'COMPLETED').length}/${models.length} successful`);

    return responses;
  }

  private async executeQuery(
    queryId: string,
    model: LLMModel,
    prompt: string,
    parameters: QueryParameters,
    userApiKeys: Record<string, string>
  ): Promise<Partial<Response>> {
    const provider = this.getProviderForModel(model);
    
    if (!provider) {
      throw new Error(`No provider found for model: ${model}`);
    }

    // Determine which API key to use
    const providerName = provider.getProviderName().toLowerCase();
    const apiKey = userApiKeys[providerName] || this.getSystemApiKey(providerName);

    if (!apiKey) {
      throw new Error(`No API key available for provider: ${providerName}`);
    }

    console.log(`🔄 Querying ${model} via ${provider.getProviderName()}`);

    try {
      const response = await provider.query(model, prompt, parameters, apiKey);
      console.log(`✅ Query completed for ${model} in ${response.responseTimeMs}ms`);
      return response;
    } catch (error) {
      console.error(`❌ Query failed for ${model}:`, error);
      throw error;
    }
  }

  private getSystemApiKey(providerName: string): string | undefined {
    const keyMap: Record<string, string> = {
      'openai': process.env.OPENAI_API_KEY || '',
      'anthropic': process.env.ANTHROPIC_API_KEY || '',
      'google': process.env.GOOGLE_API_KEY || '',
      'cohere': process.env.COHERE_API_KEY || '',
    };

    return keyMap[providerName];
  }

  private async decryptUserApiKeys(encryptedKeys: Record<string, string>): Promise<Record<string, string>> {
    const decryptedKeys: Record<string, string> = {};

    for (const [provider, encryptedKey] of Object.entries(encryptedKeys)) {
      try {
        if (encryptedKey) {
          decryptedKeys[provider] = await this.encryption.decrypt(encryptedKey);
        }
      } catch (error) {
        console.error(`Failed to decrypt API key for ${provider}:`, error);
      }
    }

    return decryptedKeys;
  }

  private async cacheQueryResults(queryId: string, responses: Response[]): Promise<void> {
    try {
      const cacheKey = `query_results:${queryId}`;
      const ttl = parseInt(process.env.RESPONSE_CACHE_TTL || '300'); // 5 minutes default
      
      await this.redis.set(cacheKey, JSON.stringify(responses), ttl);
    } catch (error) {
      console.error('Failed to cache query results:', error);
    }
  }

  public async getCachedQueryResults(queryId: string): Promise<Response[] | null> {
    try {
      const cacheKey = `query_results:${queryId}`;
      const cachedData = await this.redis.get(cacheKey);
      
      return cachedData ? JSON.parse(cachedData) : null;
    } catch (error) {
      console.error('Failed to get cached query results:', error);
      return null;
    }
  }

  public async validateUserApiKey(
    userId: string,
    provider: string,
    apiKey: string
  ): Promise<boolean> {
    const providerInstance = this.providers.get(provider.toLowerCase());
    
    if (!providerInstance) {
      throw new Error(`Unknown provider: ${provider}`);
    }

    return await providerInstance.validateApiKey(apiKey);
  }

  public async updateUserApiKey(
    userId: string,
    provider: string,
    apiKey: string
  ): Promise<void> {
    // Validate the API key first
    const isValid = await this.validateUserApiKey(userId, provider, apiKey);
    
    if (!isValid) {
      throw new Error('Invalid API key');
    }

    // Encrypt the API key
    const encryptedKey = await this.encryption.encrypt(apiKey);

    // Update user's encrypted API keys
    const user = await this.db.client.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new Error('User not found');
    }

    const currentKeys = user.encryptedApiKeys as Record<string, string>;
    const updatedKeys = {
      ...currentKeys,
      [provider.toLowerCase()]: encryptedKey,
    };

    await this.db.client.user.update({
      where: { id: userId },
      data: {
        encryptedApiKeys: updatedKeys,
      },
    });

    console.log(`✅ Updated API key for user ${userId}, provider ${provider}`);
  }

  public async removeUserApiKey(userId: string, provider: string): Promise<void> {
    const user = await this.db.client.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new Error('User not found');
    }

    const currentKeys = user.encryptedApiKeys as Record<string, string>;
    delete currentKeys[provider.toLowerCase()];

    await this.db.client.user.update({
      where: { id: userId },
      data: {
        encryptedApiKeys: currentKeys,
      },
    });

    console.log(`🗑️ Removed API key for user ${userId}, provider ${provider}`);
  }

  public getProviderNames(): string[] {
    return Array.from(this.providers.keys());
  }

  public async getUsageStats(userId: string, days: number = 30): Promise<any> {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const stats = await this.db.client.response.groupBy({
      by: ['modelName'],
      where: {
        query: {
          userId,
          createdAt: {
            gte: startDate,
          },
        },
      },
      _count: {
        id: true,
      },
      _sum: {
        costUsd: true,
        tokenCount: true,
        responseTimeMs: true,
      },
      _avg: {
        responseTimeMs: true,
      },
    });

    return stats.map(stat => ({
      model: stat.modelName,
      queries: stat._count.id,
      totalCost: stat._sum.costUsd?.toNumber() || 0,
      totalTokens: stat._sum.tokenCount || 0,
      totalResponseTime: stat._sum.responseTimeMs || 0,
      avgResponseTime: stat._avg.responseTimeMs || 0,
    }));
  }
}