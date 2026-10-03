import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';
import { createHurtok, createUserAs, loginForToken } from './helpers/proby-seed';

type StoredMessage = { role: 'USER' | 'ASSISTANT'; content: string; probyPointId: string | null; createdAt: string };
type StoredConversation = { id: string; title: string | null; createdAt: string; updatedAt: string };

/** Registers in-memory-backed mocks for every /ai-assistant/* route the page talks
 * to, so no test here ever reaches the real OpenAiService/OpenAI API. Returns the
 * shared state and a way to inspect the most recent send. */
async function mockAiAssistantApi(page: import('@playwright/test').Page, mockedReply: string, sendDelayMs = 0) {
  let conversations: StoredConversation[] = [];
  const messagesByConversation = new Map<string, StoredMessage[]>();
  let capturedSendBody: { probyPointId: string; content: string } | undefined;
  let nextId = 1;

  await page.route('**/api/backend/ai-assistant/conversations/*/messages', async (route) => {
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
    if (sendDelayMs > 0) await new Promise((r) => setTimeout(r, sendDelayMs));
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
    if (route.request().method() === 'DELETE') {
      conversations = conversations.filter((c) => c.id !== conversationId);
      messagesByConversation.delete(conversationId);
      return route.fulfill({ status: 204 });
    }
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

  return { getCapturedSendBody: () => capturedSendBody };
}

async function seedJunak(zvyazkovyiToken: string, emailPrefix: string) {
  const hurtok = await createHurtok(zvyazkovyiToken, 'Орлики');
  const email = `${emailPrefix}-${Date.now()}@example.com`;
  const password = 'password123';
  await createUserAs(zvyazkovyiToken, {
    firstName: 'Юрій',
    lastName: 'Юрченко',
    email,
    role: 'JUNAK',
    hurtokId: hurtok.id,
    password,
  });
  return { email, password };
}

test('opens a fresh, unsaved chat automatically on page load — no "+ Нова розмова" click needed', async ({ page }) => {
  const { program } = await seedProbyProgram(['Орієнтування на місцевості']);
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);
  const { email, password } = await seedJunak(zvyazkovyiToken, 'junak-ai-fresh');
  await mockAiAssistantApi(page, 'Ось план підготовки.');

  await loginAs(page, email, password);
  await page.goto('/ai-vykhovnyk');

  // The point picker and composer are visible immediately — no "Натисни + Нова
  // розмова" gate, and no conversation has been created on the backend yet
  // (nothing to clean up if the person never sends a message).
  await expect(page.getByRole('combobox')).toBeVisible();
  await expect(page.getByPlaceholder('Опишіть, що хочете підготувати...')).toBeVisible();
  await expect(page.getByText('Ще немає розмов.')).toBeVisible();
});

test('shows the "може помилятися" disclaimer under the page title', async ({ page }) => {
  const { program } = await seedProbyProgram(['Орієнтування на місцевості']);
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);
  const { email, password } = await seedJunak(zvyazkovyiToken, 'junak-ai-disclaimer');
  await mockAiAssistantApi(page, 'Ось план підготовки.');

  await loginAs(page, email, password);
  await page.goto('/ai-vykhovnyk');

  await expect(
    page.getByText('AI-виховник старається бути щоразу кращим, проте може помилятися. Перевіряй його відповідь.'),
  ).toBeVisible();
});

test('lets a junak pick a proby point, send a message, and see the mocked AI reply', async ({ page }) => {
  const { program } = await seedProbyProgram(['Орієнтування на місцевості']);
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);
  const { email, password } = await seedJunak(zvyazkovyiToken, 'junak-ai');

  const mockedReply = 'Ось план підготовки до цієї точки проби.';
  const { getCapturedSendBody } = await mockAiAssistantApi(page, mockedReply);

  await loginAs(page, email, password);
  await page.goto('/ai-vykhovnyk');

  await page.getByRole('combobox').click();
  await page.getByRole('option', { name: 'Орієнтування на місцевості' }).click();

  await page
    .getByPlaceholder('Опишіть, що хочете підготувати...')
    .fill('Допоможи підготуватись до цієї точки');
  await page.getByRole('button', { name: 'Надіслати' }).click();

  await expect(page.getByText(mockedReply)).toBeVisible();
  await expect.poll(() => getCapturedSendBody()?.content).toBe('Допоможи підготуватись до цієї точки');
  await expect.poll(() => getCapturedSendBody()?.probyPointId).toBeTruthy();

  // The sidebar should now show the new chat, titled from its first message —
  // meaning a conversation was lazily created only once a message was sent.
  await expect(page.getByRole('button', { name: 'Допоможи підготуватись до цієї точки' })).toBeVisible();
});

test('shows the sent message immediately on the right, with a typing indicator (not placeholder text) while waiting', async ({
  page,
}) => {
  const { program } = await seedProbyProgram(['Орієнтування на місцевості']);
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);
  const { email, password } = await seedJunak(zvyazkovyiToken, 'junak-ai-instant');

  // A real delay on the mocked send response gives us a window to assert the
  // optimistic (pre-response) UI state.
  await mockAiAssistantApi(page, 'Ось відповідь.', 600);

  await loginAs(page, email, password);
  await page.goto('/ai-vykhovnyk');

  await page.getByRole('combobox').click();
  await page.getByRole('option', { name: 'Орієнтування на місцевості' }).click();
  await page.getByPlaceholder('Опишіть, що хочете підготувати...').fill('Привіт, допоможи');
  await page.getByRole('button', { name: 'Надіслати' }).click();

  // The user's own message appears right away — not only after the reply comes
  // back — and no literal "Генерує відповідь" text is shown in the thread.
  await expect(page.getByText('Привіт, допоможи')).toBeVisible();
  await expect(page.getByRole('status', { name: 'Генерує відповідь' })).toBeVisible();
  await expect(page.getByText('Генерує відповідь', { exact: true })).toHaveCount(0);

  await expect(page.getByText('Ось відповідь.')).toBeVisible();
  await expect(page.getByRole('status', { name: 'Генерує відповідь' })).toHaveCount(0);
});

test('lets a junak delete a chat from the sidebar', async ({ page }) => {
  const { program } = await seedProbyProgram(['Орієнтування на місцевості']);
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);
  const { email, password } = await seedJunak(zvyazkovyiToken, 'junak-ai-del');
  await mockAiAssistantApi(page, 'Ось відповідь.');

  await loginAs(page, email, password);
  await page.goto('/ai-vykhovnyk');

  await page.getByRole('combobox').click();
  await page.getByRole('option', { name: 'Орієнтування на місцевості' }).click();
  await page.getByPlaceholder('Опишіть, що хочете підготувати...').fill('Перше повідомлення');
  await page.getByRole('button', { name: 'Надіслати' }).click();
  await expect(page.getByRole('button', { name: 'Перше повідомлення' })).toBeVisible();

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Видалити розмову' }).click();

  await expect(page.getByRole('button', { name: 'Перше повідомлення' })).toHaveCount(0);
  await expect(page.getByText('Ще немає розмов.')).toBeVisible();
  // Deleting the active chat drops back to a fresh, empty draft.
  await expect(page.getByText('Перше повідомлення')).toHaveCount(0);
});

test('renders markdown (bold, headings) in the assistant reply instead of raw syntax', async ({ page }) => {
  const { program } = await seedProbyProgram(['Три головні обов’язки']);
  const { zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);
  const zvyazkovyiToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);
  const { email, password } = await seedJunak(zvyazkovyiToken, 'junak-ai-md');

  const markdownReply = '### Заголовок\n\n**Жирний текст** і звичайний текст.';
  await mockAiAssistantApi(page, markdownReply);

  await loginAs(page, email, password);
  await page.goto('/ai-vykhovnyk');
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
