import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { createHurtok, loginForToken, createOnboardedUserAs } from './helpers/proby-seed';

test('a junak with the kurinniy position sees the Курінь nav link', async ({ page, request }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);

  const hurtok = await createHurtok(zvyazkovyiToken, 'Орлики');
  const junakEmail = `junak-kurinniy-${Date.now()}@example.com`;
  const junak = await createOnboardedUserAs(zvyazkovyiToken, {
    firstName: 'Петро',
    lastName: 'Петренко',
    email: junakEmail,
    role: 'JUNAK',
    hurtokId: hurtok.id,
    password: 'password123',
  });

  await request.post('http://localhost:3001/kurin-positions', {
    headers: { Authorization: `Bearer ${zvyazkovyiToken}`, 'Content-Type': 'application/json' },
    data: { userId: junak.user.id, scope: 'KURIN', positionType: 'KURINNYI' },
  });

  await loginAs(page, junakEmail, 'password123');

  await expect(page.getByRole('link', { name: 'Курінь', exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'Курінь', exact: true }).click();
  await expect(page).toHaveURL(/\/kurin$/);
});
