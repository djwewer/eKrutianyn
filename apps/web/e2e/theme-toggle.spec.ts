import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';

test('clicking the Nav theme toggle flips dark mode and persists across reload and login', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);

  const html = page.locator('html');
  await expect(html).not.toHaveClass(/dark/);

  const toggle = page.getByRole('switch', { name: 'Перемкнути темну тему' });
  await toggle.click();
  await expect(html).toHaveClass(/dark/);

  const cookies = await page.context().cookies();
  expect(cookies.find((c) => c.name === 'theme')?.value).toBe('dark');

  // Reload: the server now renders the dark class directly from the cookie.
  await page.reload();
  await expect(html).toHaveClass(/dark/);

  // The theme is independent of the session — it must survive logout/login.
  await page.getByRole('button', { name: 'Вийти' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(html).toHaveClass(/dark/);

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await expect(html).toHaveClass(/dark/);
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
});
