import { defineConfig } from '@playwright/test';

// Run with `npm run e2e`. It builds the app and serves it with `vite preview`.
// Needs a Chromium: `npx playwright install chromium` (or set PW_CHROMIUM to an existing binary).
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 1500, height: 950 },
    colorScheme: 'dark',
    acceptDownloads: true,
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
