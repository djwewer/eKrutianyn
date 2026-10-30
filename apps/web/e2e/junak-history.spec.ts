import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { assignVykhovnyk, createHurtok, createOnboardedUserAs, loginForToken } from './helpers/proby-seed';
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

test('zvyazkovyi records a warning (both fields required), an award, an archive position and dates; the junak sees all of it', async ({ page }) => {
  const s = await seedJunak();
  await postAs(s.token, '/kurin-positions', {
    userId: s.junak.user.id,
    scope: 'HURTOK',
    positionType: 'HURTKOVYI',
    hurtokId: s.hurtok.id,
  });
  await loginAs(page, s.zvyazkovyiEmail, s.zvyazkovyiPassword);
  await page.goto(`/users/${s.junak.user.id}`);
  const dialog = page.getByRole('dialog');

  const remarks = page.getByTestId('history-remarks');
  await remarks.getByRole('button', { name: 'Додати запис' }).click();
  await dialog.getByLabel('Тип').selectOption('WARNING');
  await expect(dialog.getByLabel('Дата')).toHaveAttribute('min', '1990-01-01');
  await dialog.getByLabel('Дата').fill('1985-01-01');
  await dialog.getByLabel('За що').fill('Запізнився на три сходини поспіль');
  await dialog.getByLabel('Як виправити').fill('Відвідати наступні чотири сходини вчасно');
  await expect(dialog.getByRole('button', { name: 'Зберегти' })).toBeDisabled();
  await dialog.getByLabel('Як виправити').fill('');
  await dialog.getByLabel('Дата').fill('2025-03-10');
  await expect(dialog.getByRole('button', { name: 'Зберегти' })).toBeDisabled();
  await dialog.getByLabel('Як виправити').fill('   ');
  await expect(dialog.getByRole('button', { name: 'Зберегти' })).toBeDisabled();
  await dialog.getByLabel('Як виправити').fill('Відвідати наступні чотири сходини вчасно');
  await dialog.getByRole('button', { name: 'Зберегти' }).click();
  await expect(dialog).toHaveCount(0);

  await remarks.getByRole('button', { name: 'Додати запис' }).click();
  await dialog.getByLabel('Тип').selectOption('AWARD');
  await expect(dialog.getByLabel('Як виправити')).toHaveCount(0);
  await dialog.getByLabel('Дата').fill('2024-08-01');
  await dialog.getByLabel('За що').fill('Найкращий табірник');
  await dialog.getByRole('button', { name: 'Зберегти' }).click();
  await expect(remarks.getByTestId('history-remark')).toHaveCount(2);
  await expect(remarks.getByTestId('history-remark').first()).toContainText('Пересторога');

  const dilovodstvo = page.getByTestId('history-dilovodstvo');
  await dilovodstvo.getByRole('button', { name: 'Додати посаду' }).click();
  await dialog.getByLabel('Посада').fill('Скарбник гуртка');
  await dialog.getByLabel('Де').selectOption('HURTOK');
  await dialog.getByLabel('Рік початку').fill('2019');
  await dialog.getByLabel('Рік завершення (необовʼязково)').fill('2021');
  await dialog.getByRole('button', { name: 'Зберегти' }).click();
  await expect(dilovodstvo).toContainText('Скарбник гуртка');
  await expect(dilovodstvo).toContainText('до застосунку');
  await expect(dilovodstvo).toContainText('Гуртковий');
  await expect(dilovodstvo).toContainText('зараз');

  const dates = page.getByTestId('history-dates');
  await dates.getByRole('button', { name: 'Змінити дати' }).click();
  await dialog.getByLabel('Дата вступу до УПЮ').fill('2018-09-01');
  await dialog.getByLabel('Дата пластової присяги').fill('2019-02-22');
  await dialog.getByRole('button', { name: 'Зберегти' }).click();
  await expect(dates).toContainText('01.09.2018');
  await expect(dates).toContainText('22.02.2019');

  // edit + delete flows
  await remarks.getByRole('button', { name: /Змінити: Відзначення від 01.08.2024/ }).click();
  await dialog.getByLabel('За що').fill('Найкращий табірник року');
  await dialog.getByRole('button', { name: 'Зберегти' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(remarks).toContainText('Найкращий табірник року');
  page.once('dialog', (d) => d.accept());
  await remarks.getByRole('button', { name: /Видалити: Відзначення від 01.08.2024/ }).click();
  await expect(remarks.getByTestId('history-remark')).toHaveCount(1);

  await dilovodstvo.getByRole('button', { name: 'Змінити: Скарбник гуртка' }).click();
  await dialog.getByLabel('Посада').fill('Скарбник гуртка (архів)');
  await dialog.getByRole('button', { name: 'Зберегти' }).click();
  await expect(dilovodstvo).toContainText('Скарбник гуртка (архів)');
  page.once('dialog', (d) => d.accept());
  await dilovodstvo.getByRole('button', { name: 'Видалити: Скарбник гуртка (архів)' }).click();
  await expect(dilovodstvo).not.toContainText('Скарбник гуртка');
  await dilovodstvo.getByRole('button', { name: 'Додати посаду' }).click();
  await dialog.getByLabel('Посада').fill('Скарбник гуртка');
  await dialog.getByLabel('Рік початку').fill('2019');
  await dialog.getByLabel('Рік завершення (необовʼязково)').fill('2021');
  await dialog.getByRole('button', { name: 'Зберегти' }).click();
  await expect(dilovodstvo).toContainText('Скарбник гуртка');

  await page.goto('/audit-log');
  await expect(page.getByText(/Додав пересторогу для .* \(від 2025-03-10\)/)).toBeVisible();
  await expect(page.getByText(/Змінив відзначення для .* \(від 2024-08-01\)/)).toBeVisible();
  await expect(page.getByText(/Видалив відзначення для .* \(від 2024-08-01\)/)).toBeVisible();
  await expect(page.getByText('Запізнився на три сходини поспіль')).toHaveCount(0);
  await expect(page.getByText('Відвідати наступні чотири сходини вчасно')).toHaveCount(0);
  await expect(page.getByText(/Додав до архіву діловодства посаду «Скарбник гуртка»/).first()).toBeVisible();
  await expect(page.getByText(/Змінив запис архіву діловодства «Скарбник гуртка \(архів\)»/)).toBeVisible();
  await expect(page.getByText(/Видалив з архіву діловодства посаду «Скарбник гуртка \(архів\)»/)).toBeVisible();
  await expect(page.getByText(/Змінив дати вступу до УПЮ та пластової присяги/)).toBeVisible();

  await page.context().clearCookies();
  await loginAs(page, s.junak.email, s.junak.password);
  await page.goto('/me');
  const ownRemarks = page.getByTestId('history-remarks');
  await expect(ownRemarks).toContainText('Запізнився на три сходини поспіль');
  await expect(ownRemarks).toContainText('Відвідати наступні чотири сходини вчасно');
  await expect(page.getByTestId('history-dilovodstvo')).toContainText('Скарбник гуртка');
  await expect(page.getByTestId('history-dates')).toContainText('22.02.2019');
  await expect(page.getByRole('main').getByRole('button', { name: /^Додати|^Змінити/ })).toHaveCount(0);
  // the old «Діловодство» card is hidden for a junak: only the history section shows it
  await expect(page.getByRole('main').getByText('Діловодство', { exact: true })).toHaveCount(1);
  await page.screenshot({ path: 'test-results/junak-history-me.png', fullPage: true });
});

test('vykhovnyk sees history edit buttons only for junaks of own hurtok', async ({ page }) => {
  const s = await seedJunak();
  const vykhovnyk = await createOnboardedUserAs(s.token, {
    firstName: 'Марія',
    lastName: `Мельник${Date.now()}`,
    email: `vykhovnyk-full-history-${Date.now()}@example.com`,
    role: 'VYKHOVNYK',
  });
  await assignVykhovnyk(s.token, vykhovnyk.user.id, s.hurtok.id);
  const loner = await createOnboardedUserAs(s.token, {
    firstName: 'Петро',
    lastName: `Безгуртковий${Date.now()}`,
    email: `junak-loner-full-${Date.now()}@example.com`,
    role: 'JUNAK',
    hurtokId: s.hurtok.id,
  });
  // a JUNAK can't be created without a hurtok: detach him afterwards
  const detach = await fetch(`http://localhost:3001/users/${loner.user.id}/hurtok`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.token}` },
    body: JSON.stringify({ hurtokId: null }),
  });
  expect(detach.ok).toBe(true);
  const editButtons = ['Додати вмілість', 'Додати ВФВ', 'Додати табір', 'Додати запис', 'Додати посаду', 'Змінити дати'];

  await loginAs(page, vykhovnyk.email, vykhovnyk.password);
  await page.goto(`/users/${s.junak.user.id}`);
  for (const name of editButtons) {
    await expect(page.getByRole('button', { name })).toBeVisible();
  }

  await page.goto(`/users/${loner.user.id}`);
  await expect(page.getByTestId('history-remarks')).toBeVisible();
  for (const name of editButtons) {
    await expect(page.getByRole('button', { name })).toHaveCount(0);
  }
});
