import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';

test('lets zvyazkovyi view kurin settings and change the proby program', async ({ page }) => {
  const { program: oldProgram } = await seedProbyProgram(['Стара точка']);
  const { zvyazkovyiEmail, zvyazkovyiPassword, kurin } = await seedKurinWithZvyazkovyi(oldProgram.id);

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto('/kurin');

  await expect(page.getByText(kurin.name)).toBeVisible();
  await expect(page.getByText('Поточна програма: Стара')).toBeVisible();

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByLabel('Нова програма').check();
  await page.getByRole('button', { name: 'Змінити програму' }).click();

  await expect(page.getByText('Поточна програма: Нова')).toBeVisible();
});
