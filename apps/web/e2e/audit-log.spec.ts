import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { createHurtok, createUserAs, loginForToken } from './helpers/proby-seed';

test('shows zvyazkovyi the hurtok creation in the audit log', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const token = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);
  const hurtokName = `Журнальні Орлики ${Date.now()}`;
  await createHurtok(token, hurtokName);

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto('/audit-log');

  await expect(page.getByRole('heading', { name: 'Журнал дій' })).toBeVisible();
  await expect(page.getByText(`Створив гурток «${hurtokName}»`)).toBeVisible();
});

test('denies a non-zvyazkovyi access to the audit log', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const token = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);
  const hurtok = await createHurtok(token, 'Орлики');
  const email = `junak-${Date.now()}@example.com`;
  await createUserAs(token, { firstName: 'Юн', lastName: 'Ак', email, role: 'JUNAK', hurtokId: hurtok.id, password: 'password123' });

  await loginAs(page, email, 'password123');
  await page.goto('/audit-log');

  await expect(page.getByText('Немає доступу.')).toBeVisible();
  await expect(page.getByText('Створив гурток')).toHaveCount(0);
});
