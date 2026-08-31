import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { createHurtok, createUserAs, loginForToken } from './helpers/proby-seed';

test('lets zvyazkovyi create a hurtok and assign a vykhovnyk to it', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);
  const vykhovnyk = await createUserAs(zvyazkovyiToken, {
    firstName: 'Вих',
    lastName: 'Овник',
    email: `vykhovnyk-${Date.now()}@example.com`,
    role: 'VYKHOVNYK',
  });

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto('/hurtky/new');
  await page.getByLabel('Назва').fill('Соколи');
  await page.getByRole('button', { name: 'Створити' }).click();
  await expect(page).toHaveURL(/\/hurtky$/);

  await page.goto('/vykhovnyk-assignments');
  await page.locator('select').first().selectOption({ label: `${vykhovnyk.lastName} ${vykhovnyk.firstName}` });
  await page.locator('select').nth(1).selectOption({ label: 'Соколи' });
  await page.getByRole('button', { name: 'Призначити' }).click();

  await expect(page.getByText(`${vykhovnyk.lastName} ${vykhovnyk.firstName} → Соколи`)).toBeVisible();
});
