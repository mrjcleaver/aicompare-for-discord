import { FullConfig } from '@playwright/test';
import { execSync } from 'child_process';
import fs from 'fs';

async function globalTeardown(config: FullConfig) {
  console.log('🧹 Starting E2E test environment teardown...');

  // Clean up test database
  console.log('📊 Cleaning up test database...');
  try {
    execSync('npm run db:clean:test', { stdio: 'inherit' });
  } catch (error) {
    console.warn('⚠️ Database cleanup failed:', error);
  }

  // Clean up test Redis
  console.log('🔄 Cleaning up test Redis...');
  try {
    execSync('redis-cli -n 15 flushdb', { stdio: 'pipe' });
  } catch (error) {
    console.warn('⚠️ Redis cleanup failed:', error);
  }

  // Remove auth state file
  try {
    if (fs.existsSync('./tests/e2e/auth-state.json')) {
      fs.unlinkSync('./tests/e2e/auth-state.json');
    }
  } catch (error) {
    console.warn('⚠️ Auth state cleanup failed:', error);
  }

  // Clean up any test artifacts
  console.log('🗂️ Cleaning up test artifacts...');
  try {
    execSync('find ./test-results -name "*.png" -type f -delete 2>/dev/null || true', { stdio: 'pipe' });
    execSync('find ./test-results -name "*.webm" -type f -delete 2>/dev/null || true', { stdio: 'pipe' });
  } catch (error) {
    // Ignore cleanup errors
  }

  console.log('✅ E2E test environment teardown complete!');
}

export default globalTeardown;