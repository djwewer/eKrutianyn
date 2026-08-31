import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { createHurtok, createUserAs, loginForToken } from './helpers/proby-seed';

test('shows a clean access-denied state instead of a crash or false empty state', async ({ page }) => {
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

  // GET /approval-requests is ZVYAZKOVYI-only (@Roles(Role.ZVYAZKOVYI) on the controller),
  // so a kurinniy hitting it gets a 403.
  await loginAs(page, kurinnyiEmail, 'password123');
  await page.goto('/approval-requests');

  await expect(page.getByText('Немає доступу.')).toBeVisible();
});
