import { LLMModel, QueryParameters, Response, ResponseMetadata } from '../../types';

export abstract class BaseLLMProvider {
  protected abstract providerName: string;
  protected abstract supportedModels: LLMModel[];

  abstract query(
    model: LLMModel,
    prompt: string,
    parameters: QueryParameters,
    apiKey?: string
  ): Promise<Partial<Response>>;

  abstract validateApiKey(apiKey: string): Promise<boolean>;

  abstract estimateCost(model: LLMModel, inputTokens: number, outputTokens: number): number;

  public getSupportedModels(): LLMModel[] {
    return this.supportedModels;
  }

  public getProviderName(): string {
    return this.providerName;
  }

  protected handleTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number = 30000
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('Request timeout')), timeoutMs)
      ),
    ]);
  }

  protected createErrorResponse(error: any): Partial<Response> {
    return {
      status: 'failed',
      error: error.message || 'Unknown error occurred',
      content: '',
      responseTimeMs: 0,
      tokenCount: 0,
      costUsd: 0,
      metadata: {
        model: '',
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

  protected normalizeParameters(parameters: QueryParameters): Record<string, any> {
    const normalized: Record<string, any> = {};

    if (parameters.temperature !== undefined) {
      normalized.temperature = Math.max(0, Math.min(2, parameters.temperature));
    }

    if (parameters.maxTokens !== undefined) {
      normalized.max_tokens = Math.max(1, Math.min(4000, parameters.maxTokens));
    }

    if (parameters.topP !== undefined) {
      normalized.top_p = Math.max(0, Math.min(1, parameters.topP));
    }

    if (parameters.topK !== undefined) {
      normalized.top_k = Math.max(1, Math.min(100, parameters.topK));
    }

    return normalized;
  }
}