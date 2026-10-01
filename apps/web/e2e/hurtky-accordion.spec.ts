import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { createHurtok, createUserAs, loginForToken } from './helpers/proby-seed';

test('expands a hurtok row inline to show its members, without navigating away', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);
  const hurtok = await createHurtok(zvyazkovyiToken, 'Орлики');
  const junak = await createUserAs(zvyazkovyiToken, {
    firstName: 'Тест',
    lastName: `Юнак${Date.now()}`,
    email: `junak-${Date.now()}@example.com`,
    role: 'JUNAK',
    hurtokId: hurtok.id,
  });

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto('/kurin');
  await page.getByText('Гуртки').click();

  await expect(page.getByText(`${junak.lastName} ${junak.firstName}`)).not.toBeVisible();
  await page.getByText('Орлики').click();
  await expect(page).toHaveURL('/kurin');
  await expect(page.getByText(`${junak.lastName} ${junak.firstName}`)).toBeVisible();
});

test('keeps two rows expanded at the same time', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);
  await createHurtok(zvyazkovyiToken, 'Орлики');
  await createHurtok(zvyazkovyiToken, 'Соколи');

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto('/kurin');
  await page.getByText('Гуртки').click();

  await page.getByText('Орлики').click();
  await page.getByText('Соколи').click();

  await expect(page.getByRole('button', { name: 'Налаштування' })).toHaveCount(2);
});
