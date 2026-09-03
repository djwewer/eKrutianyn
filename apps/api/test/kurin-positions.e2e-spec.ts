import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as request from 'supertest';
import { PrismaClient, Role, ProbyProgramVersion } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser, issueTokenFor } from './utils/fixtures';

describe('kurin-positions (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_TEST } } });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    jwtService = moduleRef.get(JwtService);
    await app.init();
  });

  afterAll(async () => {
    await cleanDatabase(prisma);
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
  });

  it('assigns a kurin-scoped position and it appears in the list', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    await request(app.getHttpServer())
      .post('/kurin-positions')
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: junak.id, scope: 'KURIN', positionType: 'KURINNYI' })
      .expect((res) => expect([200, 201]).toContain(res.status));

    const list = await request(app.getHttpServer())
      .get('/kurin-positions')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(list.body).toHaveLength(1);
    expect(list.body[0].positionType).toBe('KURINNYI');
    expect(list.body[0].user.id).toBe(junak.id);
  });

  it('automatically retires the previous holder of the same slot', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const junak1 = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const junak2 = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    await request(app.getHttpServer())
      .post('/kurin-positions')
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: junak1.id, scope: 'KURIN', positionType: 'KURINNYI' })
      .expect((res) => expect([200, 201]).toContain(res.status));

    await request(app.getHttpServer())
      .post('/kurin-positions')
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: junak2.id, scope: 'KURIN', positionType: 'KURINNYI' })
      .expect((res) => expect([200, 201]).toContain(res.status));

    const list = await request(app.getHttpServer())
      .get('/kurin-positions')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(list.body).toHaveLength(1);
    expect(list.body[0].user.id).toBe(junak2.id);

    const allPositions = await prisma.kurinPosition.findMany({ where: { kurinId: kurin.id } });
    expect(allPositions).toHaveLength(2);
    const retired = allPositions.find((p) => p.userId === junak1.id)!;
    expect(retired.removedAt).not.toBeNull();
  });

  it('rejects a hurtok-only position type at kurin scope', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    await request(app.getHttpServer())
      .post('/kurin-positions')
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: junak.id, scope: 'KURIN', positionType: 'HURTKOVYI' })
      .expect(400);
  });

  it('assigns a hurtok-scoped position only to a junak of that hurtok', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const hurtok = await prisma.hurtok.create({ data: { kurinId: kurin.id, name: 'Орлики' } });
    const otherHurtok = await prisma.hurtok.create({ data: { kurinId: kurin.id, name: 'Соколи' } });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const junakInHurtok = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id, hurtokId: hurtok.id });
    const junakInOtherHurtok = await createUser(prisma, {
      role: Role.JUNAK,
      kurinId: kurin.id,
      hurtokId: otherHurtok.id,
    });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    await request(app.getHttpServer())
      .post('/kurin-positions')
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: junakInOtherHurtok.id, scope: 'HURTOK', positionType: 'HURTKOVYI', hurtokId: hurtok.id })
      .expect(400);

    await request(app.getHttpServer())
      .post('/kurin-positions')
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: junakInHurtok.id, scope: 'HURTOK', positionType: 'HURTKOVYI', hurtokId: hurtok.id })
      .expect((res) => expect([200, 201]).toContain(res.status));
  });

  it('lets zvyazkovyi remove a position without a replacement', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    const created = await request(app.getHttpServer())
      .post('/kurin-positions')
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: junak.id, scope: 'KURIN', positionType: 'KURINNYI' })
      .expect((res) => expect([200, 201]).toContain(res.status));

    await request(app.getHttpServer())
      .delete(`/kurin-positions/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect((res) => expect([200, 201]).toContain(res.status));

    const list = await request(app.getHttpServer())
      .get('/kurin-positions')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(list.body).toHaveLength(0);
  });

  it('forbids a junak from assigning a position', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const target = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, junak);

    await request(app.getHttpServer())
      .post('/kurin-positions')
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: target.id, scope: 'KURIN', positionType: 'KURINNYI' })
      .expect(403);
  });
});
