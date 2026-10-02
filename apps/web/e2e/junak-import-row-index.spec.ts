import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { loginForToken } from './helpers/proby-seed';

const API_URL = 'http://localhost:3001';

test('keeps the real sheet row index when a blank row precedes real data, so write-back targets the right row', async ({
  page,
}) => {
  const { program } = await seedProbyProgram();
  const { kurin, zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);

  await fetch(`${API_URL}/kurins/${kurin.id}/junak-import/spreadsheet`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${zvyazkovyiToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ spreadsheetId: 'fake-sheet-row-index', spreadsheetName: 'Fake Sheet Row Index' }),
  });

  await page.route('**/api/backend/kurins/*/junak-import/sheet-data', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        rows: [
          ['ПІБ', 'Email'],
          ['', ''],
          ['Петро Сидоренко', 'petro@example.com'],
        ],
      }),
    }),
  );

  let capturedBody: { rows: { rowIndex: number }[] } | undefined;
  await page.route('**/api/backend/kurins/*/junak-import/rows', (route) => {
    capturedBody = JSON.parse(route.request().postData() ?? '{}');
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ results: [{ row: 1, created: true, succeededSteps: [] }] }),
    });
  });

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto('/suddivstvo/junak-import');

  await expect(page.getByText('Крок 1: Мапінг стовпчиків')).toBeVisible();
  await page.getByRole('button', { name: 'Далі' }).click();

  await expect(page.getByText('Крок 3: Перегляд')).toBeVisible();
  // Only the real row should render — the blank row (dataRows index 0) is skipped.
  await expect(page.getByText('Рядків до імпорту: 1')).toBeVisible();

  await page.getByRole('button', { name: 'Імпортувати' }).click();

  await expect.poll(() => capturedBody?.rows[0]?.rowIndex).toBe(1);
});
