import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { createHurtok, createUserAs, loginForToken } from './helpers/proby-seed';

test('lets zvyazkovyi approve a pending request and the change takes effect', async ({ page }) => {
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

  // kurinniy creates the request
  await loginAs(page, kurinnyiEmail, 'password123');
  await page.goto('/users/new');
  const newJunakEmail = `approved-junak-${Date.now()}@example.com`;
  await page.getByLabel('Ім\'я').fill('Схвалений');
  await page.getByLabel('Прізвище').fill('Юнак');
  await page.getByLabel('Email').fill(newJunakEmail);
  await page.getByLabel('Гурток').selectOption({ label: 'Орлики' });
  await page.getByRole('button', { name: 'Надіслати запит' }).click();
  await expect(page.getByText('Запит створено')).toBeVisible();

  await page.request.post('http://localhost:3000/api/auth/logout');

  // zvyazkovyi approves it
  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto('/approval-requests');
  await page.getByText('Створення юнака').first().click();
  await page.getByRole('button', { name: 'Затвердити' }).click();
  await expect(page).toHaveURL(/\/approval-requests$/);

  await page.goto('/users');
  await expect(page.getByText('Юнак Схвалений')).toBeVisible();
});
