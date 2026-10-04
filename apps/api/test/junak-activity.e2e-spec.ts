import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, Role, ProbyProgramVersion } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser, issueTokenFor } from './utils/fixtures';

describe('Junak activity (e2e)', () => {
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

  it('lets a junak create, list, update, and delete their own entries', async () => {
    const { kurin } = await setup();
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, junak);

    const created = await request(app.getHttpServer())
      .post('/users/me/activity')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Теренівка', occurredAt: '2026-01-10', role: 'PARTICIPANT', description: 'Було весело' })
      .expect((res) => expect([200, 201]).toContain(res.status));

    expect(created.body.title).toBe('Теренівка');
    expect(created.body.role).toBe('PARTICIPANT');

    const list = await request(app.getHttpServer())
      .get('/users/me/activity')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(list.body).toHaveLength(1);

    const updated = await request(app.getHttpServer())
      .patch(`/users/me/activity/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'PROVID' })
      .expect((res) => expect([200, 201]).toContain(res.status));
    expect(updated.body.role).toBe('PROVID');

    await request(app.getHttpServer())
      .delete(`/users/me/activity/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);

    const listAfterDelete = await request(app.getHttpServer())
      .get('/users/me/activity')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(listAfterDelete.body).toHaveLength(0);
  });

  it("never lets a junak see or modify another junak's entries", async () => {
    const { kurin } = await setup();
    const owner = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const intruder = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const ownerToken = issueTokenFor(jwtService, owner);
    const intruderToken = issueTokenFor(jwtService, intruder);

    const created = await request(app.getHttpServer())
      .post('/users/me/activity')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'Приватне', occurredAt: '2026-01-10', role: 'PARTICIPANT' });

    const intruderList = await request(app.getHttpServer())
      .get('/users/me/activity')
      .set('Authorization', `Bearer ${intruderToken}`)
      .expect(200);
    expect(intruderList.body).toHaveLength(0);

    await request(app.getHttpServer())
      .patch(`/users/me/activity/${created.body.id}`)
      .set('Authorization', `Bearer ${intruderToken}`)
      .send({ title: 'Хакнуто' })
      .expect(404);

    await request(app.getHttpServer())
      .delete(`/users/me/activity/${created.body.id}`)
      .set('Authorization', `Bearer ${intruderToken}`)
      .expect(404);
  });

  it('forbids a zvyazkovyi from using the junak activity endpoints', async () => {
    const { kurin } = await setup();
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    await request(app.getHttpServer())
      .get('/users/me/activity')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('rejects an invalid entry body (400)', async () => {
    const { kurin } = await setup();
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, junak);

    await request(app.getHttpServer())
      .post('/users/me/activity')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: '', occurredAt: 'not-a-date', role: 'NOT_A_ROLE' })
      .expect(400);
  });
});
