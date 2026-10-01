import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { createHurtok, createUserAs, loginForToken } from './helpers/proby-seed';

test('lets kurinniy view vykhovnyk contacts read-only', async ({ page, request }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);

  const hurtok = await createHurtok(zvyazkovyiToken, 'Орлики');
  const vykhovnyk = await createUserAs(zvyazkovyiToken, {
    firstName: 'Вих',
    lastName: 'Овник',
    email: `vykhovnyk-${Date.now()}@example.com`,
    role: 'VYKHOVNYK',
  });
  const kurinnyiEmail = `kurinnyi-${Date.now()}@example.com`;
  const junak = await createUserAs(zvyazkovyiToken, {
    firstName: 'Кур',
    lastName: 'Інний',
    email: kurinnyiEmail,
    role: 'JUNAK',
    hurtokId: hurtok.id,
    password: 'password123',
  });

  await request.post('http://localhost:3001/kurin-positions', {
    headers: { Authorization: `Bearer ${zvyazkovyiToken}`, 'Content-Type': 'application/json' },
    data: { userId: junak.id, scope: 'KURIN', positionType: 'KURINNYI' },
  });

  await loginAs(page, kurinnyiEmail, 'password123');
  await page.goto('/kurin');
  await page.getByText('Кадра виховників').click();

  await expect(page.getByText(`${vykhovnyk.lastName} ${vykhovnyk.firstName}`)).toBeVisible();

  await page.getByText(`${vykhovnyk.lastName} ${vykhovnyk.firstName}`).click();
  await expect(page.getByLabel('Телефон')).toBeDisabled();
});

test('a plain member does not see Кадра виховників or Список юнацтва at all', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);

  const hurtok = await createHurtok(zvyazkovyiToken, 'Соколи');
  const plainJunakEmail = `plain-${Date.now()}@example.com`;
  await createUserAs(zvyazkovyiToken, {
    firstName: 'Прост',
    lastName: 'Юнак',
    email: plainJunakEmail,
    role: 'JUNAK',
    hurtokId: hurtok.id,
    password: 'password123',
  });

  await loginAs(page, plainJunakEmail, 'password123');
  await page.goto('/kurin');
  for (const title of ['Інформація по куреню', 'Провід куреня', 'Гуртки']) {
    await expect(page.getByText(title)).toBeVisible();
  }
  await expect(page.getByText('Кадра виховників')).toHaveCount(0);
  await expect(page.getByText('Список юнацтва')).toHaveCount(0);
});

test('a plain vykhovnyk sees exactly the three read-only sections', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);

  const plainVykhovnykEmail = `plain-vykhovnyk-${Date.now()}@example.com`;
  await createUserAs(zvyazkovyiToken, {
    firstName: 'Прост',
    lastName: 'Виховник',
    email: plainVykhovnykEmail,
    role: 'VYKHOVNYK',
    password: 'password123',
  });

  await loginAs(page, plainVykhovnykEmail, 'password123');
  await page.goto('/kurin');
  for (const title of ['Інформація по куреню', 'Провід куреня', 'Гуртки']) {
    await expect(page.getByText(title)).toBeVisible();
  }
  await expect(page.getByText('Кадра виховників')).toHaveCount(0);
  await expect(page.getByText('Список юнацтва')).toHaveCount(0);
});
