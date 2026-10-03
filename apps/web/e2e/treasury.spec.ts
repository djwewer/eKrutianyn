import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { createHurtok, createUserAs, loginForToken } from './helpers/proby-seed';

test('lets zvyazkovyi set a starting balance, record income/expenses, and see the computed balance', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.getByText('Діловодство').click();
  await page.getByRole('link', { name: 'Скарбниця' }).click();

  await expect(page.getByRole('heading', { name: 'Скарбниця' })).toBeVisible();

  const balanceCard = page.getByText('Поточний баланс', { exact: true }).locator('..').locator('..');

  await page.getByRole('button', { name: 'Змінити' }).click();
  await page.getByRole('spinbutton').first().fill('1000');
  await page.getByRole('button', { name: 'Зберегти' }).click();
  // uk-UA's thousands separator is a non-breaking space, not a plain one.
  await expect(balanceCard.getByText(/1\s000,00 грн/)).toBeVisible();

  await page.getByPlaceholder('Сума (грн)').fill('200');
  await page.getByPlaceholder('Опис (напр. «вкладка за теренівку»)').fill('Квартальна вкладка');
  await page.locator('select').selectOption('INCOME');
  await page.getByRole('button', { name: 'Додати' }).click();

  await expect(page.getByText('Квартальна вкладка')).toBeVisible();
  await expect(page.getByText('+200,00 грн')).toBeVisible();

  // Balance should now read 1000 + 200 = 1200.
  await expect(balanceCard.getByText(/1\s200,00 грн/)).toBeVisible();

  await page.getByRole('button', { name: 'Видалити' }).click();
  await expect(page.getByText('Квартальна вкладка')).not.toBeVisible();
  await expect(balanceCard.getByText(/1\s000,00 грн/)).toBeVisible();
});

test('a plain junak sees an access-denied message instead of the ledger', async ({ page }) => {
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
  // A plain junak gets no "Скарбниця" nav entry, but the route itself isn't
  // blocked by middleware — only the API's SKARBNYK/ZVYAZKOVYI/kurinniy check
  // is, so navigating there directly must still fail cleanly, not crash.
  await page.goto('/treasury');
  await expect(page.getByText('Немає доступу.')).toBeVisible();
});
