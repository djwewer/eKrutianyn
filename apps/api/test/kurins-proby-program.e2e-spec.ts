import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, Role, ProbyProgramVersion, ProgressStatus, ProgressAction } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser, createKurinniyUser, issueTokenFor } from './utils/fixtures';

describe('Kurin proby-program change (e2e)', () => {
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

  it('carries over a DONE point via the mapping and preserves the old record', async () => {
    const oldTree = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Вузли (стара)']);
    const newTree = await createProbyProgramTree(prisma, ProbyProgramVersion.NEW, ['Вузли (нова)']);
    await prisma.pointMapping.create({
      data: { oldPointId: oldTree.points[0].id, newPointId: newTree.points[0].id },
    });
    const kurin = await createKurin(prisma, { probyProgramId: oldTree.program.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const vykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    await prisma.junakProgress.create({
      data: {
        junakId: junak.id,
        pointId: oldTree.points[0].id,
        status: ProgressStatus.DONE,
        confirmedById: vykhovnyk.id,
        confirmedAt: new Date(),
      },
    });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    const response = await request(app.getHttpServer())
      .patch(`/kurins/${kurin.id}/proby-program`)
      .set('Authorization', `Bearer ${token}`)
      .send({ version: ProbyProgramVersion.NEW })
      .expect(200);

    expect(response.body.probyProgramId).toBe(newTree.program.id);

    const newProgress = await prisma.junakProgress.findUnique({
      where: { junakId_pointId: { junakId: junak.id, pointId: newTree.points[0].id } },
    });
    expect(newProgress?.status).toBe(ProgressStatus.DONE);
    expect(newProgress?.transferredFromPointId).toBe(oldTree.points[0].id);

    const oldProgress = await prisma.junakProgress.findUnique({
      where: { junakId_pointId: { junakId: junak.id, pointId: oldTree.points[0].id } },
    });
    expect(oldProgress?.status).toBe(ProgressStatus.DONE);

    const auditEntries = await prisma.progressAuditLog.findMany({
      where: { junakId: junak.id, pointId: newTree.points[0].id },
    });
    expect(auditEntries).toHaveLength(1);
    expect(auditEntries[0].action).toBe(ProgressAction.CONFIRM);
    expect(auditEntries[0].actorId).toBe(zvyazkovyi.id);
  });

  it("carries over a kurinnyi's DONE point via the mapping, same as a junak's", async () => {
    const oldTree = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Вузли (стара)']);
    const newTree = await createProbyProgramTree(prisma, ProbyProgramVersion.NEW, ['Вузли (нова)']);
    await prisma.pointMapping.create({
      data: { oldPointId: oldTree.points[0].id, newPointId: newTree.points[0].id },
    });
    const kurin = await createKurin(prisma, { probyProgramId: oldTree.program.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const kurinnyi = await createKurinniyUser(prisma, { kurinId: kurin.id });
    await prisma.junakProgress.create({
      data: { junakId: kurinnyi.id, pointId: oldTree.points[0].id, status: ProgressStatus.DONE },
    });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    await request(app.getHttpServer())
      .patch(`/kurins/${kurin.id}/proby-program`)
      .set('Authorization', `Bearer ${token}`)
      .send({ version: ProbyProgramVersion.NEW })
      .expect(200);

    const newProgress = await prisma.junakProgress.findUnique({
      where: { junakId_pointId: { junakId: kurinnyi.id, pointId: newTree.points[0].id } },
    });
    expect(newProgress?.status).toBe(ProgressStatus.DONE);
    expect(newProgress?.transferredFromPointId).toBe(oldTree.points[0].id);
  });

  it('leaves an unmapped DONE point untouched with no new row created', async () => {
    const oldTree = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, [
      'Мандрівка (без відповідника)',
    ]);
    const newTree = await createProbyProgramTree(prisma, ProbyProgramVersion.NEW, ['Щось інше']);
    const kurin = await createKurin(prisma, { probyProgramId: oldTree.program.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    await prisma.junakProgress.create({
      data: { junakId: junak.id, pointId: oldTree.points[0].id, status: ProgressStatus.DONE },
    });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    await request(app.getHttpServer())
      .patch(`/kurins/${kurin.id}/proby-program`)
      .set('Authorization', `Bearer ${token}`)
      .send({ version: ProbyProgramVersion.NEW })
      .expect(200);

    const allProgress = await prisma.junakProgress.findMany({ where: { junakId: junak.id } });
    expect(allProgress).toHaveLength(1);
    expect(allProgress[0].pointId).toBe(oldTree.points[0].id);
  });

  it('does not overwrite a target point that was already independently confirmed', async () => {
    const oldTree = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Вузли (стара)']);
    const newTree = await createProbyProgramTree(prisma, ProbyProgramVersion.NEW, ['Вузли (нова)']);
    await prisma.pointMapping.create({
      data: { oldPointId: oldTree.points[0].id, newPointId: newTree.points[0].id },
    });
    const kurin = await createKurin(prisma, { probyProgramId: oldTree.program.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const originalConfirmer = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    await prisma.junakProgress.create({
      data: { junakId: junak.id, pointId: oldTree.points[0].id, status: ProgressStatus.DONE },
    });
    await prisma.junakProgress.create({
      data: {
        junakId: junak.id,
        pointId: newTree.points[0].id,
        status: ProgressStatus.DONE,
        confirmedById: originalConfirmer.id,
        confirmedAt: new Date('2025-01-01'),
      },
    });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    await request(app.getHttpServer())
      .patch(`/kurins/${kurin.id}/proby-program`)
      .set('Authorization', `Bearer ${token}`)
      .send({ version: ProbyProgramVersion.NEW })
      .expect(200);

    const targetProgress = await prisma.junakProgress.findUnique({
      where: { junakId_pointId: { junakId: junak.id, pointId: newTree.points[0].id } },
    });
    expect(targetProgress?.confirmedById).toBe(originalConfirmer.id);
  });

  it('returns 403 when a zvyazkovyi targets another kurin', async () => {
    const oldTree = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point']);
    const newTree = await createProbyProgramTree(prisma, ProbyProgramVersion.NEW, ['Point']);
    const kurinA = await createKurin(prisma, { probyProgramId: oldTree.program.id, name: 'A' });
    const kurinB = await createKurin(prisma, { probyProgramId: oldTree.program.id, name: 'B' });
    const zvyazkovyiA = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurinA.id });
    const token = issueTokenFor(jwtService, zvyazkovyiA);

    await request(app.getHttpServer())
      .patch(`/kurins/${kurinB.id}/proby-program`)
      .set('Authorization', `Bearer ${token}`)
      .send({ version: ProbyProgramVersion.NEW })
      .expect(403);
  });

  it('returns 403 for a non-zvyazkovyi role', async () => {
    const oldTree = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point']);
    const newTree = await createProbyProgramTree(prisma, ProbyProgramVersion.NEW, ['Point']);
    const kurin = await createKurin(prisma, { probyProgramId: oldTree.program.id });
    const vykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, vykhovnyk);

    await request(app.getHttpServer())
      .patch(`/kurins/${kurin.id}/proby-program`)
      .set('Authorization', `Bearer ${token}`)
      .send({ version: ProbyProgramVersion.NEW })
      .expect(403);
  });
});
