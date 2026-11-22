import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { loginForToken } from './helpers/proby-seed';

const API_URL = 'http://localhost:3001';

test('auto-maps obvious column headers on Крок 1, leaves an unknown header unmapped', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { kurin, zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);

  await fetch(`${API_URL}/kurins/${kurin.id}/junak-import/spreadsheet`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${zvyazkovyiToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ spreadsheetId: 'fake-sheet-id', spreadsheetName: 'Fake Sheet' }),
  });

  await page.route('**/api/backend/kurins/*/junak-import/sheet-data', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        rows: [
          ['ПІБ', 'Email', 'Щось незрозуміле'],
          ['Іван Петренко', 'ivan@example.com', 'xyz'],
        ],
      }),
    }),
  );

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto('/suddivstvo/junak-import');

  await expect(page.getByText('Крок 1: Мапінг стовпчиків')).toBeVisible();
  const selects = page.locator('select');
  await expect(selects.nth(0)).toHaveValue('FIRST_LAST_NAME');
  await expect(selects.nth(1)).toHaveValue('EMAIL');
  await expect(selects.nth(2)).toHaveValue('');
});

test('does not auto-map position columns, but auto-maps exact position values per scope on Крок 2, leaves deputy roles and typos unmapped', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { kurin, zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);

  await fetch(`${API_URL}/kurins/${kurin.id}/junak-import/spreadsheet`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${zvyazkovyiToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ spreadsheetId: 'fake-sheet-id-2', spreadsheetName: 'Fake Sheet 2' }),
  });

  await page.route('**/api/backend/kurins/*/junak-import/sheet-data', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        rows: [
          ['ПІБ', 'Діловодство в гуртку'],
          ['Іван Петренко', 'Суддя'],
          ['Петро Іванов', 'Заступник Гурткового'],
          ['Марія Сидоренко', 'Скарбиник'],
        ],
      }),
    }),
  );

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto('/suddivstvo/junak-import');

  await expect(page.getByText('Крок 1: Мапінг стовпчиків')).toBeVisible();
  // «Діловодство в гуртку» is not guessed as a position column: no checkbox is on, the column select stays «Не імпортувати».
  await expect(page.getByLabel('Імпортувати посади куреня')).not.toBeChecked();
  await expect(page.getByLabel('Імпортувати посади в гуртку')).not.toBeChecked();
  await expect(page.locator('select').nth(1)).toHaveValue('');
  await expect(page.locator('select').nth(1).locator('option[value="HURTOK_POSITION"]')).toHaveCount(0);

  await page.getByLabel('Імпортувати посади в гуртку').check();
  await page.getByLabel('Стовпчик з посадами в гуртку').selectOption({ label: 'B — Діловодство в гуртку' });
  await page.getByRole('button', { name: 'Далі' }).click();

  await expect(page.getByText('Крок 2: Мапінг значень посад')).toBeVisible();
  await expect(page.getByLabel('Суддя у посадах в гуртку')).toHaveValue('SUDDIA');
  await expect(page.getByLabel('Заступник Гурткового у посадах в гуртку')).toHaveValue('');
  await expect(page.getByLabel('Скарбиник у посадах в гуртку')).toHaveValue('');
});

test('does not crash when a real sheet returns a null header cell', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { kurin, zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);

  await fetch(`${API_URL}/kurins/${kurin.id}/junak-import/spreadsheet`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${zvyazkovyiToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ spreadsheetId: 'fake-sheet-id-3', spreadsheetName: 'Fake Sheet 3' }),
  });

  await page.route('**/api/backend/kurins/*/junak-import/sheet-data', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        rows: [
          ['ПІБ', null, 'Email'],
          ['Іван Петренко', 'xyz', 'ivan@example.com'],
        ],
      }),
    }),
  );

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto('/suddivstvo/junak-import');

  await expect(page.getByText('Крок 1: Мапінг стовпчиків')).toBeVisible();
  const selects = page.locator('select');
  await expect(selects.nth(0)).toHaveValue('FIRST_LAST_NAME');
  await expect(selects.nth(1)).toHaveValue('');
  await expect(selects.nth(2)).toHaveValue('EMAIL');
});
