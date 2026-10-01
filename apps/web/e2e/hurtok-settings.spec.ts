import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { createHurtok, createUserAs, loginForToken } from './helpers/proby-seed';

const API_URL = 'http://localhost:3001';

test('lets zvyazkovyi set the founding date from the settings dialog', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { kurin, zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);
  const hurtok = await createHurtok(zvyazkovyiToken, 'Орлики');

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto(`/${kurin.kurinNumber}/hurtky/${hurtok.slug}`);

  await page.getByRole('button', { name: 'Налаштування' }).click();
  await page.getByLabel('Дата заснування').fill('2020-09-01');
  await page.getByRole('button', { name: 'Зберегти дату' }).click();

  await expect(page.getByText('Засновано 01.09.2020')).toBeVisible();
});

test('lets zvyazkovyi assign a vykhovnyk from the settings dialog', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { kurin, zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);
  const hurtok = await createHurtok(zvyazkovyiToken, 'Орлики');
  const vykhovnyk = await createUserAs(zvyazkovyiToken, {
    firstName: 'Тест',
    lastName: `Виховник${Date.now()}`,
    email: `vykhovnyk-${Date.now()}@example.com`,
    role: 'VYKHOVNYK',
  });

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto(`/${kurin.kurinNumber}/hurtky/${hurtok.slug}`);

  await page.getByRole('button', { name: 'Налаштування' }).click();
  await page.getByLabel('Виховник').selectOption(vykhovnyk.id);

  // Scoped to the member card link, not getByText — the same name also sits
  // (hidden) inside the "Виховник" <select>'s own <option>, which would
  // otherwise make an unscoped getByText match ambiguous.
  await expect(
    page.locator('a').filter({ hasText: `${vykhovnyk.lastName} ${vykhovnyk.firstName}` }),
  ).toBeVisible();
});

test('lets zvyazkovyi assign and then remove a hurtok position', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { kurin, zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);
  const hurtok = await createHurtok(zvyazkovyiToken, 'Орлики');
  const junak = await createUserAs(zvyazkovyiToken, {
    firstName: 'Тест',
    lastName: `Юнак${Date.now()}`,
    email: `junak-${Date.now()}@example.com`,
    role: 'JUNAK',
    hurtokId: hurtok.id,
  });

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto(`/${kurin.kurinNumber}/hurtky/${hurtok.slug}`);

  await page.getByRole('button', { name: 'Налаштування' }).click();
  const hurtkovyiRow = page.getByTestId('position-row-HURTKOVYI');
  // Scoped to the <span> showing the current holder, not getByText — the
  // same name also sits (hidden) inside this row's own <select>'s <option>,
  // which would otherwise make an unscoped getByText match ambiguous.
  const hurtkovyiAssigned = hurtkovyiRow
    .locator('span')
    .filter({ hasText: `${junak.lastName} ${junak.firstName}` });
  await page.getByLabel('Гуртковий').selectOption(junak.id);
  await expect(hurtkovyiAssigned).toBeVisible();

  await hurtkovyiRow.getByRole('button', { name: 'Зняти' }).click();
  await expect(hurtkovyiAssigned).not.toBeVisible();
});

test('warns before reassigning a junak who already holds a position in another hurtok', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { kurin, zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);
  const hurtokA = await createHurtok(zvyazkovyiToken, 'Орлики');
  const hurtokB = await createHurtok(zvyazkovyiToken, 'Вовки');
  const junak = await createUserAs(zvyazkovyiToken, {
    firstName: 'Олег',
    lastName: 'Олененко',
    email: `junak-${Date.now()}@example.com`,
    role: 'JUNAK',
    hurtokId: hurtokA.id,
  });
  await fetch(`${API_URL}/kurin-positions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${zvyazkovyiToken}` },
    body: JSON.stringify({ userId: junak.id, scope: 'HURTOK', positionType: 'HURTKOVYI', hurtokId: hurtokA.id }),
  });
  // Move the junak to hurtokB — this does NOT clear his original position
  // (UsersService.updateHurtok only updates User.hurtokId), so he now shows
  // up as a HURTOK-position candidate in hurtokB while still holding
  // Hurtkovyi back in hurtokA.
  await fetch(`${API_URL}/users/${junak.id}/hurtok`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${zvyazkovyiToken}` },
    body: JSON.stringify({ hurtokId: hurtokB.id }),
  });

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto(`/${kurin.kurinNumber}/hurtky/${hurtokB.slug}`);
  await page.getByRole('button', { name: 'Налаштування' }).click();

  let dialogMessage = '';
  page.once('dialog', (dialog) => {
    dialogMessage = dialog.message();
    void dialog.dismiss();
  });
  await page.getByLabel('Писар').selectOption(junak.id);
  await expect.poll(() => dialogMessage).toContain('Гуртковий');
  await expect.poll(() => dialogMessage).toContain('Орлики');

  // Declined — Олег's original Гуртковий position in Орлики must stay intact.
  await page.goto(`/${kurin.kurinNumber}/hurtky/${hurtokA.slug}`);
  await page.getByRole('button', { name: 'Налаштування' }).click();
  const hurtkovyiRow = page.getByTestId('position-row-HURTKOVYI');
  await expect(hurtkovyiRow.getByText('Олененко Олег')).toBeVisible();
});

test('disables disbanding a hurtok that still has a junak, enables it once empty', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { kurin, zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);
  const hurtok = await createHurtok(zvyazkovyiToken, 'Орлики');
  const junak = await createUserAs(zvyazkovyiToken, {
    firstName: 'Тест',
    lastName: `Юнак${Date.now()}`,
    email: `junak2-${Date.now()}@example.com`,
    role: 'JUNAK',
    hurtokId: hurtok.id,
  });

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto(`/${kurin.kurinNumber}/hurtky/${hurtok.slug}`);
  await page.getByRole('button', { name: 'Налаштування' }).click();

  await expect(page.getByRole('button', { name: 'Розформувати гурток' })).toBeDisabled();

  await fetch(`${API_URL}/users/${junak.id}/hurtok`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${zvyazkovyiToken}` },
    body: JSON.stringify({ hurtokId: null }),
  });
  await page.reload();
  await page.getByRole('button', { name: 'Налаштування' }).click();

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Розформувати гурток' }).click();

  await expect(page.getByText(/Архівовано/)).toBeVisible();
});
