import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { createHurtok, createUserAs, loginForToken } from './helpers/proby-seed';

test('lets kurinniy request a hurtok change, zvyazkovyi approves it', async ({ page, request }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);

  const hurtokA = await createHurtok(zvyazkovyiToken, 'Орлики');
  const hurtokB = await createHurtok(zvyazkovyiToken, 'Соколи');
  const kurinniyEmail = `kurinniy-${Date.now()}@example.com`;
  const kurinniy = await createUserAs(zvyazkovyiToken, {
    firstName: 'Кур',
    lastName: 'Інний',
    email: kurinniyEmail,
    role: 'JUNAK',
    hurtokId: hurtokA.id,
    password: 'password123',
  });
  await request.post('http://localhost:3001/kurin-positions', {
    headers: { Authorization: `Bearer ${zvyazkovyiToken}`, 'Content-Type': 'application/json' },
    data: { userId: kurinniy.id, scope: 'KURIN', positionType: 'KURINNYI' },
  });
  const targetEmail = `target-${Date.now()}@example.com`;
  const target = await createUserAs(zvyazkovyiToken, {
    firstName: 'Ціль',
    lastName: 'Юнак',
    email: targetEmail,
    role: 'JUNAK',
    hurtokId: hurtokA.id,
    password: 'password123',
  });

  await loginAs(page, kurinniyEmail, 'password123');
  await page.goto(`/users/${target.id}`);
  await page.getByLabel('Гурток').selectOption({ label: 'Соколи' });
  await page.getByRole('button', { name: 'Перевести' }).click();
  await expect(page.getByText(/запит.*надіслано/i)).toBeVisible();

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto('/approval-requests');
  await page.getByText('Переведення в інший гурток').first().click();
  await page.getByRole('button', { name: 'Затвердити' }).click();

  await page.goto(`/users/${target.id}`);
  await expect(page.getByLabel('Гурток')).toHaveValue(hurtokB.id);
});

test('lets a KURIN-scope suddia request a hurtok change too', async ({ page, request }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);

  const hurtokA = await createHurtok(zvyazkovyiToken, 'Орлики');
  const hurtokB = await createHurtok(zvyazkovyiToken, 'Соколи');
  const suddiaEmail = `suddia-${Date.now()}@example.com`;
  const suddia = await createUserAs(zvyazkovyiToken, {
    firstName: 'Суд',
    lastName: 'Дя',
    email: suddiaEmail,
    role: 'JUNAK',
    hurtokId: hurtokA.id,
    password: 'password123',
  });
  await request.post('http://localhost:3001/kurin-positions', {
    headers: { Authorization: `Bearer ${zvyazkovyiToken}`, 'Content-Type': 'application/json' },
    data: { userId: suddia.id, scope: 'KURIN', positionType: 'SUDDIA' },
  });
  const targetEmail = `target-${Date.now()}@example.com`;
  const target = await createUserAs(zvyazkovyiToken, {
    firstName: 'Ціль',
    lastName: 'Юнак',
    email: targetEmail,
    role: 'JUNAK',
    hurtokId: hurtokA.id,
    password: 'password123',
  });

  await loginAs(page, suddiaEmail, 'password123');
  await page.goto(`/users/${target.id}`);
  await page.getByLabel('Гурток').selectOption({ label: 'Соколи' });
  await page.getByRole('button', { name: 'Перевести' }).click();
  await expect(page.getByText(/запит.*надіслано/i)).toBeVisible();

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto('/approval-requests');
  await page.getByText('Переведення в інший гурток').first().click();
  await page.getByRole('button', { name: 'Затвердити' }).click();

  await page.goto(`/users/${target.id}`);
  await expect(page.getByLabel('Гурток')).toHaveValue(hurtokB.id);
});
