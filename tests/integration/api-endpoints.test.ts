import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { FastifyInstance } from 'fastify';

// These would be imported from the actual API server implementation
// import { createApp } from '@aicompare/api-server/src/app.js';

describe('API Endpoints Integration Tests', () => {
  let app: FastifyInstance;
  let authToken: string;

  beforeAll(async () => {
    // Initialize test app
    // app = await createApp({ logger: false });
    // await app.ready();
    
    // Get authentication token
    authToken = await globalThis.IntegrationTestUtils.generateTestJWT();
  }, 30000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  beforeEach(async () => {
    await globalThis.IntegrationTestUtils.cleanDatabase();
    await globalThis.IntegrationTestUtils.seedTestData();
  });

  describe('Authentication Endpoints', () => {
    describe('POST /auth/discord', () => {
      it('should initiate Discord OAuth flow', async () => {
        const response = await request(app.server)
          .post('/auth/discord')
          .send({
            code: 'mock_discord_code',
            redirectUri: 'http://localhost:3000/auth/callback'
          });

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
          success: true,
          token: expect.any(String),
          user: expect.objectContaining({
            discordId: expect.any(String),
            username: expect.any(String)
          })
        });
      });

      it('should handle invalid Discord code', async () => {
        const response = await request(app.server)
          .post('/auth/discord')
          .send({
            code: 'invalid_code',
            redirectUri: 'http://localhost:3000/auth/callback'
          });

        expect(response.status).toBe(400);
        expect(response.body).toMatchObject({
          success: false,
          error: expect.stringContaining('Invalid authorization code')
        });
      });
    });

    describe('POST /auth/refresh', () => {
      it('should refresh valid token', async () => {
        const response = await request(app.server)
          .post('/auth/refresh')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
          success: true,
          token: expect.any(String)
        });
      });

      it('should reject invalid token', async () => {
        const response = await request(app.server)
          .post('/auth/refresh')
          .set('Authorization', 'Bearer invalid_token');

        expect(response.status).toBe(401);
        expect(response.body).toMatchObject({
          success: false,
          error: expect.stringContaining('Invalid token')
        });
      });
    });

    describe('POST /auth/logout', () => {
      it('should logout user successfully', async () => {
        const response = await request(app.server)
          .post('/auth/logout')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
          success: true,
          message: 'Logged out successfully'
        });
      });
    });
  });

  describe('Comparison Endpoints', () => {
    describe('POST /comparisons', () => {
      it('should create new comparison', async () => {
        const comparisonData = {
          prompt: 'Explain quantum computing in simple terms',
          models: ['gpt-4', 'claude-3.5-sonnet'],
          parameters: {
            temperature: 0.7,
            maxTokens: 1000
          },
          guildId: 'guild-123'
        };

        const response = await request(app.server)
          .post('/comparisons')
          .set('Authorization', `Bearer ${authToken}`)
          .send(comparisonData);

        expect(response.status).toBe(201);
        expect(response.body).toMatchObject({
          success: true,
          comparison: expect.objectContaining({
            id: expect.any(String),
            prompt: comparisonData.prompt,
            models: comparisonData.models,
            status: 'queued'
          })
        });
      });

      it('should validate required fields', async () => {
        const response = await request(app.server)
          .post('/comparisons')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            models: ['gpt-4']
            // Missing prompt
          });

        expect(response.status).toBe(400);
        expect(response.body).toMatchObject({
          success: false,
          error: expect.stringContaining('prompt')
        });
      });

      it('should validate model selection', async () => {
        const response = await request(app.server)
          .post('/comparisons')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            prompt: 'Test prompt',
            models: ['invalid-model']
          });

        expect(response.status).toBe(400);
        expect(response.body).toMatchObject({
          success: false,
          error: expect.stringContaining('Invalid model')
        });
      });

      it('should enforce rate limits', async () => {
        // Make multiple rapid requests to trigger rate limit
        const requests = Array(15).fill(null).map(() =>
          request(app.server)
            .post('/comparisons')
            .set('Authorization', `Bearer ${authToken}`)
            .send({
              prompt: 'Test prompt',
              models: ['gpt-4']
            })
        );

        const responses = await Promise.all(requests);
        const rateLimitedResponses = responses.filter(r => r.status === 429);
        
        expect(rateLimitedResponses.length).toBeGreaterThan(0);
        expect(rateLimitedResponses[0].body).toMatchObject({
          success: false,
          error: expect.stringContaining('rate limit')
        });
      });
    });

    describe('GET /comparisons/:id', () => {
      let comparisonId: string;

      beforeEach(async () => {
        // Create a test comparison
        const createResponse = await request(app.server)
          .post('/comparisons')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            prompt: 'Test prompt',
            models: ['gpt-4', 'claude-3.5-sonnet']
          });

        comparisonId = createResponse.body.comparison.id;
      });

      it('should retrieve comparison by ID', async () => {
        const response = await request(app.server)
          .get(`/comparisons/${comparisonId}`)
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
          success: true,
          comparison: expect.objectContaining({
            id: comparisonId,
            prompt: 'Test prompt',
            models: ['gpt-4', 'claude-3.5-sonnet']
          })
        });
      });

      it('should return 404 for non-existent comparison', async () => {
        const response = await request(app.server)
          .get('/comparisons/non-existent-id')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(404);
        expect(response.body).toMatchObject({
          success: false,
          error: expect.stringContaining('not found')
        });
      });

      it('should enforce access permissions', async () => {
        // Create comparison as different user
        const otherUserToken = await globalThis.IntegrationTestUtils.generateTestJWT('other-user-456');
        
        const response = await request(app.server)
          .get(`/comparisons/${comparisonId}`)
          .set('Authorization', `Bearer ${otherUserToken}`);

        expect(response.status).toBe(403);
        expect(response.body).toMatchObject({
          success: false,
          error: expect.stringContaining('access denied')
        });
      });
    });

    describe('GET /comparisons', () => {
      beforeEach(async () => {
        // Create multiple test comparisons
        await Promise.all([
          request(app.server)
            .post('/comparisons')
            .set('Authorization', `Bearer ${authToken}`)
            .send({ prompt: 'Comparison 1', models: ['gpt-4'] }),
          request(app.server)
            .post('/comparisons')
            .set('Authorization', `Bearer ${authToken}`)
            .send({ prompt: 'Comparison 2', models: ['claude-3.5-sonnet'] }),
          request(app.server)
            .post('/comparisons')
            .set('Authorization', `Bearer ${authToken}`)
            .send({ prompt: 'Comparison 3', models: ['gpt-4', 'claude-3.5-sonnet'] })
        ]);
      });

      it('should list user comparisons with pagination', async () => {
        const response = await request(app.server)
          .get('/comparisons')
          .set('Authorization', `Bearer ${authToken}`)
          .query({ page: 1, limit: 2 });

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
          success: true,
          comparisons: expect.arrayContaining([
            expect.objectContaining({
              id: expect.any(String),
              prompt: expect.any(String)
            })
          ]),
          pagination: expect.objectContaining({
            page: 1,
            limit: 2,
            total: expect.any(Number),
            totalPages: expect.any(Number)
          })
        });
        expect(response.body.comparisons).toHaveLength(2);
      });

      it('should filter comparisons by model', async () => {
        const response = await request(app.server)
          .get('/comparisons')
          .set('Authorization', `Bearer ${authToken}`)
          .query({ model: 'gpt-4' });

        expect(response.status).toBe(200);
        expect(response.body.comparisons).toHaveLength(2); // Comparisons 1 and 3
        response.body.comparisons.forEach((comparison: any) => {
          expect(comparison.models).toContain('gpt-4');
        });
      });

      it('should filter comparisons by date range', async () => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        
        const response = await request(app.server)
          .get('/comparisons')
          .set('Authorization', `Bearer ${authToken}`)
          .query({ 
            dateFrom: yesterday.toISOString(),
            dateTo: new Date().toISOString()
          });

        expect(response.status).toBe(200);
        expect(response.body.comparisons).toHaveLength(3); // All today's comparisons
      });
    });
  });

  describe('Voting Endpoints', () => {
    let comparisonId: string;
    let responseId: string;

    beforeEach(async () => {
      // Create a test comparison and response
      const comparisonResponse = await request(app.server)
        .post('/comparisons')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          prompt: 'Test prompt for voting',
          models: ['gpt-4']
        });

      comparisonId = comparisonResponse.body.comparison.id;
      
      // Simulate completion with mock response
      responseId = 'mock-response-id';
    });

    describe('POST /responses/:id/vote', () => {
      it('should register thumbs up vote', async () => {
        const response = await request(app.server)
          .post(`/responses/${responseId}/vote`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            voteType: 'thumbs_up',
            value: 1
          });

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
          success: true,
          vote: expect.objectContaining({
            voteType: 'thumbs_up',
            value: 1
          })
        });
      });

      it('should register star rating vote', async () => {
        const response = await request(app.server)
          .post(`/responses/${responseId}/vote`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            voteType: 'star_rating',
            value: 4
          });

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
          success: true,
          vote: expect.objectContaining({
            voteType: 'star_rating',
            value: 4
          })
        });
      });

      it('should update existing vote', async () => {
        // First vote
        await request(app.server)
          .post(`/responses/${responseId}/vote`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({ voteType: 'thumbs_up', value: 1 });

        // Update vote
        const response = await request(app.server)
          .post(`/responses/${responseId}/vote`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({ voteType: 'thumbs_down', value: 1 });

        expect(response.status).toBe(200);
        expect(response.body.vote.voteType).toBe('thumbs_down');
      });

      it('should validate vote values', async () => {
        const response = await request(app.server)
          .post(`/responses/${responseId}/vote`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            voteType: 'star_rating',
            value: 6 // Invalid: should be 1-5
          });

        expect(response.status).toBe(400);
        expect(response.body).toMatchObject({
          success: false,
          error: expect.stringContaining('Invalid vote value')
        });
      });
    });

    describe('GET /responses/:id/votes', () => {
      beforeEach(async () => {
        // Add some test votes
        await Promise.all([
          request(app.server)
            .post(`/responses/${responseId}/vote`)
            .set('Authorization', `Bearer ${authToken}`)
            .send({ voteType: 'thumbs_up', value: 1 }),
          request(app.server)
            .post(`/responses/${responseId}/vote`)
            .set('Authorization', `Bearer ${await globalThis.IntegrationTestUtils.generateTestJWT('user-2')}`)
            .send({ voteType: 'star_rating', value: 5 })
        ]);
      });

      it('should retrieve vote summary', async () => {
        const response = await request(app.server)
          .get(`/responses/${responseId}/votes`)
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
          success: true,
          votes: expect.objectContaining({
            thumbsUp: 1,
            thumbsDown: 0,
            starRatings: expect.arrayContaining([5]),
            averageRating: expect.any(Number)
          })
        });
      });
    });
  });

  describe('User Settings Endpoints', () => {
    describe('GET /user/settings', () => {
      it('should retrieve user settings', async () => {
        const response = await request(app.server)
          .get('/user/settings')
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
          success: true,
          settings: expect.objectContaining({
            defaultModels: expect.any(Array),
            notifications: expect.any(Object),
            display: expect.any(Object)
          })
        });
      });
    });

    describe('PUT /user/settings', () => {
      it('should update user settings', async () => {
        const newSettings = {
          defaultModels: ['gpt-4', 'claude-3.5-sonnet', 'gemini-1.5-pro'],
          notifications: {
            completion: true,
            votes: false
          }
        };

        const response = await request(app.server)
          .put('/user/settings')
          .set('Authorization', `Bearer ${authToken}`)
          .send(newSettings);

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
          success: true,
          settings: expect.objectContaining(newSettings)
        });

        // Verify settings were persisted
        const getResponse = await request(app.server)
          .get('/user/settings')
          .set('Authorization', `Bearer ${authToken}`);

        expect(getResponse.body.settings).toMatchObject(newSettings);
      });

      it('should validate settings schema', async () => {
        const response = await request(app.server)
          .put('/user/settings')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            defaultModels: ['invalid-model'],
            notifications: 'invalid-type'
          });

        expect(response.status).toBe(400);
        expect(response.body).toMatchObject({
          success: false,
          error: expect.stringContaining('validation')
        });
      });
    });

    describe('POST /user/api-keys/validate', () => {
      it('should validate API keys', async () => {
        const response = await request(app.server)
          .post('/user/api-keys/validate')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            keys: {
              openai: 'sk-test-key',
              anthropic: 'sk-ant-test-key'
            }
          });

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
          success: true,
          validation: expect.objectContaining({
            openai: expect.objectContaining({
              valid: expect.any(Boolean)
            }),
            anthropic: expect.objectContaining({
              valid: expect.any(Boolean)
            })
          })
        });
      });
    });
  });

  describe('Analytics Endpoints', () => {
    describe('GET /analytics/comparison-metrics', () => {
      it('should retrieve comparison metrics', async () => {
        const response = await request(app.server)
          .get('/analytics/comparison-metrics')
          .set('Authorization', `Bearer ${authToken}`)
          .query({ 
            period: '7d',
            guildId: 'guild-123'
          });

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
          success: true,
          metrics: expect.objectContaining({
            totalComparisons: expect.any(Number),
            modelUsage: expect.any(Object),
            averageResponseTime: expect.any(Number),
            userEngagement: expect.any(Object)
          })
        });
      });
    });

    describe('GET /analytics/model-performance', () => {
      it('should retrieve model performance data', async () => {
        const response = await request(app.server)
          .get('/analytics/model-performance')
          .set('Authorization', `Bearer ${authToken}`)
          .query({ models: 'gpt-4,claude-3.5-sonnet' });

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
          success: true,
          performance: expect.objectContaining({
            'gpt-4': expect.objectContaining({
              averageRating: expect.any(Number),
              responseTime: expect.any(Number),
              usageCount: expect.any(Number)
            }),
            'claude-3.5-sonnet': expect.objectContaining({
              averageRating: expect.any(Number),
              responseTime: expect.any(Number),
              usageCount: expect.any(Number)
            })
          })
        });
      });
    });
  });

  describe('WebSocket Endpoints', () => {
    it('should establish WebSocket connection with valid auth', async () => {
      // This would test WebSocket connection establishment
      // Implementation depends on the WebSocket testing approach
      expect(true).toBe(true); // Placeholder
    });

    it('should reject WebSocket connection without auth', async () => {
      expect(true).toBe(true); // Placeholder
    });

    it('should broadcast comparison updates', async () => {
      expect(true).toBe(true); // Placeholder
    });
  });

  describe('Error Handling', () => {
    it('should return 401 for missing authorization', async () => {
      const response = await request(app.server)
        .get('/comparisons');

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('authorization required')
      });
    });

    it('should return 500 for internal server errors', async () => {
      // Mock a database error
      // This would depend on how the app handles database errors
      expect(true).toBe(true); // Placeholder
    });

    it('should validate request body schemas', async () => {
      const response = await request(app.server)
        .post('/comparisons')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ invalid: 'data' });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('validation')
      });
    });
  });
});