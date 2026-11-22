import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { loginForToken } from './helpers/proby-seed';

const API_URL = 'http://localhost:3001';

test('judge book import: position columns are chosen explicitly and values are mapped per scope', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { kurin, zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);

  await fetch(`${API_URL}/kurins/${kurin.id}/junak-import/spreadsheet`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${zvyazkovyiToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ spreadsheetId: 'fake-sheet-pos-cols', spreadsheetName: 'Fake Sheet Pos Cols' }),
  });

  await page.route('**/api/backend/kurins/*/junak-import/sheet-data', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        rows: [
          ['ПІБ', 'Email', 'Гурток', 'Посада в курені', 'Посада в гуртку', 'Примітки'],
          ['Іван Петренко', 'ivan@example.com', 'Вовки', 'Скарбник', 'Скарбник', 'щось'],
          ['Петро Іванов', 'petro@example.com', 'Вовки', 'Інтендант', 'Скарбник гуртка', ''],
        ],
      }),
    }),
  );

  type Row = { nickname?: string; kurinPositionTypes: string[]; hurtokPositionTypes: string[] };
  let capturedBody: { rows: Row[] } | undefined;
  await page.route('**/api/backend/kurins/*/junak-import/rows', (route) => {
    capturedBody = JSON.parse(route.request().postData() ?? '{}');
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        results: [
          { row: 0, created: true, succeededSteps: [] },
          { row: 1, created: true, succeededSteps: [] },
        ],
      }),
    });
  });

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto('/suddivstvo/junak-import');
  await expect(page.getByText('Крок 1: Мапінг стовпчиків')).toBeVisible();

  const kurinBox = page.getByLabel('Імпортувати посади куреня');
  const hurtokBox = page.getByLabel('Імпортувати посади в гуртку');
  await expect(kurinBox).not.toBeChecked();
  await expect(hurtokBox).not.toBeChecked();

  // Re-enabling a scope whose column was meanwhile mapped to another field must drop that field.
  await kurinBox.check();
  await page.getByLabel('Стовпчик з посадами куреня').selectOption({ label: 'D — Посада в курені' });
  await kurinBox.uncheck();
  await page.locator('select').nth(3).selectOption('NICKNAME');
  await kurinBox.check();
  await expect(page.locator('select').nth(3)).toBeDisabled();
  await expect(page.locator('select').nth(3)).toHaveValue('');
  await expect(page.getByText('використовується для посад')).toBeVisible();

  await hurtokBox.check();
  await page.getByRole('button', { name: 'Далі' }).click();
  await expect(page.getByText('Оберіть стовпчик з посадами в гуртку')).toBeVisible();

  await page.getByLabel('Стовпчик з посадами в гуртку').selectOption({ label: 'D — Посада в курені' });
  await page.getByRole('button', { name: 'Далі' }).click();
  await expect(page.getByText('Посади куреня й гуртка мають бути в різних стовпчиках')).toBeVisible();

  await page.getByLabel('Стовпчик з посадами в гуртку').selectOption({ label: 'E — Посада в гуртку' });
  // Hurtok positions need a «Гурток» column.
  await page.locator('select').nth(2).selectOption('');
  await page.getByRole('button', { name: 'Далі' }).click();
  await expect(page.getByText('Щоб імпортувати посади в гуртку, позначте стовпчик «Гурток».')).toBeVisible();
  await page.locator('select').nth(2).selectOption('HURTOK');
  await page.getByRole('button', { name: 'Далі' }).click();

  await expect(page.getByText('Крок 2: Мапінг значень посад')).toBeVisible();
  await expect(page.getByText('Посади куреня — стовпчик D')).toBeVisible();
  await expect(page.getByText('Посади в гуртку — стовпчик E')).toBeVisible();

  const kurinSelect = page.getByLabel('Скарбник у посадах куреня', { exact: true });
  const hurtokSelect = page.getByLabel('Скарбник у посадах в гуртку', { exact: true });
  const hurtokCustom = page.getByLabel('Скарбник гуртка у посадах в гуртку', { exact: true });
  await expect(hurtokSelect.locator('option', { hasText: 'Гуртковий' })).toHaveCount(1);
  await expect(hurtokSelect.locator('option', { hasText: 'Інтендант' })).toHaveCount(0);
  await expect(kurinSelect.locator('option', { hasText: 'Інтендант' })).toHaveCount(1);
  await expect(kurinSelect.locator('option', { hasText: 'Гуртковий' })).toHaveCount(0);

  await hurtokSelect.selectOption('SKARBNYK');
  await hurtokCustom.selectOption('SKARBNYK');
  await kurinSelect.selectOption('');
  await page.getByRole('button', { name: 'Далі' }).click();

  await expect(page.getByText('Крок 3: Перегляд')).toBeVisible();
  await page.getByRole('button', { name: 'Імпортувати' }).click();
  await expect.poll(() => capturedBody?.rows.length).toBe(2);
  expect(capturedBody?.rows[0].hurtokPositionTypes).toEqual(['SKARBNYK']);
  expect(capturedBody?.rows[0].kurinPositionTypes).toEqual([]);
  expect(capturedBody?.rows[1].hurtokPositionTypes).toEqual(['SKARBNYK']);
  expect(capturedBody?.rows[0].nickname).toBeUndefined();

  await page.goto('/suddivstvo/junak-import');
  await expect(page.getByLabel('Імпортувати посади куреня')).toBeChecked();
  await expect(page.getByLabel('Імпортувати посади в гуртку')).toBeChecked();
  await expect(page.getByLabel('Стовпчик з посадами куреня')).toHaveValue('3');
  await expect(page.getByLabel('Стовпчик з посадами в гуртку')).toHaveValue('4');
  await page.getByRole('button', { name: 'Далі' }).click();
  await expect(page.getByText('Крок 2: Мапінг значень посад')).toBeVisible();
  await expect(hurtokCustom).toHaveValue('SKARBNYK');
  await expect(hurtokSelect).toHaveValue('SKARBNYK');
  // Explicit «Не імпортувати» is restored too, not replaced by the keyword suggestion.
  await expect(kurinSelect).toHaveValue('');
});
