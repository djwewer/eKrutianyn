import { test, expect, type Page } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi, ADMIN_API_KEY, ADMIN_USERNAME, ADMIN_PASSWORD } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { createHurtok, createOnboardedUserAs, loginForToken } from './helpers/proby-seed';

const DEACTIVATED_MESSAGE = 'Курінь тимчасово деактивовано. Зверніться до звʼязкового.';

async function logIntoAdmin(page: Page) {
  await page.goto('/admin');
  await page.getByPlaceholder('Адмін-ключ').fill(ADMIN_API_KEY);
  await page.getByPlaceholder('Логін').fill(ADMIN_USERNAME);
  await page.getByPlaceholder('Пароль').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Увійти' }).click();
}

test('deactivating a kurin blocks its users, keeps the zvyazkovyi in with a banner, and activation restores access', async ({
  browser,
}) => {
  const { program } = await seedProbyProgram();
  const { kurin, zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);
  const hurtok = await createHurtok(zvyazkovyiToken, 'Орлики');
  const junak = await createOnboardedUserAs(zvyazkovyiToken, {
    firstName: 'Юнак',
    lastName: `Блок${Date.now()}`,
    email: `junak-block-${Date.now()}@example.com`,
    role: 'JUNAK',
    hurtokId: hurtok.id,
  });

  // 1. The junak is logged in (context A).
  const junakContext = await browser.newContext();
  const junakPage = await junakContext.newPage();
  await loginAs(junakPage, junak.email, junak.password);

  // 2. The admin deactivates the kurin through the admin page (acting as the zvyazkovyi, who is never blocked).
  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await loginAs(adminPage, zvyazkovyiEmail, zvyazkovyiPassword);
  await logIntoAdmin(adminPage);
  const row = adminPage.getByTestId(`kurin-row-${kurin.id}`);
  await row.getByRole('button', { name: 'Деактивувати', exact: true }).click();
  await adminPage.getByRole('dialog').getByRole('button', { name: 'Деактивувати', exact: true }).click();
  await expect(row.getByText(/Деактивовано з \d{2}\.\d{2}\.\d{4}/)).toBeVisible();

  // 3. The junak's next API call bounces them to the login page with the notice.
  await junakPage.goto('/');
  await expect(junakPage).toHaveURL(/\/login\?reason=kurin-deactivated/);
  await expect(junakPage.getByText(DEACTIVATED_MESSAGE)).toBeVisible();

  // 4. A fresh login attempt shows the same message.
  const freshContext = await browser.newContext();
  const freshPage = await freshContext.newPage();
  await freshPage.goto('/login');
  await freshPage.getByLabel('Email').fill(junak.email);
  await freshPage.getByLabel('Пароль').fill(junak.password);
  await freshPage.getByRole('button', { name: 'Увійти' }).click();
  await expect(freshPage.getByText(DEACTIVATED_MESSAGE)).toBeVisible();
  await expect(freshPage).toHaveURL(/\/login/);

  // 5. The zvyazkovyi still gets in and sees the banner.
  await adminPage.goto('/');
  await expect(adminPage.getByRole('status').filter({ hasText: 'Курінь деактивовано. Зверніться до адміністратора' })).toBeVisible();

  // 6. Activation restores the junak's access.
  await adminPage.goto('/admin');
  await row.getByRole('button', { name: 'Активувати' }).click();
  await expect(row.getByText(/Деактивовано з/)).toHaveCount(0);
  await loginAs(freshPage, junak.email, junak.password);
  await expect(freshPage).not.toHaveURL(/\/login/);

  await junakContext.close();
  await adminContext.close();
  await freshContext.close();
});
