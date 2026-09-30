import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';

test('shows the Книга судді card on /suddivstvo', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto('/suddivstvo');

  await expect(page.getByRole('heading', { name: 'Суддівство' })).toBeVisible();
  await expect(page.getByText('Книга судді не підключена.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Підключити Книгу судді' })).toBeVisible();
});

test('shows a message instead of the wizard when Книга судді is not connected', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto('/suddivstvo/junak-import');

  await expect(page.getByText('Спершу підключіть Книгу судді на сторінці')).toBeVisible();
  await expect(page.getByRole('link', { name: '«Суддівство»' })).toBeVisible();
});
