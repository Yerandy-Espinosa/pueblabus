import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    launchOptions: { executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] },
    trace: 'retain-on-failure',
  },
  webServer: { command: 'npm run dev', url: 'http://127.0.0.1:5173/api/health', reuseExistingServer: !process.env.CI, timeout: 30_000 },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
});
