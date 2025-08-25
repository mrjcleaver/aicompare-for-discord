import { chromium, FullConfig } from '@playwright/test';
import { execSync } from 'child_process';

async function globalSetup(config: FullConfig) {
  console.log('🚀 Starting E2E test environment setup...');

  // Setup test database
  console.log('📊 Setting up test database...');
  try {
    execSync('npm run db:migrate:test', { stdio: 'inherit' });
    execSync('npm run db:seed:test', { stdio: 'inherit' });
  } catch (error) {
    console.warn('⚠️ Database setup failed, continuing with existing data');
  }

  // Setup test Redis instance
  console.log('🔄 Setting up test Redis...');
  try {
    execSync('redis-cli -n 15 flushdb', { stdio: 'pipe' });
  } catch (error) {
    console.warn('⚠️ Redis cleanup failed, continuing');
  }

  // Pre-authenticate a test user for authenticated tests
  console.log('🔐 Setting up test authentication...');
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto('/auth/test-login', { waitUntil: 'networkidle' });
    
    // Mock Discord OAuth for testing
    await page.route('**/api/auth/discord', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          token: 'test-jwt-token',
          user: {
            id: 'test-user-123',
            discordId: '123456789',
            username: 'testuser',
            avatar: 'test-avatar.png'
          }
        })
      });
    });

    // Save authentication state
    await context.storageState({ path: './tests/e2e/auth-state.json' });
    
    console.log('✅ Test user authenticated');
  } catch (error) {
    console.warn('⚠️ Test authentication setup failed:', error);
  }

  await browser.close();

  // Wait for services to be ready
  console.log('⏳ Waiting for services to be ready...');
  await waitForService('http://localhost:3000', 'Web Dashboard');
  await waitForService('http://localhost:3001/health', 'API Server');

  console.log('✅ E2E test environment setup complete!');
}

async function waitForService(url: string, serviceName: string, timeout: number = 60000): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status < 500) {
        console.log(`✅ ${serviceName} is ready`);
        return;
      }
    } catch (error) {
      // Service not ready yet
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  throw new Error(`${serviceName} failed to start within ${timeout}ms`);
}

export default globalSetup;