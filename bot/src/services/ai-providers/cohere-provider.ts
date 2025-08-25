import { CohereApi } from 'cohere-ai';
import { BaseAIProvider, QueryParameters } from './base-provider';
import { AIResponse, AIModel } from '../../types';
import { v4 as uuidv4 } from 'uuid';

export class CohereProvider extends BaseAIProvider {
  private client: CohereApi;
  
  constructor(config: { apiKey: string }) {
    super(config);
    this.client = new CohereApi({
      token: config.apiKey,
      timeout: 30000
    });
  }
  
  get providerName(): string {
    return 'Cohere';
  }
  
  get supportedModels(): AIModel[] {
    return ['command-r-plus', 'command-r'];
  }
  
  async query(params: QueryParameters): Promise<AIResponse> {
    const startTime = Date.now();
    
    try {
      // Prepare the message with system prompt if provided
      let message = params.prompt;
      if (params.systemPrompt) {
        message = `System: ${params.systemPrompt}\n\nHuman: ${params.prompt}`;
      }
      
      const response = await this.withRetry(async () => {
        return this.client.chatStream({
          model: this.mapModelName(params.model),
          message: message,
          temperature: params.temperature,
          maxTokens: params.maxTokens,
          preambleOverride: params.systemPrompt,
          connectors: [] // No web search for consistency
        });
      });
      
      const responseTime = Date.now() - startTime;
      
      // Collect the streamed response
      let fullText = '';
      let finishReason: string | undefined;
      let usage: any = {};
      
      for await (const part of response) {
        if (part.eventType === 'text-generation') {
          fullText += part.text || '';
        } else if (part.eventType === 'stream-end') {
          finishReason = part.finishReason;
          usage = part.response?.meta?.tokens || {};
        }
      }
      
      if (!fullText.trim()) {
        throw new Error('No content in Cohere response');
      }
      
      const tokenCount = usage.outputTokens || this.estimateTokens(fullText);
      const cost = this.calculateCost(
        params.model,
        usage.inputTokens || 0,
        usage.outputTokens || 0
      );
      
      return {
        id: uuidv4(),
        model: params.model,
        content: fullText.trim(),
        responseTime,
        tokenCount,
        cost,
        metadata: {
          finishReason: finishReason || undefined,
          usage: usage.inputTokens ? {
            promptTokens: usage.inputTokens,
            completionTokens: usage.outputTokens,
            totalTokens: usage.inputTokens + usage.outputTokens
          } : undefined
        }
      };
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      // Try non-streaming fallback
      if (error.message?.includes('stream')) {
        try {
          return await this.queryNonStreaming(params, startTime);
        } catch (fallbackError) {
          // Continue with original error handling
        }
      }
      
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
  
  private async queryNonStreaming(params: QueryParameters, startTime: number): Promise<AIResponse> {
    let message = params.prompt;
    if (params.systemPrompt) {
      message = `System: ${params.systemPrompt}\n\nHuman: ${params.prompt}`;
    }
    
    const response = await this.client.chat({
      model: this.mapModelName(params.model),
      message: message,
      temperature: params.temperature,
      maxTokens: params.maxTokens,
      preambleOverride: params.systemPrompt
    });
    
    const responseTime = Date.now() - startTime;
    
    if (!response.text) {
      throw new Error('No text in Cohere response');
    }
    
    const usage = response.meta?.tokens || {};
    const tokenCount = usage.outputTokens || this.estimateTokens(response.text);
    const cost = this.calculateCost(
      params.model,
      usage.inputTokens || 0,
      usage.outputTokens || 0
    );
    
    return {
      id: uuidv4(),
      model: params.model,
      content: response.text,
      responseTime,
      tokenCount,
      cost,
      metadata: {
        finishReason: response.finishReason || undefined,
        usage: usage.inputTokens ? {
          promptTokens: usage.inputTokens,
          completionTokens: usage.outputTokens,
          totalTokens: usage.inputTokens + usage.outputTokens
        } : undefined
      }
    };
  }
  
  private mapModelName(model: AIModel): string {
    const modelMap: Record<string, string> = {
      'command-r-plus': 'command-r-plus',
      'command-r': 'command-r'
    };
    
    return modelMap[model] || model;
  }
  
  private calculateCost(model: AIModel, inputTokens: number, outputTokens: number): number {
    // Cohere pricing as of 2024 (per 1M tokens)
    const pricing: Record<string, { input: number; output: number }> = {
      'command-r-plus': { input: 3.00, output: 15.00 },
      'command-r': { input: 0.50, output: 1.50 }
    };
    
    const modelPricing = pricing[model];
    if (!modelPricing) return 0;
    
    const inputCost = (inputTokens / 1000000) * modelPricing.input;
    const outputCost = (outputTokens / 1000000) * modelPricing.output;
    
    return inputCost + outputCost;
  }
  
  async validateConfig(): Promise<boolean> {
    try {
      const response = await this.client.chat({
        model: 'command-r',
        message: 'Hello',
        maxTokens: 10
      });
      
      return !!response.text;
    } catch (error) {
      return false;
    }
  }
  
  protected handleError(error: any, context: string): Error {
    // Handle Cohere-specific errors
    if (error.statusCode === 401) {
      return new Error('Cohere: Invalid API key');
    } else if (error.statusCode === 429) {
      return new Error('Cohere: Rate limit exceeded');
    } else if (error.statusCode === 400 && error.message?.includes('content')) {
      return new Error('Cohere: Content policy violation');
    } else if (error.statusCode === 500) {
      return new Error('Cohere: Internal server error');
    }
    
    return super.handleError(error, context);
  }
}