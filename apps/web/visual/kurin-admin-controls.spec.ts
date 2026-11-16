import path from 'node:path';
import { test, expect, type Browser, type Page } from '@playwright/test';
import { loginAs } from '../e2e/helpers/auth';
import { acceptInviteFor } from '../e2e/helpers/invite';
import { ADMIN_API_KEY, ADMIN_PASSWORD, ADMIN_USERNAME, seedKurinWithZvyazkovyi, seedProbyProgram } from '../e2e/helpers/seed';
import { createHurtok, createUserAs, loginForToken } from '../e2e/helpers/proby-seed';

// Screens for the kurin-admin-controls feature (deactivation, force delete, judge-book disconnect).
const API_URL = 'http://localhost:3001';
const OUT = path.resolve(__dirname, '../visual-shots/kurin-admin-controls');
const VIEWPORTS = { desktop: { width: 1280, height: 800 }, phone: { width: 390, height: 844 } } as const;

async function newPage(browser: Browser, viewport: keyof typeof VIEWPORTS, theme: 'light' | 'dark') {
  const ctx = await browser.newContext({ viewport: VIEWPORTS[viewport], baseURL: 'http://localhost:3000', colorScheme: theme });
  await ctx.addCookies([{ name: 'theme', value: theme, domain: 'localhost', path: '/' }]);
  return { ctx, page: await ctx.newPage() };
}

async function settle(page: Page) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: 'nextjs-portal, [data-nextjs-toast] { display: none !important; }' });
}

async function logIntoAdmin(page: Page) {
  await page.goto('/admin');
  await page.getByPlaceholder('Адмін-ключ').fill(ADMIN_API_KEY);
  await page.getByPlaceholder('Логін').fill(ADMIN_USERNAME);
  await page.getByPlaceholder('Пароль').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Увійти' }).click();
}

for (const viewport of ['desktop', 'phone'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    const tag = `${viewport}-${theme}`;

    test(`login ${tag}`, async ({ browser }) => {
      const { ctx, page } = await newPage(browser, viewport, theme);
      await page.goto('/login');
      await settle(page);
      await page.screenshot({ path: path.join(OUT, `login-${tag}.png`), fullPage: true });
      await page.goto('/login?reason=kurin-deactivated');
      await settle(page);
      await page.screenshot({ path: path.join(OUT, `login-deactivated-${tag}.png`), fullPage: true });
      await ctx.close();
    });

    test(`admin, banner, suddivstvo ${tag}`, async ({ browser }) => {
      const { program } = await seedProbyProgram();
      const active = await seedKurinWithZvyazkovyi(program.id);
      const gone = await seedKurinWithZvyazkovyi(program.id);
      const { ctx, page } = await newPage(browser, viewport, theme);

      // Admin page: one active and one deactivated kurin (admin session needs any logged-in user).
      await loginAs(page, gone.zvyazkovyiEmail, gone.zvyazkovyiPassword);
      await logIntoAdmin(page);
      const goneRow = page.getByTestId(`kurin-row-${gone.kurin.id}`);
      await goneRow.getByRole('button', { name: 'Деактивувати', exact: true }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Деактивувати', exact: true }).click();
      await expect(goneRow.getByText(/Деактивовано з/)).toBeVisible();
      await settle(page);
      await goneRow.scrollIntoViewIfNeeded();
      await goneRow.screenshot({ path: path.join(OUT, `admin-row-deactivated-${tag}.png`) });
      const activeRow = page.getByTestId(`kurin-row-${active.kurin.id}`);
      await activeRow.screenshot({ path: path.join(OUT, `admin-row-active-${tag}.png`) });
      await page.screenshot({ path: path.join(OUT, `admin-viewport-${tag}.png`) });
      await goneRow.getByRole('button', { name: 'Видалити назавжди' }).click();
      await expect(page.getByRole('dialog').getByTestId('delete-preview')).toBeVisible();
      await page.getByRole('dialog').getByLabel('Введіть назву куреня, щоб підтвердити').fill(gone.kurin.name);
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(OUT, `admin-force-delete-dialog-${tag}.png`) });
      await page.keyboard.press('Escape');

      // Banner for the zvyazkovyi of the deactivated kurin.
      await page.goto('/');
      await expect(page.getByRole('status').filter({ hasText: 'Курінь деактивовано' })).toBeVisible();
      await settle(page);
      await page.screenshot({ path: path.join(OUT, `zvyazkovyi-banner-${tag}.png`), fullPage: true });
      await ctx.close();

      // Suddya with the connected Книга судді (active kurin).
      const token = await loginForToken(active.zvyazkovyiEmail, active.zvyazkovyiPassword);
      const hurtok = await createHurtok(token, 'Орлики');
      const email = `suddia-${Date.now()}@example.com`;
      const user = await createUserAs(token, { firstName: 'Тест', lastName: 'Суддя', email, role: 'JUNAK', hurtokId: hurtok.id, password: 'password123' });
      const pos = await fetch(`${API_URL}/kurin-positions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, scope: 'KURIN', positionType: 'SUDDIA' }),
      });
      expect(pos.ok).toBeTruthy();
      await acceptInviteFor(email);
      const conn = await fetch(`${API_URL}/kurins/${active.kurin.id}/junak-import/spreadsheet`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ spreadsheetId: 'fake-sheet-id', spreadsheetName: 'Книга судді 2026' }),
      });
      expect(conn.ok).toBeTruthy();
      const s = await newPage(browser, viewport, theme);
      await loginAs(s.page, email, 'password123');
      await s.page.goto('/suddivstvo');
      await expect(s.page.getByRole('button', { name: 'Відʼєднати таблицю' })).toBeVisible();
      await settle(s.page);
      await s.page.screenshot({ path: path.join(OUT, `suddivstvo-connected-${tag}.png`), fullPage: true });
      await s.page.getByRole('button', { name: 'Відʼєднати таблицю' }).click();
      await expect(s.page.getByRole('dialog')).toBeVisible();
      await s.page.waitForTimeout(400);
      await s.page.screenshot({ path: path.join(OUT, `suddivstvo-disconnect-dialog-${tag}.png`) });
      await s.ctx.close();

      // Suddya, nothing connected: status + hint (connecting is zvyazkovyi-only).
      const plainKurin = await seedKurinWithZvyazkovyi(program.id);
      const t2 = await loginForToken(plainKurin.zvyazkovyiEmail, plainKurin.zvyazkovyiPassword);
      const h2 = await createHurtok(t2, 'Орлики');
      const email2 = `suddia2-${Date.now()}@example.com`;
      const u2 = await createUserAs(t2, { firstName: 'Тест', lastName: 'Суддя', email: email2, role: 'JUNAK', hurtokId: h2.id, password: 'password123' });
      await fetch(`${API_URL}/kurin-positions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${t2}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: u2.id, scope: 'KURIN', positionType: 'SUDDIA' }),
      });
      await acceptInviteFor(email2);
      const s2 = await newPage(browser, viewport, theme);
      await loginAs(s2.page, email2, 'password123');
      await s2.page.goto('/suddivstvo');
      await expect(s2.page.getByText('Підключити Книгу судді може звʼязковий куреня.')).toBeVisible();
      await settle(s2.page);
      await s2.page.screenshot({ path: path.join(OUT, `suddivstvo-not-connected-hint-${tag}.png`), fullPage: true });
      await s2.ctx.close();
    });
  }
}
