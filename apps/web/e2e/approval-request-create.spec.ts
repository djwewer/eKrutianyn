import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { createHurtok, createUserAs, loginForToken } from './helpers/proby-seed';

test('lets kurinniy request a new junak via approval-request', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);

  const hurtok = await createHurtok(zvyazkovyiToken, 'Орлики');
  const kurinnyiEmail = `kurinnyi-${Date.now()}@example.com`;
  await createUserAs(zvyazkovyiToken, {
    firstName: 'Кур',
    lastName: 'Інний',
    email: kurinnyiEmail,
    role: 'KURINNYI',
    hurtokId: hurtok.id,
    password: 'password123',
  });

  await loginAs(page, kurinnyiEmail, 'password123');
  await page.goto('/users/new');

  await page.getByLabel('Ім\'я').fill('Новий');
  await page.getByLabel('Прізвище').fill('Юнак');
  await page.getByLabel('Email').fill(`new-junak-${Date.now()}@example.com`);
  await page.getByLabel('Гурток').selectOption({ label: 'Орлики' });
  await page.getByRole('button', { name: 'Надіслати запит' }).click();

  await expect(page.getByText('Запит створено')).toBeVisible();
});
