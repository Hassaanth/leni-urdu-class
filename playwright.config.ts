import { defineConfig, devices } from '@playwright/test';

// Browser tests run against the production build (so the service worker is real).
// They use an installed browser channel (Chrome by default; PW_CHANNEL=msedge to switch)
// so no extra browser download is needed. Set PW_CHANNEL="" to use Playwright's bundled Chromium.
const channel = process.env.PW_CHANNEL ?? 'chrome';
const PORT = 4174;

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...(channel ? { channel } : {}),
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'iphone-size', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium', ...(channel ? { channel } : {}) } },
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 } }, testMatch: /layout\.spec\.ts/ },
  ],
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
