import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45000,
  expect: { timeout: 10000 },
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:3138',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'android-chromium', use: { ...devices['Pixel 7'] } },
    { name: 'iphone-webkit', use: { ...devices['iPhone 13'] } },
  ],
  webServer: {
    command: 'node node_modules/next/dist/bin/next dev -H 127.0.0.1 -p 3138',
    url: 'http://localhost:3138/api/ready',
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      APP_ORIGIN: 'http://localhost:3138',
      NEXT_TELEMETRY_DISABLED: '1',
      GIGACHAT_ENABLED: 'false',
    },
  },
});
