import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { PrismaClient, ProbyProgramVersion } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';

describe('Admin proby catalog (e2e)', () => {
  let app: INestApplication;
  let adminKey: string;
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_TEST } } });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    adminKey = process.env.ADMIN_API_KEY ?? 'dev-admin-key-change-me';
  });

  afterAll(async () => {
    await cleanDatabase(prisma);
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
  });

  it('builds a full program -> stage -> category -> point tree', async () => {
    const programRes = await request(app.getHttpServer())
      .post('/admin/proby-programs')
      .set('x-admin-key', adminKey)
      .send({ version: ProbyProgramVersion.OLD, name: 'Стара програма' })
      .expect(201);

    const stageRes = await request(app.getHttpServer())
      .post(`/admin/proby-programs/${programRes.body.id}/stages`)
      .set('x-admin-key', adminKey)
      .send({ order: 1, name: 'Перший ступінь' })
      .expect(201);

    const categoryRes = await request(app.getHttpServer())
      .post(`/admin/proby-stages/${stageRes.body.id}/categories`)
      .set('x-admin-key', adminKey)
      .send({ name: 'Практичне пластування' })
      .expect(201);

    const pointRes = await request(app.getHttpServer())
      .post(`/admin/proby-categories/${categoryRes.body.id}/points`)
      .set('x-admin-key', adminKey)
      .send({ order: 1, description: "В'язати 5 вузлів" })
      .expect(201);

    expect(pointRes.body.categoryId).toBe(categoryRes.body.id);
  });

  it('returns 404 when creating a stage under a nonexistent program', async () => {
    await request(app.getHttpServer())
      .post('/admin/proby-programs/00000000-0000-0000-0000-000000000000/stages')
      .set('x-admin-key', adminKey)
      .send({ order: 1, name: 'Перший ступінь' })
      .expect(404);
  });

  it('returns 401 without the admin key', async () => {
    await request(app.getHttpServer())
      .post('/admin/proby-programs')
      .send({ version: ProbyProgramVersion.OLD, name: 'Стара програма' })
      .expect(401);
  });
});
