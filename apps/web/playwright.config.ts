import { defineConfig } from '@playwright/test';

const DATABASE_URL_TEST =
  process.env.DATABASE_URL_TEST ?? 'postgresql://plast:plast@localhost:5432/plast_test';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY ?? 'dev-admin-key';
const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-jwt-secret';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:3000',
  },
  webServer: [
    {
      command: 'npm run start:dev',
      cwd: '../api',
      url: 'http://localhost:3001/health',
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        PORT: '3001',
        DATABASE_URL: DATABASE_URL_TEST,
        ADMIN_API_KEY,
        JWT_SECRET,
        MAIL_MODE: 'test',
        MAIL_FROM: 'test@example.com',
        FRONTEND_URL: 'http://localhost:3000',
      },
    },
    {
      command: 'npm run dev',
      url: 'http://localhost:3000',
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        API_URL: 'http://localhost:3001',
      },
    },
  ],
});
