import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, Role, ProbyProgramVersion, ProgressStatus, AuditAction } from '@prisma/client';
import { cleanDatabase } from './utils/clean-db';
import { bootApp } from './utils/boot-app';
import { createProbyProgramTree, createKurin, createUser, issueTokenFor } from './utils/fixtures';

describe('Audit events — Проба group (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_TEST } } });

  beforeAll(async () => {
    ({ app, jwtService } = await bootApp());
  });

  afterAll(async () => {
    await cleanDatabase(prisma);
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
  });

  async function setup(stageName = 'Stage 1') {
    const { program, stage, points } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    if (stageName !== stage.name) {
      await prisma.probyStage.update({ where: { id: stage.id }, data: { name: stageName } });
    }
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const hurtok = await prisma.hurtok.create({ data: { name: 'Орлики', kurinId: kurin.id } });
    const junak = await createUser(prisma, {
      role: Role.JUNAK,
      kurinId: kurin.id,
      hurtokId: hurtok.id,
    });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const zvyazkovyiToken = issueTokenFor(jwtService, zvyazkovyi);
    return { kurin, junak, stage, points, zvyazkovyi, zvyazkovyiToken };
  }

  it('logs closing and reopening a stage', async () => {
    const { kurin, junak, stage, points, zvyazkovyiToken, zvyazkovyi } = await setup();
    await prisma.junakProgress.create({
      data: { junakId: junak.id, pointId: points[0].id, status: ProgressStatus.DONE },
    });
    await request(app.getHttpServer())
      .post(`/junaky/${junak.id}/progress/stages/${stage.id}/close`)
      .set('Authorization', `Bearer ${zvyazkovyiToken}`)
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .post(`/junaky/${junak.id}/progress/stages/${stage.id}/reopen`)
      .set('Authorization', `Bearer ${zvyazkovyiToken}`)
      .expect(201);

    const entries = await prisma.auditLog.findMany({ where: { kurinId: kurin.id }, orderBy: { createdAt: 'asc' } });
    expect(entries.map((e) => e.action)).toEqual([AuditAction.PROBY_STAGE_CLOSED, AuditAction.PROBY_STAGE_REOPENED]);
    expect(entries[0]).toMatchObject({ actorId: zvyazkovyi.id, subjectUserId: junak.id, entityId: stage.id });
    expect(entries[0].details).toMatchObject({ stageName: 'Stage 1', subjectName: 'Test User' });
    expect((entries[0].details as any).closedAt).toEqual(expect.any(String));
    expect(entries[1]).toMatchObject({ actorId: zvyazkovyi.id, subjectUserId: junak.id, entityId: stage.id });
    expect(entries[1].details).toMatchObject({ stageName: 'Stage 1', subjectName: 'Test User' });
    expect(entries[1].details).not.toHaveProperty('closedAt');
  });

  it('logs a proby degree date change', async () => {
    const { kurin, junak, stage, points, zvyazkovyiToken, zvyazkovyi } = await setup('Проба прихильника (тест)');
    await prisma.junakProgress.create({
      data: { junakId: junak.id, pointId: points[0].id, status: ProgressStatus.DONE },
    });
    await request(app.getHttpServer())
      .post(`/junaky/${junak.id}/progress/stages/${stage.id}/close`)
      .set('Authorization', `Bearer ${zvyazkovyiToken}`)
      .send({})
      .expect(201);

    await request(app.getHttpServer())
      .put(`/users/${junak.id}/degrees/PRYHYLNYK`)
      .set('Authorization', `Bearer ${zvyazkovyiToken}`)
      .send({ date: '2024-03-01' })
      .expect(200);

    const entries = await prisma.auditLog.findMany({
      where: { kurinId: kurin.id, action: AuditAction.DEGREE_DATE_CHANGED },
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ actorId: zvyazkovyi.id, subjectUserId: junak.id });
    expect(entries[0].details).toEqual({ degree: 'PRYHYLNYK', subjectName: 'Test User', date: '2024-03-01' });
  });

  it('logs a SKOB degree date change and its removal', async () => {
    const { kurin, junak, zvyazkovyiToken, zvyazkovyi } = await setup();
    await request(app.getHttpServer())
      .put(`/users/${junak.id}/degrees/SKOB`)
      .set('Authorization', `Bearer ${zvyazkovyiToken}`)
      .send({ date: '2024-05-02' })
      .expect(200);
    await request(app.getHttpServer())
      .put(`/users/${junak.id}/degrees/SKOB`)
      .set('Authorization', `Bearer ${zvyazkovyiToken}`)
      .send({ date: null })
      .expect(200);

    const entries = await prisma.auditLog.findMany({
      where: { kurinId: kurin.id, action: AuditAction.DEGREE_DATE_CHANGED },
      orderBy: { createdAt: 'asc' },
    });
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ actorId: zvyazkovyi.id, subjectUserId: junak.id });
    expect(entries[0].details).toEqual({ degree: 'SKOB', subjectName: 'Test User', date: '2024-05-02' });
    expect(entries[1].details).toEqual({ degree: 'SKOB', subjectName: 'Test User', date: null });
  });

  it('logs the kurin proby program change as one summary event with the transfer count', async () => {
    const oldTree = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Вузли (стара)']);
    const newTree = await createProbyProgramTree(prisma, ProbyProgramVersion.NEW, ['Вузли (нова)']);
    await prisma.pointMapping.create({
      data: { oldPointId: oldTree.points[0].id, newPointId: newTree.points[0].id },
    });
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

    const entries = await prisma.auditLog.findMany({ where: { kurinId: kurin.id } });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      action: AuditAction.KURIN_PROBY_PROGRAM_CHANGED,
      actorId: zvyazkovyi.id,
      entityId: kurin.id,
    });
    expect(entries[0].details).toEqual({ from: 'OLD', to: 'NEW', transferredPoints: 1 });
  });

  it('does not log anything when the program is unchanged', async () => {
    const oldTree = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['P']);
    const kurin = await createKurin(prisma, { probyProgramId: oldTree.program.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    await request(app.getHttpServer())
      .patch(`/kurins/${kurin.id}/proby-program`)
      .set('Authorization', `Bearer ${issueTokenFor(jwtService, zvyazkovyi)}`)
      .send({ version: ProbyProgramVersion.OLD })
      .expect(200);
    expect(await prisma.auditLog.count({ where: { kurinId: kurin.id } })).toBe(0);
  });
});
