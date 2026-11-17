import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { createHurtok, createOnboardedUserAs, loginForToken } from './helpers/proby-seed';
import { seedSkillsCatalog } from './helpers/history-seed';

test.beforeAll(() => {
  seedSkillsCatalog();
});

test('junak starts a skill in the catalog, sees it in «Розпочаті» and removes it', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const seeded = await seedKurinWithZvyazkovyi(program.id);
  const token = await loginForToken(seeded.zvyazkovyiEmail, seeded.zvyazkovyiPassword);
  const hurtok = await createHurtok(token, `Орлики${Date.now()}`);
  const { email, password } = await createOnboardedUserAs(token, {
    firstName: 'Тест',
    lastName: `Юнак${Date.now()}`,
    email: `my-skills-${Date.now()}@example.com`,
    role: 'JUNAK',
    hurtokId: hurtok.id,
  });
  await loginAs(page, email, password);
  await page.goto('/skills');

  const main = page.getByRole('main');
  const mine = main.getByTestId('my-skills');
  await expect(mine).toContainText('Ще немає розпочатих вмілостей');

  await main.getByRole('button', { name: /^Природничі вмілості/ }).click();
  const card = main.getByTestId('skill-card').filter({ has: page.getByRole('heading', { name: 'Природознавство' }) });
  await card.getByRole('button', { name: /^Розпочати/ }).click();

  await expect(card.getByText('розпочата')).toBeVisible();
  const started = mine.getByTestId('my-started-skill');
  await expect(started).toHaveCount(1);
  await expect(started).toContainText('Природознавство');
  await expect(started).toContainText(/0 з \d+ вимог/);

  await started.getByRole('button').first().click();
  await started.getByRole('button', { name: /^Прибрати/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Прибрати/ }).click();

  await expect(started).toHaveCount(0);
  await expect(mine).toContainText('Ще немає розпочатих вмілостей');
  await expect(card.getByRole('button', { name: /^Розпочати/ })).toBeVisible();
});

test('виховник-side progress shows up for the junak: signs, credit and no remove', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const seeded = await seedKurinWithZvyazkovyi(program.id);
  const token = await loginForToken(seeded.zvyazkovyiEmail, seeded.zvyazkovyiPassword);
  const hurtok = await createHurtok(token, `Орлики${Date.now()}`);
  const { user, email, password } = await createOnboardedUserAs(token, {
    firstName: 'Тест',
    lastName: `Юнак${Date.now()}`,
    email: `my-skills2-${Date.now()}@example.com`,
    role: 'JUNAK',
    hurtokId: hurtok.id,
  });
  const junakToken = await loginForToken(email, password);
  const api = 'http://localhost:3001';
  const call = async (method: string, path: string, tok: string, body?: unknown) => {
    const res = await fetch(`${api}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`${method} ${path} ${res.status} ${await res.text()}`);
    return res.json();
  };
  const groups = await call('GET', '/skills', junakToken);
  const skills = (groups as { skills: { name: string; levels: { id: string; level: number }[] }[] }[]).flatMap((g) => g.skills);
  const [skillA, skillB] = [skills.find((s) => s.name === 'Природознавство')!, skills.find((s) => s.name === 'Перша допомога')!];
  const levelOf = (s: typeof skillA) => s.levels.find((l) => l.level === 1)!;
  const a = await call('POST', `/users/${user.id}/skills/start`, junakToken, { levelId: levelOf(skillA).id });
  const b = await call('POST', `/users/${user.id}/skills/start`, junakToken, { levelId: levelOf(skillB).id });
  await call('PUT', `/users/${user.id}/skills/${a.id}/requirements/0`, token);
  await call('POST', `/users/${user.id}/skills/${b.id}/achieve`, token, { achievedAt: '2026-11-01' });

  await loginAs(page, email, password);
  await page.goto('/skills');
  const main = page.getByRole('main');
  const mine = main.getByTestId('my-skills');

  const started = mine.getByTestId('my-started-skill');
  await expect(started).toHaveCount(1);
  await expect(started).toContainText('Природознавство');
  await expect(started).toContainText(/^.*1 з \d+ вимог/);
  await started.getByRole('button').first().click();
  await expect(started).toContainText('підписано');
  await expect(started).toContainText("Зв'язковий Тестовий");
  await expect(started.getByRole('button', { name: /^Прибрати/ })).toHaveCount(0);

  const achieved = mine.getByTestId('my-achieved-skill');
  await expect(achieved).toHaveCount(1);
  await expect(achieved).toContainText('Перша допомога');
  await expect(achieved).toContainText('Перша проба');
  await expect(achieved).toContainText('01.11.2026');

  await main.getByRole('button', { name: /^Вмілості першої допомоги і рятівництва/ }).click();
  const cardB = main.getByTestId('skill-card').filter({ has: page.getByRole('heading', { name: 'Перша допомога' }) });
  await expect(cardB.getByText('здобута')).toBeVisible();
});
