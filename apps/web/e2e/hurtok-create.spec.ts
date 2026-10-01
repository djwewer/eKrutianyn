import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';

test('lets zvyazkovyi create a new hurtok through the UI and land back on /kurin', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto('/kurin');
  await page.getByText('Гуртки').click();
  await page.getByRole('link', { name: 'Новий гурток' }).click();

  const hurtokName = `Нові Орлики ${Date.now()}`;
  await page.getByLabel('Назва').fill(hurtokName);
  await page.getByRole('button', { name: 'Створити' }).click();

  await expect(page).toHaveURL(/\/kurin$/);
  await page.getByText('Гуртки').click();
  await expect(page.getByText(hurtokName)).toBeVisible();
});
