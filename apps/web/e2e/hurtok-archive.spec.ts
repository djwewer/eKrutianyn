import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { createHurtok, createUserAs, loginForToken } from './helpers/proby-seed';

const API_URL = 'http://localhost:3001';

test('zvyazkovyi archives an empty hurtok', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { kurin, zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);
  const hurtok = await createHurtok(zvyazkovyiToken, 'Пусті Орли');

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto(`/${kurin.kurinNumber}/hurtky/${hurtok.slug}`);

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Архівувати гурток' }).click();

  await expect(page.getByText(/Архівовано/)).toBeVisible();
});

test('archive button is hidden while the hurtok still has a junak', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { kurin, zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);
  const hurtok = await createHurtok(zvyazkovyiToken, 'Непорожні Орли');
  await createUserAs(zvyazkovyiToken, {
    firstName: 'Тест',
    lastName: `Юнак${Date.now()}`,
    email: `junak-${Date.now()}@example.com`,
    role: 'JUNAK',
    hurtokId: hurtok.id,
  });

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto(`/${kurin.kurinNumber}/hurtky/${hurtok.slug}`);

  await expect(page.getByRole('button', { name: 'Архівувати гурток' })).not.toBeVisible();
});

test('a vykhovnyk does not see the archive button', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { kurin, zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);
  const hurtok = await createHurtok(zvyazkovyiToken, 'Тестові Орли');
  const vykhovnykEmail = `vykhovnyk-${Date.now()}@example.com`;
  const vykhovnyk = await createUserAs(zvyazkovyiToken, {
    firstName: 'Виховник',
    lastName: `Тест${Date.now()}`,
    email: vykhovnykEmail,
    role: 'VYKHOVNYK',
    password: 'password123',
  });
  await fetch(`${API_URL}/vykhovnyk-assignments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${zvyazkovyiToken}` },
    body: JSON.stringify({ vykhovnykId: vykhovnyk.id, hurtokId: hurtok.id }),
  });

  await loginAs(page, vykhovnykEmail, 'password123');
  await page.goto(`/${kurin.kurinNumber}/hurtky/${hurtok.slug}`);

  await expect(page.getByRole('button', { name: 'Архівувати гурток' })).not.toBeVisible();
});
