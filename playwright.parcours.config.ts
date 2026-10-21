import { defineConfig } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';

// Real client journey (tests/e2e/parcours-client.spec.ts) on the TEST database:
// the linked test project from this computer, the local stack on GitHub Actions.
if (existsSync('.env.tests.local')) process.loadEnvFile('.env.tests.local');
const url = process.env.E2E_SUPABASE_URL ?? '';
const cle = process.env.E2E_SUPABASE_KEY ?? '';
if (!url || !cle) throw new Error('Définir E2E_SUPABASE_URL et E2E_SUPABASE_KEY (clé publique) : voir README.');
// The browser and the SQL of the test must reach the same database.
const projet = process.env.TESTS_BASE === 'locale' ? null
  : existsSync('supabase/.temp/project-ref') ? readFileSync('supabase/.temp/project-ref', 'utf8').trim() : '';
if (projet === null ? !/^http:\/\/(127\.0\.0\.1|localhost):/.test(url) : !projet || !url.includes(projet)) {
  throw new Error('E2E_SUPABASE_URL doit viser la même base de test que TESTS_BASE.');
}

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /parcours-client\.spec\.ts/,
  workers: 1,
  timeout: 120_000,
  use: { baseURL: 'http://127.0.0.1:4180', browserName: 'chromium', channel: 'chrome', trace: 'retain-on-failure' },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --mode test --host 127.0.0.1 --port 4180 --strictPort',
    url: 'http://127.0.0.1:4180',
    env: {
      VITE_SUPABASE_URL: url,
      VITE_SUPABASE_PUBLISHABLE_KEY: cle,
      // Cloudflare test key: always passes, accepted by the server only with the test secret.
      VITE_TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
    },
  },
});
