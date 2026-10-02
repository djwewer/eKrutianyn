import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { createHurtok, createUserAs, loginForToken } from './helpers/proby-seed';

// AccordionRoot defaults `multiple` to false in the underlying library — both
// accordions on this page pass `multiple` explicitly to preserve the old
// manual Set-based behavior (several sections/rows open at once). This test
// exists so a future regression (someone dropping the prop) fails loudly
// instead of only being caught by a throwaway probe during review.
test('multiple top-level sections and multiple hurtok rows can stay open at the same time', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);

  const hurtokA = await createHurtok(zvyazkovyiToken, 'Орлики');
  const hurtokB = await createHurtok(zvyazkovyiToken, 'Соколи');
  await createUserAs(zvyazkovyiToken, {
    firstName: 'Петро',
    lastName: 'Петренко',
    email: `junak-a-${Date.now()}@example.com`,
    role: 'JUNAK',
    hurtokId: hurtokA.id,
    password: 'password123',
  });
  await createUserAs(zvyazkovyiToken, {
    firstName: 'Іван',
    lastName: 'Іваненко',
    email: `junak-b-${Date.now()}@example.com`,
    role: 'JUNAK',
    hurtokId: hurtokB.id,
    password: 'password123',
  });

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto('/kurin');

  // Top-level: open "Інформація по куреню" and "Провід куреня" together.
  await page.getByText('Інформація по куреню').click();
  await expect(page.getByText('Номер', { exact: true })).toBeVisible();

  await page.getByText('Провід куреня').click();
  await expect(page.getByText('Курінний')).toBeVisible();
  await expect(page.getByText('Номер', { exact: true })).toBeVisible();

  // Nested: open two different hurtok rows under "Гуртки" together.
  await page.getByText('Гуртки').click();
  await page.getByText('Орлики').click();
  await expect(page.getByText('Петренко Петро')).toBeVisible();

  await page.getByText('Соколи').click();
  await expect(page.getByText('Іваненко Іван')).toBeVisible();
  await expect(page.getByText('Петренко Петро')).toBeVisible();
});
