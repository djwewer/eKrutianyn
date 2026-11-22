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
          ['ПІБ', 'Email', 'Посада в курені', 'Посада в гуртку', 'Примітки'],
          ['Іван Петренко', 'ivan@example.com', 'Скарбник', 'Скарбник', 'щось'],
        ],
      }),
    }),
  );

  let capturedBody: { rows: { kurinPositionTypes: string[]; hurtokPositionTypes: string[] }[] } | undefined;
  await page.route('**/api/backend/kurins/*/junak-import/rows', (route) => {
    capturedBody = JSON.parse(route.request().postData() ?? '{}');
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ results: [{ row: 0, created: true, succeededSteps: [] }] }),
    });
  });

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto('/suddivstvo/junak-import');
  await expect(page.getByText('Крок 1: Мапінг стовпчиків')).toBeVisible();

  const kurinBox = page.getByLabel('Імпортувати посади куреня');
  const hurtokBox = page.getByLabel('Імпортувати посади в гуртку');
  await expect(kurinBox).not.toBeChecked();
  await expect(hurtokBox).not.toBeChecked();

  await kurinBox.check();
  await hurtokBox.check();
  await page.getByLabel('Стовпчик з посадами куреня').selectOption({ label: 'C — Посада в курені' });
  await page.getByLabel('Стовпчик з посадами в гуртку').selectOption({ label: 'C — Посада в курені' });
  await page.getByRole('button', { name: 'Далі' }).click();
  await expect(page.getByText('Посади куреня й гуртка мають бути в різних стовпчиках')).toBeVisible();

  await page.getByLabel('Стовпчик з посадами в гуртку').selectOption({ label: 'D — Посада в гуртку' });
  await page.getByRole('button', { name: 'Далі' }).click();

  await expect(page.getByText('Крок 2: Мапінг значень посад')).toBeVisible();
  await expect(page.getByText('Посади куреня — стовпчик C')).toBeVisible();
  await expect(page.getByText('Посади в гуртку — стовпчик D')).toBeVisible();

  const kurinSelect = page.getByLabel('Скарбник у посадах куреня');
  const hurtokSelect = page.getByLabel('Скарбник у посадах в гуртку');
  await expect(hurtokSelect.locator('option', { hasText: 'Гуртковий' })).toHaveCount(1);
  await expect(hurtokSelect.locator('option', { hasText: 'Інтендант' })).toHaveCount(0);
  await expect(kurinSelect.locator('option', { hasText: 'Інтендант' })).toHaveCount(1);
  await expect(kurinSelect.locator('option', { hasText: 'Гуртковий' })).toHaveCount(0);

  await hurtokSelect.selectOption('SKARBNYK');
  await kurinSelect.selectOption('');
  await page.getByRole('button', { name: 'Далі' }).click();

  await expect(page.getByText('Крок 3: Перегляд')).toBeVisible();
  await page.getByRole('button', { name: 'Імпортувати' }).click();
  await expect.poll(() => capturedBody?.rows[0]?.hurtokPositionTypes).toEqual(['SKARBNYK']);
  expect(capturedBody?.rows[0].kurinPositionTypes).toEqual([]);

  await page.goto('/suddivstvo/junak-import');
  await expect(page.getByLabel('Імпортувати посади куреня')).toBeChecked();
  await expect(page.getByLabel('Імпортувати посади в гуртку')).toBeChecked();
  await expect(page.getByLabel('Стовпчик з посадами куреня')).toHaveValue('2');
  await expect(page.getByLabel('Стовпчик з посадами в гуртку')).toHaveValue('3');
});
