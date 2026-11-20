import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { createHurtok, loginForToken, createOnboardedUserAs } from './helpers/proby-seed';

const API_URL = 'http://localhost:3001';

// The Google Picker can't run in tests, so the folder is set through the same
// API the picker callback uses (PATCH /kurins/:id/pysarstvo/folder).
test('Писарство has its own folder: zvyazkovyi picks it, a pysar only sees it, АПД waits for it', async ({ page, request }) => {
  const { program } = await seedProbyProgram();
  const { kurin, zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id, {
    driveFolderId: 'e2e-inventory-folder',
    driveRefreshToken: 'fake-refresh-token-e2e',
    driveConnectedEmail: 'kurin-drive@example.com',
  });
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);

  const hurtok = await createHurtok(zvyazkovyiToken, 'Орлики');
  const pysarEmail = `pysar-${Date.now()}@example.com`;
  const pysar = await createOnboardedUserAs(zvyazkovyiToken, {
    firstName: 'Пи',
    lastName: 'Сар',
    email: pysarEmail,
    role: 'JUNAK',
    hurtokId: hurtok.id,
    password: 'password123',
  });
  const assigned = await request.post(`${API_URL}/kurin-positions`, {
    headers: { Authorization: `Bearer ${zvyazkovyiToken}`, 'Content-Type': 'application/json' },
    data: { userId: pysar.user.id, scope: 'KURIN', positionType: 'PYSAR' },
  });
  expect(assigned.ok()).toBeTruthy();

  // 1. Zvyazkovyi: the inventory folder alone is not enough — no Писарство folder yet.
  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto('/pysarstvo');
  const card = page.getByTestId('pysarstvo-folder');
  await expect(card.getByText('не обрана')).toBeVisible();
  await expect(card.getByRole('button', { name: 'Обрати папку писарства' })).toBeVisible();
  await page.getByPlaceholder(/Назва документа/).fill('АПД сходини');
  await page.getByPlaceholder('Псевдо').fill('Гість');
  await page.getByRole('button', { name: 'Додати', exact: true }).click();
  await expect(page.getByText('Щоб створювати документи, спершу оберіть папку писарства вище.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Створити АПД' })).toBeDisabled();

  // 2. The folder is chosen → the name shows and АПД can be created.
  const set = await request.patch(`${API_URL}/kurins/${kurin.id}/pysarstvo/folder`, {
    headers: { Authorization: `Bearer ${zvyazkovyiToken}`, 'Content-Type': 'application/json' },
    data: { folderId: 'e2e-pysar-folder', folderName: 'Писарство куреня' },
  });
  expect(set.ok()).toBeTruthy();
  await page.reload();
  await expect(card.getByText('Писарство куреня')).toBeVisible();
  await expect(card.getByRole('button', { name: 'Змінити папку' })).toBeVisible();
  await page.getByPlaceholder(/Назва документа/).fill('АПД сходини');
  await page.getByPlaceholder('Псевдо').fill('Гість');
  await page.getByRole('button', { name: 'Додати', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Створити АПД' })).toBeEnabled();

  // 3. The pysar sees the folder but cannot change it.
  await page.context().clearCookies();
  await loginAs(page, pysarEmail, 'password123');
  await page.goto('/pysarstvo');
  await expect(card.getByText('Писарство куреня')).toBeVisible();
  await expect(card.getByRole('button')).toHaveCount(0);
});

test('Писарство tells a pysar to wait for the zvyazkovyi when no folder is chosen', async ({ page, request }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id, {
    driveFolderId: 'e2e-inventory-folder',
    driveRefreshToken: 'fake-refresh-token-e2e',
    driveConnectedEmail: 'kurin-drive@example.com',
  });
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);
  const hurtok = await createHurtok(zvyazkovyiToken, 'Орлики');
  const pysarEmail = `pysar-${Date.now()}@example.com`;
  const pysar = await createOnboardedUserAs(zvyazkovyiToken, {
    firstName: 'Пи',
    lastName: 'Сар',
    email: pysarEmail,
    role: 'JUNAK',
    hurtokId: hurtok.id,
    password: 'password123',
  });
  await request.post(`${API_URL}/kurin-positions`, {
    headers: { Authorization: `Bearer ${zvyazkovyiToken}`, 'Content-Type': 'application/json' },
    data: { userId: pysar.user.id, scope: 'KURIN', positionType: 'PYSAR' },
  });

  await loginAs(page, pysarEmail, 'password123');
  await page.goto('/pysarstvo');
  const card = page.getByTestId('pysarstvo-folder');
  await expect(card.getByText('не обрана')).toBeVisible();
  await expect(card.getByText(/Папку обирає звʼязковий куреня/)).toBeVisible();
  await expect(card.getByRole('button')).toHaveCount(0);
  await expect(page.getByText('Документи можна буде створювати, коли звʼязковий обере папку писарства.')).toBeVisible();
});
