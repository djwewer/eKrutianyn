import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, Role, ProbyProgramVersion, ProgressStatus } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createKurin, createUser, issueTokenFor } from './utils/fixtures';

describe('Proby stage lock (e2e)', () => {
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
    const program = await prisma.probyProgram.create({ data: { version: ProbyProgramVersion.OLD, name: 'Test program' } });
    const stage1 = await prisma.probyStage.create({ data: { programId: program.id, order: 1, name: 'Stage 1' } });
    const category1 = await prisma.probyCategory.create({ data: { stageId: stage1.id, name: 'Category 1' } });
    const point1a = await prisma.probyPoint.create({ data: { categoryId: category1.id, order: 1, description: 'Point 1a' } });
    const point1b = await prisma.probyPoint.create({ data: { categoryId: category1.id, order: 2, description: 'Point 1b' } });
    const stage2 = await prisma.probyStage.create({ data: { programId: program.id, order: 2, name: 'Stage 2' } });
    const category2 = await prisma.probyCategory.create({ data: { stageId: stage2.id, name: 'Category 2' } });
    const point2a = await prisma.probyPoint.create({ data: { categoryId: category2.id, order: 1, description: 'Point 2a' } });

    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const hurtok = await prisma.hurtok.create({ data: { name: 'Орлики', kurinId: kurin.id } });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id, hurtokId: hurtok.id });
    const vykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    await prisma.vykhovnykHurtok.create({ data: { vykhovnykId: vykhovnyk.id, hurtokId: hurtok.id } });
    const token = issueTokenFor(jwtService, vykhovnyk);

    return { kurin, hurtok, junak, vykhovnyk, token, stage1, stage2, point1a, point1b, point2a };
  }

  it('forbids closing a stage that is not yet reachable', async () => {
    const { junak, token, stage2 } = await setup();

    await request(app.getHttpServer())
      .post(`/junaky/${junak.id}/progress/stages/${stage2.id}/close`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('lets an assigned vykhovnyk close the first stage even with incomplete points, unlocking the next stage', async () => {
    const { junak, token, stage1, stage2 } = await setup();

    await request(app.getHttpServer())
      .post(`/junaky/${junak.id}/progress/stages/${stage1.id}/close`)
      .set('Authorization', `Bearer ${token}`)
      .expect((res) => expect([200, 201]).toContain(res.status));

    await request(app.getHttpServer())
      .post(`/junaky/${junak.id}/progress/stages/${stage2.id}/close`)
      .set('Authorization', `Bearer ${token}`)
      .expect((res) => expect([200, 201]).toContain(res.status));
  });

  it('forbids reopening a stage that was closed with debt (not fully done)', async () => {
    const { junak, token, stage1 } = await setup();

    await request(app.getHttpServer())
      .post(`/junaky/${junak.id}/progress/stages/${stage1.id}/close`)
      .set('Authorization', `Bearer ${token}`)
      .expect((res) => expect([200, 201]).toContain(res.status));

    await request(app.getHttpServer())
      .post(`/junaky/${junak.id}/progress/stages/${stage1.id}/reopen`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('forbids reopening a stage that was never closed', async () => {
    const { junak, token, stage1 } = await setup();

    await request(app.getHttpServer())
      .post(`/junaky/${junak.id}/progress/stages/${stage1.id}/reopen`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('lets an assigned vykhovnyk reopen a fully-closed stage without re-locking the next one', async () => {
    const { junak, token, stage1, stage2, point1a, point1b } = await setup();

    await prisma.junakProgress.create({ data: { junakId: junak.id, pointId: point1a.id, status: ProgressStatus.DONE } });
    await prisma.junakProgress.create({ data: { junakId: junak.id, pointId: point1b.id, status: ProgressStatus.DONE } });

    await request(app.getHttpServer())
      .post(`/junaky/${junak.id}/progress/stages/${stage1.id}/close`)
      .set('Authorization', `Bearer ${token}`)
      .expect((res) => expect([200, 201]).toContain(res.status));

    // Stage 1 is now closed AND fully done => CLOSED status. Reopen must succeed.
    await request(app.getHttpServer())
      .post(`/junaky/${junak.id}/progress/stages/${stage1.id}/reopen`)
      .set('Authorization', `Bearer ${token}`)
      .expect((res) => expect([200, 201]).toContain(res.status));

    // Stage 2 must still be reachable — reopening stage 1 must not re-lock it.
    await request(app.getHttpServer())
      .post(`/junaky/${junak.id}/progress/stages/${stage2.id}/close`)
      .set('Authorization', `Bearer ${token}`)
      .expect((res) => expect([200, 201]).toContain(res.status));
  });

  it('forbids an unassigned vykhovnyk from closing a stage', async () => {
    const { junak, kurin, stage1 } = await setup();
    const unassignedVykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, unassignedVykhovnyk);

    await request(app.getHttpServer())
      .post(`/junaky/${junak.id}/progress/stages/${stage1.id}/close`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('returns 404 when the stageId does not exist', async () => {
    const { junak, token } = await setup();

    await request(app.getHttpServer())
      .post(`/junaky/${junak.id}/progress/stages/00000000-0000-0000-0000-000000000000/close`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('returns 404 when closing a stage that belongs to a different kurin\'s program', async () => {
    const { junak, token } = await setup();
    const otherProgram = await prisma.probyProgram.create({ data: { version: ProbyProgramVersion.OLD, name: 'Other program' } });
    const foreignStage = await prisma.probyStage.create({ data: { programId: otherProgram.id, order: 1, name: 'Foreign stage' } });

    await request(app.getHttpServer())
      .post(`/junaky/${junak.id}/progress/stages/${foreignStage.id}/close`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('is idempotent: closing an already-closed stage keeps firstClosedAt unchanged', async () => {
    const { junak, token, stage1 } = await setup();

    await request(app.getHttpServer())
      .post(`/junaky/${junak.id}/progress/stages/${stage1.id}/close`)
      .set('Authorization', `Bearer ${token}`)
      .expect((res) => expect([200, 201]).toContain(res.status));

    const firstRow = await prisma.junakStageProgress.findUnique({
      where: { junakId_stageId: { junakId: junak.id, stageId: stage1.id } },
    });

    await request(app.getHttpServer())
      .post(`/junaky/${junak.id}/progress/stages/${stage1.id}/close`)
      .set('Authorization', `Bearer ${token}`)
      .expect((res) => expect([200, 201]).toContain(res.status));

    const secondRow = await prisma.junakStageProgress.findUnique({
      where: { junakId_stageId: { junakId: junak.id, stageId: stage1.id } },
    });

    expect(secondRow?.firstClosedAt).toEqual(firstRow?.firstClosedAt);
  });
});
