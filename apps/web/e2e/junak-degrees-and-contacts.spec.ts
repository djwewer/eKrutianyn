import { test, expect } from '@playwright/test';
import { seedDegreeProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { confirmPointAs, createHurtok, createUserAs, loginForToken } from './helpers/proby-seed';

const API_URL = 'http://localhost:3001';

async function seedJunak() {
  const { program, points } = await seedDegreeProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);
  const hurtok = await createHurtok(zvyazkovyiToken, 'Орлики');
  const junak = await createUserAs(zvyazkovyiToken, {
    firstName: 'Іван',
    lastName: 'Петренко',
    email: `junak-degrees-${Date.now()}@example.com`,
    role: 'JUNAK',
    hurtokId: hurtok.id,
    password: 'password123',
  });
  return { points, zvyazkovyiEmail, zvyazkovyiPassword, zvyazkovyiToken, hurtok, junak };
}

test('closing a proby with a chosen date makes it the junak\'s degree; dates are editable; Скоб is a plain date', async ({ page }) => {
  const { points, zvyazkovyiEmail, zvyazkovyiPassword, zvyazkovyiToken, junak } = await seedJunak();
  await confirmPointAs(zvyazkovyiToken, junak.id, points[0].id);

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto(`/users/${junak.id}`);

  await expect(page.getByTestId('current-degree')).toHaveText('ще не здобуто');

  // Close the first proby with the date it was really earned, not today.
  await page.getByLabel('Дата здобуття ступеня', { exact: true }).fill('2024-05-17');
  await page.getByRole('button', { name: 'Закрити пробу' }).click();

  await expect(page.getByTestId('current-degree')).toHaveText('Прихильник');
  await expect(page.getByTestId('degree-PRYHYLNYK')).toContainText('17.05.2024');
  await expect(page.getByTestId('degree-UCHASNYK')).toContainText('Дата зʼявиться, коли буде закрито відповідну пробу');

  // The date can be corrected afterwards.
  await page.getByTestId('degree-PRYHYLNYK').getByRole('button', { name: 'Змінити дату' }).click();
  await page.getByLabel('Дата здобуття ступеня «Прихильник»').fill('2024-05-20');
  await page.getByTestId('degree-PRYHYLNYK').getByRole('button', { name: 'Зберегти' }).click();
  await expect(page.getByTestId('degree-PRYHYLNYK')).toContainText('20.05.2024');

  // Скоб has no proby behind it: a hand-entered date that becomes the current degree.
  await page.getByTestId('degree-SKOB').getByRole('button', { name: 'Вказати дату' }).click();
  await page.getByLabel('Дата здобуття ступеня «Скоб»').fill('2026-01-15');
  await page.getByTestId('degree-SKOB').getByRole('button', { name: 'Зберегти' }).click();
  await expect(page.getByTestId('current-degree')).toHaveText('Скоб');
  await expect(page.getByTestId('degree-SKOB')).toContainText('15.01.2026');

  await page.getByTestId('degree-SKOB').getByRole('button', { name: 'Прибрати' }).click();
  await expect(page.getByTestId('current-degree')).toHaveText('Прихильник');

  await page.screenshot({ path: 'test-results/junak-degrees.png', fullPage: true });
});

test('adds mother, father and a guardian with a relation, without needing a phone, and saves residence and study place', async ({ page }) => {
  const { zvyazkovyiEmail, zvyazkovyiPassword, junak } = await seedJunak();

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto(`/users/${junak.id}`);

  const relation = page.getByLabel('Хто це');

  // Mother is suggested first; the phone is optional ("the judge often doesn't have it yet").
  await expect(relation).toHaveValue('MOTHER');
  await page.getByPlaceholder("Ім'я").fill('Марія Петренко');
  await page.getByRole('button', { name: 'Додати контакт' }).click();
  await expect(page.getByTestId('guardian-row').filter({ hasText: 'Мама: Марія Петренко' })).toContainText(
    'Телефон і email ще не вказані',
  );

  // Then father.
  await expect(relation).toHaveValue('FATHER');
  await page.getByPlaceholder("Ім'я").fill('Петро Петренко');
  await page.getByPlaceholder('Телефон (можна додати пізніше)').fill('+380501111111');
  await page.getByRole('button', { name: 'Додати контакт' }).click();
  await expect(page.getByTestId('guardian-row').filter({ hasText: 'Тато: Петро Петренко' })).toContainText('+380501111111');

  // Then anyone else is a guardian, clarified in words; mother/father can't be picked twice.
  await expect(relation).toHaveValue('GUARDIAN');
  await expect(relation.locator('option[value="MOTHER"]')).toBeDisabled();
  await expect(relation.locator('option[value="FATHER"]')).toBeDisabled();
  await page.getByPlaceholder('Хто саме (бабуся, тітка...)').fill('бабуся');
  await page.getByPlaceholder("Ім'я").fill('Ольга');
  await page.getByRole('button', { name: 'Додати контакт' }).click();
  await expect(page.getByTestId('guardian-row').filter({ hasText: 'Опікун (бабуся): Ольга' })).toBeVisible();

  // Residence and study place are saved with the contact info.
  await page.getByLabel('Місце проживання').fill('м. Львів, вул. Зелена 5');
  await page.getByLabel('Місце навчання').fill('Ліцей №3');
  await page.getByRole('button', { name: 'Зберегти', exact: true }).first().click();
  await page.reload();
  await expect(page.getByLabel('Місце проживання')).toHaveValue('м. Львів, вул. Зелена 5');
  await expect(page.getByLabel('Місце навчання')).toHaveValue('Ліцей №3');
  // The contacts persist across a reload, with their relation.
  await expect(page.getByTestId('guardian-row')).toHaveCount(3);
  await expect(page.getByTestId('guardian-row').filter({ hasText: 'Мама: Марія Петренко' })).toBeVisible();

  await page.screenshot({ path: 'test-results/junak-guardians.png', fullPage: true });
});

test('lets the kurin judge edit the book data on a junak profile', async ({ page }) => {
  const { zvyazkovyiToken, hurtok, junak } = await seedJunak();
  const judgeEmail = `judge-${Date.now()}@example.com`;
  const judge = await createUserAs(zvyazkovyiToken, {
    firstName: 'Суддя',
    lastName: 'Книги',
    email: judgeEmail,
    role: 'JUNAK',
    hurtokId: hurtok.id,
    password: 'password123',
  });
  const assigned = await fetch(`${API_URL}/kurin-positions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${zvyazkovyiToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: judge.id, scope: 'KURIN', positionType: 'SUDDIA' }),
  });
  expect(assigned.ok).toBeTruthy();
  // An account created with a password by someone else must change it on first login;
  // clear that the way a real first login would, so the page under test is reachable.
  const judgeToken = await loginForToken(judgeEmail, 'password123');
  await fetch(`${API_URL}/users/me/password`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${judgeToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentPassword: 'password123', newPassword: 'password123' }),
  });

  await loginAs(page, judgeEmail, 'password123');
  await page.goto(`/users/${junak.id}`);

  await expect(page.getByLabel('Місце проживання')).toBeEnabled();
  await page.getByTestId('degree-SKOB').getByRole('button', { name: 'Вказати дату' }).click();
  await page.getByLabel('Дата здобуття ступеня «Скоб»').fill('2026-02-02');
  await page.getByTestId('degree-SKOB').getByRole('button', { name: 'Зберегти' }).click();
  await expect(page.getByTestId('current-degree')).toHaveText('Скоб');
  await expect(page.getByRole('heading', { name: 'Батьки та опікуни' }).or(page.getByText('Батьки та опікуни'))).toBeVisible();
});
