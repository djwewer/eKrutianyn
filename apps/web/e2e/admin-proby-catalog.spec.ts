import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';

const ADMIN_API_KEY = process.env.ADMIN_API_KEY ?? 'dev-admin-key';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'dev-admin-password-change-me';

test('lets an admin curate a point\'s reference text, and it persists across reload', async ({ page }) => {
  // The admin page lists the full catalog across every program ever created in
  // this test DB (by design — it's not scoped to one kurin), so a unique point
  // description is what keeps this test isolated from everything else in it.
  const uniqueDescription = `Заснування Пласту ${Date.now()}`;
  const { program } = await seedProbyProgram([uniqueDescription]);
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);

  // Reaching this page still requires an ordinary app login (the global
  // auth-gating middleware applies here too) — the admin key is a second,
  // separate gate on top of that, not a replacement for it.
  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto('/admin');

  await page.getByPlaceholder('Адмін-ключ').fill(ADMIN_API_KEY);
  await page.getByPlaceholder('Логін').fill(ADMIN_USERNAME);
  await page.getByPlaceholder('Пароль').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Увійти' }).click();

  const stageDetails = page.locator('details', { hasText: uniqueDescription });
  await stageDetails.locator('summary').click();
  await expect(stageDetails.getByText(uniqueDescription)).toBeVisible();

  const textarea = stageDetails.getByPlaceholder('Довідковий матеріал (точні дати, імена, факти)...');
  await textarea.fill('Пласт засновано 12 квітня 1912 року у Львові.');
  await stageDetails.getByRole('button', { name: 'Зберегти' }).click();
  await expect(stageDetails.getByText('Збережено')).toBeVisible();

  // Reload to confirm it was actually persisted server-side, not just local state.
  await page.reload();
  const stageDetailsAfterReload = page.locator('details', { hasText: uniqueDescription });
  await stageDetailsAfterReload.locator('summary').click();
  await expect(
    stageDetailsAfterReload.getByPlaceholder('Довідковий матеріал (точні дати, імена, факти)...'),
  ).toHaveValue('Пласт засновано 12 квітня 1912 року у Львові.');
});

test('shows an error for a wrong admin key instead of the catalog', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto('/admin');

  await page.getByPlaceholder('Адмін-ключ').fill('definitely-wrong-key');
  await page.getByPlaceholder('Логін').fill(ADMIN_USERNAME);
  await page.getByPlaceholder('Пароль').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Увійти' }).click();

  await expect(page.getByText('Ввести дані знову')).toBeVisible();
});
