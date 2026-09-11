import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { createHurtok, createUserAs } from './helpers/proby-seed';

test('lets zvyazkovyi move a junak to another hurtok from the detail page', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);

  const cookies = await page.context().cookies();
  const token = cookies.find((c) => c.name === 'accessToken')?.value ?? '';
  const hurtokA = await createHurtok(token, 'Орлики');
  const hurtokB = await createHurtok(token, 'Вовки');
  const junak = await createUserAs(token, {
    firstName: 'Петро',
    lastName: 'Петренко',
    email: `junak-hurtok-${Date.now()}@example.com`,
    role: 'JUNAK',
    hurtokId: hurtokA.id,
  });

  await page.goto(`/users/${junak.id}`);
  await page.getByLabel('Гурток').selectOption({ label: 'Вовки' });
  await page.getByRole('button', { name: 'Перевести' }).click();

  await expect(page.getByRole('combobox', { name: 'Гурток' })).toHaveValue(hurtokB.id);
});
