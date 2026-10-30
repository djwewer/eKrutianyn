import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { createHurtok, createOnboardedUserAs, loginForToken } from './helpers/proby-seed';
import { seedSkillsCatalog } from './helpers/history-seed';

const GROUP_LABELS = [
  'Вмілості практичного пластування',
  'Вмілості першої допомоги і рятівництва',
  'Природничі вмілості',
  'Спортивні вмілості',
  'Вмілості домашньої зарадності',
  'Вмілості спеціального зацікавлення',
  'Мистецькі вмілості',
  'Вмілості літунського пластування',
  'Вмілості морського пластування',
];

test.beforeAll(() => {
  seedSkillsCatalog();
});

async function seed() {
  const { program } = await seedProbyProgram();
  const seeded = await seedKurinWithZvyazkovyi(program.id);
  const token = await loginForToken(seeded.zvyazkovyiEmail, seeded.zvyazkovyiPassword);
  return { ...seeded, token };
}

test('junak opens «Вмілості» from the hub and reads requirements by group and level', async ({ page }) => {
  const { token } = await seed();
  const hurtok = await createHurtok(token, `Орлики${Date.now()}`);
  const { email, password } = await createOnboardedUserAs(token, {
    firstName: 'Тест',
    lastName: `Юнак${Date.now()}`,
    email: `junak-skills-${Date.now()}@example.com`,
    role: 'JUNAK',
    hurtokId: hurtok.id,
  });
  await loginAs(page, email, password);
  await page.goto('/plastuvannia');
  await page.getByRole('main').getByRole('link', { name: /Вмілості/ }).click();
  await expect(page).toHaveURL(/\/skills$/);

  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'Вмілості', exact: true })).toBeVisible();
  for (const label of GROUP_LABELS) {
    await expect(main.getByRole('button', { name: new RegExp(`^${label}`) })).toBeVisible();
  }
  await expect(main.getByRole('button', { name: 'Додати власну вмілість' })).toHaveCount(0);

  await main.getByRole('button', { name: /^Природничі вмілості/ }).click();
  const nature = main.getByTestId('skill-card').filter({ has: page.getByRole('heading', { name: 'Природознавство' }) });
  await expect(nature.getByRole('tab')).toHaveText(['Перша проба', 'Друга проба', 'Третя проба']);
  await nature.getByRole('tab', { name: 'Третя проба' }).click();
  await expect(nature.getByRole('tabpanel')).toContainText('Зібрати, підготувати та оформити матеріали для інструктажу');

  await main.getByRole('button', { name: /^Вмілості першої допомоги і рятівництва/ }).click();
  const firstAid = main.getByTestId('skill-card').filter({ has: page.getByRole('heading', { name: 'Перша допомога' }) });
  await expect(firstAid.getByRole('tabpanel')).toContainText('Виконати вимоги А або Б.');
  await expect(firstAid.getByRole('tabpanel')).toContainText('13. Знати, що робити у випадку укушення');

  await page.screenshot({ path: 'test-results/skills-catalog.png', fullPage: true });
});

test('zvyazkovyi adds, edits and deletes a custom skill, and the journal records it', async ({ page }) => {
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seed();
  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto('/skills');

  await page.getByRole('button', { name: 'Додати власну вмілість' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Назва').fill('Знавець компʼютерів');
  await dialog.getByLabel('Група').selectOption('SPECIAL');
  await dialog.getByLabel('Вимоги — Перша проба').fill('1. Знати будову компʼютера.\n2. Встановити операційну систему.');
  await dialog.getByRole('button', { name: 'Зберегти' }).click();
  await expect(dialog).toHaveCount(0);

  await page.getByRole('button', { name: /^Вмілості спеціального зацікавлення/ }).click();
  const card = page.getByTestId('skill-card').filter({ has: page.getByRole('heading', { name: 'Знавець компʼютерів' }) });
  await expect(card.getByText('Власна')).toBeVisible();
  await expect(card.getByRole('tabpanel')).toContainText('2. Встановити операційну систему.');

  await card.getByRole('button', { name: 'Змінити' }).click();
  await dialog.getByLabel('Назва').fill('Компʼютерна грамотність');
  await dialog.getByRole('button', { name: 'Зберегти' }).click();
  const renamed = page.getByTestId('skill-card').filter({ has: page.getByRole('heading', { name: 'Компʼютерна грамотність' }) });
  await expect(renamed).toBeVisible();

  page.once('dialog', (confirmDialog) => confirmDialog.accept());
  await renamed.getByRole('button', { name: 'Видалити' }).click();
  await expect(renamed).toHaveCount(0);

  await page.goto('/audit-log');
  await expect(page.getByText('Додав власну вмілість «Знавець компʼютерів»')).toBeVisible();
  await expect(page.getByText('Видалив власну вмілість «Компʼютерна грамотність»')).toBeVisible();
});
