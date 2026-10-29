import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { createHurtok, createOnboardedUserAs, loginForToken } from './helpers/proby-seed';

test('zvyazkovyi sees all quick actions on /settings', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto('/settings');
  const main = page.locator('main');
  await expect(main.getByRole('link', { name: 'Запити' })).toHaveAttribute('href', '/approval-requests');
  await expect(main.getByRole('link', { name: 'Журнал дій' })).toHaveAttribute('href', '/audit-log');

  const html = page.locator('html');
  const wasDark = await html.evaluate((el) => el.classList.contains('dark'));
  await main.getByRole('switch', { name: 'Перемкнути темну тему' }).click();
  await expect.poll(() => html.evaluate((el) => el.classList.contains('dark'))).toBe(!wasDark);

  await main.getByRole('button', { name: 'Вийти' }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test('junak sees theme switch and logout but not zvyazkovyi links', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const seeded = await seedKurinWithZvyazkovyi(program.id);
  const token = await loginForToken(seeded.zvyazkovyiEmail, seeded.zvyazkovyiPassword);
  const hurtok = await createHurtok(token, `Орлики${Date.now()}`);
  const { email, password } = await createOnboardedUserAs(token, {
    firstName: 'Тест',
    lastName: `Юнак${Date.now()}`,
    email: `junak-qa-${Date.now()}@example.com`,
    role: 'JUNAK',
    hurtokId: hurtok.id,
  });
  await loginAs(page, email, password);
  await page.goto('/settings');
  const main = page.locator('main');
  await expect(main.getByRole('switch', { name: 'Перемкнути темну тему' })).toBeVisible();
  await expect(main.getByRole('button', { name: 'Вийти' })).toBeVisible();
  await expect(main.getByRole('link', { name: 'Запити' })).toHaveCount(0);
  await expect(main.getByRole('link', { name: 'Журнал дій' })).toHaveCount(0);
});
