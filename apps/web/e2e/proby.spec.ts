import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { createHurtok, createUserAs, loginForToken, confirmPointAs } from './helpers/proby-seed';
import { acceptInviteFor } from './helpers/invite';

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
  await acceptInviteFor(vykhovnyk.email);
  // vykhovnyk needs an assignment to confirm; assign directly via API for setup speed
  await fetch('http://localhost:3001/vykhovnyk-assignments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${zvyazkovyiToken}` },
    body: JSON.stringify({ vykhovnykId: vykhovnyk.id, hurtokId: hurtok.id }),
  });
  const freshVykhovnykToken = await loginForToken(vykhovnyk.email, 'password123');
  await confirmPointAs(freshVykhovnykToken, junak.id, points[0].id);

  await acceptInviteFor(junak.email);

  await loginAs(page, junak.email, 'password123');
  await page.goto('/proby');

  // Stages start collapsed — expand the only stage to see its points.
  await page.getByText('Ступінь 1').click();

  await expect(page.getByText('Точка А')).toBeVisible();
  await expect(page.getByText('Точка Б')).toBeVisible();
  const doneRow = page.locator('li', { hasText: 'Точка А' });
  await expect(doneRow).toContainText('Зараховано');
  const notDoneRow = page.locator('li', { hasText: 'Точка Б' });
  await expect(notDoneRow).not.toContainText('Зараховано');
});

test('marks a closed stage with a checkmark on its accordion header, not an open one', async ({ page }) => {
  const { program, stage, points } = await seedProbyProgram(['Точка А']);
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);

  const hurtok = await createHurtok(zvyazkovyiToken, 'Орлики');
  const junak = await createUserAs(zvyazkovyiToken, {
    firstName: 'Юн',
    lastName: 'Ак',
    email: `junak-stage-closed-${Date.now()}@example.com`,
    role: 'JUNAK',
    hurtokId: hurtok.id,
    password: 'password123',
  });

  await acceptInviteFor(junak.email);

  await loginAs(page, junak.email, 'password123');
  await page.goto('/proby');

  const stageHeader = page.getByRole('button', { name: 'Ступінь 1' });
  await expect(stageHeader).not.toContainText('Закрито');

  // A stage only reports as CLOSED once every point in it is confirmed AND
  // it's been closed — closing with a point still unconfirmed just tracks
  // "debt" and leaves the status at OPEN. Confirm first, then close.
  await confirmPointAs(zvyazkovyiToken, junak.id, points[0].id);
  await fetch(`http://localhost:3001/junaky/${junak.id}/progress/stages/${stage.id}/close`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${zvyazkovyiToken}` },
  });

  await page.reload();
  await expect(page.getByRole('button', { name: 'Ступінь 1' })).toContainText('Закрито');
});
