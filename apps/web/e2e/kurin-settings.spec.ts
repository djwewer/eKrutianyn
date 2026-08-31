import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';

test('lets zvyazkovyi view kurin settings and change the proby program', async ({ page }) => {
  const { program: oldProgram } = await seedProbyProgram(['Стара точка']);
  const { program: newProgram } = await seedProbyProgram(['Нова точка']);
  const { zvyazkovyiEmail, zvyazkovyiPassword, kurin } = await seedKurinWithZvyazkovyi(oldProgram.id);

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto('/kurin');

  await expect(page.getByText(kurin.name)).toBeVisible();
  await page.getByLabel('ID нової програми').fill(newProgram.id);
  await page.getByRole('button', { name: 'Змінити програму' }).click();

  await expect(page.getByText(`Поточна програма: ${newProgram.id}`)).toBeVisible();
});
