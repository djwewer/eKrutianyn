import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { createHurtok, createUserAs, loginForToken, assignVykhovnyk } from './helpers/proby-seed';

test('lets a vykhovnyk confirm a point on the hurtok board', async ({ page }) => {
  const { program, points } = await seedProbyProgram(['Точка А']);
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);

  const hurtok = await createHurtok(zvyazkovyiToken, 'Орлики');
  const vykhovnykEmail = `vykhovnyk-${Date.now()}@example.com`;
  const vykhovnyk = await createUserAs(zvyazkovyiToken, {
    firstName: 'Вих',
    lastName: 'Овник',
    email: vykhovnykEmail,
    role: 'VYKHOVNYK',
    password: 'password123',
  });
  await assignVykhovnyk(zvyazkovyiToken, vykhovnyk.id, hurtok.id);
  const junak = await createUserAs(zvyazkovyiToken, {
    firstName: 'Юн',
    lastName: 'Ак',
    email: `junak-${Date.now()}@example.com`,
    role: 'JUNAK',
    hurtokId: hurtok.id,
  });

  await loginAs(page, vykhovnykEmail, 'password123');
  await page.goto(`/hurtky/${hurtok.id}`);

  await expect(page.getByText(`${junak.lastName} ${junak.firstName}`)).toBeVisible();
  await page.getByRole('button', { name: 'Підтвердити' }).click();
  await expect(page.getByRole('button', { name: 'Зняти' })).toBeVisible();
});
