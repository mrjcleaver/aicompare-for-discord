/**
 * Mock AI Provider Services for Testing
 * Provides consistent, controllable responses for all supported AI providers
 */

export interface MockAIResponse {
  model: string;
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  responseTime: number;
  cost: number;
}

export interface MockProviderConfig {
  enabled: boolean;
  latency: {
    min: number;
    max: number;
  };
  failureRate: number; // 0-1, probability of request failure
  rateLimitAfter: number; // Number of requests before rate limiting
}

export class MockAIProviders {
  private requestCounts: Map<string, number> = new Map();
  private configs: Map<string, MockProviderConfig> = new Map();

  constructor() {
    // Default configurations
    this.configs.set('openai', {
      enabled: true,
      latency: { min: 800, max: 2000 },
      failureRate: 0.02,
      rateLimitAfter: 100
    });

    this.configs.set('anthropic', {
      enabled: true,
      latency: { min: 600, max: 1800 },
      failureRate: 0.01,
      rateLimitAfter: 80
    });

    this.configs.set('google', {
      enabled: true,
      latency: { min: 1000, max: 2500 },
      failureRate: 0.03,
      rateLimitAfter: 60
    });

    this.configs.set('cohere', {
      enabled: true,
      latency: { min: 900, max: 2200 },
      failureRate: 0.02,
      rateLimitAfter: 75
    });
  }

  /**
   * Configure mock behavior for a specific provider
   */
  configureProvider(provider: string, config: Partial<MockProviderConfig>) {
    const existingConfig = this.configs.get(provider) || {
      enabled: true,
      latency: { min: 1000, max: 2000 },
      failureRate: 0.02,
      rateLimitAfter: 100
    };
    
    this.configs.set(provider, { ...existingConfig, ...config });
  }

  /**
   * Reset request counters (useful for test setup)
   */
  reset() {
    this.requestCounts.clear();
  }

  /**
   * Simulate OpenAI GPT response
   */
  async mockOpenAI(model: string, prompt: string, options: any = {}): Promise<MockAIResponse> {
    const provider = 'openai';
    const config = this.configs.get(provider)!;
    
    if (!config.enabled) {
      throw new Error('OpenAI API is disabled');
    }

    await this.simulateLatency(config);
    this.checkRateLimit(provider, config);
    this.simulateFailures(config);

    const baseResponse = this.getBaseResponse(model, prompt);
    
    // OpenAI-specific response formatting
    const response: MockAIResponse = {
      model,
      content: this.generateOpenAIResponse(prompt, model),
      usage: {
        promptTokens: baseResponse.usage.promptTokens,
        completionTokens: baseResponse.usage.completionTokens,
        totalTokens: baseResponse.usage.totalTokens
      },
      responseTime: baseResponse.responseTime,
      cost: this.calculateOpenAICost(model, baseResponse.usage)
    };

    return response;
  }

  /**
   * Simulate Anthropic Claude response
   */
  async mockAnthropic(model: string, prompt: string, options: any = {}): Promise<MockAIResponse> {
    const provider = 'anthropic';
    const config = this.configs.get(provider)!;
    
    if (!config.enabled) {
      throw new Error('Anthropic API is disabled');
    }

    await this.simulateLatency(config);
    this.checkRateLimit(provider, config);
    this.simulateFailures(config);

    const baseResponse = this.getBaseResponse(model, prompt);
    
    const response: MockAIResponse = {
      model,
      content: this.generateAnthropicResponse(prompt, model),
      usage: {
        promptTokens: baseResponse.usage.promptTokens,
        completionTokens: baseResponse.usage.completionTokens,
        totalTokens: baseResponse.usage.totalTokens
      },
      responseTime: baseResponse.responseTime,
      cost: this.calculateAnthropicCost(model, baseResponse.usage)
    };

    return response;
  }

  /**
   * Simulate Google Gemini response
   */
  async mockGoogle(model: string, prompt: string, options: any = {}): Promise<MockAIResponse> {
    const provider = 'google';
    const config = this.configs.get(provider)!;
    
    if (!config.enabled) {
      throw new Error('Google API is disabled');
    }

    await this.simulateLatency(config);
    this.checkRateLimit(provider, config);
    this.simulateFailures(config);

    const baseResponse = this.getBaseResponse(model, prompt);
    
    const response: MockAIResponse = {
      model,
      content: this.generateGoogleResponse(prompt, model),
      usage: {
        promptTokens: baseResponse.usage.promptTokens,
        completionTokens: baseResponse.usage.completionTokens,
        totalTokens: baseResponse.usage.totalTokens
      },
      responseTime: baseResponse.responseTime,
      cost: this.calculateGoogleCost(model, baseResponse.usage)
    };

    return response;
  }

  /**
   * Simulate Cohere response
   */
  async mockCohere(model: string, prompt: string, options: any = {}): Promise<MockAIResponse> {
    const provider = 'cohere';
    const config = this.configs.get(provider)!;
    
    if (!config.enabled) {
      throw new Error('Cohere API is disabled');
    }

    await this.simulateLatency(config);
    this.checkRateLimit(provider, config);
    this.simulateFailures(config);

    const baseResponse = this.getBaseResponse(model, prompt);
    
    const response: MockAIResponse = {
      model,
      content: this.generateCohereResponse(prompt, model),
      usage: {
        promptTokens: baseResponse.usage.promptTokens,
        completionTokens: baseResponse.usage.completionTokens,
        totalTokens: baseResponse.usage.totalTokens
      },
      responseTime: baseResponse.responseTime,
      cost: this.calculateCohereCost(model, baseResponse.usage)
    };

    return response;
  }

  // Private helper methods

  private async simulateLatency(config: MockProviderConfig) {
    const latency = Math.random() * (config.latency.max - config.latency.min) + config.latency.min;
    await new Promise(resolve => setTimeout(resolve, latency));
  }

  private checkRateLimit(provider: string, config: MockProviderConfig) {
    const count = this.requestCounts.get(provider) || 0;
    this.requestCounts.set(provider, count + 1);

    if (count >= config.rateLimitAfter) {
      throw new Error(`Rate limit exceeded for ${provider}`);
    }
  }

  private simulateFailures(config: MockProviderConfig) {
    if (Math.random() < config.failureRate) {
      const errors = [
        'API temporarily unavailable',
        'Request timeout',
        'Service overloaded',
        'Invalid API key',
        'Quota exceeded'
      ];
      throw new Error(errors[Math.floor(Math.random() * errors.length)]);
    }
  }

  private getBaseResponse(model: string, prompt: string) {
    const promptTokens = Math.floor(prompt.length / 4); // Rough token estimation
    const completionTokens = Math.floor(Math.random() * 200) + 50; // 50-250 tokens
    const responseTime = Math.floor(Math.random() * 1000) + 500; // 500-1500ms

    return {
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens
      },
      responseTime
    };
  }

  private generateOpenAIResponse(prompt: string, model: string): string {
    const responses = {
      'gpt-4': [
        `Based on your question about "${prompt.substring(0, 50)}...", I can provide a comprehensive analysis. From GPT-4's perspective, this involves multiple layers of understanding and contextual reasoning.`,
        `This is an interesting question. Let me break this down systematically using GPT-4's analytical capabilities to provide you with a thorough response.`,
        `I appreciate your inquiry. As GPT-4, I can offer insights that draw from extensive training on diverse datasets to address your question comprehensively.`
      ],
      'gpt-3.5-turbo': [
        `Thanks for your question! Here's what I can tell you about "${prompt.substring(0, 50)}..." - this is a topic that has several important aspects to consider.`,
        `Let me help you with that. Based on the information I have, here's a clear explanation of what you're asking about.`,
        `Good question! I'll do my best to provide a helpful response that addresses the key points you've raised.`
      ]
    };

    const modelResponses = responses[model as keyof typeof responses] || responses['gpt-4'];
    const baseResponse = modelResponses[Math.floor(Math.random() * modelResponses.length)];
    
    // Add some realistic variation
    const elaboration = this.generateElaboration(prompt);
    return `${baseResponse}\n\n${elaboration}`;
  }

  private generateAnthropicResponse(prompt: string, model: string): string {
    const responses = [
      `I'd be happy to help you understand this topic. Based on your question about "${prompt.substring(0, 50)}...", let me provide a thoughtful analysis.`,
      `This is a nuanced question that deserves a careful response. Let me walk through the key considerations systematically.`,
      `Thank you for this interesting question. I'll aim to provide a balanced and informative perspective on this topic.`
    ];

    const baseResponse = responses[Math.floor(Math.random() * responses.length)];
    const elaboration = this.generateElaboration(prompt);
    return `${baseResponse}\n\n${elaboration}`;
  }

  private generateGoogleResponse(prompt: string, model: string): string {
    const responses = [
      `Regarding your inquiry about "${prompt.substring(0, 50)}...", I can offer insights based on my training and knowledge base.`,
      `This is an important topic to explore. Let me provide you with a comprehensive overview based on the latest understanding.`,
      `I understand you're looking for information about this subject. Here's what I can tell you from multiple perspectives.`
    ];

    const baseResponse = responses[Math.floor(Math.random() * responses.length)];
    const elaboration = this.generateElaboration(prompt);
    return `${baseResponse}\n\n${elaboration}`;
  }

  private generateCohereResponse(prompt: string, model: string): string {
    const responses = [
      `Looking at your question about "${prompt.substring(0, 50)}...", I can provide several key insights that might be helpful.`,
      `This is a relevant topic that touches on several important areas. Let me outline the main points for you.`,
      `Your question raises some interesting considerations. Here's my analysis of the key factors involved.`
    ];

    const baseResponse = responses[Math.floor(Math.random() * responses.length)];
    const elaboration = this.generateElaboration(prompt);
    return `${baseResponse}\n\n${elaboration}`;
  }

  private generateElaboration(prompt: string): string {
    const topics = prompt.toLowerCase();
    
    if (topics.includes('quantum')) {
      return `Quantum computing represents a paradigm shift in computational capabilities, leveraging quantum mechanical phenomena like superposition and entanglement. Unlike classical bits that exist in definite states of 0 or 1, quantum bits (qubits) can exist in superposition, allowing for exponentially more complex calculations. This technology has profound implications for cryptography, optimization problems, and scientific simulation.`;
    }
    
    if (topics.includes('ai') || topics.includes('artificial intelligence')) {
      return `Artificial Intelligence encompasses a broad range of technologies designed to simulate human cognitive functions. Modern AI systems utilize machine learning algorithms, particularly deep neural networks, to process vast amounts of data and identify patterns. The field has advanced rapidly, with applications spanning natural language processing, computer vision, robotics, and decision-making systems.`;
    }
    
    if (topics.includes('blockchain')) {
      return `Blockchain technology provides a distributed ledger system that maintains security through cryptographic hashing and consensus mechanisms. Each block contains a cryptographic hash of the previous block, creating an immutable chain of records. This technology enables decentralized applications, smart contracts, and cryptocurrency systems while eliminating the need for traditional intermediaries.`;
    }
    
    // Generic elaboration
    return `This topic involves multiple interconnected concepts that require careful consideration. The key aspects include historical context, current implementations, potential benefits and challenges, and future implications. Understanding these elements provides a comprehensive foundation for making informed decisions and assessments in this domain.`;
  }

  // Cost calculation methods (simplified pricing models)
  
  private calculateOpenAICost(model: string, usage: any): number {
    const pricing = {
      'gpt-4': { input: 0.03, output: 0.06 }, // per 1K tokens
      'gpt-3.5-turbo': { input: 0.001, output: 0.002 }
    };
    
    const modelPricing = pricing[model as keyof typeof pricing] || pricing['gpt-4'];
    return (usage.promptTokens * modelPricing.input + usage.completionTokens * modelPricing.output) / 1000;
  }

  private calculateAnthropicCost(model: string, usage: any): number {
    const pricing = {
      'claude-3.5-sonnet': { input: 0.003, output: 0.015 },
      'claude-3-haiku': { input: 0.00025, output: 0.00125 }
    };
    
    const modelPricing = pricing['claude-3.5-sonnet']; // Default to Sonnet pricing
    return (usage.promptTokens * modelPricing.input + usage.completionTokens * modelPricing.output) / 1000;
  }

  private calculateGoogleCost(model: string, usage: any): number {
    const pricing = {
      'gemini-1.5-pro': { input: 0.00125, output: 0.005 },
      'gemini-1.5-flash': { input: 0.000125, output: 0.0005 }
    };
    
    const modelPricing = pricing['gemini-1.5-pro']; // Default to Pro pricing
    return (usage.promptTokens * modelPricing.input + usage.completionTokens * modelPricing.output) / 1000;
  }

  private calculateCohereCost(model: string, usage: any): number {
    const pricing = {
      'command-r-plus': { input: 0.003, output: 0.015 },
      'command-r': { input: 0.0005, output: 0.0015 }
    };
    
    const modelPricing = pricing['command-r-plus']; // Default to R+ pricing
    return (usage.promptTokens * modelPricing.input + usage.completionTokens * modelPricing.output) / 1000;
  }
}

// Singleton instance for tests
export const mockAIProviders = new MockAIProviders();

// Test scenario presets
export const TestScenarios = {
  /**
   * All providers working normally
   */
  normal: () => {
    mockAIProviders.reset();
    // Use default configurations
  },

  /**
   * High latency scenario
   */
  highLatency: () => {
    mockAIProviders.reset();
    mockAIProviders.configureProvider('openai', { latency: { min: 5000, max: 10000 } });
    mockAIProviders.configureProvider('anthropic', { latency: { min: 4000, max: 8000 } });
    mockAIProviders.configureProvider('google', { latency: { min: 6000, max: 12000 } });
    mockAIProviders.configureProvider('cohere', { latency: { min: 5500, max: 11000 } });
  },

  /**
   * Some providers failing
   */
  partialFailure: () => {
    mockAIProviders.reset();
    mockAIProviders.configureProvider('openai', { enabled: false });
    mockAIProviders.configureProvider('google', { failureRate: 0.8 });
  },

  /**
   * Rate limiting scenario
   */
  rateLimited: () => {
    mockAIProviders.reset();
    mockAIProviders.configureProvider('openai', { rateLimitAfter: 1 });
    mockAIProviders.configureProvider('anthropic', { rateLimitAfter: 2 });
  },

  /**
   * All providers offline
   */
  allDown: () => {
    mockAIProviders.reset();
    mockAIProviders.configureProvider('openai', { enabled: false });
    mockAIProviders.configureProvider('anthropic', { enabled: false });
    mockAIProviders.configureProvider('google', { enabled: false });
    mockAIProviders.configureProvider('cohere', { enabled: false });
  }
};