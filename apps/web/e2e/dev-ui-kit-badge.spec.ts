import { test, expect } from '@playwright/test';

test('renders all three Badge variants with distinct backgrounds', async ({ page }) => {
  await page.goto('/dev-ui-kit');

  const accent = page.getByText('Активний');
  const warning = page.getByText('Вакансія');
  const neutral = page.getByText('Гуртковий');

  await expect(accent).toBeVisible();
  await expect(warning).toBeVisible();
  await expect(neutral).toBeVisible();

  const accentBg = await accent.evaluate((el) => getComputedStyle(el).backgroundColor);
  const warningBg = await warning.evaluate((el) => getComputedStyle(el).backgroundColor);
  const neutralBg = await neutral.evaluate((el) => getComputedStyle(el).backgroundColor);

  expect(accentBg).not.toBe(warningBg);
  expect(accentBg).not.toBe(neutralBg);
  expect(warningBg).not.toBe(neutralBg);
});
