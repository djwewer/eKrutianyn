import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { createHurtok, createUserAs, loginForToken } from './helpers/proby-seed';

test('lets a junak add an activity entry and delete it, and shows the in-production note', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const accessToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);
  const hurtok = await createHurtok(accessToken, 'Орлики');
  const junakEmail = `junak-${Date.now()}@example.com`;
  await createUserAs(accessToken, {
    firstName: 'Юний',
    lastName: 'Пластун',
    email: junakEmail,
    role: 'JUNAK',
    hurtokId: hurtok.id,
    password: 'password123',
  });

  await loginAs(page, junakEmail, 'password123');
  await page.getByRole('link', { name: 'Моя активність' }).click();

  await expect(page.getByRole('heading', { name: 'Моя активність' })).toBeVisible();
  await expect(page.getByText('ще у виробництві')).toBeVisible();

  await page.getByPlaceholder('Назва акції (напр. «Теренівка»)').fill('Зимовий табір');
  await page.locator('select').selectOption('PROVID');
  await page.getByPlaceholder('Що ти там робив(-ла)?').fill('Допомагав(-ла) з організацією');
  await page.getByRole('button', { name: 'Додати' }).click();

  await expect(page.getByText('Зимовий табір')).toBeVisible();
  await expect(page.getByText('· в проводі')).toBeVisible();

  await page.getByRole('button', { name: 'Видалити' }).click();
  await expect(page.getByText('Зимовий табір')).not.toBeVisible();
});
