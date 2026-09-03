import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { createHurtok, createUserAs, loginForToken } from './helpers/proby-seed';

test('a junak with the kurinniy position sees the extended nav and can list users', async ({ page, request }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);

  const hurtok = await createHurtok(zvyazkovyiToken, 'Орлики');
  const junakEmail = `junak-kurinniy-${Date.now()}@example.com`;
  const junak = await createUserAs(zvyazkovyiToken, {
    firstName: 'Петро',
    lastName: 'Петренко',
    email: junakEmail,
    role: 'JUNAK',
    hurtokId: hurtok.id,
    password: 'password123',
  });

  await request.post('http://localhost:3001/kurin-positions', {
    headers: { Authorization: `Bearer ${zvyazkovyiToken}`, 'Content-Type': 'application/json' },
    data: { userId: junak.id, scope: 'KURIN', positionType: 'KURINNYI' },
  });

  await loginAs(page, junakEmail, 'password123');

  await expect(page.getByRole('link', { name: 'Юнаки' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Виховники' })).toBeVisible();

  await page.getByRole('link', { name: 'Юнаки' }).click();
  await expect(page).toHaveURL(/\/users$/);
});
