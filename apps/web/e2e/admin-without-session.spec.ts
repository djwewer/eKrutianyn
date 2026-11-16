import { test, expect } from '@playwright/test';

const ADMIN_API_KEY = process.env.ADMIN_API_KEY ?? 'dev-admin-key';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'dev-admin-password-change-me';

// The admin area has its own two factors (key + login/password), so it must be
// reachable without an єПластун account session.
test('admin can open /admin and log in without an єПластун session', async ({ page }) => {
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin$/);

  await page.getByPlaceholder('Адмін-ключ').fill(ADMIN_API_KEY);
  await page.getByPlaceholder('Логін').fill(ADMIN_USERNAME);
  await page.getByPlaceholder('Пароль').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Увійти' }).click();

  await expect(page.getByText('Курені', { exact: true })).toBeVisible();
});

test('other app pages still redirect to /login without a session', async ({ page }) => {
  await page.goto('/kurin');
  await expect(page).toHaveURL(/\/login$/);
});
