import { defineConfig } from '@playwright/test';
import { generateVAPIDKeys } from 'web-push';
import { ADMIN_API_KEY, ADMIN_PASSWORD, ADMIN_USERNAME } from './e2e/helpers/seed';

const DATABASE_URL_TEST =
  process.env.DATABASE_URL_TEST ?? 'postgresql://plast:plast@localhost:5432/plast_test';
const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-jwt-secret';
// OpenAiService's constructor eagerly builds an OpenAI client and throws if no
// key is present at all, so the API can't even boot for e2e without this —
// no test here is meant to make a real OpenAI call (ai-vykhovnyk.spec.ts mocks
// the AI-assistant endpoints), this just needs to look like a key.
const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? 'test-openai-key';

// PushNotificationsService calls web-push setVapidDetails in its constructor,
// which throws on an empty key, so the API can't boot without a VAPID pair, and
// apps/api/.env has none. Test-only throwaway keys generated per run, never
// used for real pushes and not a production secret.
const VAPID = generateVAPIDKeys();
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY ?? VAPID.publicKey;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? VAPID.privateKey;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
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
        OPENAI_API_KEY,
        VAPID_PUBLIC_KEY,
        VAPID_PRIVATE_KEY,
        // The admin guard needs these and apps/api/.env doesn't define them;
        // the defaults match what the e2e seed helpers send.
        ADMIN_USERNAME,
        ADMIN_PASSWORD,
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
