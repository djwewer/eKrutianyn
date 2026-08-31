import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { createHurtok, createUserAs, loginForToken } from './helpers/proby-seed';

test('lets kurinniy view vykhovnyk contacts read-only', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);

  const hurtok = await createHurtok(zvyazkovyiToken, 'Орлики');
  const vykhovnyk = await createUserAs(zvyazkovyiToken, {
    firstName: 'Вих',
    lastName: 'Овник',
    email: `vykhovnyk-${Date.now()}@example.com`,
    role: 'VYKHOVNYK',
  });
  const kurinnyiEmail = `kurinnyi-${Date.now()}@example.com`;
  await createUserAs(zvyazkovyiToken, {
    firstName: 'Кур',
    lastName: 'Інний',
    email: kurinnyiEmail,
    role: 'KURINNYI',
    hurtokId: hurtok.id,
    password: 'password123',
  });

  await loginAs(page, kurinnyiEmail, 'password123');
  await page.goto('/users');
  await page.getByRole('button', { name: 'Виховники' }).click();

  await expect(page.getByText(`${vykhovnyk.lastName} ${vykhovnyk.firstName}`)).toBeVisible();

  await page.getByText(`${vykhovnyk.lastName} ${vykhovnyk.firstName}`).click();
  await expect(page.getByLabel('Телефон')).toBeDisabled();
});
