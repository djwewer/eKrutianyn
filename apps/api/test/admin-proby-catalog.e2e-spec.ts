import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { PrismaClient, ProbyProgramVersion } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';

describe('Admin proby catalog (e2e)', () => {
  let app: INestApplication;
  let adminKey: string;
  let adminUsername: string;
  let adminPassword: string;
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_TEST } } });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
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
  });

  it('builds a full program -> stage -> category -> point tree', async () => {
    const programRes = await request(app.getHttpServer())
      .post('/admin/proby-programs')
      .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
      .send({ version: ProbyProgramVersion.OLD, name: 'Стара програма' })
      .expect(201);

    const stageRes = await request(app.getHttpServer())
      .post(`/admin/proby-programs/${programRes.body.id}/stages`)
      .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
      .send({ order: 1, name: 'Перший ступінь' })
      .expect(201);

    const categoryRes = await request(app.getHttpServer())
      .post(`/admin/proby-stages/${stageRes.body.id}/categories`)
      .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
      .send({ name: 'Практичне пластування' })
      .expect(201);

    const pointRes = await request(app.getHttpServer())
      .post(`/admin/proby-categories/${categoryRes.body.id}/points`)
      .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
      .send({ order: 1, description: "В'язати 5 вузлів" })
      .expect(201);

    expect(pointRes.body.categoryId).toBe(categoryRes.body.id);
  });

  it('returns 404 when creating a stage under a nonexistent program', async () => {
    await request(app.getHttpServer())
      .post('/admin/proby-programs/00000000-0000-0000-0000-000000000000/stages')
      .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
      .send({ order: 1, name: 'Перший ступінь' })
      .expect(404);
  });

  it('returns 401 without the admin key', async () => {
    await request(app.getHttpServer())
      .post('/admin/proby-programs')
      .send({ version: ProbyProgramVersion.OLD, name: 'Стара програма' })
      .expect(401);
  });

  it('lists every program with its full nested tree, including referenceText', async () => {
    const programRes = await request(app.getHttpServer())
      .post('/admin/proby-programs')
      .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
      .send({ version: ProbyProgramVersion.OLD, name: 'Стара програма' })
      .expect(201);
    const stageRes = await request(app.getHttpServer())
      .post(`/admin/proby-programs/${programRes.body.id}/stages`)
      .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
      .send({ order: 1, name: 'Перший ступінь' })
      .expect(201);
    const categoryRes = await request(app.getHttpServer())
      .post(`/admin/proby-stages/${stageRes.body.id}/categories`)
      .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
      .send({ name: 'Історія' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/admin/proby-categories/${categoryRes.body.id}/points`)
      .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
      .send({ order: 1, description: 'Описати заснування Пласту' })
      .expect(201);

    const listRes = await request(app.getHttpServer())
      .get('/admin/proby-programs')
      .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
      .expect(200);

    const program = listRes.body.find((p: { id: string }) => p.id === programRes.body.id);
    expect(program.stages[0].categories[0].points[0]).toMatchObject({
      description: 'Описати заснування Пласту',
      referenceText: null,
    });
  });

  it('returns 401 listing programs without the admin key', async () => {
    await request(app.getHttpServer()).get('/admin/proby-programs').expect(401);
  });

  it("lets an admin set and clear a point's referenceText", async () => {
    const programRes = await request(app.getHttpServer())
      .post('/admin/proby-programs')
      .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
      .send({ version: ProbyProgramVersion.OLD, name: 'Стара програма' })
      .expect(201);
    const stageRes = await request(app.getHttpServer())
      .post(`/admin/proby-programs/${programRes.body.id}/stages`)
      .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
      .send({ order: 1, name: 'Перший ступінь' })
      .expect(201);
    const categoryRes = await request(app.getHttpServer())
      .post(`/admin/proby-stages/${stageRes.body.id}/categories`)
      .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
      .send({ name: 'Історія' })
      .expect(201);
    const pointRes = await request(app.getHttpServer())
      .post(`/admin/proby-categories/${categoryRes.body.id}/points`)
      .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
      .send({ order: 1, description: 'Описати заснування Пласту' })
      .expect(201);

    const updateRes = await request(app.getHttpServer())
      .patch(`/admin/proby-points/${pointRes.body.id}/reference`)
      .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
      .send({ referenceText: 'Пласт засновано 12 квітня 1912 року у Львові.' })
      .expect(200);
    expect(updateRes.body.referenceText).toBe('Пласт засновано 12 квітня 1912 року у Львові.');

    const clearRes = await request(app.getHttpServer())
      .patch(`/admin/proby-points/${pointRes.body.id}/reference`)
      .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
      .send({ referenceText: null })
      .expect(200);
    expect(clearRes.body.referenceText).toBeNull();
  });

  it('returns 404 updating referenceText for a nonexistent point', async () => {
    await request(app.getHttpServer())
      .patch('/admin/proby-points/00000000-0000-0000-0000-000000000000/reference')
      .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
      .send({ referenceText: 'щось' })
      .expect(404);
  });

  it('rejects referenceText over the 4000-character cap (400)', async () => {
    const programRes = await request(app.getHttpServer())
      .post('/admin/proby-programs')
      .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
      .send({ version: ProbyProgramVersion.OLD, name: 'Стара програма' })
      .expect(201);
    const stageRes = await request(app.getHttpServer())
      .post(`/admin/proby-programs/${programRes.body.id}/stages`)
      .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
      .send({ order: 1, name: 'Перший ступінь' })
      .expect(201);
    const categoryRes = await request(app.getHttpServer())
      .post(`/admin/proby-stages/${stageRes.body.id}/categories`)
      .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
      .send({ name: 'Історія' })
      .expect(201);
    const pointRes = await request(app.getHttpServer())
      .post(`/admin/proby-categories/${categoryRes.body.id}/points`)
      .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
      .send({ order: 1, description: 'Описати заснування Пласту' })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/admin/proby-points/${pointRes.body.id}/reference`)
      .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
      .send({ referenceText: 'a'.repeat(4001) })
      .expect(400);
  });
});
