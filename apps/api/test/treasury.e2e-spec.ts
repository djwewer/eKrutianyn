import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, Role, PositionScope, PositionType, ProbyProgramVersion } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser, issueTokenFor } from './utils/fixtures';

describe('Treasury (e2e)', () => {
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
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    return { kurin };
  }

  it('lets zvyazkovyi set the starting balance and see it reflected in the summary', async () => {
    const { kurin } = await setup();
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    const response = await request(app.getHttpServer())
      .patch(`/kurins/${kurin.id}/treasury/starting-balance`)
      .set('Authorization', `Bearer ${token}`)
      .send({ startingBalanceCents: 1000000 })
      .expect((res) => expect([200, 201]).toContain(res.status));

    expect(response.body.startingBalanceCents).toBe(1000000);
    expect(response.body.currentBalanceCents).toBe(1000000);
    expect(response.body.transactions).toEqual([]);
  });

  it('computes the current balance from starting balance + income - expenses', async () => {
    const { kurin } = await setup();
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    await request(app.getHttpServer())
      .patch(`/kurins/${kurin.id}/treasury/starting-balance`)
      .set('Authorization', `Bearer ${token}`)
      .send({ startingBalanceCents: 500000 });

    await request(app.getHttpServer())
      .post(`/kurins/${kurin.id}/treasury/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'INCOME', amountCents: 200000, description: 'Вкладка', occurredAt: '2026-01-10' })
      .expect((res) => expect([200, 201]).toContain(res.status));

    await request(app.getHttpServer())
      .post(`/kurins/${kurin.id}/treasury/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'EXPENSE', amountCents: 80000, description: 'Снарядження', occurredAt: '2026-01-15' })
      .expect((res) => expect([200, 201]).toContain(res.status));

    const response = await request(app.getHttpServer())
      .get(`/kurins/${kurin.id}/treasury`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.currentBalanceCents).toBe(500000 + 200000 - 80000);
    expect(response.body.transactions).toHaveLength(2);
    // Most recent first.
    expect(response.body.transactions[0].description).toBe('Снарядження');
  });

  it('lets a skarbnyk record and delete a transaction', async () => {
    const { kurin } = await setup();
    const skarbnyk = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    await prisma.kurinPosition.create({
      data: {
        kurinId: kurin.id,
        scope: PositionScope.KURIN,
        positionType: PositionType.SKARBNYK,
        userId: skarbnyk.id,
        assignedById: skarbnyk.id,
      },
    });
    const token = issueTokenFor(jwtService, skarbnyk);

    const created = await request(app.getHttpServer())
      .post(`/kurins/${kurin.id}/treasury/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'EXPENSE', amountCents: 1500, description: 'Бафи', occurredAt: '2026-01-21' })
      .expect((res) => expect([200, 201]).toContain(res.status));

    await request(app.getHttpServer())
      .delete(`/kurins/${kurin.id}/treasury/transactions/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect((res) => expect([200, 201]).toContain(res.status));

    const remaining = await prisma.treasuryTransaction.findMany({ where: { kurinId: kurin.id } });
    expect(remaining).toHaveLength(0);
  });

  it('forbids a plain junak from writing, but lets kurinniy read', async () => {
    const { kurin } = await setup();
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const junakToken = issueTokenFor(jwtService, junak);

    await request(app.getHttpServer())
      .post(`/kurins/${kurin.id}/treasury/transactions`)
      .set('Authorization', `Bearer ${junakToken}`)
      .send({ type: 'INCOME', amountCents: 100, description: 'x', occurredAt: '2026-01-01' })
      .expect(403);

    await request(app.getHttpServer())
      .get(`/kurins/${kurin.id}/treasury`)
      .set('Authorization', `Bearer ${junakToken}`)
      .expect(403);

    const kurinniy = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    await prisma.kurinPosition.create({
      data: {
        kurinId: kurin.id,
        scope: PositionScope.KURIN,
        positionType: PositionType.KURINNYI,
        userId: kurinniy.id,
        assignedById: kurinniy.id,
      },
    });
    const kurinniyToken = issueTokenFor(jwtService, kurinniy);

    await request(app.getHttpServer())
      .get(`/kurins/${kurin.id}/treasury`)
      .set('Authorization', `Bearer ${kurinniyToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post(`/kurins/${kurin.id}/treasury/transactions`)
      .set('Authorization', `Bearer ${kurinniyToken}`)
      .send({ type: 'INCOME', amountCents: 100, description: 'x', occurredAt: '2026-01-01' })
      .expect(403);
  });

  it('returns 404 for a different kurin', async () => {
    const { kurin } = await setup();
    const { program: otherProgram } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['P']);
    const otherKurin = await createKurin(prisma, { probyProgramId: otherProgram.id });
    const outsider = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: otherKurin.id });
    const token = issueTokenFor(jwtService, outsider);

    await request(app.getHttpServer())
      .get(`/kurins/${kurin.id}/treasury`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('returns 404 deleting a transaction that belongs to a different kurin', async () => {
    const { kurin } = await setup();
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);
    const created = await request(app.getHttpServer())
      .post(`/kurins/${kurin.id}/treasury/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'INCOME', amountCents: 100, description: 'x', occurredAt: '2026-01-01' });

    const { program: otherProgram } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['P']);
    const otherKurin = await createKurin(prisma, { probyProgramId: otherProgram.id });
    const otherZvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: otherKurin.id });
    const otherToken = issueTokenFor(jwtService, otherZvyazkovyi);

    await request(app.getHttpServer())
      .delete(`/kurins/${otherKurin.id}/treasury/transactions/${created.body.id}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(404);
  });

  it('rejects an invalid transaction body (400)', async () => {
    const { kurin } = await setup();
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    await request(app.getHttpServer())
      .post(`/kurins/${kurin.id}/treasury/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'NOT_A_TYPE', amountCents: -5, description: '', occurredAt: 'not-a-date' })
      .expect(400);
  });
});
