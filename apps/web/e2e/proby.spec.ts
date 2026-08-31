import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { createHurtok, createUserAs, loginForToken, confirmPointAs } from './helpers/proby-seed';

test('shows a junak their own confirmed and unconfirmed points', async ({ page }) => {
  const { program, points } = await seedProbyProgram(['Точка А', 'Точка Б']);
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);

  const hurtok = await createHurtok(zvyazkovyiToken, 'Орлики');
  const vykhovnyk = await createUserAs(zvyazkovyiToken, {
    firstName: 'Вих',
    lastName: 'Овник',
    email: `vykhovnyk-${Date.now()}@example.com`,
    role: 'VYKHOVNYK',
    password: 'password123',
  });
  const junak = await createUserAs(zvyazkovyiToken, {
    firstName: 'Юн',
    lastName: 'Ак',
    email: `junak-${Date.now()}@example.com`,
    role: 'JUNAK',
    hurtokId: hurtok.id,
    password: 'password123',
  });
  const vykhovnykToken = await loginForToken(vykhovnyk.email, 'password123');
  // vykhovnyk needs an assignment to confirm; assign directly via API for setup speed
  await fetch('http://localhost:3001/vykhovnyk-assignments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${zvyazkovyiToken}` },
    body: JSON.stringify({ vykhovnykId: vykhovnyk.id, hurtokId: hurtok.id }),
  });
  const freshVykhovnykToken = await loginForToken(vykhovnyk.email, 'password123');
  await confirmPointAs(freshVykhovnykToken, junak.id, points[0].id);

  await loginAs(page, junak.email, 'password123');
  await page.goto('/proby');

  await expect(page.getByText('Точка А')).toBeVisible();
  await expect(page.getByText('Точка Б')).toBeVisible();
  const doneRow = page.locator('li', { hasText: 'Точка А' });
  await expect(doneRow).toContainText('✅');
  const notDoneRow = page.locator('li', { hasText: 'Точка Б' });
  await expect(notDoneRow).toContainText('⬜');
});
