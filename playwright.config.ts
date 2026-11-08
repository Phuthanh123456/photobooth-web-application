import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  testDir: './frontend/test', timeout: 100_000, workers: 1,
  use: { baseURL: 'http://localhost:5175', browserName: 'chromium', trace: 'retain-on-failure' },
  projects: [
    { name:'chromium', testMatch:'session.spec.ts', use:{browserName:'chromium'} },
    { name:'webkit-ipad', testMatch:'display-webkit.spec.ts', use:{browserName:'webkit'} },
  ],
  webServer: { command: 'npm run dev', cwd: fileURLToPath(new URL('.', import.meta.url)),
    env: { BACKEND_PORT: '3003', FRONTEND_PORT: '5175', STORAGE_ROOT: fileURLToPath(new URL('./.local/e2e-storage', import.meta.url)), CAMERA_MODE: 'MOCK', AUTO_SAVE_DIALOG:'0' },
    url: 'http://localhost:5175', timeout: 30_000, reuseExistingServer: false },
});
