import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';

test('redirects to /login when the session token becomes invalid', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto('/users');
  await expect(page).not.toHaveURL(/\/login$/);

  await page.context().addCookies([
    { name: 'accessToken', value: 'invalid-token', domain: 'localhost', path: '/' },
  ]);
  await page.reload();

  await expect(page).toHaveURL(/\/login$/);
});
