import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  testDir: './frontend/test',
  timeout: 90_000,
  workers: 1,
  use: { baseURL: 'http://localhost:5173', browserName: 'chromium', trace: 'retain-on-failure' },
  webServer: { command: 'npm run dev', cwd: fileURLToPath(new URL('.', import.meta.url)), url: 'http://localhost:5173', timeout: 30_000, reuseExistingServer: false },
});
