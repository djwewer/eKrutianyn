import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, Role, ProbyProgramVersion, ProgressStatus } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createKurin, createUser, issueTokenFor } from './utils/fixtures';

describe('Proby progress confirm/unconfirm stage guard (e2e)', () => {
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
    const program = await prisma.probyProgram.create({ data: { version: ProbyProgramVersion.NEW, name: 'Test program' } });
    const stage1 = await prisma.probyStage.create({ data: { programId: program.id, order: 1, name: 'Stage 1' } });
    const category1 = await prisma.probyCategory.create({ data: { stageId: stage1.id, name: 'Category 1' } });
    const point1 = await prisma.probyPoint.create({ data: { categoryId: category1.id, order: 1, description: 'Point 1' } });
    const stage2 = await prisma.probyStage.create({ data: { programId: program.id, order: 2, name: 'Stage 2' } });
    const category2 = await prisma.probyCategory.create({ data: { stageId: stage2.id, name: 'Category 2' } });
    const point2 = await prisma.probyPoint.create({ data: { categoryId: category2.id, order: 1, description: 'Point 2' } });

    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const hurtok = await prisma.hurtok.create({ data: { name: 'Орлики', kurinId: kurin.id } });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id, hurtokId: hurtok.id });
    const vykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    await prisma.vykhovnykHurtok.create({ data: { vykhovnykId: vykhovnyk.id, hurtokId: hurtok.id } });
    const token = issueTokenFor(jwtService, vykhovnyk);

    return { junak, token, stage1, stage2, point1, point2 };
  }

  it('forbids confirming a point in a stage that is still locked', async () => {
    const { junak, token, point2 } = await setup();

    await request(app.getHttpServer())
      .post(`/junaky/${junak.id}/progress/${point2.id}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('lets confirming a point in a closed-with-debt stage (still OPEN)', async () => {
    const { junak, token, stage1, point1 } = await setup();

    await request(app.getHttpServer())
      .post(`/junaky/${junak.id}/progress/stages/${stage1.id}/close`)
      .set('Authorization', `Bearer ${token}`)
      .expect((res) => expect([200, 201]).toContain(res.status));

    await request(app.getHttpServer())
      .post(`/junaky/${junak.id}/progress/${point1.id}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .expect((res) => expect([200, 201]).toContain(res.status));
  });

  it('lets confirming a point in the newly-unlocked next stage', async () => {
    const { junak, token, stage1, point2 } = await setup();

    await request(app.getHttpServer())
      .post(`/junaky/${junak.id}/progress/stages/${stage1.id}/close`)
      .set('Authorization', `Bearer ${token}`)
      .expect((res) => expect([200, 201]).toContain(res.status));

    await request(app.getHttpServer())
      .post(`/junaky/${junak.id}/progress/${point2.id}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .expect((res) => expect([200, 201]).toContain(res.status));
  });

  it('forbids confirming (and unconfirming) a point in an auto-locked (CLOSED) stage', async () => {
    const { junak, token, stage1, point1 } = await setup();

    await request(app.getHttpServer())
      .post(`/junaky/${junak.id}/progress/${point1.id}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .expect((res) => expect([200, 201]).toContain(res.status));

    await request(app.getHttpServer())
      .post(`/junaky/${junak.id}/progress/stages/${stage1.id}/close`)
      .set('Authorization', `Bearer ${token}`)
      .expect((res) => expect([200, 201]).toContain(res.status));

    // Stage 1 is now closed AND fully done => CLOSED (auto-locked, read-only).
    await request(app.getHttpServer())
      .post(`/junaky/${junak.id}/progress/${point1.id}/unconfirm`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('GET /progress returns correct LOCKED/OPEN status for a fresh junak', async () => {
    const { junak, token, stage1, stage2 } = await setup();

    const response = await request(app.getHttpServer())
      .get(`/junaky/${junak.id}/progress`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const statusByStageId = new Map(response.body.stages.map((s: { stageId: string; status: string }) => [s.stageId, s.status]));
    expect(statusByStageId.get(stage1.id)).toBe('OPEN');
    expect(statusByStageId.get(stage2.id)).toBe('LOCKED');
  });

  it('GET /progress returns CLOSED status once a stage is closed and fully done', async () => {
    const { junak, token, stage1, point1 } = await setup();

    await prisma.junakProgress.create({ data: { junakId: junak.id, pointId: point1.id, status: ProgressStatus.DONE } });
    await request(app.getHttpServer())
      .post(`/junaky/${junak.id}/progress/stages/${stage1.id}/close`)
      .set('Authorization', `Bearer ${token}`)
      .expect((res) => expect([200, 201]).toContain(res.status));

    const response = await request(app.getHttpServer())
      .get(`/junaky/${junak.id}/progress`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const statusByStageId = new Map(response.body.stages.map((s: { stageId: string; status: string }) => [s.stageId, s.status]));
    expect(statusByStageId.get(stage1.id)).toBe('CLOSED');
  });

  it('GET /progress reports hasDebt when a stage is closed but not fully done', async () => {
    const { junak, token, stage1 } = await setup();

    await request(app.getHttpServer())
      .post(`/junaky/${junak.id}/progress/stages/${stage1.id}/close`)
      .set('Authorization', `Bearer ${token}`)
      .expect((res) => expect([200, 201]).toContain(res.status));

    const response = await request(app.getHttpServer())
      .get(`/junaky/${junak.id}/progress`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const stage1Info = response.body.stages.find((s: { stageId: string }) => s.stageId === stage1.id);
    expect(stage1Info.status).toBe('OPEN');
    expect(stage1Info.hasDebt).toBe(true);
  });

  it('GET /progress reports hasDebt as false for a never-closed stage', async () => {
    const { junak, token, stage1 } = await setup();

    const response = await request(app.getHttpServer())
      .get(`/junaky/${junak.id}/progress`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const stage1Info = response.body.stages.find((s: { stageId: string }) => s.stageId === stage1.id);
    expect(stage1Info.status).toBe('OPEN');
    expect(stage1Info.hasDebt).toBe(false);
  });
});
