import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, Role, ProbyProgramVersion, ProgressStatus } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createKurin, createUser, issueTokenFor } from './utils/fixtures';
import { OpenAiService } from '../src/ai-assistant/openai.service';

describe('AI assistant (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let fakeOpenAiService: { createChatCompletion: jest.Mock };
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_TEST } } });

  beforeAll(async () => {
    fakeOpenAiService = { createChatCompletion: jest.fn() };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(OpenAiService)
      .useValue(fakeOpenAiService)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    jwtService = moduleRef.get(JwtService, { strict: false });
  });

  afterAll(async () => {
    await cleanDatabase(prisma);
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
    fakeOpenAiService.createChatCompletion.mockReset().mockResolvedValue('Ось стислий матеріал для підготовки.');
  });

  /**
   * Builds a two-stage program: stage1 has a DONE point and a NOT_DONE point,
   * stage2 is unreachable (LOCKED) until stage1 is closed.
   */
  async function setup() {
    const program = await prisma.probyProgram.create({ data: { version: ProbyProgramVersion.OLD, name: 'Test program' } });
    const stage1 = await prisma.probyStage.create({ data: { programId: program.id, order: 1, name: 'Ступінь 1' } });
    const category1 = await prisma.probyCategory.create({ data: { stageId: stage1.id, name: 'Категорія 1' } });
    const openPoint = await prisma.probyPoint.create({
      data: { categoryId: category1.id, order: 1, description: 'Відкрита точка' },
    });
    const donePoint = await prisma.probyPoint.create({
      data: { categoryId: category1.id, order: 2, description: 'Завершена точка' },
    });
    const stage2 = await prisma.probyStage.create({ data: { programId: program.id, order: 2, name: 'Ступінь 2' } });
    const category2 = await prisma.probyCategory.create({ data: { stageId: stage2.id, name: 'Категорія 2' } });
    const lockedPoint = await prisma.probyPoint.create({
      data: { categoryId: category2.id, order: 1, description: 'Заблокована точка' },
    });

    const kurin = await createKurin(prisma, { probyProgramId: program.id });

    return { kurin, openPoint, donePoint, lockedPoint, stage1, stage2 };
  }

  it('lets a JUNAK GET /ai-assistant/conversation and gets an empty conversation the first time', async () => {
    const { kurin } = await setup();
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, junak);

    const response = await request(app.getHttpServer())
      .get('/ai-assistant/conversation')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.messages).toEqual([]);
    expect(response.body.id).toBeDefined();
  });

  it('lets that JUNAK POST a message about one of their own open points and gets a stored user+assistant exchange', async () => {
    const { kurin, openPoint } = await setup();
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    await prisma.junakProgress.create({
      data: { junakId: junak.id, pointId: openPoint.id, status: ProgressStatus.NOT_DONE },
    });
    const token = issueTokenFor(jwtService, junak);

    const response = await request(app.getHttpServer())
      .post('/ai-assistant/messages')
      .set('Authorization', `Bearer ${token}`)
      .send({ probyPointId: openPoint.id, content: 'Допоможи підготуватись до цієї точки' })
      .expect((res) => expect([200, 201]).toContain(res.status));

    expect(response.body.reply).toBe('Ось стислий матеріал для підготовки.');
    expect(response.body.messages).toHaveLength(2);
    expect(response.body.messages[0]).toMatchObject({ role: 'USER', content: 'Допоможи підготуватись до цієї точки' });
    expect(response.body.messages[1]).toMatchObject({ role: 'ASSISTANT', content: 'Ось стислий матеріал для підготовки.' });

    expect(fakeOpenAiService.createChatCompletion).toHaveBeenCalledTimes(1);
    const sentMessages = fakeOpenAiService.createChatCompletion.mock.calls[0][0];
    expect(sentMessages[0].role).toBe('system');
    expect(sentMessages[0].content).toContain('Відкрита точка');

    const conversationResponse = await request(app.getHttpServer())
      .get('/ai-assistant/conversation')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(conversationResponse.body.messages).toHaveLength(2);
  });

  it('gives a VYKHOVNYK 403 on both endpoints', async () => {
    const { kurin, openPoint } = await setup();
    const vykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, vykhovnyk);

    await request(app.getHttpServer())
      .get('/ai-assistant/conversation')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);

    await request(app.getHttpServer())
      .post('/ai-assistant/messages')
      .set('Authorization', `Bearer ${token}`)
      .send({ probyPointId: openPoint.id, content: 'hi' })
      .expect(403);

    expect(fakeOpenAiService.createChatCompletion).not.toHaveBeenCalled();
  });

  it('rejects a JUNAK sending a probyPointId for an already-DONE point (400)', async () => {
    const { kurin, donePoint } = await setup();
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    await prisma.junakProgress.create({
      data: { junakId: junak.id, pointId: donePoint.id, status: ProgressStatus.DONE },
    });
    const token = issueTokenFor(jwtService, junak);

    await request(app.getHttpServer())
      .post('/ai-assistant/messages')
      .set('Authorization', `Bearer ${token}`)
      .send({ probyPointId: donePoint.id, content: 'hi' })
      .expect(400);

    expect(fakeOpenAiService.createChatCompletion).not.toHaveBeenCalled();
  });

  it('rejects a JUNAK sending a probyPointId whose stage is LOCKED (400)', async () => {
    const { kurin, lockedPoint } = await setup();
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, junak);

    await request(app.getHttpServer())
      .post('/ai-assistant/messages')
      .set('Authorization', `Bearer ${token}`)
      .send({ probyPointId: lockedPoint.id, content: 'hi' })
      .expect(400);
  });

  it("lets a ZVYAZKOVYI message about any point in their kurin's program, including ones ineligible for a JUNAK", async () => {
    const { kurin, donePoint, lockedPoint } = await setup();
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    await request(app.getHttpServer())
      .post('/ai-assistant/messages')
      .set('Authorization', `Bearer ${token}`)
      .send({ probyPointId: donePoint.id, content: 'hi' })
      .expect((res) => expect([200, 201]).toContain(res.status));

    await request(app.getHttpServer())
      .post('/ai-assistant/messages')
      .set('Authorization', `Bearer ${token}`)
      .send({ probyPointId: lockedPoint.id, content: 'hi again' })
      .expect((res) => expect([200, 201]).toContain(res.status));

    expect(fakeOpenAiService.createChatCompletion).toHaveBeenCalledTimes(2);
  });

  it('returns 404 for a probyPointId belonging to a different kurin/program', async () => {
    const { kurin } = await setup();
    const otherProgram = await prisma.probyProgram.create({ data: { version: ProbyProgramVersion.OLD, name: 'Other program' } });
    const otherStage = await prisma.probyStage.create({ data: { programId: otherProgram.id, order: 1, name: 'Other stage' } });
    const otherCategory = await prisma.probyCategory.create({ data: { stageId: otherStage.id, name: 'Other category' } });
    const otherPoint = await prisma.probyPoint.create({
      data: { categoryId: otherCategory.id, order: 1, description: 'Other point' },
    });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, junak);

    await request(app.getHttpServer())
      .post('/ai-assistant/messages')
      .set('Authorization', `Bearer ${token}`)
      .send({ probyPointId: otherPoint.id, content: 'hi' })
      .expect(404);
  });

  it('rejects a message whose content exceeds the 4000-character cap (400)', async () => {
    const { kurin, openPoint } = await setup();
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    await prisma.junakProgress.create({
      data: { junakId: junak.id, pointId: openPoint.id, status: ProgressStatus.NOT_DONE },
    });
    const token = issueTokenFor(jwtService, junak);

    await request(app.getHttpServer())
      .post('/ai-assistant/messages')
      .set('Authorization', `Bearer ${token}`)
      .send({ probyPointId: openPoint.id, content: 'a'.repeat(4001) })
      .expect(400);

    expect(fakeOpenAiService.createChatCompletion).not.toHaveBeenCalled();
  });

  it('does not store an assistant message when the OpenAI call fails, but keeps the stored user message', async () => {
    const { kurin, openPoint } = await setup();
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, junak);
    fakeOpenAiService.createChatCompletion.mockRejectedValueOnce(new Error('upstream failure'));

    await request(app.getHttpServer())
      .post('/ai-assistant/messages')
      .set('Authorization', `Bearer ${token}`)
      .send({ probyPointId: openPoint.id, content: 'hi' })
      .expect(503);

    const conversationResponse = await request(app.getHttpServer())
      .get('/ai-assistant/conversation')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(conversationResponse.body.messages).toHaveLength(1);
    expect(conversationResponse.body.messages[0]).toMatchObject({ role: 'USER', content: 'hi' });
  });
});
