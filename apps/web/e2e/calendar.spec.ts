import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { createHurtok, createUserAs, loginForToken } from './helpers/proby-seed';
import { acceptInviteFor } from './helpers/invite';

test('lets zvyazkovyi add an event and see it in the timeline', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.getByRole('link', { name: 'Календар' }).click();

  await expect(page.getByRole('heading', { name: 'Календарний план' })).toBeVisible();

  await page.getByRole('button', { name: '+ Додати подію' }).click();
  await page.getByPlaceholder('Назва (напр. «Зимовий табір»)').fill('Весняний похід');
  // The date range picker defaults to today as a single day; opening and
  // clicking today's cell confirms that default without changing it.
  await page.getByRole('button', { name: 'Дата події' }).click();
  const todayDay = String(new Date().getDate());
  await page.getByRole('button', { name: todayDay, exact: true }).click();
  await page.getByRole('button', { name: 'Додати' }).click();

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

  await acceptInviteFor(junakEmail);

  await loginAs(page, junakEmail, 'password123');
  await page.getByRole('link', { name: 'Календар' }).click();

  await expect(page.getByRole('heading', { name: 'Календарний план' })).toBeVisible();
  await expect(page.getByRole('button', { name: '+ Додати подію' })).not.toBeVisible();
});
