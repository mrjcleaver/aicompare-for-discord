import { GoogleGenerativeAI } from '@google/generative-ai';
import { BaseAIProvider, QueryParameters } from './base-provider';
import { AIResponse, AIModel } from '../../types';
import { v4 as uuidv4 } from 'uuid';

export class GoogleProvider extends BaseAIProvider {
  private client: GoogleGenerativeAI;
  
  constructor(config: { apiKey: string }) {
    super(config);
    this.client = new GoogleGenerativeAI(config.apiKey);
  }
  
  get providerName(): string {
    return 'Google';
  }
  
  get supportedModels(): AIModel[] {
    return ['gemini-1.5-pro', 'gemini-1.5-flash'];
  }
  
  async query(params: QueryParameters): Promise<AIResponse> {
    const startTime = Date.now();
    
    try {
      const model = this.client.getGenerativeModel({ 
        model: this.mapModelName(params.model),
        generationConfig: {
          temperature: params.temperature,
          maxOutputTokens: params.maxTokens,
          topP: 0.95,
          topK: 64,
        },
        safetySettings: [
          {
            category: 'HARM_CATEGORY_HARASSMENT',
            threshold: 'BLOCK_MEDIUM_AND_ABOVE',
          },
          {
            category: 'HARM_CATEGORY_HATE_SPEECH',
            threshold: 'BLOCK_MEDIUM_AND_ABOVE',
          },
          {
            category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
            threshold: 'BLOCK_MEDIUM_AND_ABOVE',
          },
          {
            category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
            threshold: 'BLOCK_MEDIUM_AND_ABOVE',
          },
        ],
      });
      
      // Combine system prompt and user prompt if system prompt exists
      let fullPrompt = params.prompt;
      if (params.systemPrompt) {
        fullPrompt = `${params.systemPrompt}\n\nUser: ${params.prompt}`;
      }
      
      const result = await this.withRetry(async () => {
        return model.generateContent(fullPrompt);
      });
      
      const responseTime = Date.now() - startTime;
      
      if (!result.response) {
        throw new Error('No response from Google AI');
      }
      
      const text = result.response.text();
      
      if (!text) {
        // Check if content was blocked
        const promptFeedback = result.response.promptFeedback;
        if (promptFeedback?.blockReason) {
          throw new Error(`Content blocked: ${promptFeedback.blockReason}`);
        }
        throw new Error('No text content in Google AI response');
      }
      
      const tokenCount = result.response.usageMetadata?.candidatesTokenCount || this.estimateTokens(text);
      const cost = this.calculateCost(
        params.model,
        result.response.usageMetadata?.promptTokenCount || 0,
        result.response.usageMetadata?.candidatesTokenCount || 0
      );
      
      return {
        id: uuidv4(),
        model: params.model,
        content: text,
        responseTime,
        tokenCount,
        cost,
        metadata: {
          finishReason: result.response.candidates?.[0]?.finishReason || undefined,
          usage: result.response.usageMetadata ? {
            promptTokens: result.response.usageMetadata.promptTokenCount,
            completionTokens: result.response.usageMetadata.candidatesTokenCount,
            totalTokens: result.response.usageMetadata.totalTokenCount
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
      'gemini-1.5-pro': 'gemini-1.5-pro',
      'gemini-1.5-flash': 'gemini-1.5-flash'
    };
    
    return modelMap[model] || model;
  }
  
  private calculateCost(model: AIModel, inputTokens: number, outputTokens: number): number {
    // Google AI pricing as of 2024 (per 1M tokens)
    const pricing: Record<string, { input: number; output: number }> = {
      'gemini-1.5-pro': { input: 3.50, output: 10.50 },
      'gemini-1.5-flash': { input: 0.35, output: 1.05 }
    };
    
    const modelPricing = pricing[model];
    if (!modelPricing) return 0;
    
    const inputCost = (inputTokens / 1000000) * modelPricing.input;
    const outputCost = (outputTokens / 1000000) * modelPricing.output;
    
    return inputCost + outputCost;
  }
  
  async validateConfig(): Promise<boolean> {
    try {
      const model = this.client.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const result = await model.generateContent('Hello');
      
      return !!result.response.text();
    } catch (error) {
      return false;
    }
  }
  
  protected handleError(error: any, context: string): Error {
    // Handle Google AI specific errors
    if (error.message?.includes('API_KEY_INVALID')) {
      return new Error('Google AI: Invalid API key');
    } else if (error.message?.includes('QUOTA_EXCEEDED')) {
      return new Error('Google AI: Quota exceeded');
    } else if (error.message?.includes('RATE_LIMIT_EXCEEDED')) {
      return new Error('Google AI: Rate limit exceeded');
    } else if (error.message?.includes('MODEL_NOT_FOUND')) {
      return new Error('Google AI: Model not found or not available');
    } else if (error.message?.includes('CONTENT_BLOCKED')) {
      return new Error('Google AI: Content blocked by safety filters');
    } else if (error.message?.includes('RECITATION')) {
      return new Error('Google AI: Content flagged for potential copyright issues');
    }
    
    return super.handleError(error, context);
  }
}