import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as request from 'supertest';
import { PrismaClient, ProbyProgramVersion, Role } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser, issueTokenFor } from './utils/fixtures';

describe('Kurin deactivation (e2e)', () => {
  let app: INestApplication;
  let jwt: JwtService;
  let adminKey: string;
  let adminUsername: string;
  let adminPassword: string;
  let kurinId: string;
  let junak: { id: string; role: Role; kurinId: string };
  let zvyazkovyi: { id: string; role: Role; kurinId: string };
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_TEST } } });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    jwt = moduleRef.get(JwtService);
    adminKey = process.env.ADMIN_API_KEY ?? 'dev-admin-key-change-me';
    adminUsername = process.env.ADMIN_USERNAME ?? 'admin';
    adminPassword = process.env.ADMIN_PASSWORD ?? 'dev-admin-password-change-me';
  });

  afterAll(async () => {
    await cleanDatabase(prisma);
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    kurinId = kurin.id;
    junak = await createUser(prisma, { role: Role.JUNAK, kurinId, email: 'j@example.com', password: 'secret123' });
    zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId, email: 'z@example.com', password: 'secret123' });
  });

  const admin = (path: string) =>
    request(app.getHttpServer())
      .post(path)
      .set('x-admin-key', adminKey)
      .set('x-admin-username', adminUsername)
      .set('x-admin-password', adminPassword);

  it('deactivate: sets the date, audits, lists it, and blocks an existing JUNAK token with the code', async () => {
    const junakToken = issueTokenFor(jwt, junak);
    await request(app.getHttpServer()).get('/users/me').set('Authorization', `Bearer ${junakToken}`).expect(200);

    const res = await admin(`/admin/kurins/${kurinId}/deactivate`).expect(200);
    expect(res.body.id).toBe(kurinId);
    expect(typeof res.body.deactivatedAt).toBe('string');

    const blocked = await request(app.getHttpServer()).get('/users/me').set('Authorization', `Bearer ${junakToken}`).expect(403);
    expect(blocked.body).toMatchObject({ code: 'KURIN_DEACTIVATED' });

    await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', `Bearer ${issueTokenFor(jwt, zvyazkovyi)}`)
      .expect(200);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'j@example.com', password: 'secret123' })
      .expect(403)
      .expect((r) => expect(r.body.code).toBe('KURIN_DEACTIVATED'));
    await request(app.getHttpServer()).post('/auth/login').send({ email: 'z@example.com', password: 'secret123' }).expect(201);

    const list = await request(app.getHttpServer())
      .get('/admin/kurins')
      .set('x-admin-key', adminKey)
      .set('x-admin-username', adminUsername)
      .set('x-admin-password', adminPassword)
      .expect(200);
    expect(list.body.find((k: any) => k.id === kurinId).deactivatedAt).toBe(res.body.deactivatedAt);

    expect(await prisma.auditLog.count({ where: { kurinId, action: 'KURIN_DEACTIVATED', actorId: null } })).toBe(1);
  });

  it('deactivate twice keeps the original date; activate clears it and restores access', async () => {
    const first = await admin(`/admin/kurins/${kurinId}/deactivate`).expect(200);
    const second = await admin(`/admin/kurins/${kurinId}/deactivate`).expect(200);
    expect(second.body.deactivatedAt).toBe(first.body.deactivatedAt);
    expect(await prisma.auditLog.count({ where: { kurinId, action: 'KURIN_DEACTIVATED' } })).toBe(1);

    const act = await admin(`/admin/kurins/${kurinId}/activate`).expect(200);
    expect(act.body).toEqual({ id: kurinId, deactivatedAt: null });
    await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', `Bearer ${issueTokenFor(jwt, junak)}`)
      .expect(200);
    expect(await prisma.auditLog.count({ where: { kurinId, action: 'KURIN_ACTIVATED' } })).toBe(1);
  });

  it('returns 404 for an unknown kurin', async () => {
    await admin('/admin/kurins/00000000-0000-0000-0000-000000000000/deactivate').expect(404);
  });
});
