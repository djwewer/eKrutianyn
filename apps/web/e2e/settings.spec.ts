import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';

test('lets zvyazkovyi change their own nickname and password from settings', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto('/settings');

  await page.getByLabel('Нікнейм').fill('Сокіл');
  await page.getByRole('button', { name: 'Зберегти' }).click();
  await expect(page.getByText('Збережено.')).toBeVisible();

  await page.getByTestId('currentPassword').fill(zvyazkovyiPassword);
  await page.getByTestId('newPassword').fill('a-brand-new-password-123');
  await page.getByRole('button', { name: 'Змінити пароль' }).click();
  await expect(page.getByText('Пароль змінено.')).toBeVisible();

  await page.request.post('http://localhost:3000/api/auth/logout');
  await page.goto('/login');
  await page.getByLabel('Email').fill(zvyazkovyiEmail);
  await page.getByLabel('Пароль').fill('a-brand-new-password-123');
  await page.getByRole('button', { name: 'Увійти' }).click();
  await expect(page).not.toHaveURL(/\/login$/);
});

test('crops a selected photo before upload and updates the avatar', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto('/settings');

  // Smallest possible valid PNG (1x1 red pixel) — same fixture used by
  // kurin-roster-zvyazkovyi.spec.ts for the real upload flow.
  const pngBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  );

  await page.locator('input[type="file"]').setInputFiles({
    name: 'photo.png',
    mimeType: 'image/png',
    buffer: pngBytes,
  });

  // The crop dialog opens instead of uploading immediately.
  await expect(page.getByText('Обрізати фото')).toBeVisible();
  await expect(page.getByTestId('photo-crop-area')).toBeVisible();

  const dialog = page.getByRole('dialog');
  const saveButton = dialog.getByRole('button', { name: 'Зберегти' });
  // react-easy-crop computes the initial crop area asynchronously on image
  // load; the Save button stays disabled until that fires. Per the plan,
  // this test exercises the dialog-open -> upload -> avatar-updates
  // plumbing without dragging to zoom/pan.
  await expect(saveButton).toBeEnabled();
  await saveButton.click();

  // Dialog closes and the avatar now renders the uploaded (cropped) photo.
  await expect(page.getByText('Обрізати фото')).toBeHidden();
  const avatarPhoto = page.locator('img[alt]').first();
  await expect(avatarPhoto).toHaveAttribute('src', /\/api\/backend\/users\/.+\/photo\?v=/);
  await expect(page.getByRole('button', { name: 'Змінити фото' })).toBeVisible();
});
