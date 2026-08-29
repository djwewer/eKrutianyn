import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, Role, ProbyProgramVersion, ProgressStatus, ProgressAction } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser, issueTokenFor } from './utils/fixtures';

describe('Proby progress confirm (e2e)', () => {
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
    const { program, points } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const hurtok = await prisma.hurtok.create({ data: { name: 'Орлики', kurinId: kurin.id } });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id, hurtokId: hurtok.id });
    return { kurin, hurtok, junak, points };
  }

  it('lets an assigned vykhovnyk confirm a point and logs it', async () => {
    const { junak, hurtok, kurin, points } = await setup();
    const vykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    await prisma.vykhovnykHurtok.create({ data: { vykhovnykId: vykhovnyk.id, hurtokId: hurtok.id } });
    const token = issueTokenFor(jwtService, vykhovnyk);

    const response = await request(app.getHttpServer())
      .post(`/junaky/${junak.id}/progress/${points[0].id}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    expect(response.body.status).toBe(ProgressStatus.DONE);
    expect(response.body.confirmedById).toBe(vykhovnyk.id);

    const auditEntries = await prisma.progressAuditLog.findMany({ where: { junakId: junak.id } });
    expect(auditEntries).toHaveLength(1);
    expect(auditEntries[0].action).toBe(ProgressAction.CONFIRM);
    expect(auditEntries[0].actorId).toBe(vykhovnyk.id);
  });

  it('forbids an unassigned vykhovnyk from confirming', async () => {
    const { junak, kurin, points } = await setup();
    const unassignedVykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, unassignedVykhovnyk);

    await request(app.getHttpServer())
      .post(`/junaky/${junak.id}/progress/${points[0].id}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('forbids a zvyazkovyi from confirming (only vykhovnyk can)', async () => {
    const { junak, kurin, points } = await setup();
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    await request(app.getHttpServer())
      .post(`/junaky/${junak.id}/progress/${points[0].id}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('is idempotent: confirming an already-DONE point keeps a single progress row', async () => {
    const { junak, hurtok, kurin, points } = await setup();
    const vykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    await prisma.vykhovnykHurtok.create({ data: { vykhovnykId: vykhovnyk.id, hurtokId: hurtok.id } });
    const token = issueTokenFor(jwtService, vykhovnyk);

    await request(app.getHttpServer())
      .post(`/junaky/${junak.id}/progress/${points[0].id}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/junaky/${junak.id}/progress/${points[0].id}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    const rows = await prisma.junakProgress.findMany({ where: { junakId: junak.id, pointId: points[0].id } });
    expect(rows).toHaveLength(1);
  });

  it('returns 404 when the pointId does not exist', async () => {
    const { junak, hurtok, kurin } = await setup();
    const vykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    await prisma.vykhovnykHurtok.create({ data: { vykhovnykId: vykhovnyk.id, hurtokId: hurtok.id } });
    const token = issueTokenFor(jwtService, vykhovnyk);

    await request(app.getHttpServer())
      .post(`/junaky/${junak.id}/progress/00000000-0000-0000-0000-000000000000/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('lets any vykhovnyk in the kurin confirm a point for a hurtokless kurinnyi', async () => {
    const { program, points } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const hurtok = await prisma.hurtok.create({ data: { name: 'Орлики', kurinId: kurin.id } });
    const kurinnyi = await createUser(prisma, { role: Role.KURINNYI, kurinId: kurin.id });
    const vykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    await prisma.vykhovnykHurtok.create({ data: { vykhovnykId: vykhovnyk.id, hurtokId: hurtok.id } });
    const token = issueTokenFor(jwtService, vykhovnyk);

    const response = await request(app.getHttpServer())
      .post(`/junaky/${kurinnyi.id}/progress/${points[0].id}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    expect(response.body.status).toBe(ProgressStatus.DONE);
  });

  it('forbids a vykhovnyk from another kurin from confirming a point for a kurinnyi', async () => {
    const { program, points } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurinA = await createKurin(prisma, { probyProgramId: program.id, name: 'A' });
    const kurinB = await createKurin(prisma, { probyProgramId: program.id, name: 'B' });
    const kurinnyiA = await createUser(prisma, { role: Role.KURINNYI, kurinId: kurinA.id });
    const hurtokB = await prisma.hurtok.create({ data: { name: 'B', kurinId: kurinB.id } });
    const vykhovnykB = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurinB.id });
    await prisma.vykhovnykHurtok.create({ data: { vykhovnykId: vykhovnykB.id, hurtokId: hurtokB.id } });
    const token = issueTokenFor(jwtService, vykhovnykB);

    await request(app.getHttpServer())
      .post(`/junaky/${kurinnyiA.id}/progress/${points[0].id}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });
});
