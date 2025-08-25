import { CohereApi } from 'cohere-ai';
import { BaseLLMProvider } from './base';
import { LLMModel, QueryParameters, Response } from '../../types';

export class CohereProvider extends BaseLLMProvider {
  protected providerName = 'Cohere';
  protected supportedModels: LLMModel[] = [
    'command-r-plus',
    'command-r',
  ];

  private readonly costPer1KTokens: Record<string, { input: number; output: number }> = {
    'command-r-plus': { input: 0.003, output: 0.015 },
    'command-r': { input: 0.0005, output: 0.0015 },
  };

  private mapModelName(model: LLMModel): string {
    const modelMap: Record<LLMModel, string> = {
      'command-r-plus': 'command-r-plus',
      'command-r': 'command-r',
      // Add other models as needed
      'gpt-4': '',
      'gpt-4-turbo': '',
      'gpt-3.5-turbo': '',
      'claude-3.5-sonnet': '',
      'claude-3-haiku': '',
      'gemini-1.5-pro': '',
      'gemini-1.5-flash': '',
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
      const cohere = new CohereApi(apiKey || process.env.COHERE_API_KEY || '');

      const normalizedParams = this.normalizeParameters(parameters);
      const cohereModel = this.mapModelName(model);

      // Build the message with system prompt if provided
      const message = parameters.systemPrompt 
        ? `${parameters.systemPrompt}\n\nHuman: ${prompt}\n\nAssistant:`
        : prompt;

      const response = await this.handleTimeout(
        cohere.generate({
          model: cohereModel,
          prompt: message,
          maxTokens: normalizedParams.max_tokens,
          temperature: normalizedParams.temperature,
          p: normalizedParams.top_p,
          k: normalizedParams.top_k,
          stopSequences: ['Human:', '\n\nHuman:'],
        }),
        parseInt(process.env.QUERY_TIMEOUT_MS || '30000')
      );

      const responseTime = Date.now() - startTime;
      const generation = response.generations?.[0];
      
      if (!generation) {
        throw new Error('No generation received from Cohere');
      }

      const cost = this.estimateCost(
        model,
        generation.tokenLikelihood?.length || 0,
        generation.tokenLikelihood?.length || 0
      );

      return {
        status: 'completed',
        content: generation.text.trim(),
        responseTimeMs: responseTime,
        tokenCount: generation.tokenLikelihood?.length || 0,
        costUsd: cost,
        metadata: {
          model: cohereModel,
          version: cohereModel,
          finishReason: generation.finishReason || 'unknown',
          usage: {
            promptTokens: 0, // Cohere doesn't provide detailed token counts
            completionTokens: generation.tokenLikelihood?.length || 0,
            totalTokens: generation.tokenLikelihood?.length || 0,
          },
          safety: {
            blocked: false,
            categories: [],
          },
        },
      };
    } catch (error: any) {
      console.error(`Cohere API error for ${model}:`, error);
      
      const responseTime = Date.now() - startTime;
      const errorResponse = this.createErrorResponse(error);
      errorResponse.responseTimeMs = responseTime;
      errorResponse.metadata!.model = model;
      
      return errorResponse;
    }
  }

  async validateApiKey(apiKey: string): Promise<boolean> {
    try {
      const cohere = new CohereApi(apiKey);
      
      // Make a minimal request to validate the key
      await cohere.generate({
        model: 'command-r',
        prompt: 'Hi',
        maxTokens: 1,
      });
      return true;
    } catch (error) {
      console.error('Cohere API key validation failed:', error);
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