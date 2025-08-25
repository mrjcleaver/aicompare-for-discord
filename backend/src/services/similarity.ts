import { similarity } from 'similarity';
import Sentiment from 'sentiment';
import { ComparisonMetrics, Response, SimilarityScore } from '../types';

export class SimilarityService {
  private static instance: SimilarityService;
  private sentiment: Sentiment;
  
  private constructor() {
    this.sentiment = new Sentiment();
  }

  public static getInstance(): SimilarityService {
    if (!SimilarityService.instance) {
      SimilarityService.instance = new SimilarityService();
    }
    return SimilarityService.instance;
  }

  /**
   * Calculate comprehensive comparison metrics for multiple responses
   */
  public async calculateComparison(responses: Response[]): Promise<ComparisonMetrics> {
    if (responses.length < 2) {
      throw new Error('At least 2 responses required for comparison');
    }

    const validResponses = responses.filter(r => r.status === 'COMPLETED' && r.content);

    if (validResponses.length < 2) {
      throw new Error('At least 2 completed responses required for comparison');
    }

    // Calculate all metrics
    const semanticSimilarity = await this.calculateSemanticSimilarity(validResponses);
    const lengthComparison = this.calculateLengthComparison(validResponses);
    const sentimentAlignment = this.calculateSentimentAlignment(validResponses);
    const factualConsistency = this.calculateFactualConsistency(validResponses);
    const responseTimeComparison = this.calculateResponseTimeComparison(validResponses);

    // Calculate aggregate score (weighted average)
    const weights = {
      semantic: 0.35,      // 35% - most important
      sentiment: 0.20,     // 20% - emotional alignment
      factual: 0.25,       // 25% - consistency of facts
      length: 0.10,        // 10% - length consistency
      timing: 0.10,        // 10% - response time consistency
    };

    const aggregateScore = (
      semanticSimilarity * weights.semantic +
      sentimentAlignment * weights.sentiment +
      factualConsistency * weights.factual +
      lengthComparison * weights.length +
      responseTimeComparison * weights.timing
    );

    return {
      semanticSimilarity,
      lengthComparison,
      sentimentAlignment,
      factualConsistency,
      responseTimeComparison,
      aggregateScore: Math.round(aggregateScore * 100) / 100,
    };
  }

  /**
   * Calculate semantic similarity using string comparison algorithms
   */
  private async calculateSemanticSimilarity(responses: Response[]): Promise<number> {
    if (responses.length < 2) return 0;

    const contents = responses.map(r => this.normalizeText(r.content));
    const similarities: number[] = [];

    // Calculate pairwise similarities
    for (let i = 0; i < contents.length - 1; i++) {
      for (let j = i + 1; j < contents.length; j++) {
        // Use multiple similarity metrics
        const jaccardSim = this.jaccardSimilarity(contents[i], contents[j]);
        const cosineSim = this.cosineSimilarity(contents[i], contents[j]);
        const levenshteinSim = this.levenshteinSimilarity(contents[i], contents[j]);
        
        // Weighted combination of similarity measures
        const combinedSimilarity = (
          jaccardSim * 0.3 +
          cosineSim * 0.4 +
          levenshteinSim * 0.3
        );
        
        similarities.push(combinedSimilarity);
      }
    }

    const averageSimilarity = similarities.reduce((sum, sim) => sum + sim, 0) / similarities.length;
    return Math.round(averageSimilarity * 100);
  }

  /**
   * Calculate length comparison consistency
   */
  private calculateLengthComparison(responses: Response[]): Promise<number> {
    if (responses.length < 2) return Promise.resolve(0);

    const lengths = responses.map(r => r.content.length);
    const avgLength = lengths.reduce((sum, len) => sum + len, 0) / lengths.length;
    
    // Calculate coefficient of variation (lower = more consistent)
    const variance = lengths.reduce((sum, len) => sum + Math.pow(len - avgLength, 2), 0) / lengths.length;
    const stdDev = Math.sqrt(variance);
    const coeffOfVariation = stdDev / avgLength;
    
    // Convert to similarity score (1 - normalized coefficient of variation)
    const normalizedCoeff = Math.min(coeffOfVariation, 1); // Cap at 1
    const similarityScore = (1 - normalizedCoeff) * 100;
    
    return Promise.resolve(Math.round(similarityScore));
  }

  /**
   * Calculate sentiment alignment between responses
   */
  private calculateSentimentAlignment(responses: Response[]): number {
    if (responses.length < 2) return 0;

    const sentiments = responses.map(r => {
      const analysis = this.sentiment.analyze(r.content);
      return {
        score: analysis.score,
        comparative: analysis.comparative,
        positive: analysis.positive,
        negative: analysis.negative,
      };
    });

    // Calculate alignment based on sentiment scores
    const scores = sentiments.map(s => s.comparative);
    const avgScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    
    // Calculate how close all scores are to the average (lower variance = higher alignment)
    const variance = scores.reduce((sum, score) => sum + Math.pow(score - avgScore, 2), 0) / scores.length;
    const stdDev = Math.sqrt(variance);
    
    // Normalize standard deviation (typical range is 0-2 for sentiment)
    const normalizedStdDev = Math.min(stdDev / 2, 1);
    const alignmentScore = (1 - normalizedStdDev) * 100;
    
    return Math.round(alignmentScore);
  }

  /**
   * Calculate factual consistency by analyzing key terms and entities
   */
  private calculateFactualConsistency(responses: Response[]): number {
    if (responses.length < 2) return 0;

    // Extract key terms and numbers from each response
    const responseFacts = responses.map(r => this.extractFacts(r.content));
    
    // Calculate overlap of factual elements
    let totalOverlap = 0;
    let totalComparisons = 0;

    for (let i = 0; i < responseFacts.length - 1; i++) {
      for (let j = i + 1; j < responseFacts.length; j++) {
        const overlap = this.calculateFactOverlap(responseFacts[i], responseFacts[j]);
        totalOverlap += overlap;
        totalComparisons++;
      }
    }

    const avgOverlap = totalComparisons > 0 ? totalOverlap / totalComparisons : 0;
    return Math.round(avgOverlap * 100);
  }

  /**
   * Calculate response time consistency
   */
  private calculateResponseTimeComparison(responses: Response[]): number {
    if (responses.length < 2) return 0;

    const times = responses.map(r => r.responseTimeMs);
    const avgTime = times.reduce((sum, time) => sum + time, 0) / times.length;
    
    // Calculate coefficient of variation
    const variance = times.reduce((sum, time) => sum + Math.pow(time - avgTime, 2), 0) / times.length;
    const stdDev = Math.sqrt(variance);
    const coeffOfVariation = stdDev / avgTime;
    
    // Convert to consistency score
    const normalizedCoeff = Math.min(coeffOfVariation, 2); // Cap at 2
    const consistencyScore = (1 - normalizedCoeff / 2) * 100;
    
    return Math.round(Math.max(consistencyScore, 0));
  }

  /**
   * Normalize text for better comparison
   */
  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Calculate Jaccard similarity between two texts
   */
  private jaccardSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.split(' '));
    const words2 = new Set(text2.split(' '));
    
    const intersection = new Set([...words1].filter(word => words2.has(word)));
    const union = new Set([...words1, ...words2]);
    
    return union.size > 0 ? intersection.size / union.size : 0;
  }

  /**
   * Calculate cosine similarity between two texts
   */
  private cosineSimilarity(text1: string, text2: string): number {
    const words1 = text1.split(' ');
    const words2 = text2.split(' ');
    
    // Create word frequency vectors
    const vocab = [...new Set([...words1, ...words2])];
    const vector1 = vocab.map(word => words1.filter(w => w === word).length);
    const vector2 = vocab.map(word => words2.filter(w => w === word).length);
    
    // Calculate dot product
    const dotProduct = vector1.reduce((sum, val, i) => sum + val * vector2[i], 0);
    
    // Calculate magnitudes
    const magnitude1 = Math.sqrt(vector1.reduce((sum, val) => sum + val * val, 0));
    const magnitude2 = Math.sqrt(vector2.reduce((sum, val) => sum + val * val, 0));
    
    if (magnitude1 === 0 || magnitude2 === 0) return 0;
    
    return dotProduct / (magnitude1 * magnitude2);
  }

  /**
   * Calculate Levenshtein similarity between two texts
   */
  private levenshteinSimilarity(text1: string, text2: string): number {
    const maxLength = Math.max(text1.length, text2.length);
    if (maxLength === 0) return 1;
    
    const distance = this.levenshteinDistance(text1, text2);
    return (maxLength - distance) / maxLength;
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Extract factual elements from text (numbers, dates, proper nouns, etc.)
   */
  private extractFacts(text: string): {
    numbers: number[];
    dates: string[];
    properNouns: string[];
    keyTerms: string[];
  } {
    // Extract numbers
    const numbers = (text.match(/\d+\.?\d*/g) || []).map(num => parseFloat(num));
    
    // Extract dates (simple patterns)
    const dates = text.match(/\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2}|\b\d{4}\b/g) || [];
    
    // Extract capitalized words (potential proper nouns)
    const properNouns = text.match(/\b[A-Z][a-z]+\b/g) || [];
    
    // Extract key terms (longer words that aren't common stop words)
    const stopWords = new Set(['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'this', 'that', 'these', 'those']);
    const keyTerms = text
      .toLowerCase()
      .match(/\b\w{4,}\b/g) // Words with 4+ characters
      ?.filter(word => !stopWords.has(word)) || [];
    
    return { numbers, dates, properNouns, keyTerms };
  }

  /**
   * Calculate overlap between fact sets
   */
  private calculateFactOverlap(facts1: any, facts2: any): number {
    let totalElements = 0;
    let overlappingElements = 0;

    // Compare numbers (with tolerance)
    const tolerance = 0.01;
    for (const num1 of facts1.numbers) {
      totalElements++;
      if (facts2.numbers.some((num2: number) => Math.abs(num1 - num2) <= tolerance)) {
        overlappingElements++;
      }
    }

    // Compare dates
    for (const date1 of facts1.dates) {
      totalElements++;
      if (facts2.dates.includes(date1)) {
        overlappingElements++;
      }
    }

    // Compare proper nouns
    const properNouns1Set = new Set(facts1.properNouns.map((n: string) => n.toLowerCase()));
    const properNouns2Set = new Set(facts2.properNouns.map((n: string) => n.toLowerCase()));
    
    for (const noun of properNouns1Set) {
      totalElements++;
      if (properNouns2Set.has(noun)) {
        overlappingElements++;
      }
    }

    // Compare key terms
    const keyTerms1Set = new Set(facts1.keyTerms);
    const keyTerms2Set = new Set(facts2.keyTerms);
    
    for (const term of keyTerms1Set) {
      totalElements++;
      if (keyTerms2Set.has(term)) {
        overlappingElements++;
      }
    }

    return totalElements > 0 ? overlappingElements / totalElements : 0;
  }

  /**
   * Get similarity category based on score
   */
  public getSimilarityCategory(score: number): 'high' | 'medium' | 'low' {
    if (score >= 80) return 'high';
    if (score >= 60) return 'medium';
    return 'low';
  }

  /**
   * Generate explanation for similarity score
   */
  public generateSimilarityExplanation(metrics: ComparisonMetrics): string {
    const parts: string[] = [];

    // Semantic similarity
    const semanticCategory = this.getSimilarityCategory(metrics.semanticSimilarity);
    parts.push(`Semantic similarity is ${semanticCategory} (${metrics.semanticSimilarity}%)`);

    // Sentiment alignment
    const sentimentCategory = this.getSimilarityCategory(metrics.sentimentAlignment);
    parts.push(`sentiment alignment is ${sentimentCategory} (${metrics.sentimentAlignment}%)`);

    // Factual consistency
    const factualCategory = this.getSimilarityCategory(metrics.factualConsistency);
    parts.push(`factual consistency is ${factualCategory} (${metrics.factualConsistency}%)`);

    // Overall assessment
    const overallCategory = this.getSimilarityCategory(metrics.aggregateScore);
    const overallDescription = overallCategory === 'high' ? 'very similar' :
                             overallCategory === 'medium' ? 'moderately similar' : 'quite different';

    return `The responses are ${overallDescription} overall. ${parts.join(', ')}.`;
  }

  /**
   * Compare two specific responses
   */
  public async compareTwoResponses(response1: Response, response2: Response): Promise<{
    similarity: number;
    category: 'high' | 'medium' | 'low';
    explanation: string;
    breakdown: {
      semantic: number;
      sentiment: number;
      factual: number;
      length: number;
    };
  }> {
    const responses = [response1, response2];
    const metrics = await this.calculateComparison(responses);

    return {
      similarity: metrics.aggregateScore,
      category: this.getSimilarityCategory(metrics.aggregateScore),
      explanation: this.generateSimilarityExplanation(metrics),
      breakdown: {
        semantic: metrics.semanticSimilarity,
        sentiment: metrics.sentimentAlignment,
        factual: metrics.factualConsistency,
        length: metrics.lengthComparison,
      },
    };
  }
}