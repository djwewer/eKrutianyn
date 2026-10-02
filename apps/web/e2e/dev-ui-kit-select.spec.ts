import { test, expect } from '@playwright/test';

test('opens the select, shows options, and selecting one updates the trigger', async ({ page }) => {
  await page.goto('/dev-ui-kit');

  const trigger = page.getByRole('combobox', { name: 'Гурток' });
  await expect(trigger).toContainText('Орлики');

  await trigger.click();
  const sokolyOption = page.getByRole('option', { name: 'Соколи' });
  await expect(sokolyOption).toBeVisible();

  await sokolyOption.click();
  await expect(trigger).toContainText('Соколи');
});
