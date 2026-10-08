import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { createHurtok, createUserAs, loginForToken } from './helpers/proby-seed';

const API_URL = 'http://localhost:3001';

test('zvyazkovyi publishes an announcement, it appears in the feed, and they can react to it', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto('/news/new');
  await page.getByPlaceholder('Заголовок').fill('Зимовий табір');
  await page.locator('.ProseMirror').fill('Збір у суботу о 9:00.');
  await page.getByRole('button', { name: 'Опублікувати' }).click();
  await page.waitForURL('/news');

  await expect(page.getByText('Зимовий табір')).toBeVisible();
  await expect(page.getByText('Збір у суботу о 9:00.')).toBeVisible();

  // React with the heart emoji, then toggle it off.
  const heartButton = page.getByRole('button', { name: '❤️' });
  await heartButton.click();
  await expect(page.getByRole('button', { name: '❤️ 1' })).toBeVisible();
  await heartButton.click();
  await expect(page.getByRole('button', { name: '❤️ 1' })).not.toBeVisible();

  // Regression test: deleting an announcement that has a reaction (and the
  // FK cascade onto it) must not 500 — it used to fail with a DB-level FK
  // violation because AnnouncementReaction.announcement had no onDelete
  // behavior.
  await heartButton.click();
  await expect(page.getByRole('button', { name: '❤️ 1' })).toBeVisible();

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Видалити' }).click();

  await expect(page.getByText('Зимовий табір')).not.toBeVisible();
});

test('a plain junak (no писар position) does not see edit/delete controls or the new-announcement button', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const accessToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);

  const kurinRes = await fetch(`${API_URL}/kurins/me`, { headers: { Authorization: `Bearer ${accessToken}` } });
  const kurin = await kurinRes.json();

  await fetch(`${API_URL}/kurins/${kurin.id}/announcements`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ title: 'Існуюче оголошення', content: { type: 'doc', content: [] }, imageIds: [] }),
  });

  // A JUNAK must belong to a hurtok, so seed one for this plain junak.
  const hurtok = await createHurtok(accessToken, 'Новинні Орли');
  const junakEmail = `junak-news-${Date.now()}@example.com`;
  const junakPassword = 'password123';
  await createUserAs(accessToken, {
    firstName: 'Тест',
    lastName: 'Юнак',
    email: junakEmail,
    role: 'JUNAK',
    hurtokId: hurtok.id,
    password: junakPassword,
  });

  // An admin-assigned password carries mustChangePassword:true, which would
  // redirect straight to /settings on first navigation; clear it the same
  // way a real first login would, so the test reaches /news cleanly.
  const junakToken = await loginForToken(junakEmail, junakPassword);
  await fetch(`${API_URL}/users/me/password`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${junakToken}` },
    body: JSON.stringify({ currentPassword: junakPassword, newPassword: junakPassword }),
  });

  await loginAs(page, junakEmail, junakPassword);
  await page.goto('/news');

  await expect(page.getByText('Існуюче оголошення')).toBeVisible();
  await expect(page.getByRole('button', { name: '+ Нове оголошення' })).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Редагувати' })).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Видалити' })).not.toBeVisible();
});
