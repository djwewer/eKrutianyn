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
  await page.goto('/kurin');
  await page.getByText('Провід куреня').click();

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
  await page.goto('/kurin');
  await page.getByText('Провід куреня').click();

  await page.getByText('Курінний').locator('..').getByRole('combobox').selectOption({ label: 'Іваненко Іван' });
  await page.getByText('Курінний').locator('..').getByRole('button', { name: 'Призначити' }).click();
  await expect(page.getByText('Курінний').locator('..').getByText('Іваненко Іван')).toBeVisible();

  await page.getByText('Суддя').locator('..').getByRole('combobox').selectOption({ label: 'Іваненко Іван' });

  let dialogMessage = '';
  page.once('dialog', (dialog) => {
    dialogMessage = dialog.message();
    void dialog.dismiss();
  });
  await page.getByText('Суддя').locator('..').getByRole('button', { name: 'Призначити' }).click();
  await expect.poll(() => dialogMessage).toContain('Курінний');

  await expect(page.getByText('Курінний').locator('..').getByText('Іваненко Іван')).toBeVisible();
  await expect(page.getByText('Суддя').locator('..').getByRole('combobox')).toBeVisible();

  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByText('Суддя').locator('..').getByRole('button', { name: 'Призначити' }).click();

  await expect(page.getByText('Суддя').locator('..').getByText('Іваненко Іван')).toBeVisible();
  await expect(page.getByText('Курінний').locator('..').getByRole('combobox')).toBeVisible();
});

test('lets kurinniy edit a non-Курінний slot but not the Курінний slot itself', async ({ page, request }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);

  const hurtok = await createHurtok(zvyazkovyiToken, 'Орлики');
  const kurinniyEmail = `kurinniy-${Date.now()}@example.com`;
  const kurinniy = await createUserAs(zvyazkovyiToken, {
    firstName: 'Кур',
    lastName: 'Інний',
    email: kurinniyEmail,
    role: 'JUNAK',
    hurtokId: hurtok.id,
    password: 'password123',
  });
  await request.post('http://localhost:3001/kurin-positions', {
    headers: { Authorization: `Bearer ${zvyazkovyiToken}`, 'Content-Type': 'application/json' },
    data: { userId: kurinniy.id, scope: 'KURIN', positionType: 'KURINNYI' },
  });
  const otherJunakEmail = `other-${Date.now()}@example.com`;
  await createUserAs(zvyazkovyiToken, {
    firstName: 'Петро',
    lastName: 'Петренко',
    email: otherJunakEmail,
    role: 'JUNAK',
    hurtokId: hurtok.id,
    password: 'password123',
  });

  await loginAs(page, kurinniyEmail, 'password123');
  await page.goto('/kurin');
  await page.getByText('Провід куреня').click();

  // Курінний slot: no select, no button — just the current holder's name.
  await expect(page.getByText('Курінний').locator('..').getByRole('combobox')).toHaveCount(0);
  await expect(page.getByText('Курінний').locator('..').getByRole('button', { name: 'Зняти' })).toHaveCount(0);

  // Писар slot: kurinniy can assign it.
  await page.getByText('Писар').locator('..').getByRole('combobox').selectOption({ label: 'Петренко Петро' });
  await page.getByText('Писар').locator('..').getByRole('button', { name: 'Призначити' }).click();
  await expect(page.getByText('Писар').locator('..').getByText('Петренко Петро')).toBeVisible();
});
