import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';

const ADMIN_API_KEY = process.env.ADMIN_API_KEY ?? 'dev-admin-key';

test('lets an admin add a reference source linked to a point, and it persists across reload', async ({ page }) => {
  const uniqueDescription = `Заспіває пластові пісні ${Date.now()}`;
  const uniqueLabel = `Гімни і молитви ${Date.now()}`;
  const { program } = await seedProbyProgram([uniqueDescription]);
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto('/admin');
  await page.getByPlaceholder('Адмін-ключ').fill(ADMIN_API_KEY);
  await page.getByRole('button', { name: 'Увійти' }).click();

  const section = page.getByText('Джерела в інтернеті (пісні, гімни тощо)').locator('..').locator('..');
  await section.getByPlaceholder('Назва (напр. «Гімни і молитви, pryvatri.de»)').fill(uniqueLabel);
  await section.getByPlaceholder('https://...').fill('https://pryvatri.de/himny-i-molytvy');
  await section.locator('select').selectOption({ label: `${program.name} / Ступінь 1 / ${uniqueDescription}` });
  await section.getByRole('button', { name: 'Додати' }).click();

  const sourceRow = page.getByText(uniqueLabel, { exact: true }).locator('xpath=../..');
  await expect(sourceRow.getByText(uniqueDescription)).toBeVisible();
  await expect(sourceRow.getByText('Ще не завантажено жодного разу')).toBeVisible();

  await page.reload();
  await expect(page.getByText(uniqueLabel)).toBeVisible();
});

test('lets an admin delete a reference source', async ({ page }) => {
  const uniqueLabel = `Тимчасове джерело ${Date.now()}`;
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto('/admin');
  await page.getByPlaceholder('Адмін-ключ').fill(ADMIN_API_KEY);
  await page.getByRole('button', { name: 'Увійти' }).click();

  const section = page.getByText('Джерела в інтернеті (пісні, гімни тощо)').locator('..').locator('..');
  await section.getByPlaceholder('Назва (напр. «Гімни і молитви, pryvatri.de»)').fill(uniqueLabel);
  await section.getByPlaceholder('https://...').fill('https://example.com/song');
  await section.getByRole('button', { name: 'Додати' }).click();

  const sourceRow = page.getByText(uniqueLabel, { exact: true }).locator('xpath=../..');
  await expect(sourceRow).toBeVisible();
  await sourceRow.getByRole('button', { name: 'Видалити' }).click();
  await expect(page.getByText(uniqueLabel)).not.toBeVisible();
});
