import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, Role, ProbyProgramVersion, ProgressStatus } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser, issueTokenFor } from './utils/fixtures';

describe('GET /hurtky/:id/board (e2e)', () => {
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

  it('lets an assigned vykhovnyk see the hurtok, its junaky, and their progress', async () => {
    const { program, points } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const hurtok = await prisma.hurtok.create({ data: { name: 'Орлики', kurinId: kurin.id } });
    const vykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    await prisma.vykhovnykHurtok.create({ data: { vykhovnykId: vykhovnyk.id, hurtokId: hurtok.id } });
    const junak = await createUser(prisma, {
      role: Role.JUNAK,
      kurinId: kurin.id,
      hurtokId: hurtok.id,
      password: 'x',
    });
    await prisma.junakProgress.create({
      data: { junakId: junak.id, pointId: points[0].id, status: ProgressStatus.DONE, confirmedById: vykhovnyk.id, confirmedAt: new Date() },
    });

    const token = issueTokenFor(jwtService, vykhovnyk);
    const response = await request(app.getHttpServer())
      .get(`/hurtky/${hurtok.id}/board`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.hurtok.id).toBe(hurtok.id);
    expect(response.body.junaky).toHaveLength(1);
    expect(response.body.junaky[0].id).toBe(junak.id);
    expect(response.body.junaky[0].passwordHash).toBeUndefined();
    expect(response.body.junaky[0].progress).toHaveLength(1);
    expect(response.body.junaky[0].progress[0].status).toBe(ProgressStatus.DONE);
    expect(response.body.junaky[0].progress[0].point.id).toBe(points[0].id);
  });

  it('returns 404 for a vykhovnyk not assigned to the hurtok', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const hurtok = await prisma.hurtok.create({ data: { name: 'Орлики', kurinId: kurin.id } });
    const vykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, vykhovnyk);

    await request(app.getHttpServer())
      .get(`/hurtky/${hurtok.id}/board`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('lets a zvyazkovyi view any hurtok board in their kurin', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const hurtok = await prisma.hurtok.create({ data: { name: 'Орлики', kurinId: kurin.id } });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    await request(app.getHttpServer())
      .get(`/hurtky/${hurtok.id}/board`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('forbids a kurinniy and a junak from viewing the board', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const hurtok = await prisma.hurtok.create({ data: { name: 'Орлики', kurinId: kurin.id } });
    const kurinniy = await createUser(prisma, { role: Role.KURINNYI, kurinId: kurin.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });

    await request(app.getHttpServer())
      .get(`/hurtky/${hurtok.id}/board`)
      .set('Authorization', `Bearer ${issueTokenFor(jwtService, kurinniy)}`)
      .expect(403);

    await request(app.getHttpServer())
      .get(`/hurtky/${hurtok.id}/board`)
      .set('Authorization', `Bearer ${issueTokenFor(jwtService, junak)}`)
      .expect(403);
  });

  it('returns 404 for a hurtok from another kurin', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurinA = await createKurin(prisma, { probyProgramId: program.id, name: 'A' });
    const kurinB = await createKurin(prisma, { probyProgramId: program.id, name: 'B' });
    const hurtokB = await prisma.hurtok.create({ data: { name: 'HB', kurinId: kurinB.id } });
    const zvyazkovyiA = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurinA.id });
    const token = issueTokenFor(jwtService, zvyazkovyiA);

    await request(app.getHttpServer())
      .get(`/hurtky/${hurtokB.id}/board`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('returns 401 without a token', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const hurtok = await prisma.hurtok.create({ data: { name: 'Орлики', kurinId: kurin.id } });

    await request(app.getHttpServer()).get(`/hurtky/${hurtok.id}/board`).expect(401);
  });
});
