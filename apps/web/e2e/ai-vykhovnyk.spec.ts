import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { createHurtok, createUserAs, loginForToken } from './helpers/proby-seed';

type StoredMessage = { role: 'USER' | 'ASSISTANT'; content: string; probyPointId: string | null; createdAt: string };
type StoredConversation = { id: string; title: string | null; createdAt: string; updatedAt: string };

test('lets a junak create a chat, pick a proby point, send a message, and see the mocked AI reply', async ({ page }) => {
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

  // Never let this test's flow reach the real OpenAiService/OpenAI API — mock
  // every /ai-assistant/* route the page talks to, backed by in-memory state so
  // the list/get/create/send endpoints stay consistent with each other across
  // the query invalidations the page triggers.
  let conversations: StoredConversation[] = [];
  const messagesByConversation = new Map<string, StoredMessage[]>();
  let capturedSendBody: { probyPointId: string; content: string } | undefined;
  const mockedReply = 'Ось план підготовки до цієї точки проби.';
  let nextId = 1;

  await page.route('**/api/backend/ai-assistant/conversations/*/messages', (route) => {
    const conversationId = new URL(route.request().url()).pathname.split('/').at(-2)!;
    capturedSendBody = JSON.parse(route.request().postData() ?? '{}');
    const existing = messagesByConversation.get(conversationId) ?? [];
    const updated: StoredMessage[] = [
      ...existing,
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
    messagesByConversation.set(conversationId, updated);
    conversations = conversations.map((c) =>
      c.id === conversationId
        ? { ...c, title: c.title ?? capturedSendBody!.content.slice(0, 60), updatedAt: new Date().toISOString() }
        : c,
    );
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ reply: mockedReply, messages: updated }),
    });
  });

  await page.route('**/api/backend/ai-assistant/conversations/*', (route) => {
    const conversationId = new URL(route.request().url()).pathname.split('/').pop()!;
    const conversation = conversations.find((c) => c.id === conversationId);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: conversationId,
        title: conversation?.title ?? null,
        messages: messagesByConversation.get(conversationId) ?? [],
      }),
    });
  });

  await page.route('**/api/backend/ai-assistant/conversations', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(conversations) });
    }
    const id = `conv-${nextId++}`;
    const now = new Date().toISOString();
    conversations = [{ id, title: null, createdAt: now, updatedAt: now }, ...conversations];
    messagesByConversation.set(id, []);
    return route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ id, title: null, messages: [] }),
    });
  });

  await loginAs(page, junakEmail, junakPassword);
  await page.goto('/ai-vykhovnyk');

  await expect(page.getByText('Натисни «+ Нова розмова», щоб почати.')).toBeVisible();
  await page.getByRole('button', { name: '+ Нова розмова' }).click();

  await page.getByRole('combobox').click();
  await page.getByRole('option', { name: 'Орієнтування на місцевості' }).click();

  await page
    .getByPlaceholder('Опишіть, що хочете підготувати...')
    .fill('Допоможи підготуватись до цієї точки');
  await page.getByRole('button', { name: 'Надіслати' }).click();

  await expect(page.getByText(mockedReply)).toBeVisible();
  await expect.poll(() => capturedSendBody?.content).toBe('Допоможи підготуватись до цієї точки');
  await expect.poll(() => capturedSendBody?.probyPointId).toBeTruthy();

  // The sidebar should now show the new chat, titled from its first message.
  await expect(page.getByRole('button', { name: 'Допоможи підготуватись до цієї точки' })).toBeVisible();
});

test('renders markdown (bold, headings) in the assistant reply instead of raw syntax', async ({ page }) => {
  const { program } = await seedProbyProgram(['Три головні обов’язки']);
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);

  const hurtok = await createHurtok(zvyazkovyiToken, 'Орлики');
  const junakEmail = `junak-ai-md-${Date.now()}@example.com`;
  const junakPassword = 'password123';
  await createUserAs(zvyazkovyiToken, {
    firstName: 'Юрій',
    lastName: 'Юрченко',
    email: junakEmail,
    role: 'JUNAK',
    hurtokId: hurtok.id,
    password: junakPassword,
  });

  const markdownReply = '### Заголовок\n\n**Жирний текст** і звичайний текст.';
  let conversations: StoredConversation[] = [];
  const messagesByConversation = new Map<string, StoredMessage[]>();
  let nextId = 1;

  await page.route('**/api/backend/ai-assistant/conversations/*/messages', (route) => {
    const conversationId = new URL(route.request().url()).pathname.split('/').at(-2)!;
    const body = JSON.parse(route.request().postData() ?? '{}');
    const updated: StoredMessage[] = [
      { role: 'USER', content: body.content, probyPointId: body.probyPointId, createdAt: new Date().toISOString() },
      { role: 'ASSISTANT', content: markdownReply, probyPointId: body.probyPointId, createdAt: new Date().toISOString() },
    ];
    messagesByConversation.set(conversationId, updated);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ reply: markdownReply, messages: updated }),
    });
  });

  await page.route('**/api/backend/ai-assistant/conversations/*', (route) => {
    const conversationId = new URL(route.request().url()).pathname.split('/').pop()!;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: conversationId, title: null, messages: messagesByConversation.get(conversationId) ?? [] }),
    });
  });

  await page.route('**/api/backend/ai-assistant/conversations', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(conversations) });
    }
    const id = `conv-${nextId++}`;
    const now = new Date().toISOString();
    conversations = [{ id, title: null, createdAt: now, updatedAt: now }, ...conversations];
    messagesByConversation.set(id, []);
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id, title: null, messages: [] }) });
  });

  await loginAs(page, junakEmail, junakPassword);
  await page.goto('/ai-vykhovnyk');
  await page.getByRole('button', { name: '+ Нова розмова' }).click();
  await page.getByRole('combobox').click();
  await page.getByRole('option', { name: 'Три головні обов’язки' }).click();
  await page.getByPlaceholder('Опишіть, що хочете підготувати...').fill('Привіт');
  await page.getByRole('button', { name: 'Надіслати' }).click();

  await expect(page.getByRole('heading', { name: 'Заголовок', level: 3 })).toBeVisible();
  await expect(page.locator('strong', { hasText: 'Жирний текст' })).toBeVisible();
  // The raw markdown syntax must not appear anywhere in the rendered thread.
  await expect(page.getByText('###', { exact: false })).toHaveCount(0);
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
