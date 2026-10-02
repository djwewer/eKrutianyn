import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';

test('lets zvyazkovyi disconnect a connected Google Drive from the inventory page', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id, {
    driveFolderId: 'e2e-test-folder-id',
    driveRefreshToken: 'fake-refresh-token-e2e',
    driveConnectedEmail: 'kurin-drive@example.com',
  });

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.getByText('Діловодство').click();
  await page.getByRole('link', { name: 'Облік реманенту' }).click();

  await expect(page.getByText('Підключено як: kurin-drive@example.com')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Перепідключити' })).toBeVisible();

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Відключити' }).click();

  await expect(page.getByText('Google Drive не підключено.')).toBeVisible({ timeout: 10000 });
});
