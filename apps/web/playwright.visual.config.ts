import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// Throwaway VAPID pair and admin credentials: the API refuses to boot without a
// VAPID pair, and its admin guard needs ADMIN_USERNAME/ADMIN_PASSWORD, but
// apps/api/.env has none of them (the regular e2e config has the same gap here).
// The credential defaults match e2e/helpers/seed.ts.
// Not a secret: it only satisfies web-push's constructor check.
const VAPID_PUBLIC_KEY = 'BAX3Z_cJ6IUBBCFhRrNyaOlCM2eKqYzS92e0OvyxgEZ4wxszoaoz4GOk7GizYVliXjscrES2k-2AQGnHT-4Q7d4';
const VAPID_PRIVATE_KEY = 'hxb0dbB5p3F-WmWvXcdCPa1XN6FbdP5Nzr-DdgHqbzE';

const ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'dev-admin-password-change-me';

const [apiServer, ...otherServers] = Array.isArray(base.webServer) ? base.webServer : [];

export default defineConfig({
  ...base,
  testDir: './visual',
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  outputDir: 'test-results/visual-run',
  webServer: [
    { ...apiServer, env: { ...apiServer.env, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, ADMIN_USERNAME, ADMIN_PASSWORD } },
    ...otherServers,
  ],
});
