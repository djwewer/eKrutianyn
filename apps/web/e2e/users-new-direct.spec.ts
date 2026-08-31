import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';

test('lets zvyazkovyi create a vykhovnyk directly, no approval needed', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto('/users/new');

  await page.locator('#role').selectOption('VYKHOVNYK');
  await page.getByLabel('Ім\'я').fill('Новий');
  await page.getByLabel('Прізвище').fill('Виховник');
  await page.getByLabel('Email').fill(`new-vykhovnyk-${Date.now()}@example.com`);
  await page.getByRole('button', { name: 'Створити' }).click();

  await expect(page).toHaveURL(/\/users$/);
  await expect(page.getByText('Виховник Новий')).toBeVisible();
});
