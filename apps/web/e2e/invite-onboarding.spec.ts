import { test, expect } from '@playwright/test';
import { seedProbyProgram, ADMIN_API_KEY, ADMIN_USERNAME, ADMIN_PASSWORD } from './helpers/seed';

const API_URL = 'http://localhost:3001';
const ADMIN_HEADERS = {
  'Content-Type': 'application/json',
  'x-admin-key': ADMIN_API_KEY,
  'x-admin-username': ADMIN_USERNAME,
  'x-admin-password': ADMIN_PASSWORD,
};

async function inviteLinkPath(email: string): Promise<string> {
  const res = await fetch(`${API_URL}/admin/test-mail?to=${encodeURIComponent(email)}`, { headers: ADMIN_HEADERS });
  const mail = (await res.json()) as { type?: string; link?: string } | null;
  if (!mail || mail.type !== 'welcome-invite' || !mail.link) throw new Error(`no welcome-invite mail for ${email}`);
  const url = new URL(mail.link);
  return `${url.pathname}${url.search}`;
}

test('invite link onboards a zvyazkovyi, who invites a user; resend replaces the link', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const zvEmail = `invite-zv-${suffix}@example.com`;
  const kurinName = `Курінь Запрошень ${suffix}`;
  const kurinRes = await fetch(`${API_URL}/admin/kurins`, {
    method: 'POST',
    headers: ADMIN_HEADERS,
    body: JSON.stringify({
      name: kurinName,
      kurinNumber: suffix,
      gender: 'MALE',
      stanytsia: 'Тестова станиця',
      probyProgramId: program.id,
      zvyazkovyi: { firstName: "Зв'язковий", lastName: 'Запрошений', email: zvEmail },
    }),
  });
  expect(kurinRes.ok).toBe(true);

  const zvLink = await inviteLinkPath(zvEmail);
  await page.goto(zvLink);
  await expect(page.getByRole('heading', { name: "Вітаємо, Зв'язковий!" })).toBeVisible();
  await expect(page.getByText(kurinName)).toBeVisible();

  await page.getByLabel('Новий пароль').fill('password123');
  await page.getByLabel('Повторіть пароль').fill('password123');
  await page.getByRole('button', { name: 'Встановити пароль і увійти' }).click();
  await page.waitForURL((url) => url.pathname !== '/welcome');
  await expect(page.getByRole('navigation', { name: 'Основна навігація' })).toBeVisible();

  // The link is one-time.
  await page.goto(zvLink);
  await expect(page.getByText('Посилання недійсне або вже використане')).toBeVisible();

  // The zvyazkovyi adds a user: no password field, an invite goes out.
  const userEmail = `invite-user-${suffix}@example.com`;
  await page.goto('/users/new');
  await page.locator('#role').selectOption('VYKHOVNYK');
  await expect(page.getByLabel(/Пароль/)).toHaveCount(0);
  await page.getByLabel("Ім'я").fill('Новий');
  await page.getByLabel('Прізвище').fill('Запрошений');
  await page.getByLabel('Email').fill(userEmail);
  const [createRes] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/api/backend/users') && r.request().method() === 'POST'),
    page.getByRole('button', { name: 'Створити' }).click(),
  ]);
  const created = (await createRes.json()) as { id: string };
  await expect(page.getByText(`Запрошення надіслано на ${userEmail}`)).toBeVisible();

  const oldLink = await inviteLinkPath(userEmail);
  await page.goto(`/users/${created.id}`);
  await expect(page.getByText('Ще не активовано')).toBeVisible();
  await page.getByRole('button', { name: 'Надіслати запрошення ще раз' }).click();
  await expect(page.getByText(`Запрошення надіслано на ${userEmail}`)).toBeVisible();

  const newLink = await inviteLinkPath(userEmail);
  expect(newLink).not.toBe(oldLink);

  await page.goto(oldLink);
  await expect(page.getByText('Посилання недійсне або вже використане')).toBeVisible();
  await page.goto(newLink);
  await expect(page.getByRole('heading', { name: 'Вітаємо, Новий!' })).toBeVisible();
});
