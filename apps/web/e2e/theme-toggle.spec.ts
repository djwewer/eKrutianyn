import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';

test('choosing the theme radio on Налаштування flips dark mode and persists across reload and login', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);

  await page.goto('/settings');
  const main = page.locator('main');
  const html = page.locator('html');
  await expect(html).not.toHaveClass(/dark/);

  const dark = main.getByRole('radio', { name: 'Темна' });
  await dark.click();
  await expect(html).toHaveClass(/dark/);

  const cookies = await page.context().cookies();
  expect(cookies.find((c) => c.name === 'theme')?.value).toBe('dark');

  // Reload: the server now renders the dark class directly from the cookie.
  await page.reload();
  await expect(html).toHaveClass(/dark/);

  // The theme is independent of the session — it must survive logout/login.
  await main.getByRole('button', { name: 'Вийти' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(html).toHaveClass(/dark/);

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto('/settings');
  await expect(html).toHaveClass(/dark/);
  await expect(dark).toHaveAttribute('aria-checked', 'true');
});

test('choosing «Як у системі» follows the system color scheme', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);

  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/settings');
  const html = page.locator('html');
  const main = page.locator('main');

  await main.getByRole('radio', { name: 'Світла' }).click();
  await expect(html).not.toHaveClass(/dark/);

  await main.getByRole('radio', { name: 'Як у системі' }).click();
  await expect(html).toHaveClass(/dark/);
  expect((await page.context().cookies()).find((c) => c.name === 'theme')?.value).toBe('system');

  await page.reload();
  await expect(html).toHaveClass(/dark/);
  await expect(main.getByRole('radio', { name: 'Як у системі' })).toHaveAttribute('aria-checked', 'true');
});

test('«Як у системі» chosen after a light page load follows live system changes', async ({ page, context }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);

  await context.addCookies([{ name: 'theme', value: 'light', url: 'http://localhost:3000' }]);
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/settings');
  const html = page.locator('html');
  await expect(html).not.toHaveClass(/dark/);

  await page.locator('main').getByRole('radio', { name: 'Як у системі' }).click();
  await expect(html).not.toHaveClass(/dark/);

  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(html).toHaveClass(/dark/);
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(html).not.toHaveClass(/dark/);
});
