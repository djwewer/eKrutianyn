import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { createHurtok, loginForToken } from './helpers/proby-seed';

test('shows a link to add a junak directly into this hurtok', async ({ page }) => {
  const { kurin, zvyazkovyiEmail, zvyazkovyiPassword } = await (async () => {
    const { program } = await seedProbyProgram();
    const seeded = await seedKurinWithZvyazkovyi(program.id);
    return { kurin: seeded.kurin, zvyazkovyiEmail: seeded.zvyazkovyiEmail, zvyazkovyiPassword: seeded.zvyazkovyiPassword };
  })();
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);
  const hurtok = await createHurtok(zvyazkovyiToken, 'Орлики');

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto(`/${kurin.kurinNumber}/hurtky/${hurtok.slug}`);

  const link = page.getByRole('link', { name: 'Додати юнака/чку' });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', `/users/new?hurtokId=${hurtok.id}`);
});
