import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { createHurtok, createUserAs, loginForToken } from './helpers/proby-seed';

test('lets zvyazkovyi add an event, see it in the timeline, and view it in the month grid', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.getByRole('link', { name: 'Календар' }).click();

  await expect(page.getByRole('heading', { name: 'Календарний план' })).toBeVisible();

  const today = new Date().toISOString().slice(0, 10);
  await page.getByPlaceholder('Назва (напр. «Зимовий табір»)').fill('Весняний похід');
  await page.locator('input[type="date"]').first().fill(today);
  await page.getByRole('button', { name: 'Додати' }).click();

  await expect(page.getByText('Весняний похід')).toBeVisible();

  await page.getByRole('button', { name: 'Місяць' }).click();
  // Today's cell should show the event dot and, once clicked, list the event.
  const todayDay = String(new Date().getDate());
  await page.getByRole('button', { name: todayDay, exact: true }).click();
  await expect(page.getByText('Весняний похід')).toBeVisible();
});

test('a plain junak can see events but gets no add-event form', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);
  const hurtok = await createHurtok(zvyazkovyiToken, 'Орлики');

  const junakEmail = `junak-${Date.now()}@example.com`;
  await createUserAs(zvyazkovyiToken, {
    firstName: 'Юний',
    lastName: 'Пластун',
    email: junakEmail,
    role: 'JUNAK',
    hurtokId: hurtok.id,
    password: 'password123',
  });

  await loginAs(page, junakEmail, 'password123');
  await page.getByRole('link', { name: 'Календар' }).click();

  await expect(page.getByRole('heading', { name: 'Календарний план' })).toBeVisible();
  await expect(page.getByPlaceholder('Назва (напр. «Зимовий табір»)')).not.toBeVisible();
});
