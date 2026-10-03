import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';

const ADMIN_API_KEY = process.env.ADMIN_API_KEY ?? 'dev-admin-key';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'dev-admin-password-change-me';

async function logIntoAdmin(page: import('@playwright/test').Page) {
  await page.goto('/admin');
  await page.getByPlaceholder('Адмін-ключ').fill(ADMIN_API_KEY);
  await page.getByPlaceholder('Логін').fill(ADMIN_USERNAME);
  await page.getByPlaceholder('Пароль').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Увійти' }).click();
}

test('lets an admin create a kurin, rename/renumber it, and it persists across reload', async ({ page }) => {
  // seedProbyProgram only ever creates OLD-version programs.
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await logIntoAdmin(page);

  const uniqueName = `курінь Тестовий ${Date.now()}`;
  const section = page.getByText('Курені', { exact: true }).locator('..').locator('..');
  await section.getByPlaceholder('Назва (напр. «курінь Лісові Мандрівники»)').fill(uniqueName);
  await section.getByPlaceholder('Станиця').fill('Тестова станиця');
  await section.locator('select').nth(1).selectOption({ label: `${program.name} (OLD)` });

  // Input value-attribute selectors don't track a React-controlled input's live
  // value, so identify the new row by its real id from the create response
  // instead of fragile DOM text/value matching.
  const [response] = await Promise.all([
    page.waitForResponse((res) => res.url().includes('/admin/kurins') && res.request().method() === 'POST'),
    section.getByRole('button', { name: 'Створити' }).click(),
  ]);
  const created = await response.json();

  const row = page.getByTestId(`kurin-row-${created.id}`);
  await expect(row).toBeVisible();

  const renamedName = `${uniqueName} перейменовано`;
  await row.locator('input').nth(1).fill(renamedName);
  await row.getByRole('button', { name: 'Зберегти' }).click();
  await expect(row.getByText('Збережено')).toBeVisible();

  await page.reload();
  await expect(page.getByTestId(`kurin-row-${created.id}`).locator('input').nth(1)).toHaveValue(renamedName);
});

test('refuses to delete a kurin that still has members', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { kurin, zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await logIntoAdmin(page);

  const row = page.getByTestId(`kurin-row-${kurin.id}`);
  await expect(row.getByRole('button', { name: 'Видалити' })).toBeDisabled();
});
