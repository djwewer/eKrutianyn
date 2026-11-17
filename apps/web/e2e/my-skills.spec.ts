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
  await card.getByRole('button', { name: 'Розпочати' }).click();

  await expect(card.getByText('розпочата')).toBeVisible();
  const started = mine.getByTestId('my-started-skill');
  await expect(started).toHaveCount(1);
  await expect(started).toContainText('Природознавство');
  await expect(started).toContainText(/0 з \d+ вимог/);

  await started.getByRole('button').first().click();
  await started.getByRole('button', { name: 'Прибрати' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Прибрати' }).click();

  await expect(started).toHaveCount(0);
  await expect(mine).toContainText('Ще немає розпочатих вмілостей');
  await expect(card.getByRole('button', { name: 'Розпочати' })).toBeVisible();
});
