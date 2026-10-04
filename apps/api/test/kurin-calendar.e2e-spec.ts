import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, Role, PositionScope, PositionType, ProbyProgramVersion } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser, issueTokenFor } from './utils/fixtures';

describe('Kurin calendar (e2e)', () => {
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

  it('lets zvyazkovyi create, update, and delete an event', async () => {
    const { kurin } = await setup();
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    const created = await request(app.getHttpServer())
      .post(`/kurins/${kurin.id}/calendar-events`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Зимовий табір', startDate: '2026-01-15', endDate: '2026-01-20' })
      .expect((res) => expect([200, 201]).toContain(res.status));

    expect(created.body.title).toBe('Зимовий табір');

    const updated = await request(app.getHttpServer())
      .patch(`/kurins/${kurin.id}/calendar-events/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Зимовий табір (перенесено)' })
      .expect((res) => expect([200, 201]).toContain(res.status));
    expect(updated.body.title).toBe('Зимовий табір (перенесено)');

    await request(app.getHttpServer())
      .delete(`/kurins/${kurin.id}/calendar-events/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);

    const list = await request(app.getHttpServer())
      .get(`/kurins/${kurin.id}/calendar-events`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(list.body).toHaveLength(0);
  });

  it('lets any member of the kurin read the calendar, but forbids a plain junak from writing', async () => {
    const { kurin } = await setup();
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const zvyazkovyiToken = issueTokenFor(jwtService, zvyazkovyi);
    await request(app.getHttpServer())
      .post(`/kurins/${kurin.id}/calendar-events`)
      .set('Authorization', `Bearer ${zvyazkovyiToken}`)
      .send({ title: 'Загальний збір', startDate: '2026-02-01' });

    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const junakToken = issueTokenFor(jwtService, junak);

    const list = await request(app.getHttpServer())
      .get(`/kurins/${kurin.id}/calendar-events`)
      .set('Authorization', `Bearer ${junakToken}`)
      .expect(200);
    expect(list.body).toHaveLength(1);

    await request(app.getHttpServer())
      .post(`/kurins/${kurin.id}/calendar-events`)
      .set('Authorization', `Bearer ${junakToken}`)
      .send({ title: 'Хакнуто', startDate: '2026-02-02' })
      .expect(403);
  });

  it('lets a kurinniy junak write to the calendar', async () => {
    const { kurin } = await setup();
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
    const token = issueTokenFor(jwtService, kurinniy);

    await request(app.getHttpServer())
      .post(`/kurins/${kurin.id}/calendar-events`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Пластова ватра', startDate: '2026-03-01' })
      .expect((res) => expect([200, 201]).toContain(res.status));
  });

  it('returns 404 for a different kurin', async () => {
    const { kurin } = await setup();
    const { program: otherProgram } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['P']);
    const otherKurin = await createKurin(prisma, { probyProgramId: otherProgram.id });
    const outsider = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: otherKurin.id });
    const token = issueTokenFor(jwtService, outsider);

    await request(app.getHttpServer())
      .get(`/kurins/${kurin.id}/calendar-events`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('rejects an invalid event body (400)', async () => {
    const { kurin } = await setup();
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    await request(app.getHttpServer())
      .post(`/kurins/${kurin.id}/calendar-events`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: '', startDate: 'not-a-date' })
      .expect(400);
  });
});
