import { test, expect } from '@playwright/test';

test('renders avatar initials', async ({ page }) => {
  await page.goto('/dev-ui-kit');

  await expect(page.getByText('ТШ', { exact: true })).toBeVisible();
  await expect(page.getByText('МК', { exact: true })).toBeVisible();
});
