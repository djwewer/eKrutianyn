import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { createHurtok, createUserAs, loginForToken } from './helpers/proby-seed';

test('zvyazkovyi sees and can use all 5 sections of the Курінь accordion', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);

  const hurtok = await createHurtok(zvyazkovyiToken, 'Орлики');
  await createUserAs(zvyazkovyiToken, {
    firstName: 'Петро',
    lastName: 'Петренко',
    email: `junak-${Date.now()}@example.com`,
    role: 'JUNAK',
    hurtokId: hurtok.id,
    password: 'password123',
  });
  await createUserAs(zvyazkovyiToken, {
    firstName: 'Вих',
    lastName: 'Овник',
    email: `vykhovnyk-${Date.now()}@example.com`,
    role: 'VYKHOVNYK',
  });

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto('/kurin');

  for (const title of ['Інформація про курінь', 'Провід куреня', 'Гуртки', 'Кадра виховників', 'Список юнацтва']) {
    await expect(page.getByText(title)).toBeVisible();
  }

  await page.getByText('Інформація про курінь').click();
  await expect(page.getByText('Номер', { exact: true })).toBeVisible();

  await page.getByText('Гуртки').click();
  await page.getByText('Орлики').click();
  await expect(page.getByText('Петренко Петро')).toBeVisible();

  await page.getByText('Кадра виховників').click();
  await expect(page.getByText('Овник Вих')).toBeVisible();

  await page.getByText('Список юнацтва').click();
  await expect(page.getByText('Петренко Петро')).toBeVisible();
});
