import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';

test('lets zvyazkovyi change their own nickname and password from settings', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto('/settings');

  await page.getByLabel('Нікнейм').fill('Сокіл');
  await page.getByRole('button', { name: 'Зберегти' }).click();
  await expect(page.getByText('Збережено.')).toBeVisible();

  await page.getByTestId('currentPassword').fill(zvyazkovyiPassword);
  await page.getByTestId('newPassword').fill('a-brand-new-password-123');
  await page.getByRole('button', { name: 'Змінити пароль' }).click();
  await expect(page.getByText('Пароль змінено.')).toBeVisible();

  await page.request.post('http://localhost:3000/api/auth/logout');
  await page.goto('/login');
  await page.getByLabel('Email').fill(zvyazkovyiEmail);
  await page.getByLabel('Пароль').fill('a-brand-new-password-123');
  await page.getByRole('button', { name: 'Увійти' }).click();
  await expect(page).not.toHaveURL(/\/login$/);
});
