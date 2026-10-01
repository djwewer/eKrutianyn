import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, Role, ProbyProgramVersion } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser, createKurinSuddiaUser, issueTokenFor } from './utils/fixtures';

describe('Hurtok update (e2e)', () => {
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

  it('lets zvyazkovyi set the founding date of a hurtok', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const hurtok = await prisma.hurtok.create({ data: { name: 'Орлики', kurinId: kurin.id } });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    const response = await request(app.getHttpServer())
      .patch(`/hurtky/${hurtok.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ foundedAt: '2020-09-01' })
      .expect(200);

    expect(response.body.id).toBe(hurtok.id);
    const updated = await prisma.hurtok.findUnique({ where: { id: hurtok.id } });
    expect(updated?.foundedAt?.toISOString().slice(0, 10)).toBe('2020-09-01');
  });

  it('lets zvyazkovyi clear the founding date', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const hurtok = await prisma.hurtok.create({
      data: { name: 'Орлики', kurinId: kurin.id, foundedAt: new Date('2020-09-01') },
    });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    await request(app.getHttpServer())
      .patch(`/hurtky/${hurtok.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ foundedAt: null })
      .expect(200);

    const updated = await prisma.hurtok.findUnique({ where: { id: hurtok.id } });
    expect(updated?.foundedAt).toBeNull();
  });

  it('rejects an invalid date string', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const hurtok = await prisma.hurtok.create({ data: { name: 'Орлики', kurinId: kurin.id } });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    await request(app.getHttpServer())
      .patch(`/hurtky/${hurtok.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ foundedAt: 'not-a-date' })
      .expect(400);
  });

  it('forbids a non-zvyazkovyi from updating a hurtok', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const hurtok = await prisma.hurtok.create({ data: { name: 'Орлики', kurinId: kurin.id } });
    const vykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, vykhovnyk);

    await request(app.getHttpServer())
      .patch(`/hurtky/${hurtok.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ foundedAt: '2020-09-01' })
      .expect(403);
  });

  it('returns 404 for a hurtok in another kurin', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurinA = await createKurin(prisma, { probyProgramId: program.id, name: 'A' });
    const kurinB = await createKurin(prisma, { probyProgramId: program.id, name: 'B' });
    const hurtokB = await prisma.hurtok.create({ data: { name: 'Hurtok B', kurinId: kurinB.id } });
    const zvyazkovyiA = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurinA.id });
    const token = issueTokenFor(jwtService, zvyazkovyiA);

    await request(app.getHttpServer())
      .patch(`/hurtky/${hurtokB.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ foundedAt: '2020-09-01' })
      .expect(404);
  });

  it('lets a KURIN-scope suddia update a hurtok', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const hurtok = await prisma.hurtok.create({ data: { kurinId: kurin.id, name: 'Орлики' } });
    const suddia = await createKurinSuddiaUser(prisma, { kurinId: kurin.id });
    const token = issueTokenFor(jwtService, suddia);

    await request(app.getHttpServer())
      .patch(`/hurtky/${hurtok.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ foundedAt: '2020-01-01' })
      .expect(200);
  });

  it('forbids a HURTOK-scope (not KURIN-scope) suddia from updating a hurtok', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const hurtok = await prisma.hurtok.create({ data: { kurinId: kurin.id, name: 'Орлики' } });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id, hurtokId: hurtok.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    await prisma.kurinPosition.create({
      data: {
        kurinId: kurin.id,
        scope: 'HURTOK',
        hurtokId: hurtok.id,
        positionType: 'SUDDIA',
        userId: junak.id,
        assignedById: zvyazkovyi.id,
      },
    });
    const token = issueTokenFor(jwtService, junak);

    await request(app.getHttpServer())
      .patch(`/hurtky/${hurtok.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ foundedAt: '2020-01-01' })
      .expect(403);
  });

  it('still forbids a plain vykhovnyk from updating a hurtok', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const hurtok = await prisma.hurtok.create({ data: { kurinId: kurin.id, name: 'Орлики' } });
    const vykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, vykhovnyk);

    await request(app.getHttpServer())
      .patch(`/hurtky/${hurtok.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ foundedAt: '2020-01-01' })
      .expect(403);
  });
});
