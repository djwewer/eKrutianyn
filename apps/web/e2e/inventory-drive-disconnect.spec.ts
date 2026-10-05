import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';

test('inventory page only offers to change the folder, not reconnect/disconnect', async ({ page }) => {
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
  // No driveFolderName is seeded, so the picker button reads "Обрати папку
  // для реманенту" rather than "Змінити папку" — either way it's the
  // folder-picker action, which is what should remain on this page.
  await expect(page.getByRole('button', { name: /папку для реманенту/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Перепідключити' })).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Відключити' })).not.toBeVisible();
});

test('lets zvyazkovyi reconnect/disconnect a connected Google Drive from the kurin settings page', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id, {
    driveFolderId: 'e2e-test-folder-id',
    driveRefreshToken: 'fake-refresh-token-e2e',
    driveConnectedEmail: 'kurin-drive@example.com',
  });

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto('/kurin');
  await page.getByText('Інформація про курінь').click();
  await page.getByRole('button', { name: 'Редагувати' }).click();

  await expect(page.getByText('Підключено як: kurin-drive@example.com')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Перепідключити' })).toBeVisible();

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Відключити' }).click();

  await expect(page.getByRole('button', { name: 'Підключити Google Drive' })).toBeVisible({ timeout: 10000 });
});
