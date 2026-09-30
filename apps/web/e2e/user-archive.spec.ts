import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { createHurtok, createUserAs, loginForToken } from './helpers/proby-seed';

const API_URL = 'http://localhost:3001';

test('zvyazkovyi archives a junak with no hurtok and no positions', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);
  const hurtok = await createHurtok(zvyazkovyiToken, 'Орлики');
  const junak = await createUserAs(zvyazkovyiToken, {
    firstName: 'Тест',
    lastName: `Юнак${Date.now()}`,
    email: `junak-${Date.now()}@example.com`,
    role: 'JUNAK',
    hurtokId: hurtok.id,
  });
  await fetch(`${API_URL}/users/${junak.id}/hurtok`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${zvyazkovyiToken}` },
    body: JSON.stringify({ hurtokId: null }),
  });

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto(`/users/${junak.id}`);

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Архівувати' }).click();

  await expect(page.getByText(/Архівовано/)).toBeVisible();
});

test('archive button is hidden while the junak still has a hurtok', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);
  const hurtok = await createHurtok(zvyazkovyiToken, 'Соколи');
  const junak = await createUserAs(zvyazkovyiToken, {
    firstName: 'Тест',
    lastName: `Юнак${Date.now()}`,
    email: `junak2-${Date.now()}@example.com`,
    role: 'JUNAK',
    hurtokId: hurtok.id,
  });

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto(`/users/${junak.id}`);

  await expect(page.getByRole('button', { name: 'Архівувати' })).not.toBeVisible();
  await expect(page.getByText('Спершу зніміть юнака з гуртка та посад')).toBeVisible();
});

test('kurinniy sends an archive request for a junak instead of archiving directly', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);
  const hurtokForJunak3 = await createHurtok(zvyazkovyiToken, 'Ведмеді');
  const hurtokForKurinniy = await createHurtok(zvyazkovyiToken, 'Орли');
  const junak = await createUserAs(zvyazkovyiToken, {
    firstName: 'Тест',
    lastName: `Юнак${Date.now()}`,
    email: `junak3-${Date.now()}@example.com`,
    role: 'JUNAK',
    hurtokId: hurtokForJunak3.id,
  });
  await fetch(`${API_URL}/users/${junak.id}/hurtok`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${zvyazkovyiToken}` },
    body: JSON.stringify({ hurtokId: null }),
  });
  const kurinniyEmail = `kurinniy-${Date.now()}@example.com`;
  const kurinniy = await createUserAs(zvyazkovyiToken, {
    firstName: 'Курінний',
    lastName: `Тест${Date.now()}`,
    email: kurinniyEmail,
    role: 'JUNAK',
    hurtokId: hurtokForKurinniy.id,
    password: 'password123',
  });
  await fetch(`${API_URL}/kurin-positions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${zvyazkovyiToken}` },
    body: JSON.stringify({ userId: kurinniy.id, scope: 'KURIN', positionType: 'KURINNYI' }),
  });

  await loginAs(page, kurinniyEmail, 'password123');
  await page.goto(`/users/${junak.id}`);

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Архівувати' }).click();

  await expect(page.getByText(/Запит на архівацію надіслано/)).toBeVisible();
});
