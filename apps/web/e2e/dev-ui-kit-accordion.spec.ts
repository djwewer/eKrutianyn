import { test, expect } from '@playwright/test';

test('expands and collapses a top-level accordion item', async ({ page }) => {
  await page.goto('/dev-ui-kit');

  const trigger = page.getByRole('button', { name: 'Інформація по куреню' });
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByText('Назва, номер, пробна програма.')).not.toBeVisible();

  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByText('Назва, номер, пробна програма.')).toBeVisible();

  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
});

test('a nested accordion inside an item expands independently of its parent', async ({ page }) => {
  await page.goto('/dev-ui-kit');

  await page.getByRole('button', { name: 'Гуртки' }).click();
  const nestedTrigger = page.getByRole('button', { name: 'Орлики' });
  await expect(nestedTrigger).toBeVisible();
  await expect(nestedTrigger).toHaveAttribute('aria-expanded', 'false');

  await nestedTrigger.click();
  await expect(nestedTrigger).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByText('Тарас Шевчук — Гуртковий')).toBeVisible();

  // The parent item ("Гуртки") must still be open — opening the nested
  // item must not collapse or otherwise affect its ancestor.
  await expect(page.getByRole('button', { name: 'Гуртки' })).toHaveAttribute('aria-expanded', 'true');
});

test('opening a second top-level item closes the first (single-open accordion)', async ({ page }) => {
  await page.goto('/dev-ui-kit');

  await page.getByRole('button', { name: 'Інформація по куреню' }).click();
  await page.getByRole('button', { name: 'Гуртки' }).click();

  await expect(page.getByRole('button', { name: 'Інформація по куреню' })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('button', { name: 'Гуртки' })).toHaveAttribute('aria-expanded', 'true');
});
