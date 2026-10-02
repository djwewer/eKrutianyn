import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';

test('lets zvyazkovyi change their kurin number from the settings page', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto('/kurin');
  await page.getByText('Інформація по куреню').click();

  // Get the current kurin number from the page. The label/value are now
  // separate sibling spans (<span>Номер</span><span>{value}</span>), not
  // one "Номер: {value}" text node.
  const currentNumber = await page
    .getByText('Номер', { exact: true })
    .locator('..')
    .locator('span')
    .nth(1)
    .textContent();

  // Use a unique number based on timestamp to avoid collisions
  const newNumber = `${Date.now()}-test`;

  // Fill and submit
  await page.getByPlaceholder(currentNumber || '').fill(newNumber);
  await page.getByRole('button', { name: 'Змінити номер' }).click();

  // Wait for the kurin number to update
  await expect(
    page.getByText('Номер', { exact: true }).locator('..').getByText(newNumber, { exact: true }),
  ).toBeVisible({ timeout: 10000 });
});
