import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

// Mock data
const mockUser = {
  id: 'user-123',
  discordId: '123456789',
  username: 'testuser',
  avatar: 'https://cdn.discordapp.com/avatars/123456789/test-avatar.png',
  preferences: {
    defaultModels: ['gpt-4', 'claude-3.5-sonnet'],
    notifications: true,
    theme: 'light'
  },
  guilds: [
    {
      id: 'guild-123',
      name: 'Test Guild',
      icon: 'test-icon.png',
      permissions: ['ADMINISTRATOR']
    }
  ]
};

const mockComparisons = [
  {
    id: 'comparison-1',
    query: {
      id: 'query-1',
      prompt: 'Explain quantum computing',
      parameters: { temperature: 0.7, maxTokens: 1000 },
      modelsRequested: ['gpt-4', 'claude-3.5-sonnet'],
      createdAt: '2023-12-01T10:00:00Z'
    },
    responses: [
      {
        id: 'response-1',
        modelName: 'gpt-4',
        content: 'Quantum computing is a revolutionary technology...',
        metadata: {
          model: 'gpt-4',
          usage: { promptTokens: 15, completionTokens: 200, totalTokens: 215 }
        },
        responseTimeMs: 1200,
        tokenCount: 215,
        costUsd: 0.0043
      },
      {
        id: 'response-2',
        modelName: 'claude-3.5-sonnet',
        content: 'Quantum computing represents a fundamental shift...',
        metadata: {
          model: 'claude-3-5-sonnet-20240620',
          usage: { inputTokens: 15, outputTokens: 180 }
        },
        responseTimeMs: 950,
        tokenCount: 195,
        costUsd: 0.0024
      }
    ],
    metrics: {
      semantic: 87,
      length: 91,
      sentiment: 85,
      speed: 92
    },
    votes: {
      'response-1': {
        thumbsUp: 8,
        thumbsDown: 2,
        starRatings: [5, 4, 5, 4, 5, 3, 4, 5, 4, 5]
      },
      'response-2': {
        thumbsUp: 6,
        thumbsDown: 1,
        starRatings: [4, 5, 4, 4, 5, 3, 4]
      }
    },
    createdAt: '2023-12-01T10:00:00Z'
  }
];

// API handlers
export const handlers = [
  // Authentication endpoints
  http.post('/api/auth/discord', () => {
    return HttpResponse.json({
      success: true,
      token: 'mock-jwt-token',
      user: mockUser
    });
  }),

  http.post('/api/auth/refresh', ({ request }) => {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.includes('Bearer')) {
      return HttpResponse.json(
        { success: false, error: 'Invalid token' },
        { status: 401 }
      );
    }

    return HttpResponse.json({
      success: true,
      token: 'refreshed-jwt-token'
    });
  }),

  http.post('/api/auth/logout', () => {
    return HttpResponse.json({
      success: true,
      message: 'Logged out successfully'
    });
  }),

  // User endpoints
  http.get('/api/user/me', ({ request }) => {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.includes('Bearer')) {
      return HttpResponse.json(
        { success: false, error: 'Authorization required' },
        { status: 401 }
      );
    }

    return HttpResponse.json({
      success: true,
      user: mockUser
    });
  }),

  http.get('/api/user/settings', () => {
    return HttpResponse.json({
      success: true,
      settings: {
        defaultModels: ['gpt-4', 'claude-3.5-sonnet'],
        notifications: {
          completion: true,
          votes: false,
          mentions: true
        },
        display: {
          format: 'detailed',
          theme: 'light'
        },
        privacy: {
          shareResponses: true,
          anonymousVoting: false
        }
      }
    });
  }),

  http.put('/api/user/settings', async ({ request }) => {
    const settings = await request.json() as any;
    
    return HttpResponse.json({
      success: true,
      settings: {
        ...settings,
        updatedAt: new Date().toISOString()
      }
    });
  }),

  // Comparison endpoints
  http.post('/api/comparisons', async ({ request }) => {
    const data = await request.json() as any;
    
    if (!data.prompt) {
      return HttpResponse.json(
        { success: false, error: 'Prompt is required' },
        { status: 400 }
      );
    }

    if (!data.models || data.models.length === 0) {
      return HttpResponse.json(
        { success: false, error: 'At least one model is required' },
        { status: 400 }
      );
    }

    const newComparison = {
      id: `comparison-${Date.now()}`,
      prompt: data.prompt,
      models: data.models,
      parameters: data.parameters || { temperature: 0.7 },
      status: 'queued',
      createdAt: new Date().toISOString()
    };

    return HttpResponse.json({
      success: true,
      comparison: newComparison
    }, { status: 201 });
  }),

  http.get('/api/comparisons/:id', ({ params }) => {
    const { id } = params;
    const comparison = mockComparisons.find(c => c.id === id);
    
    if (!comparison) {
      return HttpResponse.json(
        { success: false, error: 'Comparison not found' },
        { status: 404 }
      );
    }

    return HttpResponse.json({
      success: true,
      comparison
    });
  }),

  http.get('/api/comparisons', ({ request }) => {
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '10');
    const model = url.searchParams.get('model');
    
    let filteredComparisons = mockComparisons;
    
    if (model) {
      filteredComparisons = mockComparisons.filter(c => 
        c.query.modelsRequested.includes(model)
      );
    }

    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedComparisons = filteredComparisons.slice(startIndex, endIndex);

    return HttpResponse.json({
      success: true,
      comparisons: paginatedComparisons,
      pagination: {
        page,
        limit,
        total: filteredComparisons.length,
        totalPages: Math.ceil(filteredComparisons.length / limit)
      }
    });
  }),

  // Voting endpoints
  http.post('/api/responses/:id/vote', async ({ params, request }) => {
    const { id } = params;
    const voteData = await request.json() as any;
    
    if (!['thumbs_up', 'thumbs_down', 'star_rating'].includes(voteData.voteType)) {
      return HttpResponse.json(
        { success: false, error: 'Invalid vote type' },
        { status: 400 }
      );
    }

    if (voteData.voteType === 'star_rating' && (voteData.value < 1 || voteData.value > 5)) {
      return HttpResponse.json(
        { success: false, error: 'Star rating must be between 1 and 5' },
        { status: 400 }
      );
    }

    return HttpResponse.json({
      success: true,
      vote: {
        id: `vote-${Date.now()}`,
        responseId: id,
        voteType: voteData.voteType,
        value: voteData.value,
        createdAt: new Date().toISOString()
      }
    });
  }),

  http.get('/api/responses/:id/votes', ({ params }) => {
    const { id } = params;
    
    // Mock vote summary based on response ID
    const mockVotes = {
      thumbsUp: 5,
      thumbsDown: 1,
      starRatings: [4, 5, 4, 5, 3, 4],
      averageRating: 4.2,
      totalVotes: 6
    };

    return HttpResponse.json({
      success: true,
      votes: mockVotes
    });
  }),

  // Analytics endpoints
  http.get('/api/analytics/comparison-metrics', ({ request }) => {
    const url = new URL(request.url);
    const period = url.searchParams.get('period') || '7d';
    
    return HttpResponse.json({
      success: true,
      metrics: {
        totalComparisons: 42,
        period: period,
        modelUsage: {
          'gpt-4': 28,
          'claude-3.5-sonnet': 35,
          'gemini-1.5-pro': 15,
          'command-r-plus': 8
        },
        averageResponseTime: 1250,
        userEngagement: {
          totalUsers: 15,
          activeUsers: 12,
          averageVotesPerComparison: 3.2
        },
        costAnalysis: {
          totalCost: 1.45,
          averageCostPerComparison: 0.034,
          costByModel: {
            'gpt-4': 0.89,
            'claude-3.5-sonnet': 0.31,
            'gemini-1.5-pro': 0.18,
            'command-r-plus': 0.07
          }
        }
      }
    });
  }),

  http.get('/api/analytics/model-performance', ({ request }) => {
    const url = new URL(request.url);
    const models = url.searchParams.get('models')?.split(',') || ['gpt-4', 'claude-3.5-sonnet'];
    
    const performance = models.reduce((acc, model) => {
      acc[model] = {
        averageRating: Math.random() * 2 + 3, // 3-5 rating
        responseTime: Math.random() * 1000 + 500, // 500-1500ms
        usageCount: Math.floor(Math.random() * 50) + 10,
        voteRatio: Math.random() * 0.3 + 0.7, // 0.7-1.0 positive ratio
        costEfficiency: Math.random() * 0.5 + 0.5 // 0.5-1.0
      };
      return acc;
    }, {} as Record<string, any>);

    return HttpResponse.json({
      success: true,
      performance
    });
  }),

  // Error simulation endpoints for testing
  http.get('/api/test/server-error', () => {
    return HttpResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }),

  http.get('/api/test/timeout', () => {
    // Simulate timeout by never resolving
    return new Promise(() => {});
  }),

  http.get('/api/test/rate-limit', () => {
    return HttpResponse.json(
      { 
        success: false, 
        error: 'Rate limit exceeded',
        retryAfter: 60
      },
      { status: 429 }
    );
  })
];

// Create server instance
export const server = setupServer(...handlers);

// Helper functions for test scenarios
export const mockAPIError = (endpoint: string, status: number, error: string) => {
  server.use(
    http.get(endpoint, () => {
      return HttpResponse.json(
        { success: false, error },
        { status }
      );
    })
  );
};

export const mockAPISuccess = (endpoint: string, data: any) => {
  server.use(
    http.get(endpoint, () => {
      return HttpResponse.json({
        success: true,
        ...data
      });
    })
  );
};

export const mockAuthenticationFailure = () => {
  server.use(
    http.post('/api/auth/discord', () => {
      return HttpResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      );
    })
  );
};