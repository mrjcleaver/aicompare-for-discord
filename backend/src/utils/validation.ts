import Joi from 'joi';
import { LLMModel, QueryParameters } from '../types';

// Common validation schemas
export const commonSchemas = {
  uuid: Joi.string().uuid().required(),
  discordId: Joi.string().pattern(/^\d+$/).required(),
  username: Joi.string().min(1).max(100).required(),
  
  llmModel: Joi.string().valid(
    'gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo',
    'claude-3.5-sonnet', 'claude-3-haiku',
    'gemini-1.5-pro', 'gemini-1.5-flash',
    'command-r-plus', 'command-r'
  ),
  
  queryParameters: Joi.object({
    temperature: Joi.number().min(0).max(2).optional(),
    maxTokens: Joi.number().min(1).max(4000).optional(),
    systemPrompt: Joi.string().max(1000).optional(),
    topP: Joi.number().min(0).max(1).optional(),
    topK: Joi.number().min(1).max(100).optional(),
  }).optional(),
};

// Validation functions
export class ValidationUtils {
  static validateLLMModel(model: string): model is LLMModel {
    const validModels: LLMModel[] = [
      'gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo',
      'claude-3.5-sonnet', 'claude-3-haiku',
      'gemini-1.5-pro', 'gemini-1.5-flash',
      'command-r-plus', 'command-r'
    ];
    return validModels.includes(model as LLMModel);
  }

  static validateQueryParameters(params: any): QueryParameters | null {
    const schema = commonSchemas.queryParameters;
    const { error, value } = schema.validate(params);
    
    if (error) {
      throw new Error(`Invalid query parameters: ${error.details[0].message}`);
    }
    
    return value as QueryParameters;
  }

  static validateDiscordId(id: string): boolean {
    return /^\d{17,19}$/.test(id);
  }

  static validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  static sanitizeString(str: string, maxLength: number = 1000): string {
    if (typeof str !== 'string') return '';
    
    return str
      .trim()
      .substring(0, maxLength)
      .replace(/[\x00-\x1F\x7F-\x9F]/g, '') // Remove control characters
      .replace(/[<>]/g, ''); // Remove potential HTML tags
  }

  static validateApiKey(provider: string, apiKey: string): boolean {
    if (!apiKey || typeof apiKey !== 'string') return false;

    switch (provider.toLowerCase()) {
      case 'openai':
        return /^sk-[a-zA-Z0-9]{48,}$/.test(apiKey);
      case 'anthropic':
        return /^sk-ant-[a-zA-Z0-9-]{95,}$/.test(apiKey);
      case 'google':
        return /^[a-zA-Z0-9-_]{35,}$/.test(apiKey);
      case 'cohere':
        return /^[a-zA-Z0-9-_]{40,}$/.test(apiKey);
      default:
        return apiKey.length >= 10;
    }
  }

  static validatePaginationParams(params: any): {
    limit: number;
    offset: number;
    page: number;
  } {
    const limit = Math.min(Math.max(parseInt(params.limit) || 10, 1), 100);
    const page = Math.max(parseInt(params.page) || 1, 1);
    const offset = (page - 1) * limit;

    return { limit, offset, page };
  }

  static validateSortParams(params: any, allowedFields: string[]): {
    sortBy: string;
    sortOrder: 'asc' | 'desc';
  } {
    const sortBy = allowedFields.includes(params.sortBy) ? params.sortBy : allowedFields[0];
    const sortOrder = params.sortOrder === 'asc' ? 'asc' : 'desc';

    return { sortBy, sortOrder };
  }

  static validateDateRange(startDate?: string, endDate?: string): {
    startDate: Date | undefined;
    endDate: Date | undefined;
  } {
    let start: Date | undefined;
    let end: Date | undefined;

    if (startDate) {
      start = new Date(startDate);
      if (isNaN(start.getTime())) {
        throw new Error('Invalid start date format');
      }
    }

    if (endDate) {
      end = new Date(endDate);
      if (isNaN(end.getTime())) {
        throw new Error('Invalid end date format');
      }
    }

    if (start && end && start > end) {
      throw new Error('Start date must be before end date');
    }

    return { startDate: start, endDate: end };
  }
}

// Custom Joi extensions
export const extendedJoi = Joi.extend({
  type: 'discordId',
  base: Joi.string(),
  messages: {
    'discordId.invalid': 'must be a valid Discord ID',
  },
  rules: {
    valid: {
      validate(value, helpers) {
        if (!ValidationUtils.validateDiscordId(value)) {
          return helpers.error('discordId.invalid');
        }
        return value;
      },
    },
  },
});

// Request validation middleware factory
export const validateRequest = (schema: Joi.ObjectSchema) => {
  return (req: any, res: any, next: any) => {
    const { error, value } = schema.validate(req.body);
    
    if (error) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: error.details[0].message,
          details: error.details,
        },
      });
    }
    
    req.body = value;
    next();
  };
};

// Query parameter validation middleware factory
export const validateQuery = (schema: Joi.ObjectSchema) => {
  return (req: any, res: any, next: any) => {
    const { error, value } = schema.validate(req.query);
    
    if (error) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: error.details[0].message,
          details: error.details,
        },
      });
    }
    
    req.query = value;
    next();
  };
};

// File upload validation
export const validateFileUpload = (file: any, allowedTypes: string[], maxSize: number) => {
  if (!file) {
    throw new Error('No file provided');
  }

  if (!allowedTypes.includes(file.mimetype)) {
    throw new Error(`File type not allowed. Allowed types: ${allowedTypes.join(', ')}`);
  }

  if (file.size > maxSize) {
    throw new Error(`File size too large. Maximum size: ${maxSize} bytes`);
  }

  return true;
};