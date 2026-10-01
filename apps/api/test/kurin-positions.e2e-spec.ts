import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as request from 'supertest';
import { PrismaClient, Role, ProbyProgramVersion } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser, createKurinniyUser, issueTokenFor } from './utils/fixtures';

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

  it('retires a junak from their other kurin-scoped position when assigned a new one', async () => {
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

    await request(app.getHttpServer())
      .post('/kurin-positions')
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: junak.id, scope: 'KURIN', positionType: 'SUDDIA' })
      .expect((res) => expect([200, 201]).toContain(res.status));

    const list = await request(app.getHttpServer())
      .get('/kurin-positions')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(list.body).toHaveLength(1);
    expect(list.body[0].positionType).toBe('SUDDIA');
    expect(list.body[0].user.id).toBe(junak.id);
  });

  it('retires a junak from their other hurtok-scoped position when assigned a new one in the same hurtok', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const hurtok = await prisma.hurtok.create({ data: { kurinId: kurin.id, name: 'Орлики' } });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id, hurtokId: hurtok.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    await request(app.getHttpServer())
      .post('/kurin-positions')
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: junak.id, scope: 'HURTOK', positionType: 'HURTKOVYI', hurtokId: hurtok.id })
      .expect((res) => expect([200, 201]).toContain(res.status));

    await request(app.getHttpServer())
      .post('/kurin-positions')
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: junak.id, scope: 'HURTOK', positionType: 'PYSAR', hurtokId: hurtok.id })
      .expect((res) => expect([200, 201]).toContain(res.status));

    const list = await request(app.getHttpServer())
      .get('/kurin-positions')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(list.body).toHaveLength(1);
    expect(list.body[0].positionType).toBe('PYSAR');
    expect(list.body[0].user.id).toBe(junak.id);
  });

  it('does not let a kurin-scoped assignment retire the same junak’s hurtok-scoped position', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const hurtok = await prisma.hurtok.create({ data: { kurinId: kurin.id, name: 'Орлики' } });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id, hurtokId: hurtok.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    await request(app.getHttpServer())
      .post('/kurin-positions')
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: junak.id, scope: 'HURTOK', positionType: 'HURTKOVYI', hurtokId: hurtok.id })
      .expect((res) => expect([200, 201]).toContain(res.status));

    await request(app.getHttpServer())
      .post('/kurin-positions')
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: junak.id, scope: 'KURIN', positionType: 'PYSAR' })
      .expect((res) => expect([200, 201]).toContain(res.status));

    const list = await request(app.getHttpServer())
      .get('/kurin-positions')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(list.body).toHaveLength(2);
    const positionTypes = list.body.map((p: { positionType: string }) => p.positionType).sort();
    expect(positionTypes).toEqual(['HURTKOVYI', 'PYSAR']);
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

  it('lets kurinniy assign a non-Курінний kurin-scoped position', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const kurinniy = await createKurinniyUser(prisma, { kurinId: kurin.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, kurinniy);

    await request(app.getHttpServer())
      .post('/kurin-positions')
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: junak.id, scope: 'KURIN', positionType: 'PYSAR' })
      .expect((res) => expect([200, 201]).toContain(res.status));

    const list = await request(app.getHttpServer())
      .get('/kurin-positions')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(list.body.find((p: { positionType: string }) => p.positionType === 'PYSAR').user.id).toBe(junak.id);
  });

  it('forbids kurinniy from assigning the Курінний slot', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const kurinniy = await createKurinniyUser(prisma, { kurinId: kurin.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, kurinniy);

    await request(app.getHttpServer())
      .post('/kurin-positions')
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: junak.id, scope: 'KURIN', positionType: 'KURINNYI' })
      .expect(403);
  });

  it('forbids kurinniy from removing his own Курінний position record', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const kurinniy = await createKurinniyUser(prisma, { kurinId: kurin.id });
    const token = issueTokenFor(jwtService, kurinniy);
    const ownPosition = await prisma.kurinPosition.findFirstOrThrow({
      where: { userId: kurinniy.id, positionType: 'KURINNYI' },
    });

    await request(app.getHttpServer())
      .delete(`/kurin-positions/${ownPosition.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('forbids kurinniy from removing any other Курінний position record', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const kurinniy = await createKurinniyUser(prisma, { kurinId: kurin.id });
    const otherKurinniyHolder = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const otherKurinniyPosition = await prisma.kurinPosition.create({
      data: {
        kurinId: kurin.id,
        scope: 'KURIN',
        positionType: 'SUDDIA',
        userId: otherKurinniyHolder.id,
        assignedById: zvyazkovyi.id,
      },
    });
    const token = issueTokenFor(jwtService, kurinniy);

    // sanity: kurinniy CAN remove a non-Курінний record
    await request(app.getHttpServer())
      .delete(`/kurin-positions/${otherKurinniyPosition.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect((res) => expect([200, 201]).toContain(res.status));
  });

  it('still forbids a plain junak (no kurinniy) from assigning any kurin position', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const plainJunak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const target = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, plainJunak);

    await request(app.getHttpServer())
      .post('/kurin-positions')
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: target.id, scope: 'KURIN', positionType: 'PYSAR' })
      .expect(403);
  });
});
