import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { createUserAs, loginForToken } from './helpers/proby-seed';

test('lists the kurin\'s own zvyazkovyi in Кадра виховників with a Зв\'язковий badge', async ({ page }) => {
  const { program } = await seedProbyProgram();
  // seedKurinWithZvyazkovyi always creates the zvyazkovyi as
  // firstName: "Зв'язковий", lastName: "Тестовий" — asserted on literally
  // since the admin-seed response type doesn't carry these fields.
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto('/kurin');
  await page.getByText('Кадра виховників').click();

  const row = page.locator('a').filter({ hasText: 'Тестовий Зв\'язковий' });
  await expect(row).toBeVisible();
  await expect(row.getByText('Зв\'язковий', { exact: true })).toBeVisible();
});

test('roster row shows the real uploaded profile photo as an <img>, not just initials', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);

  const vykhovnykEmail = `vykhovnyk-photo-${Date.now()}@example.com`;
  const vykhovnykPassword = 'password123';
  const vykhovnyk = await createUserAs(zvyazkovyiToken, {
    firstName: 'Фото',
    lastName: 'Власник',
    email: vykhovnykEmail,
    role: 'VYKHOVNYK',
    password: vykhovnykPassword,
  });
  const vykhovnykToken = await loginForToken(vykhovnykEmail, vykhovnykPassword);

  // Smallest possible valid PNG (1x1 red pixel), uploaded via the real
  // PATCH /users/me/photo flow so the server-side magic-byte sniff and
  // photoUpdatedAt bump are exercised exactly as in production.
  const pngBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  );
  const formData = new FormData();
  formData.append('photo', new Blob([pngBytes], { type: 'image/png' }), 'photo.png');
  const uploadRes = await fetch('http://localhost:3001/users/me/photo', {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${vykhovnykToken}` },
    body: formData,
  });
  if (!uploadRes.ok) {
    throw new Error(`photo upload failed: ${uploadRes.status} ${await uploadRes.text()}`);
  }

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto('/kurin');
  await page.getByText('Кадра виховників').click();

  const row = page.locator('a').filter({ hasText: `${vykhovnyk.lastName} ${vykhovnyk.firstName}` });
  await expect(row).toBeVisible();
  const photo = row.locator('img');
  await expect(photo).toHaveCount(1);
  await expect(photo).toHaveAttribute('src', new RegExp(`/api/backend/users/${vykhovnyk.id}/photo\\?v=`));
});
