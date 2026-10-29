import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { assignVykhovnyk, createHurtok, createOnboardedUserAs, loginForToken } from './helpers/proby-seed';

async function seed() {
  const { program } = await seedProbyProgram();
  const seeded = await seedKurinWithZvyazkovyi(program.id);
  const token = await loginForToken(seeded.zvyazkovyiEmail, seeded.zvyazkovyiPassword);
  return { token, seeded };
}

test('zvyazkovyi sees own data and no degrees card on /me', async ({ page }) => {
  const { seeded } = await seed();
  await loginAs(page, seeded.zvyazkovyiEmail, seeded.zvyazkovyiPassword);
  await page.goto('/me');
  const main = page.locator('main');
  await expect(main.getByRole('heading', { name: 'Моя сторінка' })).toBeVisible();
  await expect(main.getByText(seeded.zvyazkovyiEmail).first()).toBeVisible();
  await expect(main.getByText('Діловодство')).toBeVisible();
  await expect(main.getByText("Зв'язковий").first()).toBeVisible();
  await expect(main.getByText('Ступінь')).toHaveCount(0);
});

test('junak sees degrees and own data with hurtok on /me', async ({ page }) => {
  const { token } = await seed();
  const hurtok = await createHurtok(token, `Орлики${Date.now()}`);
  const { email, password } = await createOnboardedUserAs(token, {
    firstName: 'Тест',
    lastName: `Юнак${Date.now()}`,
    email: `junak-me-${Date.now()}@example.com`,
    role: 'JUNAK',
    hurtokId: hurtok.id,
  });
  await loginAs(page, email, password);
  await page.goto('/me');
  const main = page.locator('main');
  await expect(main.getByText('Ступінь', { exact: true })).toBeVisible();
  await expect(main.getByTestId('current-degree')).toBeVisible();
  await expect(main.getByText('Дані', { exact: true })).toBeVisible();
  await expect(main.getByText(hurtok.name)).toBeVisible();
  await expect(main.getByRole('button', { name: 'Зберегти' })).toHaveCount(0);
});

test('vykhovnyk sees own hurtky and no degrees on /me', async ({ page }) => {
  const { token } = await seed();
  const hurtok = await createHurtok(token, `Орлики${Date.now()}`);
  const { user, email, password } = await createOnboardedUserAs(token, {
    firstName: 'Марія',
    lastName: `Мельник${Date.now()}`,
    email: `vykhovnyk-me-${Date.now()}@example.com`,
    role: 'VYKHOVNYK',
  });
  await assignVykhovnyk(token, user.id, hurtok.id);
  await loginAs(page, email, password);
  await page.goto('/me');
  const main = page.locator('main');
  await expect(main.getByText(email).first()).toBeVisible();
  await expect(main.getByText('Мої гуртки')).toBeVisible();
  await expect(main.getByText(hurtok.name)).toBeVisible();
  await expect(main.getByText('Дані', { exact: true })).toBeVisible();
  await expect(main.getByText('Ступінь')).toHaveCount(0);
});
