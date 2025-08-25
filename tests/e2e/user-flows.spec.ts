import { test, expect } from '@playwright/test';

test.describe('Critical User Flows', () => {
  
  test.describe('Authentication Flow', () => {
    test('should complete Discord OAuth login flow', async ({ page }) => {
      // Start at homepage
      await page.goto('/');
      
      // Should show login prompt for unauthenticated user
      await expect(page.getByText('Sign in with Discord')).toBeVisible();
      
      // Click sign in button
      const signInButton = page.getByRole('button', { name: /sign in with discord/i });
      await signInButton.click();
      
      // Should redirect to Discord OAuth (mocked in test)
      await expect(page).toHaveURL(/auth\/discord/);
      
      // Mock successful OAuth response
      await page.route('**/api/auth/discord', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            token: 'mock-jwt-token',
            user: {
              id: 'test-user-123',
              discordId: '123456789',
              username: 'testuser',
              avatar: 'https://cdn.discordapp.com/avatars/123456789/test-avatar.png'
            }
          })
        });
      });
      
      // Complete OAuth flow
      await page.goto('/auth/callback?code=test_code');
      
      // Should redirect to dashboard after successful login
      await expect(page).toHaveURL('/dashboard');
      
      // Should show user info in header
      await expect(page.getByText('testuser')).toBeVisible();
      await expect(page.getByTestId('user-avatar')).toBeVisible();
    });

    test('should handle OAuth errors gracefully', async ({ page }) => {
      await page.goto('/auth/discord');
      
      // Mock OAuth error
      await page.route('**/api/auth/discord', async route => {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            error: 'Invalid authorization code'
          })
        });
      });
      
      await page.goto('/auth/callback?code=invalid_code');
      
      // Should show error message
      await expect(page.getByText(/authentication failed/i)).toBeVisible();
      
      // Should provide retry option
      const retryButton = page.getByRole('button', { name: /try again/i });
      await expect(retryButton).toBeVisible();
    });

    test('should logout user successfully', async ({ page }) => {
      // Use pre-authenticated state
      await page.goto('/dashboard', { 
        storageState: './tests/e2e/auth-state.json' 
      });
      
      // Open user menu
      const userMenu = page.getByTestId('user-menu');
      await userMenu.click();
      
      // Click logout
      const logoutButton = page.getByRole('menuitem', { name: /logout/i });
      await logoutButton.click();
      
      // Should redirect to homepage
      await expect(page).toHaveURL('/');
      
      // Should show sign in button again
      await expect(page.getByText('Sign in with Discord')).toBeVisible();
    });
  });

  test.describe('AI Comparison Flow', () => {
    test.beforeEach(async ({ page }) => {
      // Use authenticated state
      await page.goto('/dashboard', { 
        storageState: './tests/e2e/auth-state.json' 
      });
    });

    test('should create new comparison successfully', async ({ page }) => {
      // Navigate to create comparison
      const newComparisonButton = page.getByRole('button', { name: /new comparison/i });
      await newComparisonButton.click();
      
      // Should open comparison form
      await expect(page.getByTestId('comparison-form')).toBeVisible();
      
      // Fill in comparison details
      const promptInput = page.getByLabel(/prompt/i);
      await promptInput.fill('Explain quantum computing in simple terms');
      
      // Select models
      const gpt4Checkbox = page.getByLabel(/gpt-4/i);
      const claudeCheckbox = page.getByLabel(/claude.*sonnet/i);
      await gpt4Checkbox.check();
      await claudeCheckbox.check();
      
      // Set temperature
      const temperatureSlider = page.getByLabel(/temperature/i);
      await temperatureSlider.fill('0.7');
      
      // Mock API response for comparison creation
      await page.route('**/api/comparisons', async route => {
        if (route.request().method() === 'POST') {
          await route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              comparison: {
                id: 'comparison-test-123',
                prompt: 'Explain quantum computing in simple terms',
                models: ['gpt-4', 'claude-3.5-sonnet'],
                status: 'queued',
                createdAt: new Date().toISOString()
              }
            })
          });
        }
      });
      
      // Submit form
      const submitButton = page.getByRole('button', { name: /start comparison/i });
      await submitButton.click();
      
      // Should redirect to comparison page
      await expect(page).toHaveURL(/\/comparison\/comparison-test-123/);
      
      // Should show processing state
      await expect(page.getByText(/processing/i)).toBeVisible();
      await expect(page.getByTestId('progress-indicator')).toBeVisible();
    });

    test('should display comparison results correctly', async ({ page }) => {
      // Mock completed comparison data
      const mockComparison = {
        id: 'comparison-123',
        query: {
          prompt: 'Explain quantum computing',
          modelsRequested: ['gpt-4', 'claude-3.5-sonnet'],
          parameters: { temperature: 0.7 }
        },
        responses: [
          {
            id: 'response-1',
            modelName: 'gpt-4',
            content: 'Quantum computing is a revolutionary technology that uses quantum mechanical phenomena...',
            responseTimeMs: 1200,
            tokenCount: 215,
            costUsd: 0.0043
          },
          {
            id: 'response-2',
            modelName: 'claude-3.5-sonnet',
            content: 'Quantum computing represents a fundamental shift in computational paradigms...',
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
        status: 'completed'
      };
      
      await page.route('**/api/comparisons/comparison-123', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            comparison: mockComparison
          })
        });
      });
      
      await page.goto('/comparison/comparison-123');
      
      // Should display prompt
      await expect(page.getByText('Explain quantum computing')).toBeVisible();
      
      // Should display both responses
      await expect(page.getByText('GPT-4')).toBeVisible();
      await expect(page.getByText('Claude-3.5-Sonnet')).toBeVisible();
      
      // Should display response content
      await expect(page.getByText(/revolutionary technology/)).toBeVisible();
      await expect(page.getByText(/fundamental shift/)).toBeVisible();
      
      // Should display metrics
      await expect(page.getByText('87%')).toBeVisible(); // Semantic similarity
      await expect(page.getByText('91%')).toBeVisible(); // Length consistency
      
      // Should display response metadata
      await expect(page.getByText('1200ms')).toBeVisible(); // GPT-4 response time
      await expect(page.getByText('950ms')).toBeVisible(); // Claude response time
    });

    test('should handle comparison voting', async ({ page }) => {
      await page.goto('/comparison/comparison-123');
      
      // Wait for comparison to load
      await expect(page.getByText('GPT-4')).toBeVisible();
      
      // Mock vote submission
      await page.route('**/api/responses/*/vote', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            vote: {
              id: 'vote-123',
              responseId: route.request().url().match(/responses\/(.+)\/vote/)?.[1],
              voteType: 'thumbs_up',
              value: 1
            }
          })
        });
      });
      
      // Click thumbs up on first response
      const thumbsUpButtons = page.getByRole('button', { name: /thumbs up/i });
      await thumbsUpButtons.first().click();
      
      // Should show success feedback
      await expect(page.getByText(/vote submitted/i)).toBeVisible();
      
      // Vote button should show selected state
      await expect(thumbsUpButtons.first()).toHaveClass(/voted|active/);
    });

    test('should support star ratings', async ({ page }) => {
      await page.goto('/comparison/comparison-123');
      
      // Mock star rating submission
      await page.route('**/api/responses/*/vote', async route => {
        const requestBody = await route.request().postData();
        const voteData = JSON.parse(requestBody || '{}');
        
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            vote: {
              id: 'vote-star-123',
              responseId: route.request().url().match(/responses\/(.+)\/vote/)?.[1],
              voteType: 'star_rating',
              value: voteData.value
            }
          })
        });
      });
      
      // Click 4-star rating on first response
      const starRatings = page.getByTestId('star-rating');
      const fourStarButton = starRatings.first().locator('[data-rating="4"]');
      await fourStarButton.click();
      
      // Should highlight selected stars
      const stars = starRatings.first().locator('.star');
      for (let i = 0; i < 4; i++) {
        await expect(stars.nth(i)).toHaveClass(/filled|active/);
      }
    });
  });

  test.describe('History and Navigation Flow', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/dashboard', { 
        storageState: './tests/e2e/auth-state.json' 
      });
    });

    test('should navigate to history page', async ({ page }) => {
      const historyLink = page.getByRole('link', { name: /history/i });
      await historyLink.click();
      
      await expect(page).toHaveURL('/history');
      await expect(page.getByText('Comparison History')).toBeVisible();
    });

    test('should display and filter comparison history', async ({ page }) => {
      // Mock history data
      const mockHistory = {
        comparisons: [
          {
            id: 'comp-1',
            query: { prompt: 'Explain AI', modelsRequested: ['gpt-4'] },
            createdAt: '2023-12-01T10:00:00Z'
          },
          {
            id: 'comp-2',
            query: { prompt: 'What is blockchain', modelsRequested: ['claude-3.5-sonnet'] },
            createdAt: '2023-12-01T09:00:00Z'
          }
        ],
        pagination: { page: 1, totalPages: 1, total: 2 }
      };
      
      await page.route('**/api/comparisons*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            ...mockHistory
          })
        });
      });
      
      await page.goto('/history');
      
      // Should display comparisons
      await expect(page.getByText('Explain AI')).toBeVisible();
      await expect(page.getByText('What is blockchain')).toBeVisible();
      
      // Test filtering
      const filterInput = page.getByLabel(/filter/i);
      await filterInput.fill('gpt-4');
      
      // Should filter results
      await expect(page.getByText('Explain AI')).toBeVisible();
      await expect(page.getByText('What is blockchain')).not.toBeVisible();
    });

    test('should navigate to comparison from history', async ({ page }) => {
      await page.goto('/history');
      
      // Click on a comparison entry
      const comparisonCard = page.getByTestId('comparison-card').first();
      await comparisonCard.click();
      
      // Should navigate to comparison details
      await expect(page).toHaveURL(/\/comparison\/.+/);
    });
  });

  test.describe('Settings Flow', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/settings', { 
        storageState: './tests/e2e/auth-state.json' 
      });
    });

    test('should display current user settings', async ({ page }) => {
      // Mock settings data
      await page.route('**/api/user/settings', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            settings: {
              defaultModels: ['gpt-4', 'claude-3.5-sonnet'],
              notifications: { completion: true, votes: false },
              display: { theme: 'light', format: 'detailed' }
            }
          })
        });
      });
      
      await page.reload();
      
      // Should display settings
      await expect(page.getByText('User Settings')).toBeVisible();
      
      // Should show current model selections
      const gpt4Checkbox = page.getByLabel(/gpt-4/i);
      const claudeCheckbox = page.getByLabel(/claude.*sonnet/i);
      
      await expect(gpt4Checkbox).toBeChecked();
      await expect(claudeCheckbox).toBeChecked();
    });

    test('should update model preferences', async ({ page }) => {
      // Mock settings update
      await page.route('**/api/user/settings', async route => {
        if (route.request().method() === 'PUT') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              settings: { /* updated settings */ }
            })
          });
        }
      });
      
      // Change model selection
      const geminiCheckbox = page.getByLabel(/gemini/i);
      await geminiCheckbox.check();
      
      // Save settings
      const saveButton = page.getByRole('button', { name: /save/i });
      await saveButton.click();
      
      // Should show success message
      await expect(page.getByText(/settings updated/i)).toBeVisible();
    });

    test('should update notification preferences', async ({ page }) => {
      const notificationsTab = page.getByRole('tab', { name: /notifications/i });
      await notificationsTab.click();
      
      // Toggle notification settings
      const completionToggle = page.getByLabel(/completion notifications/i);
      await completionToggle.click();
      
      const votesToggle = page.getByLabel(/vote notifications/i);
      await votesToggle.click();
      
      // Save settings
      const saveButton = page.getByRole('button', { name: /save/i });
      await saveButton.click();
      
      await expect(page.getByText(/settings updated/i)).toBeVisible();
    });
  });

  test.describe('Error Handling Flow', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/dashboard', { 
        storageState: './tests/e2e/auth-state.json' 
      });
    });

    test('should handle API errors gracefully', async ({ page }) => {
      // Mock API error
      await page.route('**/api/comparisons', async route => {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            error: 'Internal server error'
          })
        });
      });
      
      // Trigger API call
      const newComparisonButton = page.getByRole('button', { name: /new comparison/i });
      await newComparisonButton.click();
      
      const submitButton = page.getByRole('button', { name: /start comparison/i });
      await submitButton.click();
      
      // Should show error message
      await expect(page.getByText(/something went wrong/i)).toBeVisible();
      
      // Should provide retry option
      const retryButton = page.getByRole('button', { name: /retry/i });
      await expect(retryButton).toBeVisible();
    });

    test('should handle network connectivity issues', async ({ page }) => {
      // Simulate network failure
      await page.context().setOffline(true);
      
      // Try to navigate
      await page.goto('/comparison/test-123');
      
      // Should show offline message
      await expect(page.getByText(/offline/i)).toBeVisible();
      
      // Restore connectivity
      await page.context().setOffline(false);
      
      // Should recover when online
      await page.reload();
      await expect(page.getByText(/offline/i)).not.toBeVisible();
    });

    test('should handle rate limiting', async ({ page }) => {
      // Mock rate limit response
      await page.route('**/api/comparisons', async route => {
        await route.fulfill({
          status: 429,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            error: 'Rate limit exceeded',
            retryAfter: 60
          })
        });
      });
      
      const newComparisonButton = page.getByRole('button', { name: /new comparison/i });
      await newComparisonButton.click();
      
      const submitButton = page.getByRole('button', { name: /start comparison/i });
      await submitButton.click();
      
      // Should show rate limit message with countdown
      await expect(page.getByText(/rate limit/i)).toBeVisible();
      await expect(page.getByText(/try again in/i)).toBeVisible();
    });
  });

  test.describe('Mobile Responsive Flow', () => {
    test.use({ viewport: { width: 375, height: 667 } }); // iPhone SE size

    test.beforeEach(async ({ page }) => {
      await page.goto('/dashboard', { 
        storageState: './tests/e2e/auth-state.json' 
      });
    });

    test('should navigate using mobile menu', async ({ page }) => {
      // Should show mobile menu button
      const menuButton = page.getByTestId('mobile-menu-button');
      await expect(menuButton).toBeVisible();
      
      // Open mobile menu
      await menuButton.click();
      
      // Should show navigation links
      const mobileMenu = page.getByTestId('mobile-menu');
      await expect(mobileMenu).toBeVisible();
      
      // Navigate to history
      const historyLink = mobileMenu.getByRole('link', { name: /history/i });
      await historyLink.click();
      
      await expect(page).toHaveURL('/history');
    });

    test('should display comparison in mobile layout', async ({ page }) => {
      await page.goto('/comparison/comparison-123');
      
      // Should use mobile-optimized layout
      const comparisonContainer = page.getByTestId('comparison-container');
      await expect(comparisonContainer).toHaveClass(/mobile/);
      
      // Responses should be stacked vertically
      const responseCards = page.getByTestId('response-card');
      await expect(responseCards).toHaveCount(2);
      
      // Should have swipeable interface on mobile
      await expect(page.getByTestId('swipe-indicator')).toBeVisible();
    });

    test('should have touch-friendly voting interface', async ({ page }) => {
      await page.goto('/comparison/comparison-123');
      
      // Vote buttons should be appropriately sized for touch
      const voteButtons = page.getByRole('button', { name: /thumbs/i });
      
      for (const button of await voteButtons.all()) {
        const boundingBox = await button.boundingBox();
        expect(boundingBox?.width).toBeGreaterThanOrEqual(44); // Minimum touch target
        expect(boundingBox?.height).toBeGreaterThanOrEqual(44);
      }
    });
  });

  test.describe('Performance Flow', () => {
    test('should load pages within performance budget', async ({ page }) => {
      // Monitor network and performance
      const responsePromise = page.waitForResponse('**/api/comparisons**');
      
      const startTime = Date.now();
      await page.goto('/dashboard', { 
        storageState: './tests/e2e/auth-state.json' 
      });
      
      await responsePromise;
      const loadTime = Date.now() - startTime;
      
      // Should load within 3 seconds
      expect(loadTime).toBeLessThan(3000);
      
      // Check core web vitals
      const metrics = await page.evaluate(() => {
        return new Promise(resolve => {
          new PerformanceObserver(list => {
            const entries = list.getEntries();
            const vitals = entries.reduce((acc: any, entry: any) => {
              acc[entry.name] = entry.value;
              return acc;
            }, {});
            resolve(vitals);
          }).observe({ entryTypes: ['measure', 'navigation'] });
        });
      });
      
      console.log('Performance metrics:', metrics);
    });

    test('should handle large comparison results efficiently', async ({ page }) => {
      // Mock large comparison data
      const largeComparison = {
        id: 'large-comparison',
        responses: Array(10).fill(null).map((_, i) => ({
          id: `response-${i}`,
          modelName: `Model ${i}`,
          content: 'Large response content...'.repeat(100),
          responseTimeMs: 1000 + i * 100
        }))
      };
      
      await page.route('**/api/comparisons/large-comparison', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, comparison: largeComparison })
        });
      });
      
      const startTime = Date.now();
      await page.goto('/comparison/large-comparison');
      
      // Should render without blocking
      await expect(page.getByText('Model 0')).toBeVisible();
      const renderTime = Date.now() - startTime;
      
      // Should render large data set within reasonable time
      expect(renderTime).toBeLessThan(5000);
      
      // Should implement virtualization for performance
      const visibleResponses = await page.getByTestId('response-card').count();
      expect(visibleResponses).toBeLessThanOrEqual(5); // Virtualized view
    });
  });
});