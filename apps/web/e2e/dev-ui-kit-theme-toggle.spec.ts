import { test, expect } from '@playwright/test';

test('clicking the theme toggle flips dark mode and the page background color changes', async ({ page }) => {
  await page.goto('/dev-ui-kit');

  const html = page.locator('html');
  await expect(html).not.toHaveClass(/dark/);

  const bgBefore = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

  const toggle = page.getByRole('switch', { name: 'Перемкнути темну тему' });
  await toggle.click();

  await expect(html).toHaveClass(/dark/);
  const bgAfter = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bgAfter).not.toBe(bgBefore);

  await toggle.click();
  await expect(html).not.toHaveClass(/dark/);
});
