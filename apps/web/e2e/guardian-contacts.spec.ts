import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { createHurtok, createUserAs, loginForToken } from './helpers/proby-seed';

test('lets zvyazkovyi add and remove a guardian contact from the junak detail page', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);

  const hurtok = await createHurtok(zvyazkovyiToken, 'Орлики');
  const junakEmail = `junak-guardian-${Date.now()}@example.com`;
  const junak = await createUserAs(zvyazkovyiToken, {
    firstName: 'Петро',
    lastName: 'Петренко',
    email: junakEmail,
    role: 'JUNAK',
    hurtokId: hurtok.id,
  });

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto(`/users/${junak.id}`);

  // Mother is the suggested first contact; the relation is chosen, not typed.
  await expect(page.getByLabel('Хто це')).toHaveValue('MOTHER');
  await page.getByPlaceholder("Ім'я").fill('Марія Петренко');
  await page.getByPlaceholder('Телефон (можна додати пізніше)').fill('+380501234567');
  await page.getByRole('button', { name: 'Додати контакт' }).click();

  await expect(page.getByText('Мама: Марія Петренко')).toBeVisible();

  await page.getByRole('button', { name: 'Видалити' }).click();
  await expect(page.getByText('Мама: Марія Петренко')).not.toBeVisible();
});
