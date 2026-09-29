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

test('warns before reassigning a hurtok position even when the conflicting position is in a different hurtok', async ({
  page,
}) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);

  const hurtokA = await createHurtok(zvyazkovyiToken, 'Орлики');
  const hurtokB = await createHurtok(zvyazkovyiToken, 'Вовки');
  const junakEmail = `junak-${Date.now()}@example.com`;
  const junak = await createUserAs(zvyazkovyiToken, {
    firstName: 'Олег',
    lastName: 'Олененко',
    email: junakEmail,
    role: 'JUNAK',
    hurtokId: hurtokA.id,
    password: 'password123',
  });

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto('/positions');

  const orlykyCard = page.locator('[data-slot="card"]').filter({ hasText: 'Орлики' });
  const vovkyCard = page.locator('[data-slot="card"]').filter({ hasText: 'Вовки' });

  // Assign as Гуртковий while still in Орлики.
  await orlykyCard.getByText('Гуртковий').locator('..').getByRole('combobox').selectOption({ label: 'Олененко Олег' });
  await orlykyCard.getByText('Гуртковий').locator('..').getByRole('button', { name: 'Призначити' }).click();
  await expect(orlykyCard.getByText('Гуртковий').locator('..').getByText('Олененко Олег')).toBeVisible();

  // Move the junak to Вовки — this does NOT clear their Орлики position (users.service.ts only updates User.hurtokId).
  await page.goto(`/users/${junak.id}`);
  await page.getByLabel('Гурток').selectOption({ label: 'Вовки' });
  await page.getByRole('button', { name: 'Перевести' }).click();
  await expect(page.getByRole('combobox', { name: 'Гурток' })).toHaveValue(hurtokB.id);

  await page.goto('/positions');

  // Now selectable in Вовки's card (current hurtok), but still holds Гуртковий back in Орлики.
  await vovkyCard.getByText('Писар').locator('..').getByRole('combobox').selectOption({ label: 'Олененко Олег' });

  let dialogMessage = '';
  page.once('dialog', (dialog) => {
    dialogMessage = dialog.message();
    void dialog.dismiss();
  });
  await vovkyCard.getByText('Писар').locator('..').getByRole('button', { name: 'Призначити' }).click();
  await expect.poll(() => dialogMessage).toContain('Гуртковий');
  await expect.poll(() => dialogMessage).toContain('Орлики');

  // Declined — the Орлики position must still be intact.
  await expect(orlykyCard.getByText('Гуртковий').locator('..').getByText('Олененко Олег')).toBeVisible();
});
