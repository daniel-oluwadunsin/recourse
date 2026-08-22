import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command:
        'TSX_TSCONFIG_PATH=apps/api/tsconfig.json pnpm exec tsx scripts/e2e-server.ts',
      url: 'http://127.0.0.1:4000/api/v1/health',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command:
        'NEXT_PUBLIC_API_URL=http://127.0.0.1:4000/api/v1 pnpm --filter web build && NEXT_PUBLIC_API_URL=http://127.0.0.1:4000/api/v1 pnpm --filter web start',
      url: 'http://127.0.0.1:3000',
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
  outputDir: 'test-results',
});
