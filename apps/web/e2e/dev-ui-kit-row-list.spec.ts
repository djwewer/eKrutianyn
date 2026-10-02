import { test, expect } from '@playwright/test';

test('renders rows with avatar initials, name, subtitle, and trailing content', async ({ page }) => {
  await page.goto('/dev-ui-kit');

  await expect(page.getByText('Іван Мельник')).toBeVisible();
  await expect(page.getByText('Курінний')).toBeVisible();
  await expect(page.getByText('Олена Ткаченко')).toBeVisible();

  const rowListSection = page.locator('section', { has: page.getByRole('heading', { name: 'Row list' }) });
  await expect(rowListSection.getByText('ІМ', { exact: true })).toBeVisible();
  await expect(rowListSection.getByText('ОТ', { exact: true })).toBeVisible();
});
