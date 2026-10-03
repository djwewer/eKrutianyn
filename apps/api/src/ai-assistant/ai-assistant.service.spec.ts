import { BadRequestException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { AiAssistantService } from './ai-assistant.service';

const ACTOR_JUNAK = { userId: 'junak-1', role: 'JUNAK', kurinId: 'kurin-1', isKurinniy: false, positions: [] } as any;
const ACTOR_ZVYAZKOVYI = {
  userId: 'zvyazkovyi-1',
  role: 'ZVYAZKOVYI',
  kurinId: 'kurin-1',
  isKurinniy: false,
  positions: [],
} as any;

function makePoint(overrides: Partial<any> = {}) {
  return {
    id: 'point-1',
    description: 'Описати історію Пласту',
    categoryId: 'category-1',
    category: {
      id: 'category-1',
      name: 'Категорія історії',
      stageId: 'stage-1',
      stage: { id: 'stage-1', programId: 'program-1', name: 'Ступінь Юнак' },
    },
    ...overrides,
  };
}

function makeConversation(overrides: Partial<any> = {}) {
  return {
    id: 'conversation-1',
    userId: ACTOR_JUNAK.userId,
    title: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('AiAssistantService', () => {
  let service: AiAssistantService;
  let prisma: any;
  let openAi: any;
  let probyProgress: any;

  beforeEach(() => {
    prisma = {
      kurin: { findUnique: jest.fn().mockResolvedValue({ id: 'kurin-1', probyProgramId: 'program-1' }) },
      probyPoint: { findUnique: jest.fn().mockResolvedValue(makePoint()) },
      aiConversation: {
        findUnique: jest.fn().mockResolvedValue(makeConversation()),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue(makeConversation()),
        update: jest.fn().mockResolvedValue(makeConversation()),
      },
      aiMessage: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({}),
      },
    };
    openAi = { createChatCompletion: jest.fn().mockResolvedValue('Ось твоя відповідь.') };
    probyProgress = {
      getProgressFor: jest
        .fn()
        .mockResolvedValue({ points: [], stages: [{ stageId: 'stage-1', status: 'OPEN', hasDebt: false }] }),
    };
    service = new AiAssistantService(prisma, openAi, probyProgress);
  });

  describe('listConversations', () => {
    it("returns only the actor's own conversations, most recently active first", async () => {
      await service.listConversations(ACTOR_JUNAK);
      expect(prisma.aiConversation.findMany).toHaveBeenCalledWith({
        where: { userId: ACTOR_JUNAK.userId },
        orderBy: { updatedAt: 'desc' },
      });
    });
  });

  describe('createConversation', () => {
    it('creates an empty, untitled conversation for the actor', async () => {
      const result = await service.createConversation(ACTOR_JUNAK);
      expect(prisma.aiConversation.create).toHaveBeenCalledWith({ data: { userId: ACTOR_JUNAK.userId } });
      expect(result.messages).toEqual([]);
    });
  });

  describe('getConversation / sendMessage ownership', () => {
    it("404s on a conversation that doesn't exist", async () => {
      prisma.aiConversation.findUnique.mockResolvedValue(null);
      await expect(service.getConversation('missing', ACTOR_JUNAK)).rejects.toThrow(NotFoundException);
    });

    it("404s on another user's conversation, never leaking that it exists", async () => {
      prisma.aiConversation.findUnique.mockResolvedValue(makeConversation({ userId: 'someone-else' }));
      await expect(service.getConversation('conversation-1', ACTOR_JUNAK)).rejects.toThrow(NotFoundException);
      await expect(
        service.sendMessage('conversation-1', { probyPointId: 'point-1', content: 'hi' }, ACTOR_JUNAK),
      ).rejects.toThrow(NotFoundException);
      expect(openAi.createChatCompletion).not.toHaveBeenCalled();
    });
  });

  it('builds a system prompt containing the real stage name, category name, and point description', async () => {
    await service.sendMessage('conversation-1', { probyPointId: 'point-1', content: 'Допоможи підготуватись' }, ACTOR_JUNAK);

    const messagesArg = openAi.createChatCompletion.mock.calls[0][0];
    const systemMessage = messagesArg[0];
    expect(systemMessage.role).toBe('system');
    expect(systemMessage.content).toContain('Ступінь Юнак');
    expect(systemMessage.content).toContain('Категорія історії');
    expect(systemMessage.content).toContain('Описати історію Пласту');
    expect(systemMessage.content).toContain('Без зайвої води');
    expect(systemMessage.content).toContain('AI-виховник');
  });

  it("rejects a probyPointId that doesn't belong to the actor's kurin's program", async () => {
    prisma.probyPoint.findUnique.mockResolvedValue(
      makePoint({
        category: {
          ...makePoint().category,
          stage: { ...makePoint().category.stage, programId: 'other-program' },
        },
      }),
    );

    await expect(
      service.sendMessage('conversation-1', { probyPointId: 'point-1', content: 'hi' }, ACTOR_JUNAK),
    ).rejects.toThrow(NotFoundException);
    expect(openAi.createChatCompletion).not.toHaveBeenCalled();
  });

  it('rejects a probyPointId that does not exist at all, with the same 404', async () => {
    prisma.probyPoint.findUnique.mockResolvedValue(null);

    await expect(
      service.sendMessage('conversation-1', { probyPointId: 'missing-point', content: 'hi' }, ACTOR_JUNAK),
    ).rejects.toThrow(NotFoundException);
  });

  it('for a JUNAK actor, rejects a point that is already DONE', async () => {
    probyProgress.getProgressFor.mockResolvedValue({
      points: [{ pointId: 'point-1', status: 'DONE', point: makePoint() }],
      stages: [{ stageId: 'stage-1', status: 'OPEN', hasDebt: false }],
    });

    await expect(
      service.sendMessage('conversation-1', { probyPointId: 'point-1', content: 'hi' }, ACTOR_JUNAK),
    ).rejects.toThrow(BadRequestException);
    expect(openAi.createChatCompletion).not.toHaveBeenCalled();
  });

  it('for a JUNAK actor, rejects a point whose stage is LOCKED', async () => {
    probyProgress.getProgressFor.mockResolvedValue({
      points: [],
      stages: [{ stageId: 'stage-1', status: 'LOCKED', hasDebt: false }],
    });

    await expect(
      service.sendMessage('conversation-1', { probyPointId: 'point-1', content: 'hi' }, ACTOR_JUNAK),
    ).rejects.toThrow(BadRequestException);
    expect(openAi.createChatCompletion).not.toHaveBeenCalled();
  });

  it('for a ZVYAZKOVYI actor, accepts a point regardless of DONE/LOCKED status and never calls getProgressFor', async () => {
    prisma.aiConversation.findUnique.mockResolvedValue(makeConversation({ userId: ACTOR_ZVYAZKOVYI.userId }));
    const result = await service.sendMessage(
      'conversation-1',
      { probyPointId: 'point-1', content: 'hi' },
      ACTOR_ZVYAZKOVYI,
    );

    expect(probyProgress.getProgressFor).not.toHaveBeenCalled();
    expect(result.reply).toBe('Ось твоя відповідь.');
  });

  it('sets the conversation title from the first message, but never overwrites an existing title', async () => {
    prisma.aiConversation.findUnique.mockResolvedValue(makeConversation({ title: null }));
    prisma.aiMessage.findMany.mockResolvedValue([]); // no history yet: this is the first message

    await service.sendMessage('conversation-1', { probyPointId: 'point-1', content: 'Перше повідомлення' }, ACTOR_JUNAK);

    expect(prisma.aiConversation.update).toHaveBeenCalledWith({
      where: { id: 'conversation-1' },
      data: { title: 'Перше повідомлення' },
    });
  });

  it('does not touch the title on a later message in the same conversation', async () => {
    prisma.aiConversation.findUnique.mockResolvedValue(makeConversation({ title: 'Перше повідомлення' }));
    prisma.aiMessage.findMany.mockResolvedValue([
      { id: 'm1', role: 'USER', content: 'Перше повідомлення', createdAt: new Date() },
    ]);

    await service.sendMessage('conversation-1', { probyPointId: 'point-1', content: 'Друге повідомлення' }, ACTOR_JUNAK);

    expect(prisma.aiConversation.update).toHaveBeenCalledWith({ where: { id: 'conversation-1' }, data: {} });
  });

  it('caps history sent to OpenAI at the last 20 stored messages, most recent and in chronological order', async () => {
    const now = Date.now();
    const seeded = Array.from({ length: 25 }, (_, i) => ({
      id: `msg-${i}`,
      conversationId: 'conversation-1',
      role: i % 2 === 0 ? 'USER' : 'ASSISTANT',
      content: `message-${i}`,
      probyPointId: 'point-1',
      createdAt: new Date(now + i * 1000),
    }));
    prisma.aiMessage.findMany.mockImplementation(({ orderBy, take }: any) => {
      const sorted = [...seeded].sort((a, b) =>
        orderBy.createdAt === 'desc'
          ? b.createdAt.getTime() - a.createdAt.getTime()
          : a.createdAt.getTime() - b.createdAt.getTime(),
      );
      return Promise.resolve(take ? sorted.slice(0, take) : sorted);
    });

    await service.sendMessage('conversation-1', { probyPointId: 'point-1', content: 'new message' }, ACTOR_JUNAK);

    const messagesArg = openAi.createChatCompletion.mock.calls[0][0];
    // 1 system + 20 history + 1 new user message
    expect(messagesArg).toHaveLength(22);
    expect(messagesArg[0].role).toBe('system');
    // The oldest of the last 20 seeded messages is message-5 (25 seeded, most recent 20 kept);
    // odd indices were seeded as ASSISTANT, even as USER.
    expect(messagesArg[1]).toEqual({ role: 'assistant', content: 'message-5' });
    expect(messagesArg[20]).toEqual({ role: 'user', content: 'message-24' });
    expect(messagesArg[21]).toEqual({ role: 'user', content: 'new message' });
  });

  it('stores the user message even when createChatCompletion rejects, and stores no assistant message', async () => {
    openAi.createChatCompletion.mockRejectedValue(new Error('network error, leaked header: Authorization sk-secret'));

    await expect(
      service.sendMessage('conversation-1', { probyPointId: 'point-1', content: 'hi' }, ACTOR_JUNAK),
    ).rejects.toThrow(ServiceUnavailableException);

    expect(prisma.aiMessage.create).toHaveBeenCalledTimes(1);
    expect(prisma.aiMessage.create).toHaveBeenCalledWith({
      data: { conversationId: 'conversation-1', role: 'USER', content: 'hi', probyPointId: 'point-1' },
    });
  });

  it('does not leak the underlying SDK error message (which may contain secrets) into the thrown error', async () => {
    openAi.createChatCompletion.mockRejectedValue(new Error('Authorization: Bearer sk-super-secret-key'));

    try {
      await service.sendMessage('conversation-1', { probyPointId: 'point-1', content: 'hi' }, ACTOR_JUNAK);
      fail('expected sendMessage to throw');
    } catch (error: any) {
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect(JSON.stringify(error.getResponse())).not.toContain('sk-super-secret-key');
    }
  });
});
