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
  const hurtkovyiSelect = page.getByLabel('Гуртковий');
  await hurtkovyiSelect.selectOption(junak.id);
  await expect(hurtkovyiSelect).toHaveValue(junak.id);
  await expect(hurtkovyiRow.getByRole('button', { name: 'Зняти' })).toBeVisible();

  await hurtkovyiRow.getByRole('button', { name: 'Зняти' }).click();
  await expect(hurtkovyiSelect).toHaveValue('');
  await expect(hurtkovyiRow.getByRole('button', { name: 'Зняти' })).not.toBeVisible();
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
  // He's no longer a member of Орлики (moved to Вовки above), so the select
  // shows him via a synthesized option rather than one from junakMembers.
  await page.goto(`/${kurin.kurinNumber}/hurtky/${hurtokA.slug}`);
  await page.getByRole('button', { name: 'Налаштування' }).click();
  await expect(page.getByLabel('Гуртковий')).toHaveValue(junak.id);
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

test('lets a KURIN-scope suddia open and use the hurtok settings dialog', async ({ page, request }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);

  const hurtok = await createHurtok(zvyazkovyiToken, 'Орлики');
  const suddiaEmail = `suddia-${Date.now()}@example.com`;
  const suddia = await createUserAs(zvyazkovyiToken, {
    firstName: 'Суд',
    lastName: 'Дя',
    email: suddiaEmail,
    role: 'JUNAK',
    hurtokId: hurtok.id,
    password: 'password123',
  });
  await request.post('http://localhost:3001/kurin-positions', {
    headers: { Authorization: `Bearer ${zvyazkovyiToken}`, 'Content-Type': 'application/json' },
    data: { userId: suddia.id, scope: 'KURIN', positionType: 'SUDDIA' },
  });

  await loginAs(page, suddiaEmail, 'password123');
  await page.goto('/kurin');
  await page.getByText('Гуртки').click();
  await page.getByText('Орлики').click();
  await page.getByRole('button', { name: 'Налаштування' }).click();
  await page.getByLabel('Дата заснування').fill('2020-05-01');
  await page.getByRole('button', { name: 'Зберегти дату' }).click();
  await expect(page.getByText('Засновано')).toBeVisible();
});

test('a plain member sees hurtok info read-only, with no settings button', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);

  const hurtok = await createHurtok(zvyazkovyiToken, 'Соколи');
  const plainJunakEmail = `plain-${Date.now()}@example.com`;
  await createUserAs(zvyazkovyiToken, {
    firstName: 'Прост',
    lastName: 'Юнак',
    email: plainJunakEmail,
    role: 'JUNAK',
    hurtokId: hurtok.id,
    password: 'password123',
  });

  await loginAs(page, plainJunakEmail, 'password123');
  await page.goto('/kurin');
  await page.getByText('Гуртки').click();
  await page.getByText('Соколи').click();
  await expect(page.getByRole('button', { name: 'Налаштування' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Додати юнака/чку' })).toHaveCount(0);
});

test('a HURTOK-scope (not KURIN-scope) suddia sees hurtok info read-only, with no settings button', async ({
  page,
  request,
}) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);

  const hurtok = await createHurtok(zvyazkovyiToken, 'Ведмеді');
  const suddiaEmail = `hurtok-suddia-${Date.now()}@example.com`;
  const suddia = await createUserAs(zvyazkovyiToken, {
    firstName: 'Гурток',
    lastName: 'Суддя',
    email: suddiaEmail,
    role: 'JUNAK',
    hurtokId: hurtok.id,
    password: 'password123',
  });
  await request.post('http://localhost:3001/kurin-positions', {
    headers: { Authorization: `Bearer ${zvyazkovyiToken}`, 'Content-Type': 'application/json' },
    data: { userId: suddia.id, scope: 'HURTOK', hurtokId: hurtok.id, positionType: 'SUDDIA' },
  });

  await loginAs(page, suddiaEmail, 'password123');
  await page.goto('/kurin');
  await page.getByText('Гуртки').click();
  await page.getByText('Ведмеді').click();
  await expect(page.getByRole('button', { name: 'Налаштування' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Додати юнака/чку' })).toHaveCount(0);
});
