import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';

test('lets a user reset a forgotten password end to end', async ({ page, request }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail } = await seedKurinWithZvyazkovyi(program.id);

  await page.goto('/forgot-password');
  await page.getByLabel('Email').fill(zvyazkovyiEmail);
  await page.getByRole('button', { name: 'Надіслати посилання' }).click();
  await expect(page.getByText('Якщо такий email зареєстровано')).toBeVisible();

  const mailRes = await request.get(
    `http://localhost:3001/admin/test-mail?to=${encodeURIComponent(zvyazkovyiEmail)}`,
    { headers: { 'x-admin-key': 'dev-admin-key' } },
  );
  const mail = await mailRes.json();
  expect(mail.type).toBe('password-reset');
  const token = new URL(mail.link).searchParams.get('token');

  await page.goto(`/reset-password?token=${token}`);
  await page.getByLabel('Новий пароль').fill('freshly-reset-password-123');
  await page.getByRole('button', { name: 'Встановити пароль' }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel('Email').fill(zvyazkovyiEmail);
  await page.getByLabel('Пароль').fill('freshly-reset-password-123');
  await page.getByRole('button', { name: 'Увійти' }).click();
  await expect(page).not.toHaveURL(/\/login$/);
});
