import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, ProbyProgramVersion, Role, PositionScope, PositionType } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createKurin, createUser, createKurinniyUser, issueTokenFor } from './utils/fixtures';

describe('Junak degrees — dates, current degree, editing (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_TEST } } });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
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
  });

  async function setup() {
    const program = await prisma.probyProgram.create({ data: { version: ProbyProgramVersion.OLD, name: 'P' } });
    const stages = [];
    for (const [i, name] of ['Проба прихильника (Відзнака)', 'Проба учасника (Скобине крило)', 'Проба розвідувача (Скобиний хват)'].entries()) {
      const stage = await prisma.probyStage.create({ data: { programId: program.id, order: i + 1, name } });
      const category = await prisma.probyCategory.create({ data: { stageId: stage.id, name: 'C' } });
      await prisma.probyPoint.create({ data: { categoryId: category.id, order: 1, description: 'Точка' } });
      stages.push(stage);
    }
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    return { kurin, stages, zvyazkovyi, junak, token: issueTokenFor(jwtService, zvyazkovyi) };
  }

  async function giveSuddiaPosition(kurinId: string) {
    const suddya = await createUser(prisma, { role: Role.JUNAK, kurinId });
    await prisma.kurinPosition.create({
      data: { kurinId, scope: PositionScope.KURIN, positionType: PositionType.SUDDIA, userId: suddya.id, assignedById: suddya.id },
    });
    return suddya;
  }

  const earned = (junakId: string, stageId: string, iso: string, reopened = false) =>
    prisma.junakStageProgress.create({
      data: {
        junakId,
        stageId,
        firstClosedAt: new Date(iso),
        closedAt: reopened ? null : new Date(iso),
        closedById: junakId,
      },
    });

  describe('GET /users/:id/degrees', () => {
    it('shows no degree for a junak who has earned none', async () => {
      const { junak, token } = await setup();
      const res = await request(app.getHttpServer()).get(`/users/${junak.id}/degrees`).set('Authorization', `Bearer ${token}`).expect(200);
      expect(res.body).toEqual({
        dates: { PRYHYLNYK: null, UCHASNYK: null, ROZVIDUVACH: null, SKOB: null },
        current: null,
        currentLabel: null,
      });
    });

    it('makes the current degree the highest earned one, so a junak with a Розвідувач date is a Розвідувач', async () => {
      const { junak, stages, token } = await setup();
      await earned(junak.id, stages[0].id, '2023-05-10T00:00:00.000Z');
      await earned(junak.id, stages[1].id, '2024-03-02T00:00:00.000Z');
      await earned(junak.id, stages[2].id, '2025-06-21T00:00:00.000Z');

      const res = await request(app.getHttpServer()).get(`/users/${junak.id}/degrees`).set('Authorization', `Bearer ${token}`).expect(200);

      expect(res.body.dates).toEqual({
        PRYHYLNYK: '2023-05-10',
        UCHASNYK: '2024-03-02',
        ROZVIDUVACH: '2025-06-21',
        SKOB: null,
      });
      expect(res.body.current).toBe('ROZVIDUVACH');
      expect(res.body.currentLabel).toBe('Розвідувач');
    });

    it('does not take a degree away when its stage is reopened', async () => {
      const { junak, stages, token } = await setup();
      await earned(junak.id, stages[0].id, '2023-05-10T00:00:00.000Z', true);

      const res = await request(app.getHttpServer()).get(`/users/${junak.id}/degrees`).set('Authorization', `Bearer ${token}`).expect(200);

      expect(res.body.current).toBe('PRYHYLNYK');
    });

    it('treats a Скоб date as the highest degree', async () => {
      const { junak, stages, token } = await setup();
      await earned(junak.id, stages[2].id, '2025-06-21T00:00:00.000Z');
      await prisma.user.update({ where: { id: junak.id }, data: { skobDate: new Date('2026-01-15T00:00:00.000Z') } });

      const res = await request(app.getHttpServer()).get(`/users/${junak.id}/degrees`).set('Authorization', `Bearer ${token}`).expect(200);

      expect(res.body.dates.SKOB).toBe('2026-01-15');
      expect(res.body.currentLabel).toBe('Скоб');
    });

    it("hides another kurin's junak and lets the judge read degrees", async () => {
      const { kurin, junak, token } = await setup();
      const otherProgram = await prisma.probyProgram.create({ data: { version: ProbyProgramVersion.OLD, name: 'Other' } });
      const otherKurin = await createKurin(prisma, { probyProgramId: otherProgram.id });
      const foreign = await createUser(prisma, { role: Role.JUNAK, kurinId: otherKurin.id });
      const suddya = await giveSuddiaPosition(kurin.id);

      await request(app.getHttpServer()).get(`/users/${foreign.id}/degrees`).set('Authorization', `Bearer ${token}`).expect(404);
      await request(app.getHttpServer())
        .get(`/users/${junak.id}/degrees`)
        .set('Authorization', `Bearer ${issueTokenFor(jwtService, suddya)}`)
        .expect(200);
    });
  });

  describe('PUT /users/:id/degrees/:key', () => {
    const put = (junakId: string, key: string, token: string, date: string | null) =>
      request(app.getHttpServer()).put(`/users/${junakId}/degrees/${key}`).set('Authorization', `Bearer ${token}`).send({ date });

    it('corrects the date of an earned degree, and keeps the closed timestamp in step', async () => {
      const { junak, stages, token } = await setup();
      const progress = await earned(junak.id, stages[0].id, '2023-05-10T00:00:00.000Z');

      const res = await put(junak.id, 'PRYHYLNYK', token, '2023-04-01').expect(200);

      expect(res.body.dates.PRYHYLNYK).toBe('2023-04-01');
      const stored = await prisma.junakStageProgress.findUnique({ where: { id: progress.id } });
      expect(stored?.firstClosedAt?.toISOString()).toBe('2023-04-01T00:00:00.000Z');
      expect(stored?.closedAt?.toISOString()).toBe('2023-04-01T00:00:00.000Z');
    });

    it('does not re-close a currently reopened stage when its earned date is corrected', async () => {
      const { junak, stages, token } = await setup();
      const progress = await earned(junak.id, stages[0].id, '2023-05-10T00:00:00.000Z', true);

      await put(junak.id, 'PRYHYLNYK', token, '2023-04-01').expect(200);

      const stored = await prisma.junakStageProgress.findUnique({ where: { id: progress.id } });
      expect(stored?.closedAt).toBeNull();
      expect(stored?.firstClosedAt?.toISOString()).toBe('2023-04-01T00:00:00.000Z');
    });

    it('refuses to set the date of a degree whose proby was never closed', async () => {
      const { junak, token } = await setup();
      const res = await put(junak.id, 'UCHASNYK', token, '2024-01-01').expect(400);
      expect(res.body.message).toContain('закрийте пробу');
    });

    it('sets and clears the Скоб date', async () => {
      const { junak, token } = await setup();

      const set = await put(junak.id, 'SKOB', token, '2026-02-03').expect(200);
      expect(set.body.dates.SKOB).toBe('2026-02-03');
      expect(set.body.current).toBe('SKOB');

      const cleared = await put(junak.id, 'SKOB', token, null).expect(200);
      expect(cleared.body.dates.SKOB).toBeNull();
      expect(cleared.body.current).toBeNull();
    });

    it('rejects a date in the future, a malformed date, an unknown degree and clearing a proby degree', async () => {
      const { junak, stages, token } = await setup();
      await earned(junak.id, stages[0].id, '2023-05-10T00:00:00.000Z');

      await put(junak.id, 'SKOB', token, '2999-01-01').expect(400);
      await put(junak.id, 'SKOB', token, 'вчора').expect(400);
      await put(junak.id, 'MAGISTER', token, '2024-01-01').expect(400);
      await put(junak.id, 'PRYHYLNYK', token, null).expect(400);
    });

    it('lets the judge, kurinniy and an assigned vykhovnyk edit proby dates, but not a plain junak or an unassigned vykhovnyk', async () => {
      const { kurin, junak, stages, token: zvToken } = await setup();
      await earned(junak.id, stages[0].id, '2023-05-10T00:00:00.000Z');
      const hurtok = await prisma.hurtok.create({ data: { name: 'Орли', kurinId: kurin.id } });
      await prisma.user.update({ where: { id: junak.id }, data: { hurtokId: hurtok.id } });
      const suddya = await giveSuddiaPosition(kurin.id);
      const kurinnyi = await createKurinniyUser(prisma, { kurinId: kurin.id });
      const assigned = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
      await prisma.vykhovnykHurtok.create({ data: { vykhovnykId: assigned.id, hurtokId: hurtok.id } });
      const stranger = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
      const plain = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });

      for (const who of [suddya, kurinnyi, assigned]) {
        await put(junak.id, 'PRYHYLNYK', issueTokenFor(jwtService, who), '2023-05-11').expect(200);
      }
      await put(junak.id, 'PRYHYLNYK', issueTokenFor(jwtService, stranger), '2023-05-12').expect(403);
      await put(junak.id, 'PRYHYLNYK', issueTokenFor(jwtService, plain), '2023-05-12').expect(403);
      await put(junak.id, 'PRYHYLNYK', zvToken, '2023-05-13').expect(200);
    });

    it('lets a vykhovnyk correct proby dates but not the Скоб date', async () => {
      const { kurin, junak } = await setup();
      const hurtok = await prisma.hurtok.create({ data: { name: 'Орли', kurinId: kurin.id } });
      await prisma.user.update({ where: { id: junak.id }, data: { hurtokId: hurtok.id } });
      const vykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
      await prisma.vykhovnykHurtok.create({ data: { vykhovnykId: vykhovnyk.id, hurtokId: hurtok.id } });

      await put(junak.id, 'SKOB', issueTokenFor(jwtService, vykhovnyk), '2026-01-01').expect(403);
    });

    it('refuses to edit an archived junak', async () => {
      const { junak, token } = await setup();
      await prisma.user.update({ where: { id: junak.id }, data: { archivedAt: new Date() } });
      await put(junak.id, 'SKOB', token, '2026-01-01').expect(400);
    });
  });

  describe('closing a stage with a chosen date', () => {
    it('uses the given date as the date the degree was earned', async () => {
      const { junak, stages, token } = await setup();

      await request(app.getHttpServer())
        .post(`/junaky/${junak.id}/progress/stages/${stages[0].id}/close`)
        .set('Authorization', `Bearer ${token}`)
        .send({ date: '2024-09-01' })
        .expect((res) => expect([200, 201]).toContain(res.status));

      const res = await request(app.getHttpServer()).get(`/users/${junak.id}/degrees`).set('Authorization', `Bearer ${token}`).expect(200);
      expect(res.body.dates.PRYHYLNYK).toBe('2024-09-01');
      expect(res.body.current).toBe('PRYHYLNYK');
    });

    it('still closes with today when no date is given, and rejects a future date', async () => {
      const { junak, stages, token } = await setup();

      await request(app.getHttpServer())
        .post(`/junaky/${junak.id}/progress/stages/${stages[0].id}/close`)
        .set('Authorization', `Bearer ${token}`)
        .send({ date: '2999-01-01' })
        .expect(400);

      await request(app.getHttpServer())
        .post(`/junaky/${junak.id}/progress/stages/${stages[0].id}/close`)
        .set('Authorization', `Bearer ${token}`)
        .expect((res) => expect([200, 201]).toContain(res.status));
      const res = await request(app.getHttpServer()).get(`/users/${junak.id}/degrees`).set('Authorization', `Bearer ${token}`).expect(200);
      expect(res.body.dates.PRYHYLNYK).toBe(new Date().toISOString().slice(0, 10));
    });
  });
});
