import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { createHurtok, createOnboardedUserAs, loginForToken } from './helpers/proby-seed';

async function seed() {
  const { program } = await seedProbyProgram();
  const seeded = await seedKurinWithZvyazkovyi(program.id);
  const token = await loginForToken(seeded.zvyazkovyiEmail, seeded.zvyazkovyiPassword);
  return { ...seeded, token };
}

async function expectTiles(page: import('@playwright/test').Page) {
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'Моє пластування' })).toBeVisible();
  await expect(main.getByRole('link', { name: /Моя проба/ })).toHaveAttribute('href', '/proby');
  await expect(main.getByRole('link', { name: /AI-виховник/ })).toHaveAttribute('href', '/ai-vykhovnyk');
  await expect(main.getByRole('link', { name: /Додати акцію/ })).toHaveAttribute('href', '/my-activity');
  await expect(main.getByText('Запит', { exact: true })).toBeVisible();
  await expect(page.getByText('Скоро')).toBeVisible();
  await expect(main.getByRole('link', { name: /^Запит(\s|$)/ })).toHaveCount(0);
}

test('zvyazkovyi sees the hub with test-mode badge and a non-link Запит tile', async ({ page }) => {
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seed();
  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto('/plastuvannia');
  await expectTiles(page);
  await expect(page.getByText('Тестовий режим')).toBeVisible();
});

test('junak sees the same tiles without the test-mode badge', async ({ page }) => {
  const { token } = await seed();
  const hurtok = await createHurtok(token, `Орлики${Date.now()}`);
  const { email, password } = await createOnboardedUserAs(token, {
    firstName: 'Тест',
    lastName: `Юнак${Date.now()}`,
    email: `junak-hub-${Date.now()}@example.com`,
    role: 'JUNAK',
    hurtokId: hurtok.id,
  });
  await loginAs(page, email, password);
  await page.goto('/plastuvannia');
  await expectTiles(page);
  await expect(page.getByText('Тестовий режим')).toHaveCount(0);
});

test('vykhovnyk gets no access', async ({ page }) => {
  const { token } = await seed();
  const { email, password } = await createOnboardedUserAs(token, {
    firstName: 'Марія',
    lastName: `Мельник${Date.now()}`,
    email: `vykhovnyk-hub-${Date.now()}@example.com`,
    role: 'VYKHOVNYK',
  });
  await loginAs(page, email, password);
  await page.goto('/plastuvannia');
  await expect(page.getByText('Немає доступу.')).toBeVisible();
});
