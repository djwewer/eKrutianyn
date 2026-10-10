import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { createHurtok, createUserAs, loginForToken } from './helpers/proby-seed';

const API_URL = 'http://localhost:3001';

test('shows a readable list of what a bulk import request will change instead of raw JSON', async ({ page, request }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);
  const hurtok = await createHurtok(zvyazkovyiToken, 'Орлики');

  const kurinniyEmail = `kurinniy-bulk-${Date.now()}@example.com`;
  const kurinniy = await createUserAs(zvyazkovyiToken, {
    firstName: 'Кур',
    lastName: 'Інний',
    email: kurinniyEmail,
    role: 'JUNAK',
    hurtokId: hurtok.id,
    password: 'password123',
  });
  await request.post(`${API_URL}/kurin-positions`, {
    headers: { Authorization: `Bearer ${zvyazkovyiToken}`, 'Content-Type': 'application/json' },
    data: { userId: kurinniy.id, scope: 'KURIN', positionType: 'KURINNYI' },
  });

  // An existing junak who already holds a kurin position: the importer refuses to
  // touch such a target through an approval request, and the page must say so.
  const intendant = await createUserAs(zvyazkovyiToken, {
    firstName: 'Інтендант',
    lastName: 'Існуючий',
    email: `intendant-bulk-${Date.now()}@example.com`,
    role: 'JUNAK',
    hurtokId: hurtok.id,
    password: 'password123',
  });
  await request.post(`${API_URL}/kurin-positions`, {
    headers: { Authorization: `Bearer ${zvyazkovyiToken}`, 'Content-Type': 'application/json' },
    data: { userId: intendant.id, scope: 'KURIN', positionType: 'INTENDANT' },
  });

  // An existing plain junak the import would update.
  const plain = await createUserAs(zvyazkovyiToken, {
    firstName: 'Звичайний',
    lastName: 'Юнак',
    email: `plain-bulk-${Date.now()}@example.com`,
    role: 'JUNAK',
    hurtokId: hurtok.id,
    password: 'password123',
  });

  const kurinniyToken = await loginForToken(kurinniyEmail, 'password123');
  const created = await request.post(`${API_URL}/approval-requests`, {
    headers: { Authorization: `Bearer ${kurinniyToken}`, 'Content-Type': 'application/json' },
    data: {
      actionType: 'BULK_IMPORT_JUNAKY',
      newData: {
        rows: [
          { rowIndex: 0, firstName: 'Свіжий', lastName: 'Новачок', email: 'fresh@example.com', hurtokName: 'Орлики' },
          {
            rowIndex: 1,
            matchedUserId: plain.id,
            firstName: 'Звичайний',
            lastName: 'Юнак',
            email: 'another@example.com',
            phone: '+380501112233',
            kurinPositionTypes: ['INTENDANT'],
            degreeDates: { PRYHYLNYK: '2024-05-17' },
          },
          { rowIndex: 2, matchedUserId: intendant.id, firstName: 'Інтендант', lastName: 'Існуючий', email: 'evil@attacker.com' },
        ],
      },
    },
  });
  expect(created.ok()).toBeTruthy();
  const { id } = await created.json();

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto(`/approval-requests/${id}`);

  const rows = page.getByTestId('bulk-import-row');
  await expect(rows).toHaveCount(3);
  // No raw JSON / opaque UUIDs anywhere on the page.
  await expect(page.locator('pre')).toHaveCount(0);
  await expect(page.getByText(plain.id)).toHaveCount(0);
  await expect(page.getByText('Рядків: 3 (нових — 1, оновлень — 2)')).toBeVisible();

  await expect(rows.nth(0)).toContainText('Новий юнак: Свіжий Новачок');
  await expect(rows.nth(0)).toContainText('fresh@example.com');

  // The update row shows the resolved NAME and what actually changes.
  await expect(rows.nth(1)).toContainText('Оновлення: Звичайний Юнак');
  await expect(rows.nth(1)).toContainText('+380501112233');
  await expect(rows.nth(1)).toContainText('його не буде застосовано');
  await expect(rows.nth(1)).toContainText('Призначити посаду в курені: Інтендант');
  await expect(rows.nth(1)).toContainText('Прихильник — 17.05.2024');
  await expect(rows.nth(1)).not.toContainText('буде відхилено');

  // The protected target is flagged as one the importer will reject.
  await expect(rows.nth(2)).toContainText('Оновлення: Інтендант Існуючий');
  await expect(rows.nth(2)).toContainText('Має посаду в курені');
  await expect(rows.nth(2)).toContainText('буде відхилено');

  await page.screenshot({ path: 'test-results/bulk-import-request-view.png', fullPage: true });
});
