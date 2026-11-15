import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { createHurtok, createUserAs, loginForToken } from './helpers/proby-seed';
import { acceptInviteFor } from './helpers/invite';

test('redirects any authenticated role from / to /news', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto('/');

  await expect(page).toHaveURL(/\/news$/);
});

test('redirects a junak from / to /news too', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);
  const hurtok = await createHurtok(zvyazkovyiToken, 'Домашні Орли');

  const junakEmail = `junak-home-${Date.now()}@example.com`;
  const junakPassword = 'password123';
  await createUserAs(zvyazkovyiToken, {
    firstName: 'Тест',
    lastName: 'Юнак',
    email: junakEmail,
    role: 'JUNAK',
    hurtokId: hurtok.id,
    password: junakPassword,
  });

  await acceptInviteFor(junakEmail);

  await loginAs(page, junakEmail, junakPassword);
  await page.goto('/');

  await expect(page).toHaveURL(/\/news$/);
});
