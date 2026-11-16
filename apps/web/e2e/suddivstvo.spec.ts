import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { acceptInviteFor } from './helpers/invite';
import { createHurtok, createUserAs, loginForToken } from './helpers/proby-seed';

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

test('lets zvyazkovyi push pending data to Книга судді on demand and shows the real failure reason', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { kurin, zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);
  const headers = { Authorization: `Bearer ${zvyazkovyiToken}`, 'Content-Type': 'application/json' };

  // Connected book + saved mapping, but no Drive OAuth: the sync must report that
  // precisely instead of a generic error. (No real Google credentials needed.)
  await fetch(`${API_URL}/kurins/${kurin.id}/junak-import/spreadsheet`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ spreadsheetId: 'fake-sheet-id', spreadsheetName: 'Книга судді 2026' }),
  });

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto('/suddivstvo');
  await page.getByRole('button', { name: 'Записати зміни в таблицю зараз' }).click();

  await expect(page.getByText('Курінь ще не підключив Google Drive')).toBeVisible();
  await expect(page.getByTestId('sync-report')).toHaveCount(0);
});

test('renders the manual sync report: written cells, unlinked junaky and skipped rows with reasons', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { kurin, zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);
  await fetch(`${API_URL}/kurins/${kurin.id}/junak-import/spreadsheet`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${zvyazkovyiToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ spreadsheetId: 'fake-sheet-id', spreadsheetName: 'Книга судді 2026' }),
  });
  // The real endpoint needs live Google access; its response shape is covered by the API e2e suite.
  await page.route('**/api/backend/kurins/*/junak-import/sync', (route) =>
    route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        linkedJunaky: 12,
        syncedJunaky: 9,
        updatedCells: 21,
        unlinkedJunaky: 3,
        skipped: [{ junakName: 'Петро Сидоренко', row: 7, reason: 'у рядку 7 зараз «Хтось Інший» — рядок могли пересунути або змінити' }],
      }),
    }),
  );

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto('/suddivstvo');
  await page.getByRole('button', { name: 'Записати зміни в таблицю зараз' }).click();

  const report = page.getByTestId('sync-report');
  await expect(report).toContainText('Записано комірок: 21 (юнаків: 9)');
  await expect(report).toContainText('Без рядка в таблиці: 3');
  await expect(report).toContainText('Пропущено: 1');
  await expect(report).toContainText('Петро Сидоренко: у рядку 7 зараз «Хтось Інший»');
  await page.screenshot({ path: 'test-results/suddivstvo-sync-report.png', fullPage: true });
});

async function seedUser(zvyazkovyiToken: string, hurtokId: string, suddia: boolean) {
  const email = `${suddia ? 'suddia' : 'plain'}-${Date.now()}@example.com`;
  const user = await createUserAs(zvyazkovyiToken, {
    firstName: 'Тест',
    lastName: suddia ? 'Суддя' : 'Звичайний',
    email,
    role: 'JUNAK',
    hurtokId,
    password: 'password123',
  });
  if (suddia) {
    const res = await fetch(`${API_URL}/kurin-positions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${zvyazkovyiToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, scope: 'KURIN', positionType: 'SUDDIA' }),
    });
    expect(res.ok).toBeTruthy();
  }
  await acceptInviteFor(email);
  return email;
}

test('suddya sees the connect control, a plain vykhovnyk does not', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const token = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);
  const hurtok = await createHurtok(token, 'Орлики');
  const suddiaEmail = await seedUser(token, hurtok.id, true);
  const plainEmail = await seedUser(token, hurtok.id, false);

  await loginAs(page, plainEmail, 'password123');
  await page.goto('/suddivstvo');
  await expect(page.getByText('Книга судді не підключена.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Підключити Книгу судді' })).toHaveCount(0);

  await page.context().clearCookies();
  await loginAs(page, suddiaEmail, 'password123');
  await page.goto('/suddivstvo');
  await expect(page.getByRole('button', { name: 'Підключити Книгу судді' })).toBeVisible();
});

test('suddya disconnects the connected Книга судді after confirming', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { kurin, zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const token = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);
  const hurtok = await createHurtok(token, 'Орлики');
  const suddiaEmail = await seedUser(token, hurtok.id, true);
  await fetch(`${API_URL}/kurins/${kurin.id}/junak-import/spreadsheet`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ spreadsheetId: 'fake-sheet-id', spreadsheetName: 'Книга судді 2026' }),
  });

  await loginAs(page, suddiaEmail, 'password123');
  await page.goto('/suddivstvo');
  await expect(page.getByText('Підключено', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Відʼєднати таблицю' }).click();
  await expect(page.getByText('Синхронізація з таблицею зупиниться.')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Відʼєднати таблицю' }).click();

  await expect(page.getByText('Не підключено', { exact: true })).toBeVisible();
  await expect(page.getByText('Книга судді не підключена.')).toBeVisible();
});
