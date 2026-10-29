import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { assignVykhovnyk, createHurtok, createOnboardedUserAs, createUserAs, loginForToken } from './helpers/proby-seed';

async function seed() {
  const { program } = await seedProbyProgram();
  const seeded = await seedKurinWithZvyazkovyi(program.id);
  const token = await loginForToken(seeded.zvyazkovyiEmail, seeded.zvyazkovyiPassword);
  return { token };
}

const vykhovnykDto = () => ({
  firstName: 'Марія',
  lastName: `Мельник${Date.now()}`,
  email: `vykhovnyk-mh-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`,
  role: 'VYKHOVNYK',
});

test('vykhovnyk assigned to a hurtok sees its name and members', async ({ page }) => {
  const { token } = await seed();
  const hurtok = await createHurtok(token, `Орлики${Date.now()}`);
  const junak = await createUserAs(token, {
    firstName: 'Тест',
    lastName: `Юнак${Date.now()}`,
    email: `junak-mh-${Date.now()}@example.com`,
    role: 'JUNAK',
    hurtokId: hurtok.id,
  });
  const { user, email, password } = await createOnboardedUserAs(token, vykhovnykDto());
  await assignVykhovnyk(token, user.id, hurtok.id);

  await loginAs(page, email, password);
  await page.goto('/my-hurtok');
  await expect(page.getByRole('heading', { name: 'Мій гурток' })).toBeVisible();
  await expect(page.getByText(hurtok.name).first()).toBeVisible();
  await expect(page.getByText(`${junak.lastName} ${junak.firstName}`)).toBeVisible();
});

test('vykhovnyk without hurtky sees the empty message', async ({ page }) => {
  const { token } = await seed();
  const { email, password } = await createOnboardedUserAs(token, vykhovnykDto());
  await loginAs(page, email, password);
  await page.goto('/my-hurtok');
  await expect(page.getByText('Вас ще не прикріплено до жодного гуртка.')).toBeVisible();
});

test('junak gets no access', async ({ page }) => {
  const { token } = await seed();
  const hurtok = await createHurtok(token, `Орлики${Date.now()}`);
  const { email, password } = await createOnboardedUserAs(token, {
    firstName: 'Тест',
    lastName: `Юнак${Date.now()}`,
    email: `junak-mh2-${Date.now()}@example.com`,
    role: 'JUNAK',
    hurtokId: hurtok.id,
  });
  await loginAs(page, email, password);
  await page.goto('/my-hurtok');
  await expect(page.getByText('Немає доступу.')).toBeVisible();
});
