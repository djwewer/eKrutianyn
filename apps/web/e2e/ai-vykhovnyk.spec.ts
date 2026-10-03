import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { createHurtok, createUserAs, loginForToken } from './helpers/proby-seed';

test('lets a junak pick a proby point, send a message, and see the mocked AI reply', async ({ page }) => {
  const { program } = await seedProbyProgram(['Орієнтування на місцевості']);
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);

  const hurtok = await createHurtok(zvyazkovyiToken, 'Орлики');
  const junakEmail = `junak-ai-${Date.now()}@example.com`;
  const junakPassword = 'password123';
  await createUserAs(zvyazkovyiToken, {
    firstName: 'Юрій',
    lastName: 'Юрченко',
    email: junakEmail,
    role: 'JUNAK',
    hurtokId: hurtok.id,
    password: junakPassword,
  });

  // Never let this test's flow reach the real OpenAiService/OpenAI API —
  // mock both AI-assistant endpoints the page talks to. The conversation GET
  // is re-fetched after a successful send (query invalidation), so it must
  // reflect the same messages the POST just "persisted", not a fixed stub.
  let capturedSendBody: { probyPointId: string; content: string } | undefined;
  const mockedReply = 'Ось план підготовки до цієї точки проби.';
  let storedMessages: {
    role: 'USER' | 'ASSISTANT';
    content: string;
    probyPointId: string | null;
    createdAt: string;
  }[] = [];

  await page.route('**/api/backend/ai-assistant/conversation', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'conv-1', messages: storedMessages }),
    }),
  );

  await page.route('**/api/backend/ai-assistant/messages', (route) => {
    capturedSendBody = JSON.parse(route.request().postData() ?? '{}');
    storedMessages = [
      ...storedMessages,
      {
        role: 'USER',
        content: capturedSendBody?.content ?? '',
        probyPointId: capturedSendBody?.probyPointId ?? null,
        createdAt: new Date().toISOString(),
      },
      {
        role: 'ASSISTANT',
        content: mockedReply,
        probyPointId: capturedSendBody?.probyPointId ?? null,
        createdAt: new Date().toISOString(),
      },
    ];
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ reply: mockedReply, messages: storedMessages }),
    });
  });

  await loginAs(page, junakEmail, junakPassword);
  await page.goto('/ai-vykhovnyk');

  await page.getByRole('combobox').click();
  await page.getByRole('option', { name: 'Орієнтування на місцевості' }).click();

  await page
    .getByPlaceholder('Опишіть, що хочете підготувати...')
    .fill('Допоможи підготуватись до цієї точки');
  await page.getByRole('button', { name: 'Надіслати' }).click();

  await expect(page.getByText(mockedReply)).toBeVisible();
  await expect.poll(() => capturedSendBody?.content).toBe('Допоможи підготуватись до цієї точки');
  await expect.poll(() => capturedSendBody?.probyPointId).toBeTruthy();
});

test('does not show the AI-виховник nav link for a vykhovnyk', async ({ page }) => {
  const { program } = await seedProbyProgram();
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);

  const vykhovnykEmail = `vykhovnyk-ai-${Date.now()}@example.com`;
  const vykhovnykPassword = 'password123';
  await createUserAs(zvyazkovyiToken, {
    firstName: 'Марія',
    lastName: 'Мельник',
    email: vykhovnykEmail,
    role: 'VYKHOVNYK',
    password: vykhovnykPassword,
  });

  await loginAs(page, vykhovnykEmail, vykhovnykPassword);

  await expect(page.getByRole('link', { name: 'AI-виховник' })).toHaveCount(0);
});
