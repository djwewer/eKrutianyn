import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { loginForToken } from './helpers/proby-seed';

const API_URL = 'http://localhost:3001';

test('pre-fills the Крок 3 email field from the mapped Email column instead of showing it blank', async ({
  page,
}) => {
  const { program } = await seedProbyProgram();
  const { kurin, zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);

  await fetch(`${API_URL}/kurins/${kurin.id}/junak-import/spreadsheet`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${zvyazkovyiToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ spreadsheetId: 'fake-sheet-step3', spreadsheetName: 'Fake Sheet Step3' }),
  });

  await page.route('**/api/backend/kurins/*/junak-import/sheet-data', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        rows: [
          ['ПІБ', 'Email'],
          ['Іван Петренко', 'ivan@example.com'],
        ],
      }),
    }),
  );

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto('/suddivstvo/junak-import');

  await expect(page.getByText('Крок 1: Мапінг стовпчиків')).toBeVisible();
  await page.getByRole('button', { name: 'Далі' }).click();

  await expect(page.getByText('Крок 3: Перегляд')).toBeVisible();
  await expect(page.getByPlaceholder('Email')).toHaveValue('ivan@example.com');
});
