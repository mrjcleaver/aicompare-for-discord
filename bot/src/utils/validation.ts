import { AIModel, BotError } from '../types';
import { constants, modelConfigs } from '../config';

export class ValidationUtils {
  
  /**
   * Validate prompt text
   */
  static validatePrompt(prompt: string): void {
    if (!prompt || prompt.trim().length === 0) {
      throw new ValidationError('Prompt cannot be empty');
    }
    
    if (prompt.length > constants.MAX_PROMPT_LENGTH) {
      throw new ValidationError(`Prompt too long. Maximum ${constants.MAX_PROMPT_LENGTH} characters allowed.`);
    }

    // Check for potential injection attempts or unsafe content
    const suspiciousPatterns = [
      /system\s*:/i,
      /ignore\s+previous\s+instructions/i,
      /act\s+as\s+if/i,
      /pretend\s+you\s+are/i
    ];

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(prompt)) {
        throw new ValidationError('Prompt contains potentially unsafe content');
      }
    }
  }

  /**
   * Validate selected models
   */
  static validateModels(models: string[]): AIModel[] {
    if (!models || models.length === 0) {
      throw new ValidationError('At least one model must be selected');
    }

    if (models.length > constants.MAX_CONCURRENT_QUERIES) {
      throw new ValidationError(`Maximum ${constants.MAX_CONCURRENT_QUERIES} models allowed per comparison`);
    }

    const validModels: AIModel[] = [];
    const availableModels = Object.keys(modelConfigs);

    for (const model of models) {
      if (!availableModels.includes(model)) {
        throw new ValidationError(`Invalid model: ${model}`);
      }
      validModels.push(model as AIModel);
    }

    // Remove duplicates
    return [...new Set(validModels)];
  }

  /**
   * Validate temperature parameter
   */
  static validateTemperature(temperature: number): number {
    if (temperature < 0 || temperature > 1) {
      throw new ValidationError('Temperature must be between 0.0 and 1.0');
    }
    return Number(temperature.toFixed(2));
  }

  /**
   * Validate max tokens parameter
   */
  static validateMaxTokens(maxTokens: number, models: AIModel[]): number {
    if (maxTokens < 1) {
      throw new ValidationError('Max tokens must be at least 1');
    }

    // Check against model limits
    for (const model of models) {
      const config = modelConfigs[model];
      if (config && maxTokens > config.maxTokens) {
        throw new ValidationError(`Max tokens ${maxTokens} exceeds limit for ${config.displayName} (${config.maxTokens})`);
      }
    }

    return maxTokens;
  }

  /**
   * Validate user permissions
   */
  static validateUserPermissions(userId: string, guildId: string): void {
    if (!userId || userId.length === 0) {
      throw new ValidationError('Invalid user ID');
    }

    if (!guildId || guildId.length === 0) {
      throw new ValidationError('Invalid guild ID');
    }

    // Additional permission checks would go here
    // e.g., banned users, rate limits, etc.
  }

  /**
   * Validate vote input
   */
  static validateVote(voteType: string, value?: number): { type: 'thumbs_up' | 'thumbs_down' | 'star_rating', value: number } {
    const validVoteTypes = ['thumbs_up', 'thumbs_down', 'star_rating'];
    
    if (!validVoteTypes.includes(voteType)) {
      throw new ValidationError(`Invalid vote type: ${voteType}`);
    }

    let voteValue = 1;
    
    if (voteType === 'star_rating') {
      if (value === undefined || value < 1 || value > 5) {
        throw new ValidationError('Star rating must be between 1 and 5');
      }
      voteValue = value;
    } else if (voteType === 'thumbs_down') {
      voteValue = -1;
    }

    return {
      type: voteType as 'thumbs_up' | 'thumbs_down' | 'star_rating',
      value: voteValue
    };
  }

  /**
   * Sanitize text for display
   */
  static sanitizeText(text: string): string {
    // Remove markdown that could break Discord formatting
    return text
      .replace(/```/g, '`‌`‌`') // Add zero-width non-joiner to break code blocks
      .replace(/~~~/g, '~‌~‌~')
      .replace(/@everyone/gi, '@‌everyone')
      .replace(/@here/gi, '@‌here')
      .substring(0, constants.DISCORD_LIMITS.EMBED_FIELD_VALUE);
  }

  /**
   * Validate Discord interaction data
   */
  static validateInteractionData(customId: string): { type: string, queryId: string, data?: string } {
    const parts = customId.split('_');
    
    if (parts.length < 2) {
      throw new ValidationError('Invalid interaction data format');
    }

    const type = parts[0];
    const queryId = parts[1];

    // Validate UUID format for queryId
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(queryId)) {
      throw new ValidationError('Invalid query ID format');
    }

    return {
      type,
      queryId,
      data: parts.slice(2).join('_')
    };
  }

  /**
   * Check rate limits
   */
  static checkRateLimit(userId: string, rateLimitMap: Map<string, { count: number, resetTime: number }>): boolean {
    const now = Date.now();
    const userLimit = rateLimitMap.get(userId);
    
    if (!userLimit) {
      rateLimitMap.set(userId, { count: 1, resetTime: now + constants.USER_COOLDOWN_MS });
      return true;
    }

    if (now > userLimit.resetTime) {
      rateLimitMap.set(userId, { count: 1, resetTime: now + constants.USER_COOLDOWN_MS });
      return true;
    }

    if (userLimit.count >= 10) { // Max 10 requests per cooldown period
      return false;
    }

    userLimit.count++;
    return true;
  }
}

export class ValidationError extends Error implements BotError {
  public readonly code = 'VALIDATION_ERROR';
  public readonly timestamp = new Date();

  constructor(message: string, public context?: string, public userId?: string, public guildId?: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export default ValidationUtils;