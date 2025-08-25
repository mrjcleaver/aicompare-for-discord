import Anthropic from '@anthropic-ai/sdk';
import { BaseAIProvider, QueryParameters } from './base-provider';
import { AIResponse, AIModel } from '../../types';
import { v4 as uuidv4 } from 'uuid';

export class AnthropicProvider extends BaseAIProvider {
  private client: Anthropic;
  
  constructor(config: { apiKey: string; baseUrl?: string }) {
    super(config);
    this.client = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      timeout: 30000
    });
  }
  
  get providerName(): string {
    return 'Anthropic';
  }
  
  get supportedModels(): AIModel[] {
    return ['claude-3.5-sonnet', 'claude-3-haiku'];
  }
  
  async query(params: QueryParameters): Promise<AIResponse> {
    const startTime = Date.now();
    
    try {
      const message = await this.withRetry(async () => {
        return this.client.messages.create({
          model: this.mapModelName(params.model),
          max_tokens: params.maxTokens,
          temperature: params.temperature,
          system: params.systemPrompt,
          messages: [{
            role: 'user',
            content: params.prompt
          }]
        });
      });
      
      const responseTime = Date.now() - startTime;
      
      if (!message.content || message.content.length === 0) {
        throw new Error('No content in Anthropic response');
      }
      
      // Extract text content from the response
      const textContent = message.content
        .filter((block: any) => block.type === 'text')
        .map((block: any) => block.text)
        .join('');
      
      if (!textContent) {
        throw new Error('No text content in Anthropic response');
      }
      
      const tokenCount = message.usage?.output_tokens || this.estimateTokens(textContent);
      const cost = this.calculateCost(
        params.model, 
        message.usage?.input_tokens || 0, 
        message.usage?.output_tokens || 0
      );
      
      return {
        id: uuidv4(),
        model: params.model,
        content: textContent,
        responseTime,
        tokenCount,
        cost,
        metadata: {
          finishReason: message.stop_reason || undefined,
          usage: message.usage ? {
            promptTokens: message.usage.input_tokens,
            completionTokens: message.usage.output_tokens,
            totalTokens: message.usage.input_tokens + message.usage.output_tokens
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
      'claude-3.5-sonnet': 'claude-3-5-sonnet-20240620',
      'claude-3-haiku': 'claude-3-haiku-20240307'
    };
    
    return modelMap[model] || model;
  }
  
  private calculateCost(model: AIModel, inputTokens: number, outputTokens: number): number {
    // Anthropic pricing as of 2024 (per 1M tokens)
    const pricing: Record<string, { input: number; output: number }> = {
      'claude-3.5-sonnet': { input: 3.00, output: 15.00 },
      'claude-3-haiku': { input: 0.25, output: 1.25 }
    };
    
    const modelPricing = pricing[model];
    if (!modelPricing) return 0;
    
    const inputCost = (inputTokens / 1000000) * modelPricing.input;
    const outputCost = (outputTokens / 1000000) * modelPricing.output;
    
    return inputCost + outputCost;
  }
  
  async validateConfig(): Promise<boolean> {
    try {
      const response = await this.client.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hello' }]
      });
      
      return response.content.length > 0;
    } catch (error) {
      return false;
    }
  }
  
  protected handleError(error: any, context: string): Error {
    // Handle Anthropic-specific errors
    if (error.error?.type === 'invalid_request_error') {
      return new Error(`Anthropic: Invalid request - ${error.error.message}`);
    } else if (error.error?.type === 'authentication_error') {
      return new Error('Anthropic: Invalid API key');
    } else if (error.error?.type === 'permission_error') {
      return new Error('Anthropic: Permission denied');
    } else if (error.error?.type === 'rate_limit_error') {
      return new Error('Anthropic: Rate limit exceeded');
    } else if (error.error?.type === 'api_error') {
      return new Error(`Anthropic: API error - ${error.error.message}`);
    } else if (error.error?.type === 'overloaded_error') {
      return new Error('Anthropic: Service overloaded, please try again');
    }
    
    return super.handleError(error, context);
  }
}