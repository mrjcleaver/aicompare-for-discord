import OpenAI from 'openai';
import { BaseLLMProvider } from './base';
import { LLMModel, QueryParameters, Response } from '../../types';

export class OpenAIProvider extends BaseLLMProvider {
  protected providerName = 'OpenAI';
  protected supportedModels: LLMModel[] = [
    'gpt-4',
    'gpt-4-turbo',
    'gpt-3.5-turbo',
  ];

  private readonly costPer1KTokens: Record<string, { input: number; output: number }> = {
    'gpt-4': { input: 0.03, output: 0.06 },
    'gpt-4-turbo': { input: 0.01, output: 0.03 },
    'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
  };

  async query(
    model: LLMModel,
    prompt: string,
    parameters: QueryParameters,
    apiKey?: string
  ): Promise<Partial<Response>> {
    const startTime = Date.now();

    try {
      const openai = new OpenAI({
        apiKey: apiKey || process.env.OPENAI_API_KEY,
      });

      const normalizedParams = this.normalizeParameters(parameters);
      
      const messages = [
        ...(parameters.systemPrompt ? [{ role: 'system' as const, content: parameters.systemPrompt }] : []),
        { role: 'user' as const, content: prompt },
      ];

      const response = await this.handleTimeout(
        openai.chat.completions.create({
          model: model as string,
          messages,
          temperature: normalizedParams.temperature,
          max_tokens: normalizedParams.max_tokens,
          top_p: normalizedParams.top_p,
          stream: false,
        }),
        parseInt(process.env.QUERY_TIMEOUT_MS || '30000')
      );

      const responseTime = Date.now() - startTime;
      const usage = response.usage;
      const cost = this.estimateCost(
        model,
        usage?.prompt_tokens || 0,
        usage?.completion_tokens || 0
      );

      return {
        status: 'completed',
        content: response.choices[0]?.message?.content || '',
        responseTimeMs: responseTime,
        tokenCount: usage?.total_tokens || 0,
        costUsd: cost,
        metadata: {
          model: response.model,
          version: response.model,
          finishReason: response.choices[0]?.finish_reason || 'unknown',
          usage: {
            promptTokens: usage?.prompt_tokens || 0,
            completionTokens: usage?.completion_tokens || 0,
            totalTokens: usage?.total_tokens || 0,
          },
        },
      };
    } catch (error: any) {
      console.error(`OpenAI API error for ${model}:`, error);
      
      const responseTime = Date.now() - startTime;
      const errorResponse = this.createErrorResponse(error);
      errorResponse.responseTimeMs = responseTime;
      errorResponse.metadata!.model = model;
      
      return errorResponse;
    }
  }

  async validateApiKey(apiKey: string): Promise<boolean> {
    try {
      const openai = new OpenAI({ apiKey });
      
      // Make a minimal request to validate the key
      await openai.models.list();
      return true;
    } catch (error) {
      console.error('OpenAI API key validation failed:', error);
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