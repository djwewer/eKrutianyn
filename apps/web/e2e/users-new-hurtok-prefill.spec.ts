import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { createHurtok, loginForToken } from './helpers/proby-seed';

test('pre-fills the hurtok select on /users/new when hurtokId is in the query string', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);
  const hurtok = await createHurtok(zvyazkovyiToken, 'Орлики');

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto(`/users/new?hurtokId=${hurtok.id}`);

  await expect(page.getByLabel('Гурток')).toHaveValue(hurtok.id);
});
