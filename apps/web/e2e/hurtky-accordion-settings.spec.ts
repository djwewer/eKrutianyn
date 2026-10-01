import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { createHurtok, loginForToken } from './helpers/proby-seed';

test('opens the settings dialog from an accordion row and saves the founding date', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);
  const hurtok = await createHurtok(zvyazkovyiToken, 'Орлики');

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto('/hurtky');
  await page.getByText('Орлики').click();

  await page.getByRole('button', { name: 'Налаштування' }).click();
  await page.getByLabel('Дата заснування').fill('2021-05-10');
  await page.getByRole('button', { name: 'Зберегти дату' }).click();

  await expect(page.getByText('Засновано 10.05.2021')).toBeVisible();
  // Рядок лишається розгорнутим — сторінка не перезавантажилась і не згорнулась.
  await expect(page).toHaveURL('/hurtky');
});
