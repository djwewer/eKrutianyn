import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';

test('lets zvyazkovyi add an inventory item with a photo and delete it', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.getByText('Діловодство').click();
  await page.getByRole('link', { name: 'Облік реманенту' }).click();

  await expect(page.getByRole('heading', { name: 'Облік реманенту' })).toBeVisible();

  await page.getByPlaceholder('Назва (наприклад, Пилка)').fill('Тестова пилка');
  await page.getByPlaceholder('Кількість').fill('3');
  await page.getByRole('button', { name: 'Додати річ' }).click();

  await expect(page.getByText('Тестова пилка')).toBeVisible();
  await expect(page.getByText('Кількість: 3')).toBeVisible();

  await page.getByRole('button', { name: 'Видалити' }).click();
  await expect(page.getByText('Тестова пилка')).not.toBeVisible();
});
