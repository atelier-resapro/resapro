import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:4179', browserName: 'chromium', channel: 'chrome' },
  projects: [
    { name: 'ui', testMatch: /client-ui\.spec\.ts/ },
    { name: 'supabase-local', testMatch: /client-auth\.spec\.ts/ },
  ],
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --mode test --host 127.0.0.1 --port 4179 --strictPort',
    url: 'http://127.0.0.1:4179', reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === '1',
    env: {
      VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
      VITE_SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_TEST_ANON_KEY ?? 'local-tests-only',
      VITE_TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
    },
  },
});
