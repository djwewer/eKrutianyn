import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { createHurtok, createUserAs, loginForToken } from './helpers/proby-seed';

test('lets zvyazkovyi expand a proba category and confirm a point from the junak detail page', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);

  const hurtok = await createHurtok(zvyazkovyiToken, 'Орлики');
  const junak = await createUserAs(zvyazkovyiToken, {
    firstName: 'Петро',
    lastName: 'Петренко',
    email: `junak-proba-${Date.now()}@example.com`,
    role: 'JUNAK',
    hurtokId: hurtok.id,
  });

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto(`/users/${junak.id}`);

  const proba = page.getByTestId('junak-proba');
  await expect(proba).toContainText('0 з 1 точок');
  // Collapsed by default: neither stages nor points are rendered until expanded.
  await expect(page.getByText('Категорія 1 (0/1)')).toHaveCount(0);
  await proba.getByRole('button', { name: /^Проба/ }).click();
  await page.getByText('Категорія 1 (0/1)').click();
  await expect(page.getByRole('button', { name: 'Підтвердити' })).toBeVisible();

  await page.getByRole('button', { name: 'Підтвердити' }).click();
  await expect(page.getByRole('button', { name: 'Зняти' })).toBeVisible();
  await expect(proba).toContainText('1 з 1 точок');
});
