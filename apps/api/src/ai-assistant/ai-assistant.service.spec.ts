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
    referenceText: null,
    referenceSources: [],
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
    probyPointId: null,
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
      kurin: { findUnique: jest.fn().mockResolvedValue({ id: 'kurin-1', probyProgramId: 'program-1', gender: 'MALE' }) },
      probyPoint: { findUnique: jest.fn().mockResolvedValue(makePoint()) },
      aiConversation: {
        // Two different lookups share this mock: ownership checks (by id) and
        // createConversation's find-or-create (by the userId+probyPointId
        // compound key). Branch on shape so each gets a sensible default —
        // an existing conversation by id, no existing one for that point yet.
        findUnique: jest.fn((args: any) =>
          args?.where?.userId_probyPointId ? Promise.resolve(null) : Promise.resolve(makeConversation()),
        ),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue(makeConversation()),
        update: jest.fn().mockResolvedValue(makeConversation()),
        delete: jest.fn().mockResolvedValue(makeConversation()),
        count: jest.fn().mockResolvedValue(0),
      },
      aiMessage: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        count: jest.fn().mockResolvedValue(0),
      },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    openAi = {
      createChatCompletion: jest.fn().mockResolvedValue('Ось твоя відповідь.'),
      isSearchGroundingEnabled: jest.fn().mockReturnValue(false),
    };
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
    it('creates an empty, untitled conversation pinned to the given proby point', async () => {
      const result = await service.createConversation(ACTOR_JUNAK, { probyPointId: 'point-1' });
      expect(prisma.aiConversation.create).toHaveBeenCalledWith({
        data: { userId: ACTOR_JUNAK.userId, probyPointId: 'point-1' },
      });
      expect(result.messages).toEqual([]);
    });

    it("returns the actor's existing conversation for that point instead of creating a duplicate", async () => {
      prisma.aiConversation.findUnique.mockImplementation((args: any) =>
        args?.where?.userId_probyPointId
          ? Promise.resolve(makeConversation({ probyPointId: 'point-1', title: 'Стара розмова' }))
          : Promise.resolve(makeConversation()),
      );

      const result = await service.createConversation(ACTOR_JUNAK, { probyPointId: 'point-1' });

      expect(prisma.aiConversation.create).not.toHaveBeenCalled();
      expect(result.title).toBe('Стара розмова');
    });

    it("404s creating a conversation for a point outside the actor's kurin's program", async () => {
      prisma.probyPoint.findUnique.mockResolvedValue(
        makePoint({
          category: {
            ...makePoint().category,
            stage: { ...makePoint().category.stage, programId: 'other-program' },
          },
        }),
      );

      await expect(service.createConversation(ACTOR_JUNAK, { probyPointId: 'point-1' })).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.aiConversation.create).not.toHaveBeenCalled();
    });
  });

  describe('per-point conversation pinning', () => {
    it('rejects sending a message whose probyPointId differs from the one the conversation is pinned to', async () => {
      prisma.aiConversation.findUnique.mockResolvedValue(makeConversation({ probyPointId: 'point-1' }));

      await expect(
        service.sendMessage('conversation-1', { probyPointId: 'point-2', content: 'hi' }, ACTOR_JUNAK),
      ).rejects.toThrow(BadRequestException);
      expect(openAi.createChatCompletion).not.toHaveBeenCalled();
    });

    it('allows sending a message whose probyPointId matches the conversation’s pinned point', async () => {
      prisma.aiConversation.findUnique.mockResolvedValue(makeConversation({ probyPointId: 'point-1' }));

      const result = await service.sendMessage(
        'conversation-1',
        { probyPointId: 'point-1', content: 'hi' },
        ACTOR_JUNAK,
      );

      expect(result.reply).toBe('Ось твоя відповідь.');
    });

    it('allows any probyPointId on a legacy conversation that has no pinned point', async () => {
      prisma.aiConversation.findUnique.mockResolvedValue(makeConversation({ probyPointId: null }));

      const result = await service.sendMessage(
        'conversation-1',
        { probyPointId: 'point-1', content: 'hi' },
        ACTOR_JUNAK,
      );

      expect(result.reply).toBe('Ось твоя відповідь.');
    });
  });

  describe('deleteConversation', () => {
    it('deletes the messages before the conversation, in one transaction', async () => {
      await service.deleteConversation('conversation-1', ACTOR_JUNAK);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.aiMessage.deleteMany).toHaveBeenCalledWith({ where: { conversationId: 'conversation-1' } });
      expect(prisma.aiConversation.delete).toHaveBeenCalledWith({ where: { id: 'conversation-1' } });
    });

    it("404s deleting a conversation that doesn't exist", async () => {
      prisma.aiConversation.findUnique.mockResolvedValue(null);
      await expect(service.deleteConversation('missing', ACTOR_JUNAK)).rejects.toThrow(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("404s deleting another user's conversation, and doesn't touch the database", async () => {
      prisma.aiConversation.findUnique.mockResolvedValue(makeConversation({ userId: 'someone-else' }));
      await expect(service.deleteConversation('conversation-1', ACTOR_JUNAK)).rejects.toThrow(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
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

  it('includes the curated referenceText and the only-use-these-facts instruction when present', async () => {
    prisma.probyPoint.findUnique.mockResolvedValue(
      makePoint({ referenceText: 'Пласт засновано 12 квітня 1912 року у Львові.' }),
    );

    await service.sendMessage('conversation-1', { probyPointId: 'point-1', content: 'Коли засновано Пласт?' }, ACTOR_JUNAK);

    const systemMessage = openAi.createChatCompletion.mock.calls[0][0][0];
    expect(systemMessage.content).toContain('Пласт засновано 12 квітня 1912 року у Львові.');
    expect(systemMessage.content).toContain('бери їх лише з цього довідкового матеріалу');
  });

  it('omits the reference-material block entirely when a point has no referenceText', async () => {
    await service.sendMessage('conversation-1', { probyPointId: 'point-1', content: 'hi' }, ACTOR_JUNAK);

    const systemMessage = openAi.createChatCompletion.mock.calls[0][0][0];
    expect(systemMessage.content).not.toContain('Довідковий матеріал');
  });

  it('includes fetched ReferenceSource text, labeled, with its own only-use-these-facts instruction', async () => {
    prisma.probyPoint.findUnique.mockResolvedValue(
      makePoint({
        referenceSources: [
          { label: 'Гімни і молитви (pryvatri.de)', extractedText: 'Гімн Пласту: Цвіт України і краса...' },
        ],
      }),
    );

    await service.sendMessage('conversation-1', { probyPointId: 'point-1', content: 'Заспівай гімн' }, ACTOR_JUNAK);

    const systemMessage = openAi.createChatCompletion.mock.calls[0][0][0];
    expect(systemMessage.content).toContain('Гімни і молитви (pryvatri.de)');
    expect(systemMessage.content).toContain('Гімн Пласту: Цвіт України і краса...');
    expect(systemMessage.content).toContain('не маєш його, а не вигадуй');
  });

  it('skips a ReferenceSource that has never been successfully fetched (null extractedText)', async () => {
    prisma.probyPoint.findUnique.mockResolvedValue(
      makePoint({ referenceSources: [{ label: 'Ще не завантажено', extractedText: null }] }),
    );

    await service.sendMessage('conversation-1', { probyPointId: 'point-1', content: 'hi' }, ACTOR_JUNAK);

    const systemMessage = openAi.createChatCompletion.mock.calls[0][0][0];
    expect(systemMessage.content).not.toContain('Ще не завантажено');
    expect(systemMessage.content).not.toContain('Додаткові джерела');
  });

  it('instructs a "друже" greeting for a male (MALE) kurin on the first message', async () => {
    prisma.kurin.findUnique.mockResolvedValue({ id: 'kurin-1', probyProgramId: 'program-1', gender: 'MALE' });

    await service.sendMessage('conversation-1', { probyPointId: 'point-1', content: 'hi' }, ACTOR_JUNAK);

    const systemMessage = openAi.createChatCompletion.mock.calls[0][0][0];
    expect(systemMessage.content).toContain('СКОБ, друже!');
    expect(systemMessage.content).not.toContain('подруго');
  });

  it('instructs a "подруго" greeting for a female (FEMALE) kurin on the first message', async () => {
    prisma.kurin.findUnique.mockResolvedValue({ id: 'kurin-1', probyProgramId: 'program-1', gender: 'FEMALE' });

    await service.sendMessage('conversation-1', { probyPointId: 'point-1', content: 'hi' }, ACTOR_JUNAK);

    const systemMessage = openAi.createChatCompletion.mock.calls[0][0][0];
    expect(systemMessage.content).toContain('СКОБ, подруго!');
  });

  it('tells the model not to repeat the "СКОБ" greeting on a later message in the conversation', async () => {
    prisma.aiMessage.findMany.mockResolvedValue([
      { role: 'USER', content: 'перше повідомлення', createdAt: new Date(), probyPointId: 'point-1' },
      { role: 'ASSISTANT', content: 'СКОБ, друже! ...', createdAt: new Date(), probyPointId: 'point-1' },
    ]);

    await service.sendMessage('conversation-1', { probyPointId: 'point-1', content: 'ще питання' }, ACTOR_JUNAK);

    const systemMessage = openAi.createChatCompletion.mock.calls[0][0][0];
    expect(systemMessage.content).not.toContain('СКОБ, друже!');
    expect(systemMessage.content).toContain('не вітайся словом "СКОБ" знову');
  });

  it('instructs the model to skip filler intro/outro phrases and answer straight to the point', async () => {
    await service.sendMessage('conversation-1', { probyPointId: 'point-1', content: 'hi' }, ACTOR_JUNAK);

    const systemMessage = openAi.createChatCompletion.mock.calls[0][0][0];
    expect(systemMessage.content).toContain('Ось стислий і структурований матеріал');
    expect(systemMessage.content).toContain('Сподіваюсь, це допоможе');
  });

  it('tells the model to search the web proactively (not as a last resort) when Gemini grounding is enabled', async () => {
    openAi.isSearchGroundingEnabled.mockReturnValue(true);

    await service.sendMessage('conversation-1', { probyPointId: 'point-1', content: 'hi' }, ACTOR_JUNAK);

    const systemMessage = openAi.createChatCompletion.mock.calls[0][0][0];
    expect(systemMessage.content).toContain('У тебе є доступ до пошуку в інтернеті');
    expect(systemMessage.content).toContain('проактивно, а не як крайнім засобом');
    expect(systemMessage.content).toContain('одразу шукай її сам');
  });

  it('instructs the model never to recite the stage/category/point structure back to the junak', async () => {
    await service.sendMessage('conversation-1', { probyPointId: 'point-1', content: 'hi' }, ACTOR_JUNAK);

    const systemMessage = openAi.createChatCompletion.mock.calls[0][0][0];
    expect(systemMessage.content).toContain('Ніколи не озвучуй юнаку службову інформацію');
  });

  it('restricts suggesting the vykhovnyk to sensitive topics, hallucination risk, or contradictory sources', async () => {
    await service.sendMessage('conversation-1', { probyPointId: 'point-1', content: 'hi' }, ACTOR_JUNAK);

    const systemMessage = openAi.createChatCompletion.mock.calls[0][0][0];
    expect(systemMessage.content).toContain('Коли радити звернутися до виховника — лише в крайніх випадках');
    expect(systemMessage.content).toContain('Ніколи не відправляй юнака до виховника лише тому, що потрібної інформації немає');
  });

  it('says nothing about web search when Gemini grounding is not enabled', async () => {
    openAi.isSearchGroundingEnabled.mockReturnValue(false);

    await service.sendMessage('conversation-1', { probyPointId: 'point-1', content: 'hi' }, ACTOR_JUNAK);

    const systemMessage = openAi.createChatCompletion.mock.calls[0][0][0];
    expect(systemMessage.content).not.toContain('доступ до пошуку в інтернеті');
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

  describe('daily new-chat limit (JUNAK only)', () => {
    it('rejects a JUNAK who has hit the daily new-chat limit with a 429, without creating a conversation', async () => {
      prisma.aiConversation.count.mockResolvedValue(5);

      await expect(service.createConversation(ACTOR_JUNAK, { probyPointId: 'point-1' })).rejects.toMatchObject({
        status: 429,
      });
      expect(prisma.aiConversation.create).not.toHaveBeenCalled();
    });

    it('includes the configured limit in the 429 message', async () => {
      prisma.aiConversation.count.mockResolvedValue(5);

      try {
        await service.createConversation(ACTOR_JUNAK, { probyPointId: 'point-1' });
        fail('expected createConversation to throw');
      } catch (error: any) {
        expect(error.getResponse()).toContain('5');
      }
    });

    it('lets a JUNAK under the daily limit create a new conversation normally', async () => {
      prisma.aiConversation.count.mockResolvedValue(4);

      const result = await service.createConversation(ACTOR_JUNAK, { probyPointId: 'point-1' });

      expect(prisma.aiConversation.create).toHaveBeenCalledWith({
        data: { userId: ACTOR_JUNAK.userId, probyPointId: 'point-1' },
      });
      expect(result.messages).toEqual([]);
    });

    it('counts only conversations created within the last rolling 24h window', async () => {
      await service.createConversation(ACTOR_JUNAK, { probyPointId: 'point-1' });

      expect(prisma.aiConversation.count).toHaveBeenCalledWith({
        where: { userId: ACTOR_JUNAK.userId, createdAt: { gte: expect.any(Date) } },
      });
    });

    it('never rate-limits a ZVYAZKOVYI actor creating a conversation, regardless of count', async () => {
      prisma.aiConversation.count.mockResolvedValue(999);

      const result = await service.createConversation(ACTOR_ZVYAZKOVYI, { probyPointId: 'point-1' });

      expect(prisma.aiConversation.count).not.toHaveBeenCalled();
      expect(result.messages).toEqual([]);
    });
  });

  describe('messages-per-chat limit (JUNAK only)', () => {
    it('rejects a JUNAK who has hit the per-chat message limit with a 429, before calling the AI', async () => {
      prisma.aiMessage.count.mockResolvedValue(25);

      await expect(
        service.sendMessage('conversation-1', { probyPointId: 'point-1', content: 'hi' }, ACTOR_JUNAK),
      ).rejects.toMatchObject({ status: 429 });
      expect(openAi.createChatCompletion).not.toHaveBeenCalled();
      expect(prisma.aiMessage.create).not.toHaveBeenCalled();
    });

    it('includes the configured limit in the 429 message', async () => {
      prisma.aiMessage.count.mockResolvedValue(25);

      try {
        await service.sendMessage('conversation-1', { probyPointId: 'point-1', content: 'hi' }, ACTOR_JUNAK);
        fail('expected sendMessage to throw');
      } catch (error: any) {
        expect(error.getResponse()).toContain('25');
      }
    });

    it('lets a JUNAK under the per-chat limit send a message normally', async () => {
      prisma.aiMessage.count.mockResolvedValue(24);

      const result = await service.sendMessage(
        'conversation-1',
        { probyPointId: 'point-1', content: 'hi' },
        ACTOR_JUNAK,
      );

      expect(result.reply).toBe('Ось твоя відповідь.');
    });

    it('counts only USER messages already in this conversation (not other conversations)', async () => {
      await service.sendMessage('conversation-1', { probyPointId: 'point-1', content: 'hi' }, ACTOR_JUNAK);

      expect(prisma.aiMessage.count).toHaveBeenCalledWith({
        where: { conversationId: 'conversation-1', role: 'USER' },
      });
    });

    it('never rate-limits a ZVYAZKOVYI actor sending a message, regardless of count', async () => {
      prisma.aiConversation.findUnique.mockResolvedValue(makeConversation({ userId: ACTOR_ZVYAZKOVYI.userId }));
      prisma.aiMessage.count.mockResolvedValue(999);

      const result = await service.sendMessage(
        'conversation-1',
        { probyPointId: 'point-1', content: 'hi' },
        ACTOR_ZVYAZKOVYI,
      );

      expect(prisma.aiMessage.count).not.toHaveBeenCalled();
      expect(result.reply).toBe('Ось твоя відповідь.');
    });
  });
});
