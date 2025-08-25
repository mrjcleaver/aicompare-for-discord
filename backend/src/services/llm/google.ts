import { GoogleGenerativeAI } from '@google/generative-ai';
import { BaseLLMProvider } from './base';
import { LLMModel, QueryParameters, Response } from '../../types';

export class GoogleProvider extends BaseLLMProvider {
  protected providerName = 'Google';
  protected supportedModels: LLMModel[] = [
    'gemini-1.5-pro',
    'gemini-1.5-flash',
  ];

  private readonly costPer1KTokens: Record<string, { input: number; output: number }> = {
    'gemini-1.5-pro': { input: 0.0035, output: 0.0105 },
    'gemini-1.5-flash': { input: 0.00035, output: 0.00105 },
  };

  private mapModelName(model: LLMModel): string {
    const modelMap: Record<LLMModel, string> = {
      'gemini-1.5-pro': 'gemini-1.5-pro',
      'gemini-1.5-flash': 'gemini-1.5-flash',
      // Add other models as needed
      'gpt-4': '',
      'gpt-4-turbo': '',
      'gpt-3.5-turbo': '',
      'claude-3.5-sonnet': '',
      'claude-3-haiku': '',
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
      const genAI = new GoogleGenerativeAI(
        apiKey || process.env.GOOGLE_API_KEY || ''
      );

      const normalizedParams = this.normalizeParameters(parameters);
      const googleModel = this.mapModelName(model);

      const generativeModel = genAI.getGenerativeModel({ 
        model: googleModel,
        generationConfig: {
          temperature: normalizedParams.temperature,
          topP: normalizedParams.top_p,
          topK: normalizedParams.top_k,
          maxOutputTokens: normalizedParams.max_tokens,
        },
      });

      // Combine system prompt with user prompt
      const fullPrompt = parameters.systemPrompt 
        ? `${parameters.systemPrompt}\n\nUser: ${prompt}`
        : prompt;

      const result = await this.handleTimeout(
        generativeModel.generateContent(fullPrompt),
        parseInt(process.env.QUERY_TIMEOUT_MS || '30000')
      );

      const responseTime = Date.now() - startTime;
      const response = result.response;
      const text = response.text();
      
      // Google doesn't provide detailed usage info in the free version
      const estimatedTokens = Math.ceil(text.length / 4); // Rough estimate
      const cost = this.estimateCost(model, estimatedTokens, estimatedTokens);

      return {
        status: 'completed',
        content: text,
        responseTimeMs: responseTime,
        tokenCount: estimatedTokens * 2, // Input + output estimate
        costUsd: cost,
        metadata: {
          model: googleModel,
          version: googleModel,
          finishReason: response.candidates?.[0]?.finishReason || 'unknown',
          usage: {
            promptTokens: estimatedTokens,
            completionTokens: estimatedTokens,
            totalTokens: estimatedTokens * 2,
          },
          safety: {
            blocked: false,
            categories: response.candidates?.[0]?.safetyRatings?.map(r => r.category) || [],
          },
        },
      };
    } catch (error: any) {
      console.error(`Google AI API error for ${model}:`, error);
      
      const responseTime = Date.now() - startTime;
      const errorResponse = this.createErrorResponse(error);
      errorResponse.responseTimeMs = responseTime;
      errorResponse.metadata!.model = model;
      
      return errorResponse;
    }
  }

  async validateApiKey(apiKey: string): Promise<boolean> {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      
      // Make a minimal request to validate the key
      await model.generateContent('Hi');
      return true;
    } catch (error) {
      console.error('Google AI API key validation failed:', error);
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