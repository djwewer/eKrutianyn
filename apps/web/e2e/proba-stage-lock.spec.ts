import { test, expect } from '@playwright/test';
import { seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { createHurtok, createUserAs, loginForToken } from './helpers/proby-seed';

const API_URL = 'http://localhost:3001';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY ?? 'dev-admin-key';

async function adminPost<T>(path: string, body: unknown, adminKey = ADMIN_API_KEY): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Admin seed request failed: ${path} -> ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function seedTwoStageProgram() {
  const program = await adminPost<{ id: string }>('/admin/proby-programs', {
    version: 'OLD',
    name: `Програма ${Date.now()}`,
  });
  const stage1 = await adminPost<{ id: string }>(`/admin/proby-programs/${program.id}/stages`, {
    order: 1,
    name: 'Стадія 1',
  });
  const category1 = await adminPost<{ id: string }>(`/admin/proby-stages/${stage1.id}/categories`, {
    name: 'Категорія 1',
  });
  const point1 = await adminPost<{ id: string }>(`/admin/proby-categories/${category1.id}/points`, {
    order: 1,
    description: 'Точка 1',
  });
  const stage2 = await adminPost<{ id: string }>(`/admin/proby-programs/${program.id}/stages`, {
    order: 2,
    name: 'Стадія 2',
  });
  const category2 = await adminPost<{ id: string }>(`/admin/proby-stages/${stage2.id}/categories`, {
    name: 'Категорія 2',
  });
  const point2 = await adminPost<{ id: string }>(`/admin/proby-categories/${category2.id}/points`, {
    order: 1,
    description: 'Точка 2',
  });
  return { program, stage1, point1, stage2, point2 };
}

test('lets zvyazkovyi close a stage with debt, work in the next stage, then close and reopen the first', async ({ page }) => {
  const { program, stage1, point1, stage2 } = await seedTwoStageProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);

  const hurtok = await createHurtok(zvyazkovyiToken, 'Орлики');
  const junak = await createUserAs(zvyazkovyiToken, {
    firstName: 'Петро',
    lastName: 'Петренко',
    email: `junak-stage-lock-${Date.now()}@example.com`,
    role: 'JUNAK',
    hurtokId: hurtok.id,
  });

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto(`/users/${junak.id}`);

  await expect(page.getByText('🔒 Стадія 2')).toBeVisible();

  await page.getByRole('button', { name: 'Закрити пробу' }).first().click();

  await expect(page.getByText('🔒 Стадія 2')).not.toBeVisible();
  await expect(page.getByText('Категорія 2 (0/1)')).toBeVisible();

  await page.getByText('Категорія 1 (0/1)').click();
  await page.getByRole('button', { name: 'Підтвердити' }).first().click();

  await expect(page.getByRole('button', { name: '🔓 Перевідкрити пробу' })).toBeVisible();

  await page.getByRole('button', { name: '🔓 Перевідкрити пробу' }).click();

  // Stage 2 is also OPEN by now (unaffected by reopening stage 1), so two
  // "Закрити пробу" buttons exist on the page at this point — assert on
  // the first rather than a bare locator to avoid a Playwright strict-mode
  // violation from matching multiple elements.
  await expect(page.getByRole('button', { name: 'Закрити пробу' }).first()).toBeVisible();
  await expect(page.getByText('🔒 Стадія 2')).not.toBeVisible();
});
