import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// webServer (API/Next env incl. the throwaway VAPID and admin defaults) is
// inherited from the main e2e config.
export default defineConfig({
  ...base,
  testDir: './visual',
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  outputDir: 'test-results/visual-run',
});
