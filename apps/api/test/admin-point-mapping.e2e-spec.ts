import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { PrismaClient, ProbyProgramVersion } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree } from './utils/fixtures';

describe('Admin point mappings (e2e)', () => {
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

  it('creates a mapping between an old and a new point', async () => {
    const oldTree = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Вузли (стара)']);
    const newTree = await createProbyProgramTree(prisma, ProbyProgramVersion.NEW, ['Вузли (нова)']);

    const response = await request(app.getHttpServer())
      .post('/admin/point-mappings')
      .set('x-admin-key', adminKey)
      .send({ oldPointId: oldTree.points[0].id, newPointId: newTree.points[0].id })
      .expect(201);

    expect(response.body.oldPointId).toBe(oldTree.points[0].id);
    expect(response.body.newPointId).toBe(newTree.points[0].id);
  });

  it('returns 404 when either point does not exist', async () => {
    const oldTree = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Вузли (стара)']);

    await request(app.getHttpServer())
      .post('/admin/point-mappings')
      .set('x-admin-key', adminKey)
      .send({ oldPointId: oldTree.points[0].id, newPointId: '00000000-0000-0000-0000-000000000000' })
      .expect(404);
  });

  it('returns 409 when the same mapping is created twice', async () => {
    const oldTree = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Вузли (стара)']);
    const newTree = await createProbyProgramTree(prisma, ProbyProgramVersion.NEW, ['Вузли (нова)']);

    await request(app.getHttpServer())
      .post('/admin/point-mappings')
      .set('x-admin-key', adminKey)
      .send({ oldPointId: oldTree.points[0].id, newPointId: newTree.points[0].id })
      .expect(201);

    await request(app.getHttpServer())
      .post('/admin/point-mappings')
      .set('x-admin-key', adminKey)
      .send({ oldPointId: oldTree.points[0].id, newPointId: newTree.points[0].id })
      .expect(409);
  });
});
