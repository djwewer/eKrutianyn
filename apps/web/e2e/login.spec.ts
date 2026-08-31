import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';

test('lets a zvyazkovyi log in with email and password', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);

  await expect(page).not.toHaveURL(/\/login$/);
});

test('shows an error and stays on the login page for wrong credentials', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('nobody@example.com');
  await page.getByLabel('Пароль').fill('wrongpassword');
  await page.getByRole('button', { name: 'Увійти' }).click();

  await expect(page.getByText('Невірний email або пароль')).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test('redirects an unauthenticated visitor to /login', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
});
