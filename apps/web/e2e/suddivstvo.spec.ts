import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { loginForToken } from './helpers/proby-seed';

const API_URL = 'http://localhost:3001';

test('shows the Книга судді card on /suddivstvo', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto('/suddivstvo');

  await expect(page.getByRole('heading', { name: 'Суддівство' })).toBeVisible();
  await expect(page.getByText('Книга судді не підключена.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Підключити Книгу судді' })).toBeVisible();
});

test('shows a message instead of the wizard when Книга судді is not connected', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto('/suddivstvo/junak-import');

  await expect(page.getByText('Спершу підключіть Книгу судді на сторінці')).toBeVisible();
  await expect(page.getByRole('link', { name: '«Суддівство»' })).toBeVisible();
});

test('shows a clear error instead of a silently empty Крок 1 when reading the sheet fails', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { kurin, zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);

  // Marking a spreadsheet connected without ever completing Drive OAuth means
  // GoogleDriveService.getAuthorizedClient throws (no driveRefreshToken) the
  // moment the wizard tries to read it — the same class of failure (Sheets API
  // not enabled, revoked token, etc.) that silently produced an empty Крок 1
  // before this fix, with no real Google credentials needed to reproduce it.
  await fetch(`${API_URL}/kurins/${kurin.id}/junak-import/spreadsheet`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${zvyazkovyiToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ spreadsheetId: 'fake-sheet-id', spreadsheetName: 'Fake Sheet' }),
  });

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto('/suddivstvo/junak-import');

  await expect(page.getByText('Крок 1: Мапінг стовпчиків')).not.toBeVisible();
  await expect(page.getByText('Сталася помилка. Спробуйте пізніше.')).toBeVisible();
  await expect(page.getByText('Курінь ще не підключив Google Drive')).toBeVisible();
});
