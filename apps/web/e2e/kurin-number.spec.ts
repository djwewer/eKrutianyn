import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';

test('lets zvyazkovyi change their kurin number from the settings page', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto('/kurin');

  // Get the current kurin number from the page
  const currentNumberText = await page.getByText(/Номер:/).textContent();
  const currentNumber = currentNumberText?.split(': ')[1]?.trim();

  // Fill and submit
  await page.getByPlaceholder(currentNumber || '').fill('75');
  await page.getByRole('button', { name: 'Змінити номер' }).click();

  // Wait for the kurin number to update
  await expect(page.getByText('Номер: 75')).toBeVisible({ timeout: 10000 });
});
