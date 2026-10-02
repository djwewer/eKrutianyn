import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';

test('lists the kurin\'s own zvyazkovyi in Кадра виховників with a Зв\'язковий badge', async ({ page }) => {
  const { program } = await seedProbyProgram();
  // seedKurinWithZvyazkovyi always creates the zvyazkovyi as
  // firstName: "Зв'язковий", lastName: "Тестовий" — asserted on literally
  // since the admin-seed response type doesn't carry these fields.
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto('/kurin');
  await page.getByText('Кадра виховників').click();

  const row = page.locator('a').filter({ hasText: 'Тестовий Зв\'язковий' });
  await expect(row).toBeVisible();
  await expect(row.getByText('Зв\'язковий', { exact: true })).toBeVisible();
});
