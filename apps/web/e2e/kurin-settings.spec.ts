import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';

const API_URL = 'http://localhost:3001';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY ?? 'dev-admin-key';

// `seedProbyProgram` only ever creates OLD-version programs, and this test
// needs a NEW-version one to exist so the "Нова програма" switch resolves.
// Scoped here (not in the shared seed helper) since other spec files don't
// need this and the shared helper feeding every spec would just accumulate
// more stray ProbyProgram rows in the dev database.
async function seedNewProbyProgram() {
  const res = await fetch(`${API_URL}/admin/proby-programs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-key': ADMIN_API_KEY },
    body: JSON.stringify({ version: 'NEW', name: `Нова програма ${Date.now()}` }),
  });
  if (!res.ok) {
    throw new Error(`Admin seed request failed: /admin/proby-programs -> ${res.status} ${await res.text()}`);
  }
  return res.json();
}

test('lets zvyazkovyi view kurin settings and change the proby program', async ({ page }) => {
  const { program: oldProgram } = await seedProbyProgram(['Стара точка']);
  await seedNewProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword, kurin } = await seedKurinWithZvyazkovyi(oldProgram.id);

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto('/kurin');

  await expect(page.getByText(kurin.name)).toBeVisible();
  await expect(page.getByText('Поточна програма: Стара')).toBeVisible();

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByLabel('Нова програма').check();
  await page.getByRole('button', { name: 'Змінити програму' }).click();

  await expect(page.getByText('Поточна програма: Нова')).toBeVisible();
});
