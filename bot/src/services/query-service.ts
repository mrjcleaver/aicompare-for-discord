import { QueryRequest, ComparisonResult, AIResponse, SimilarityMetrics, PaginatedResponse } from '../types';
import { DatabaseService } from './database';
import { RedisService } from './redis';
import { aiManager } from './ai-manager';
import { v4 as uuidv4 } from 'uuid';
import { dbLogger, aiLogger } from '../utils/logger';

export class QueryService {
  
  async createQuery(request: QueryRequest): Promise<string> {
    const queryId = uuidv4();
    
    try {
      // Get or create user
      let user = await DatabaseService.getUserByDiscordId(request.userId);
      if (!user) {
        user = await DatabaseService.createUser({
          discordId: request.userId,
          username: 'Discord User' // Will be updated when we get the actual username
        });
      }

      // Get or create team if guild ID provided
      let team = null;
      if (request.guildId && request.guildId !== 'dm') {
        team = await DatabaseService.getTeamByGuildId(request.guildId);
        if (!team) {
          team = await DatabaseService.createOrUpdateTeam({
            discordGuildId: request.guildId,
            name: 'Discord Server' // Will be updated when we get the actual name
          });
        }
      }

      // Create query record
      const queryData = {
        userId: user.id,
        teamId: team?.id,
        channelId: request.channelId,
        messageId: request.messageId,
        prompt: request.prompt,
        parameters: {
          models: request.models,
          temperature: request.temperature,
          maxTokens: request.maxTokens,
          systemPrompt: request.systemPrompt
        },
        modelsRequested: request.models
      };

      const query = await DatabaseService.createQuery(queryData);
      
      // Queue the AI processing job
      await this.processAIQuery(query.id, request);
      
      dbLogger.info(`Query ${query.id} created and queued for processing`, {
        userId: request.userId,
        modelsCount: request.models.length
      });

      return query.id;
    } catch (error) {
      dbLogger.error('Failed to create query:', {
        error: error.message,
        userId: request.userId,
        guildId: request.guildId
      });
      throw error;
    }
  }

  async processAIQuery(queryId: string, request: QueryRequest): Promise<void> {
    try {
      // Update query status to processing
      await DatabaseService.updateQueryStatus(queryId, 'processing');

      // Execute AI queries in parallel
      aiLogger.info(`Starting parallel AI queries for ${queryId}`, {
        models: request.models
      });

      const responses = await aiManager.queryModels(request.models, {
        prompt: request.prompt,
        temperature: request.temperature || 0.7,
        maxTokens: request.maxTokens || 1000,
        systemPrompt: request.systemPrompt
      });

      // Save responses to database
      const savedResponses = [];
      for (const response of responses) {
        const savedResponse = await DatabaseService.saveResponse({
          queryId,
          modelName: response.model,
          provider: this.getProviderForModel(response.model),
          content: response.content,
          metadata: response.metadata,
          responseTime: response.responseTime,
          tokenCount: response.tokenCount,
          estimatedCost: response.cost,
          errorMessage: response.error
        });
        savedResponses.push(savedResponse);
      }

      // Calculate similarity metrics if we have successful responses
      const successfulResponses = responses.filter(r => !r.error && r.content);
      if (successfulResponses.length >= 2) {
        const metrics = await this.calculateSimilarityMetrics(successfulResponses);
        await DatabaseService.saveSimilarityMetrics({
          queryId,
          ...metrics
        });
      }

      // Update query status to completed
      await DatabaseService.updateQueryStatus(queryId, 'completed');

      // Cache the complete result
      const comparisonResult = await this.getComparisonResult(queryId);
      await RedisService.cacheQueryResult(queryId, comparisonResult, 3600); // Cache for 1 hour

      aiLogger.info(`Query ${queryId} completed successfully`, {
        responsesCount: responses.length,
        successfulCount: successfulResponses.length
      });

      // Trigger notification (this would be handled by a separate notification service)
      await this.notifyQueryCompletion(queryId, comparisonResult);

    } catch (error) {
      aiLogger.error(`Failed to process query ${queryId}:`, error);
      await DatabaseService.updateQueryStatus(queryId, 'failed', error.message);
    }
  }

  async getComparisonResult(queryId: string): Promise<ComparisonResult | null> {
    try {
      // Try to get from cache first
      const cached = await RedisService.getCachedQueryResult(queryId);
      if (cached) {
        return cached;
      }

      // Get from database
      const query = await DatabaseService.getQueryById(queryId);
      if (!query) return null;

      const responses = await DatabaseService.getResponsesByQueryId(queryId);
      const votes = await DatabaseService.getVotesByQueryId(queryId);
      const metrics = await DatabaseService.getSimilarityMetricsByQueryId(queryId);

      // Transform database responses to AIResponse format
      const aiResponses: AIResponse[] = responses.map(r => ({
        id: r.id,
        model: r.model_name,
        content: r.content || '',
        responseTime: r.response_time_ms,
        tokenCount: r.token_count,
        cost: parseFloat(r.estimated_cost || '0'),
        error: r.error_message || undefined,
        metadata: r.metadata || {}
      }));

      // Aggregate votes
      const aggregatedVotes = this.aggregateVotes(votes);

      // Build similarity metrics
      const similarityMetrics: SimilarityMetrics = metrics ? {
        semantic: metrics.semantic_similarity,
        length: metrics.length_consistency,
        sentiment: metrics.sentiment_alignment,
        speed: metrics.response_speed_score,
        aggregate: metrics.aggregate_score
      } : {
        semantic: 0,
        length: 0,
        sentiment: 0,
        speed: 0,
        aggregate: 0
      };

      const result: ComparisonResult = {
        id: query.id,
        queryId: query.id,
        userId: query.user_id,
        guildId: query.team_id || '',
        prompt: query.prompt,
        responses: aiResponses,
        metrics: similarityMetrics,
        votes: aggregatedVotes,
        createdAt: new Date(query.created_at),
        updatedAt: new Date(query.updated_at || query.created_at)
      };

      // Cache the result
      await RedisService.cacheQueryResult(queryId, result, 3600);

      return result;
    } catch (error) {
      dbLogger.error(`Failed to get comparison result for ${queryId}:`, error);
      return null;
    }
  }

  async getQueryHistory(params: {
    userId?: string;
    guildId?: string;
    limit?: number;
    page?: number;
    filter?: string;
    modelFilter?: string;
  }): Promise<PaginatedResponse<any>> {
    try {
      const limit = Math.min(params.limit || 10, 25);
      const page = Math.max(params.page || 1, 1);
      const offset = (page - 1) * limit;

      // Build query parameters
      const queryParams: any = {
        limit,
        offset
      };

      if (params.userId) {
        queryParams.userId = params.userId;
      }

      // Map guildId to teamId
      if (params.guildId) {
        const team = await DatabaseService.getTeamByGuildId(params.guildId);
        if (team) {
          queryParams.teamId = team.id;
        }
      }

      // Apply filters
      if (params.filter && params.filter !== 'all') {
        if (params.filter === 'failed') {
          queryParams.status = 'failed';
        } else if (params.filter === 'success') {
          queryParams.status = 'completed';
        } else if (params.filter.endsWith('h') || params.filter.endsWith('d')) {
          // Time-based filters would require additional query logic
          // For now, we'll ignore these
        }
      }

      const result = await DatabaseService.getQueryHistory(queryParams);
      const totalPages = Math.ceil(result.total / limit);

      return {
        data: result.data,
        page,
        totalPages,
        totalCount: result.total,
        hasNext: page < totalPages,
        hasPrev: page > 1
      };
    } catch (error) {
      dbLogger.error('Failed to get query history:', error);
      return {
        data: [],
        page: 1,
        totalPages: 1,
        totalCount: 0,
        hasNext: false,
        hasPrev: false
      };
    }
  }

  private async calculateSimilarityMetrics(responses: AIResponse[]): Promise<{
    semanticSimilarity: number;
    lengthConsistency: number;
    sentimentAlignment: number;
    responseSpeedScore: number;
    aggregateScore: number;
  }> {
    // Simple similarity calculations
    // In a production environment, you'd use more sophisticated NLP techniques

    const contents = responses.map(r => r.content);
    const lengths = responses.map(r => r.content.length);
    const responseTimes = responses.map(r => r.responseTime);

    // Semantic similarity (simplified - based on word overlap)
    const semantic = this.calculateSemanticSimilarity(contents);

    // Length consistency
    const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const lengthVariance = lengths.reduce((acc, len) => acc + Math.pow(len - avgLength, 2), 0) / lengths.length;
    const lengthConsistency = Math.max(0, 100 - Math.sqrt(lengthVariance) / avgLength * 100);

    // Sentiment alignment (simplified - based on response tone indicators)
    const sentiment = this.calculateSentimentAlignment(contents);

    // Response speed score
    const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
    const maxTime = Math.max(...responseTimes);
    const minTime = Math.min(...responseTimes);
    const speedVariance = maxTime - minTime;
    const responseSpeed = Math.max(0, 100 - (speedVariance / avgResponseTime) * 50);

    // Aggregate score
    const aggregateScore = (semantic + lengthConsistency + sentiment + responseSpeed) / 4;

    return {
      semanticSimilarity: Math.round(semantic),
      lengthConsistency: Math.round(lengthConsistency),
      sentimentAlignment: Math.round(sentiment),
      responseSpeedScore: Math.round(responseSpeed),
      aggregateScore: Math.round(aggregateScore)
    };
  }

  private calculateSemanticSimilarity(contents: string[]): number {
    // Simplified word overlap calculation
    if (contents.length < 2) return 100;

    const wordSets = contents.map(content => 
      new Set(content.toLowerCase().split(/\W+/).filter(word => word.length > 3))
    );

    let totalSimilarity = 0;
    let comparisons = 0;

    for (let i = 0; i < wordSets.length; i++) {
      for (let j = i + 1; j < wordSets.length; j++) {
        const intersection = new Set([...wordSets[i]].filter(x => wordSets[j].has(x)));
        const union = new Set([...wordSets[i], ...wordSets[j]]);
        
        if (union.size > 0) {
          totalSimilarity += (intersection.size / union.size) * 100;
          comparisons++;
        }
      }
    }

    return comparisons > 0 ? totalSimilarity / comparisons : 0;
  }

  private calculateSentimentAlignment(contents: string[]): number {
    // Very simplified sentiment analysis based on word patterns
    const sentiments = contents.map(content => {
      const positiveWords = (content.match(/\b(good|great|excellent|amazing|wonderful|fantastic|positive|yes|success|perfect)\b/gi) || []).length;
      const negativeWords = (content.match(/\b(bad|terrible|awful|horrible|negative|no|failure|wrong|error|problem)\b/gi) || []).length;
      const neutralWords = (content.match(/\b(maybe|perhaps|possibly|likely|probably|might|could|would)\b/gi) || []).length;
      
      const total = positiveWords + negativeWords + neutralWords;
      if (total === 0) return 0; // Neutral
      
      return (positiveWords - negativeWords) / total;
    });

    // Calculate variance in sentiment
    const avgSentiment = sentiments.reduce((a, b) => a + b, 0) / sentiments.length;
    const variance = sentiments.reduce((acc, sent) => acc + Math.pow(sent - avgSentiment, 2), 0) / sentiments.length;
    
    return Math.max(0, 100 - Math.sqrt(variance) * 100);
  }

  private aggregateVotes(votes: any[]): any {
    const aggregated = {
      thumbsUp: 0,
      thumbsDown: 0,
      starRatings: {} as { [userId: string]: number },
      modelVotes: {} as { [model: string]: { up: number; down: number } }
    };

    for (const vote of votes) {
      if (vote.vote_type === 'thumbs_up') {
        aggregated.thumbsUp++;
      } else if (vote.vote_type === 'thumbs_down') {
        aggregated.thumbsDown++;
      } else if (vote.vote_type === 'star_rating') {
        aggregated.starRatings[vote.user_id] = vote.value;
      }
    }

    return aggregated;
  }

  private getProviderForModel(model: string): string {
    const modelProviderMap: { [key: string]: string } = {
      'gpt-4': 'openai',
      'gpt-4-turbo': 'openai',
      'gpt-3.5-turbo': 'openai',
      'claude-3.5-sonnet': 'anthropic',
      'claude-3-haiku': 'anthropic',
      'gemini-1.5-pro': 'google',
      'gemini-1.5-flash': 'google',
      'command-r-plus': 'cohere',
      'command-r': 'cohere'
    };

    return modelProviderMap[model] || 'unknown';
  }

  private async notifyQueryCompletion(queryId: string, result: ComparisonResult): Promise<void> {
    // This would be implemented by a notification service
    // For now, just log the completion
    dbLogger.info(`Query ${queryId} completed notification`, {
      userId: result.userId,
      responsesCount: result.responses.length,
      aggregateScore: result.metrics.aggregate
    });
  }
}