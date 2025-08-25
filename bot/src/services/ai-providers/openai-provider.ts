import { OpenAI } from 'openai';
import { BaseAIProvider, QueryParameters } from './base-provider';
import { AIResponse, AIModel } from '../../types';
import { v4 as uuidv4 } from 'uuid';

export class OpenAIProvider extends BaseAIProvider {
  private client: OpenAI;
  
  constructor(config: { apiKey: string; baseUrl?: string }) {
    super(config);
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      timeout: 30000
    });
  }
  
  get providerName(): string {
    return 'OpenAI';
  }
  
  get supportedModels(): AIModel[] {
    return ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo'];
  }
  
  async query(params: QueryParameters): Promise<AIResponse> {
    const startTime = Date.now();
    
    try {
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
      
      if (params.systemPrompt) {
        messages.push({
          role: 'system',
          content: params.systemPrompt
        });
      }
      
      messages.push({
        role: 'user',
        content: params.prompt
      });
      
      const completion = await this.withRetry(async () => {
        return this.client.chat.completions.create({
          model: this.mapModelName(params.model),
          messages,
          temperature: params.temperature,
          max_tokens: params.maxTokens,
          top_p: 1,
          frequency_penalty: 0,
          presence_penalty: 0
        });
      });
      
      const responseTime = Date.now() - startTime;
      const choice = completion.choices[0];
      
      if (!choice?.message?.content) {
        throw new Error('No content in OpenAI response');
      }
      
      const usage = completion.usage;
      const tokenCount = usage?.completion_tokens || this.estimateTokens(choice.message.content);
      const cost = this.calculateCost(params.model, usage?.prompt_tokens || 0, usage?.completion_tokens || 0);
      
      return {
        id: uuidv4(),
        model: params.model,
        content: choice.message.content,
        responseTime,
        tokenCount,
        cost,
        metadata: {
          finishReason: choice.finish_reason || undefined,
          usage: usage ? {
            promptTokens: usage.prompt_tokens,
            completionTokens: usage.completion_tokens,
            totalTokens: usage.total_tokens
          } : undefined
        }
      };
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      return {
        id: uuidv4(),
        model: params.model,
        content: '',
        responseTime,
        tokenCount: 0,
        cost: 0,
        error: this.handleError(error, 'query').message,
        metadata: {}
      };
    }
  }
  
  private mapModelName(model: AIModel): string {
    const modelMap: Record<string, string> = {
      'gpt-4': 'gpt-4',
      'gpt-4-turbo': 'gpt-4-turbo-preview',
      'gpt-3.5-turbo': 'gpt-3.5-turbo'
    };
    
    return modelMap[model] || model;
  }
  
  private calculateCost(model: AIModel, promptTokens: number, completionTokens: number): number {
    // OpenAI pricing as of 2024 (per 1K tokens)
    const pricing: Record<string, { input: number; output: number }> = {
      'gpt-4': { input: 0.03, output: 0.06 },
      'gpt-4-turbo': { input: 0.01, output: 0.03 },
      'gpt-3.5-turbo': { input: 0.0015, output: 0.002 }
    };
    
    const modelPricing = pricing[model];
    if (!modelPricing) return 0;
    
    const inputCost = (promptTokens / 1000) * modelPricing.input;
    const outputCost = (completionTokens / 1000) * modelPricing.output;
    
    return inputCost + outputCost;
  }
  
  async validateConfig(): Promise<boolean> {
    try {
      const response = await this.client.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 5
      });
      
      return !!response.choices[0]?.message?.content;
    } catch (error) {
      return false;
    }
  }
}