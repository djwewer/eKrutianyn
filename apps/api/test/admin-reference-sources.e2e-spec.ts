import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { PrismaClient, ProbyProgramVersion } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';

describe('Admin reference sources (e2e)', () => {
  let app: INestApplication;
  let adminKey: string;
  let adminUsername: string;
  let adminPassword: string;
  let fetchSpy: jest.SpyInstance;
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

  afterEach(() => {
    fetchSpy?.mockRestore();
  });

  async function seedPoint() {
    const program = await prisma.probyProgram.create({ data: { version: ProbyProgramVersion.OLD, name: 'Стара програма' } });
    const stage = await prisma.probyStage.create({ data: { programId: program.id, order: 1, name: 'Перший ступінь' } });
    const category = await prisma.probyCategory.create({ data: { stageId: stage.id, name: 'Історія' } });
    return prisma.probyPoint.create({ data: { categoryId: category.id, order: 1, description: 'Заспіває пластові пісні' } });
  }

  it('creates, lists, updates, and deletes a reference source', async () => {
    const point = await seedPoint();

    const createRes = await request(app.getHttpServer())
      .post('/admin/reference-sources')
      .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
      .send({ url: 'https://pryvatri.de/himny', label: 'Гімни і молитви', probyPointId: point.id })
      .expect(201);
    expect(createRes.body).toMatchObject({ url: 'https://pryvatri.de/himny', label: 'Гімни і молитви', probyPointId: point.id });

    const listRes = await request(app.getHttpServer()).get('/admin/reference-sources').set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword).expect(200);
    expect(listRes.body).toHaveLength(1);
    expect(listRes.body[0].probyPoint).toMatchObject({ id: point.id, description: 'Заспіває пластові пісні' });

    const updateRes = await request(app.getHttpServer())
      .patch(`/admin/reference-sources/${createRes.body.id}`)
      .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
      .send({ label: 'Гімни, молитви і присяга' })
      .expect(200);
    expect(updateRes.body.label).toBe('Гімни, молитви і присяга');

    await request(app.getHttpServer()).delete(`/admin/reference-sources/${createRes.body.id}`).set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword).expect(204);
    const afterDelete = await request(app.getHttpServer()).get('/admin/reference-sources').set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword).expect(200);
    expect(afterDelete.body).toHaveLength(0);
  });

  it('allows a reference source with no linked proby point', async () => {
    const res = await request(app.getHttpServer())
      .post('/admin/reference-sources')
      .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
      .send({ url: 'https://www.wikispiv.com/wiki/Категорія:Пластові_пісні', label: 'Пластові пісні (wikispiv)' })
      .expect(201);
    expect(res.body.probyPointId).toBeNull();
  });

  it('returns 404 updating or deleting a nonexistent source', async () => {
    await request(app.getHttpServer())
      .patch('/admin/reference-sources/00000000-0000-0000-0000-000000000000')
      .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
      .send({ label: 'x' })
      .expect(404);
    await request(app.getHttpServer())
      .delete('/admin/reference-sources/00000000-0000-0000-0000-000000000000')
      .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
      .expect(404);
  });

  it('rejects an invalid URL (400) and requires the admin key (401)', async () => {
    await request(app.getHttpServer())
      .post('/admin/reference-sources')
      .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
      .send({ url: 'not-a-url', label: 'Bad' })
      .expect(400);
    await request(app.getHttpServer()).get('/admin/reference-sources').expect(401);
  });

  it('fetch-now pulls the page, extracts text, and clears any prior error', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/admin/reference-sources')
      .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
      .send({ url: 'https://pryvatri.de/himny', label: 'Гімни і молитви' })
      .expect(201);

    fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: true, status: 200, text: async () => '<body><h1>Гімн Пласту</h1><p>Цвіт України і краса</p></body>' } as Response);

    const fetchNowRes = await request(app.getHttpServer())
      .post(`/admin/reference-sources/${createRes.body.id}/fetch-now`)
      .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
      .expect(201);

    expect(fetchNowRes.body.extractedText).toBe('Гімн Пласту Цвіт України і краса');
    expect(fetchNowRes.body.lastFetchedAt).not.toBeNull();
    expect(fetchNowRes.body.lastError).toBeNull();
  });

  it('fetch-now records lastError and keeps the previously cached text on failure', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/admin/reference-sources')
      .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
      .send({ url: 'https://pryvatri.de/down', label: 'Гімни і молитви' })
      .expect(201);

    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => '<body>Перший успішний фетч</body>',
    } as Response);
    await request(app.getHttpServer()).post(`/admin/reference-sources/${createRes.body.id}/fetch-now`).set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword).expect(201);

    fetchSpy.mockRejectedValueOnce(new Error('connection reset'));
    const secondFetch = await request(app.getHttpServer())
      .post(`/admin/reference-sources/${createRes.body.id}/fetch-now`)
      .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
      .expect(201);

    expect(secondFetch.body.extractedText).toBe('Перший успішний фетч');
    expect(secondFetch.body.lastError).toBe('connection reset');
  });

  it('fetch-all refreshes every source and tallies results', async () => {
    await request(app.getHttpServer())
      .post('/admin/reference-sources')
      .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
      .send({ url: 'https://pryvatri.de/ok', label: 'OK source' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/admin/reference-sources')
      .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
      .send({ url: 'https://pryvatri.de/bad', label: 'Bad source' })
      .expect(201);

    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('bad')) return Promise.reject(new Error('timeout'));
      return Promise.resolve({ ok: true, status: 200, text: async () => '<body>OK</body>' } as Response);
    });

    const res = await request(app.getHttpServer()).post('/admin/reference-sources/fetch-all').set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword).expect(201);
    expect(res.body).toEqual({ succeeded: 1, failed: 1 });
  });
});
