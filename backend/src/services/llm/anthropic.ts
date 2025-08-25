import Anthropic from '@anthropic-ai/sdk';
import { BaseLLMProvider } from './base';
import { LLMModel, QueryParameters, Response } from '../../types';

export class AnthropicProvider extends BaseLLMProvider {
  protected providerName = 'Anthropic';
  protected supportedModels: LLMModel[] = [
    'claude-3.5-sonnet',
    'claude-3-haiku',
  ];

  private readonly costPer1KTokens: Record<string, { input: number; output: number }> = {
    'claude-3.5-sonnet': { input: 0.003, output: 0.015 },
    'claude-3-haiku': { input: 0.00025, output: 0.00125 },
  };

  private mapModelName(model: LLMModel): string {
    const modelMap: Record<LLMModel, string> = {
      'claude-3.5-sonnet': 'claude-3-5-sonnet-20241022',
      'claude-3-haiku': 'claude-3-haiku-20240307',
      // Add other models as needed
      'gpt-4': '',
      'gpt-4-turbo': '',
      'gpt-3.5-turbo': '',
      'gemini-1.5-pro': '',
      'gemini-1.5-flash': '',
      'command-r-plus': '',
      'command-r': '',
    };
    return modelMap[model] || model;
  }

  async query(
    model: LLMModel,
    prompt: string,
    parameters: QueryParameters,
    apiKey?: string
  ): Promise<Partial<Response>> {
    const startTime = Date.now();

    try {
      const anthropic = new Anthropic({
        apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
      });

      const normalizedParams = this.normalizeParameters(parameters);
      const anthropicModel = this.mapModelName(model);

      const messages = [
        { role: 'user' as const, content: prompt },
      ];

      const response = await this.handleTimeout(
        anthropic.messages.create({
          model: anthropicModel,
          max_tokens: normalizedParams.max_tokens || 1000,
          temperature: normalizedParams.temperature,
          top_p: normalizedParams.top_p,
          system: parameters.systemPrompt,
          messages,
        }),
        parseInt(process.env.QUERY_TIMEOUT_MS || '30000')
      );

      const responseTime = Date.now() - startTime;
      const usage = response.usage;
      const cost = this.estimateCost(
        model,
        usage.input_tokens,
        usage.output_tokens
      );

      const content = response.content
        .filter(block => block.type === 'text')
        .map(block => 'text' in block ? block.text : '')
        .join('');

      return {
        status: 'completed',
        content,
        responseTimeMs: responseTime,
        tokenCount: usage.input_tokens + usage.output_tokens,
        costUsd: cost,
        metadata: {
          model: anthropicModel,
          version: anthropicModel,
          finishReason: response.stop_reason || 'unknown',
          usage: {
            promptTokens: usage.input_tokens,
            completionTokens: usage.output_tokens,
            totalTokens: usage.input_tokens + usage.output_tokens,
          },
          safety: {
            blocked: false,
            categories: [],
          },
        },
      };
    } catch (error: any) {
      console.error(`Anthropic API error for ${model}:`, error);
      
      const responseTime = Date.now() - startTime;
      const errorResponse = this.createErrorResponse(error);
      errorResponse.responseTimeMs = responseTime;
      errorResponse.metadata!.model = model;
      
      return errorResponse;
    }
  }

  async validateApiKey(apiKey: string): Promise<boolean> {
    try {
      const anthropic = new Anthropic({ apiKey });
      
      // Make a minimal request to validate the key
      await anthropic.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'Hi' }],
      });
      return true;
    } catch (error) {
      console.error('Anthropic API key validation failed:', error);
      return false;
    }
  }

  estimateCost(model: LLMModel, inputTokens: number, outputTokens: number): number {
    const costs = this.costPer1KTokens[model];
    if (!costs) return 0;

    const inputCost = (inputTokens / 1000) * costs.input;
    const outputCost = (outputTokens / 1000) * costs.output;
    
    return Math.round((inputCost + outputCost) * 1000000) / 1000000; // Round to 6 decimal places
  }
}