import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { createHurtok, createUserAs, loginForToken } from './helpers/proby-seed';

test('lets zvyazkovyi assign and remove kurin positions', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);

  const hurtok = await createHurtok(zvyazkovyiToken, 'Орлики');
  const junakEmail = `junak-${Date.now()}@example.com`;
  await createUserAs(zvyazkovyiToken, {
    firstName: 'Петро',
    lastName: 'Петренко',
    email: junakEmail,
    role: 'JUNAK',
    hurtokId: hurtok.id,
    password: 'password123',
  });

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto('/positions');

  await page.getByText('Курінний').locator('..').getByRole('combobox').selectOption({ label: 'Петренко Петро' });
  await page.getByText('Курінний').locator('..').getByRole('button', { name: 'Призначити' }).click();

  await expect(page.getByText('Курінний').locator('..').getByText('Петренко Петро')).toBeVisible();

  await page.getByText('Курінний').locator('..').getByRole('button', { name: 'Зняти' }).click();
  await expect(page.getByText('Курінний').locator('..').getByRole('combobox')).toBeVisible();
});

test('warns before reassigning a junak who already holds another position in the same scope', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);

  const hurtok = await createHurtok(zvyazkovyiToken, 'Соколи');
  const junakEmail = `junak-${Date.now()}@example.com`;
  await createUserAs(zvyazkovyiToken, {
    firstName: 'Іван',
    lastName: 'Іваненко',
    email: junakEmail,
    role: 'JUNAK',
    hurtokId: hurtok.id,
    password: 'password123',
  });

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto('/positions');

  // Scope to the "Посади куреня" card — a hurtok exists too, and "Суддя" is
  // also a valid hurtok-scope position, so an unscoped getByText('Суддя')
  // would match twice.
  const kurinCard = page.locator('[data-slot="card"]').filter({ hasText: 'Посади куреня' });

  await kurinCard.getByText('Курінний').locator('..').getByRole('combobox').selectOption({ label: 'Іваненко Іван' });
  await kurinCard.getByText('Курінний').locator('..').getByRole('button', { name: 'Призначити' }).click();
  await expect(kurinCard.getByText('Курінний').locator('..').getByText('Іваненко Іван')).toBeVisible();

  await kurinCard.getByText('Суддя').locator('..').getByRole('combobox').selectOption({ label: 'Іваненко Іван' });

  let dialogMessage = '';
  page.once('dialog', (dialog) => {
    dialogMessage = dialog.message();
    void dialog.dismiss();
  });
  await kurinCard.getByText('Суддя').locator('..').getByRole('button', { name: 'Призначити' }).click();
  await expect.poll(() => dialogMessage).toContain('Курінний');

  // Declined — nothing changed: Курінний still occupied, Суддя still empty.
  await expect(kurinCard.getByText('Курінний').locator('..').getByText('Іваненко Іван')).toBeVisible();
  await expect(kurinCard.getByText('Суддя').locator('..').getByRole('combobox')).toBeVisible();

  page.once('dialog', (dialog) => void dialog.accept());
  await kurinCard.getByText('Суддя').locator('..').getByRole('button', { name: 'Призначити' }).click();

  await expect(kurinCard.getByText('Суддя').locator('..').getByText('Іваненко Іван')).toBeVisible();
  await expect(kurinCard.getByText('Курінний').locator('..').getByRole('combobox')).toBeVisible();
});
