import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { assignVykhovnyk, createHurtok, createOnboardedUserAs, loginForToken } from './helpers/proby-seed';
import { seedSkillsCatalog } from './helpers/history-seed';

test.beforeAll(() => {
  seedSkillsCatalog();
});

async function seedJunak() {
  const { program } = await seedProbyProgram();
  const seeded = await seedKurinWithZvyazkovyi(program.id);
  const token = await loginForToken(seeded.zvyazkovyiEmail, seeded.zvyazkovyiPassword);
  const hurtok = await createHurtok(token, `Орлики${Date.now()}`);
  const junak = await createOnboardedUserAs(token, {
    firstName: 'Іван',
    lastName: `Петренко${Date.now()}`,
    email: `junak-history-${Date.now()}@example.com`,
    role: 'JUNAK',
    hurtokId: hurtok.id,
  });
  return { ...seeded, token, hurtok, junak };
}

test('zvyazkovyi adds a skill on the junak page; the junak sees it read-only on /me; the journal describes it', async ({ page }) => {
  const s = await seedJunak();
  await loginAs(page, s.zvyazkovyiEmail, s.zvyazkovyiPassword);
  await page.goto(`/users/${s.junak.user.id}`);

  const card = page.getByTestId('history-skills');
  await expect(card).toContainText('Вмілостей ще немає.');
  await card.getByRole('button', { name: 'Додати вмілість' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Вмілість').fill('Картог');
  await dialog.getByRole('button', { name: /^Картографія/ }).click();
  await expect(dialog.getByLabel('Рівень')).not.toHaveValue('');
  await dialog.getByLabel('Дата здобуття').fill('2025-05-01');
  await dialog.getByLabel('Екзаменатор (необовʼязково)').fill('Остап Вишня');
  await dialog.getByRole('button', { name: 'Зберегти' }).click();
  await expect(dialog).toHaveCount(0);

  await expect(card.getByTestId('junak-skill')).toContainText('Картографія 2');
  await expect(card).toContainText('01.05.2025');
  await expect(card).toContainText('Вмілості практичного пластування');

  await page.goto('/audit-log');
  await expect(page.getByText(/Зарахував вмілість «Картографія» \(друга проба\)/)).toBeVisible();

  await page.context().clearCookies();
  await loginAs(page, s.junak.email, s.junak.password);
  await page.goto('/me');
  const own = page.getByTestId('history-skills');
  await expect(own.getByTestId('junak-skill')).toContainText('Картографія 2');
  await expect(own.getByRole('button', { name: 'Додати вмілість' })).toHaveCount(0);
  await expect(own.getByRole('button', { name: /Змінити:|Видалити:/ })).toHaveCount(0);
});

test('vykhovnyk sees skill edit buttons only for junaks of own hurtok', async ({ page }) => {
  const s = await seedJunak();
  const vykhovnyk = await createOnboardedUserAs(s.token, {
    firstName: 'Марія',
    lastName: `Мельник${Date.now()}`,
    email: `vykhovnyk-history-${Date.now()}@example.com`,
    role: 'VYKHOVNYK',
  });
  await assignVykhovnyk(s.token, vykhovnyk.user.id, s.hurtok.id);
  // A junak is created with a hurtok; clearing it leaves one a vykhovnyk may read but not edit.
  const outsider = await createOnboardedUserAs(s.token, {
    firstName: 'Петро',
    lastName: `Безгуртковий${Date.now()}`,
    email: `junak-outsider-${Date.now()}@example.com`,
    role: 'JUNAK',
    hurtokId: s.hurtok.id,
  });
  const cleared = await fetch(`http://localhost:3001/users/${outsider.user.id}/hurtok`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.token}` },
    body: JSON.stringify({ hurtokId: null }),
  });
  expect(cleared.ok).toBe(true);

  await loginAs(page, vykhovnyk.email, vykhovnyk.password);
  await page.goto(`/users/${s.junak.user.id}`);
  await expect(page.getByTestId('history-skills').getByRole('button', { name: 'Додати вмілість' })).toBeVisible();

  await page.goto(`/users/${outsider.user.id}`);
  await expect(page.getByTestId('history-skills')).toBeVisible();
  await expect(page.getByTestId('history-skills').getByRole('button', { name: 'Додати вмілість' })).toHaveCount(0);
});
