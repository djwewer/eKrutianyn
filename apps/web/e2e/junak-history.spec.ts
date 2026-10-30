import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { createHurtok, createOnboardedUserAs, loginForToken } from './helpers/proby-seed';
import { postAs } from './helpers/history-seed';

async function seedJunak() {
  const { program } = await seedProbyProgram();
  const seeded = await seedKurinWithZvyazkovyi(program.id);
  const token = await loginForToken(seeded.zvyazkovyiEmail, seeded.zvyazkovyiPassword);
  const hurtok = await createHurtok(token, `Орлики${Date.now()}`);
  const junak = await createOnboardedUserAs(token, {
    firstName: 'Іван',
    lastName: `Петренко${Date.now()}`,
    email: `junak-full-history-${Date.now()}@example.com`,
    role: 'JUNAK',
    hurtokId: hurtok.id,
  });
  return { ...seeded, token, hurtok, junak };
}

test('junak sees VFV and camps read-only on /me', async ({ page }) => {
  const s = await seedJunak();
  await postAs(s.token, `/users/${s.junak.user.id}/camps`, { name: 'Вовча тропа', yearFrom: 2023, yearTo: 2024, role: 'PROVID' });
  await postAs(s.token, `/users/${s.junak.user.id}/vfv`, { achievedAt: '2024-06-01', note: 'Склав усі норми' });

  await loginAs(page, s.junak.email, s.junak.password);
  await page.goto('/me');
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'Історія' })).toBeVisible();
  await expect(main.getByTestId('history-camps')).toContainText('Вовча тропа, 2023–2024, провід');
  await expect(main.getByTestId('history-vfv')).toContainText('01.06.2024');
  await expect(main.getByTestId('history-vfv')).toContainText('Склав усі норми');
  await expect(main.getByRole('button', { name: /^Додати/ })).toHaveCount(0);
  await expect(main.getByRole('button', { name: /Змінити:|Видалити:/ })).toHaveCount(0);
});

test('zvyazkovyi adds, edits and deletes camp and VFV records; the journal describes it', async ({ page }) => {
  const s = await seedJunak();
  await loginAs(page, s.zvyazkovyiEmail, s.zvyazkovyiPassword);
  await page.goto(`/users/${s.junak.user.id}`);

  const camps = page.getByTestId('history-camps');
  await expect(camps).toContainText('Таборів ще немає.');
  await camps.getByRole('button', { name: 'Додати табір' }).click();
  const dialog = page.getByRole('dialog');

  // blank name is rejected: submit stays disabled
  await dialog.getByLabel('Назва табору').fill('   ');
  await expect(dialog.getByRole('button', { name: 'Зберегти' })).toBeDisabled();

  await dialog.getByLabel('Назва табору').fill('Говерла');
  await dialog.getByLabel('Рік початку').fill('2024');
  await dialog.getByLabel('Рік завершення (необовʼязково)').fill('2025');
  await dialog.getByLabel('Роль').selectOption('PROVID');
  await dialog.getByRole('button', { name: 'Зберегти' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(camps).toContainText('Говерла, 2024–2025, провід');

  await camps.getByRole('button', { name: 'Змінити: Говерла' }).click();
  await dialog.getByLabel('Роль').selectOption('PARTICIPANT');
  await dialog.getByRole('button', { name: 'Зберегти' }).click();
  await expect(camps).toContainText('Говерла, 2024–2025, учасник');

  const vfv = page.getByTestId('history-vfv');
  await expect(vfv).toContainText('Записів про ВФВ ще немає.');
  await vfv.getByRole('button', { name: 'Додати ВФВ' }).click();
  await dialog.getByLabel('Дата (необовʼязково)').fill('2025-06-14');
  await dialog.getByLabel('Примітка (необовʼязково)').fill('  Перша спроба  ');
  await dialog.getByRole('button', { name: 'Зберегти' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(vfv).toContainText('14.06.2025');
  await expect(vfv).toContainText('Перша спроба');

  await vfv.getByRole('button', { name: 'Змінити: ВФВ, 14.06.2025' }).click();
  await dialog.getByLabel('Примітка (необовʼязково)').fill('Друга спроба');
  await dialog.getByRole('button', { name: 'Зберегти' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(vfv).toContainText('Друга спроба');
  await expect(vfv).not.toContainText('Перша спроба');

  page.once('dialog', (confirmDialog) => confirmDialog.accept());
  await vfv.getByRole('button', { name: 'Видалити: ВФВ, 14.06.2025' }).click();
  await expect(vfv).toContainText('Записів про ВФВ ще немає.');

  page.once('dialog', (confirmDialog) => confirmDialog.accept());
  await camps.getByRole('button', { name: 'Видалити: Говерла' }).click();
  await expect(camps).toContainText('Таборів ще немає.');

  await page.goto('/audit-log');
  await expect(page.getByText(/Додав табір «Говерла» для/)).toBeVisible();
  await expect(page.getByText(/Змінив табір «Говерла» для/)).toBeVisible();
  await expect(page.getByText(/Видалив табір «Говерла» для/)).toBeVisible();
  await expect(page.getByText(/Додав запис ВФВ для/)).toBeVisible();
  await expect(page.getByText(/Змінив запис ВФВ для/)).toBeVisible();
  await expect(page.getByText(/Видалив запис ВФВ для/)).toBeVisible();
});
