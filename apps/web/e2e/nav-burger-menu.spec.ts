import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';

test('below sm: the inline nav links are hidden behind a hamburger that reveals role-gated links and closes on navigation', async ({
  page,
}) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);

  await page.setViewportSize({ width: 375, height: 812 });
  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);

  // The inline pills row is not visible at phone width.
  await expect(page.getByRole('link', { name: 'Курінь' })).toBeHidden();
  await expect(page.getByRole('link', { name: 'Запити' })).toBeHidden();

  const burger = page.getByRole('button', { name: 'Меню' });
  await expect(burger).toBeVisible();
  await expect(burger).toHaveAttribute('aria-expanded', 'false');

  await burger.click();
  await expect(burger).toHaveAttribute('aria-expanded', 'true');

  // The full link list is now visible, including a role-gated link: "Облік
  // реманенту" only ever appears for ZVYAZKOVYI via the flattened
  // Діловодство entries.
  await expect(page.getByRole('link', { name: 'Курінь' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Запити' })).toBeVisible();
  const inventoryLink = page.getByRole('link', { name: 'Облік реманенту' });
  await expect(inventoryLink).toBeVisible();

  await inventoryLink.click();

  await expect(page).toHaveURL(/\/inventory$/);
  await expect(page.getByRole('link', { name: 'Облік реманенту' })).toBeHidden();
  await expect(burger).toHaveAttribute('aria-expanded', 'false');
});
