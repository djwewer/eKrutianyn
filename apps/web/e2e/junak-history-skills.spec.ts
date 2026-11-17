import { test, expect, type Locator } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { assignVykhovnyk, createHurtok, createOnboardedUserAs, loginForToken } from './helpers/proby-seed';
import { seedSkillsCatalog } from './helpers/history-seed';

test.beforeAll(() => {
  seedSkillsCatalog();
});

async function openSkills(card: Locator) {
  await card.getByRole('button', { name: /^Вмілості/ }).click();
  await expect(card.getByRole('link', { name: 'Каталог' })).toBeVisible();
}

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

  const card = page.getByTestId('junak-skills');
  await expect(card).toContainText('Розпочато: 0 · Здобуто: 0');
  await openSkills(card);
  await expect(card).toContainText('Вмілостей ще немає.');
  await card.getByRole('button', { name: 'Додати здобуту' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Вмілість').fill('Картог');
  await dialog.getByRole('button', { name: /^Картографія/ }).click();
  await expect(dialog.getByLabel('Рівень')).not.toHaveValue('');
  await dialog.getByLabel('Дата здобуття').fill('2025-05-01');
  await dialog.getByLabel('Екзаменатор (необовʼязково)').fill('Остап Вишня');
  await dialog.getByRole('button', { name: 'Зберегти' }).click();
  await expect(dialog).toHaveCount(0);

  await expect(card.getByTestId('junak-skill')).toContainText('Картографія 2');
  await expect(card).toContainText('Розпочато: 0 · Здобуто: 1');
  await expect(card).toContainText('01.05.2025');
  await expect(card).toContainText('Вмілості практичного пластування');

  await page.goto('/audit-log');
  await expect(page.getByText(/Зарахував вмілість «Картографія» \(друга проба\)/)).toBeVisible();

  await page.context().clearCookies();
  await loginAs(page, s.junak.email, s.junak.password);
  await page.goto('/me');
  const own = page.getByTestId('junak-skills');
  await openSkills(own);
  await expect(own.getByTestId('junak-skill')).toContainText('Картографія 2');
  await expect(own.getByRole('button', { name: 'Додати здобуту' })).toHaveCount(0);
  await expect(own.getByRole('button', { name: 'Розпочати вмілість' })).toBeVisible();
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
  const own = page.getByTestId('junak-skills');
  await openSkills(own);
  await expect(own.getByRole('button', { name: 'Додати здобуту' })).toBeVisible();

  await page.goto(`/users/${outsider.user.id}`);
  const other = page.getByTestId('junak-skills');
  await openSkills(other);
  await expect(other.getByRole('button', { name: 'Додати здобуту' })).toHaveCount(0);
  await expect(other.getByRole('button', { name: 'Розпочати вмілість' })).toHaveCount(0);
});

test('started skill is highlighted; zvyazkovyi signs 2 requirements and credits it; the proba stays collapsed', async ({ page }) => {
  const s = await seedJunak();
  const junakToken = await loginForToken(s.junak.email, s.junak.password);
  const api = 'http://localhost:3001';
  const groups = (await (await fetch(`${api}/skills`, { headers: { Authorization: `Bearer ${junakToken}` } })).json()) as {
    skills: { name: string; levels: { id: string; level: number }[] }[];
  }[];
  const skill = groups.flatMap((g) => g.skills).find((x) => x.name === 'Природознавство')!;
  const started = await fetch(`${api}/users/${s.junak.user.id}/skills/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${junakToken}` },
    body: JSON.stringify({ levelId: skill.levels.find((l) => l.level === 1)!.id }),
  });
  expect(started.ok).toBe(true);

  await loginAs(page, s.zvyazkovyiEmail, s.zvyazkovyiPassword);
  await page.goto(`/users/${s.junak.user.id}`);

  const card = page.getByTestId('junak-skills');
  await expect(card).toContainText('Розпочато: 1 · Здобуто: 0');
  await openSkills(card);
  const item = card.getByTestId('junak-started-skill');
  await expect(item).toHaveCount(1);
  await expect(item).toContainText('Природознавство');
  await item.getByRole('button').first().click();

  await item.getByRole('checkbox', { name: /^Підпис вимоги 1: Природознавство/ }).click();
  await expect(item.getByTestId('junak-skill-progress')).toContainText(/^1 з \d+ вимог/);
  await item.getByRole('checkbox', { name: /^Підпис вимоги 2: Природознавство/ }).click();
  await expect(item.getByTestId('junak-skill-progress')).toContainText(/^2 з \d+ вимог/);
  await expect(item).toContainText("Зв'язковий Тестовий");

  await item.getByRole('button', { name: /^Зарахувати вмілість/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Екзаменатор (необовʼязково)').fill('Остап Вишня');
  await dialog.getByRole('button', { name: 'Зберегти' }).click();
  await expect(dialog).toHaveCount(0);

  await expect(card).toContainText('Розпочато: 0 · Здобуто: 1');
  await expect(card.getByTestId('junak-started-skill')).toHaveCount(0);
  await expect(card.getByTestId('junak-skill')).toContainText('Природознавство 1');

  // The proba card is collapsed by default.
  const proba = page.getByTestId('junak-proba');
  await expect(proba).toContainText('0 з 1 точок');
  await expect(page.getByText('Категорія 1 (0/1)')).toHaveCount(0);
  await proba.getByRole('button', { name: /^Проба/ }).click();
  await page.getByText('Категорія 1 (0/1)').click();
  await page.getByRole('button', { name: 'Підтвердити' }).click();
  await expect(proba).toContainText('1 з 1 точок');
});

test('zvyazkovyi starts a skill for the junak from the catalog picker', async ({ page }) => {
  const s = await seedJunak();
  await loginAs(page, s.zvyazkovyiEmail, s.zvyazkovyiPassword);
  await page.goto(`/users/${s.junak.user.id}`);

  const card = page.getByTestId('junak-skills');
  await openSkills(card);
  await card.getByRole('button', { name: 'Розпочати вмілість' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Вмілість').fill('Перша допом');
  await dialog.getByRole('button', { name: /^Перша допомога/ }).click();
  await dialog.getByLabel('Рівень').selectOption({ label: 'Перша проба' });
  await dialog.getByRole('button', { name: 'Розпочати' }).click();
  await expect(dialog).toHaveCount(0);

  await expect(card).toContainText('Розпочато: 1 · Здобуто: 0');
  await expect(card.getByTestId('junak-started-skill')).toContainText('Перша допомога');
});
