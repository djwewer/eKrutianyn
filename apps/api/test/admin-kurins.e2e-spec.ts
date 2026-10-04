import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { PrismaClient, ProbyProgramVersion, KurinGender, Role } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser } from './utils/fixtures';

describe('Admin kurins (e2e)', () => {
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

  const zvyazkovyi = (overrides: Partial<Record<'firstName' | 'lastName' | 'email' | 'password', string>> = {}) => ({
    firstName: 'Іван',
    lastName: 'Франко',
    email: `zvyazkovyi-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
    password: 'secret123',
    ...overrides,
  });

  describe('POST /admin/kurins', () => {
    it('creates a kurin together with its first zvyazkovyi, who can then log in', async () => {
      const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
      const zv = zvyazkovyi({ email: 'zvyazkovyi-bootstrap@example.com' });

      const response = await request(app.getHttpServer())
        .post('/admin/kurins')
        .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
        .send({
          name: 'Курінь Тестовий',
          kurinNumber: '5',
          gender: KurinGender.MALE,
          stanytsia: 'Львів',
          probyProgramId: program.id,
          zvyazkovyi: zv,
        })
        .expect(201);

      expect(response.body.id).toEqual(expect.any(String));
      expect(response.body.name).toBe('Курінь Тестовий');

      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: zv.email, password: zv.password })
        .expect(201);
      expect(loginResponse.body.accessToken).toEqual(expect.any(String));

      const created = await prisma.user.findUniqueOrThrow({ where: { email: zv.email } });
      expect(created.role).toBe('ZVYAZKOVYI');
      expect(created.kurinId).toBe(response.body.id);
      expect(created.mustChangePassword).toBe(true);
    });

    it('returns 401 with a missing or wrong admin key', async () => {
      const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
      const payload = {
        name: 'Курінь Тестовий',
        kurinNumber: '5',
        gender: KurinGender.MALE,
        stanytsia: 'Львів',
        probyProgramId: program.id,
        zvyazkovyi: zvyazkovyi(),
      };

      await request(app.getHttpServer()).post('/admin/kurins').send(payload).expect(401);
      await request(app.getHttpServer())
        .post('/admin/kurins')
        .set('x-admin-key', 'wrong-key')
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
        .send(payload)
        .expect(401);
    });

    it('returns 401 with a correct admin key but a missing or wrong username/password (both factors required)', async () => {
      const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
      const payload = {
        name: 'Курінь Тестовий',
        kurinNumber: '5',
        gender: KurinGender.MALE,
        stanytsia: 'Львів',
        probyProgramId: program.id,
        zvyazkovyi: zvyazkovyi(),
      };

      await request(app.getHttpServer())
        .post('/admin/kurins')
        .set('x-admin-key', adminKey)
        .send(payload)
        .expect(401);
      await request(app.getHttpServer())
        .post('/admin/kurins')
        .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', 'wrong-password')
        .send(payload)
        .expect(401);
    });

    it('returns 404 when probyProgramId does not exist', async () => {
      await request(app.getHttpServer())
        .post('/admin/kurins')
        .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
        .send({
          name: 'Курінь Тестовий',
          kurinNumber: '5',
          gender: KurinGender.MALE,
          stanytsia: 'Львів',
          probyProgramId: '00000000-0000-0000-0000-000000000000',
          zvyazkovyi: zvyazkovyi(),
        })
        .expect(404);
    });

    it('returns 400 when zvyazkovyi is missing', async () => {
      const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);

      await request(app.getHttpServer())
        .post('/admin/kurins')
        .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
        .send({ name: 'Курінь Підготовчий', gender: KurinGender.MALE, stanytsia: 'Львів', probyProgramId: program.id })
        .expect(400);
    });

    it('leaves kurinNumber null when omitted (preparatory kurin, no synthetic placeholder)', async () => {
      const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);

      const response = await request(app.getHttpServer())
        .post('/admin/kurins')
        .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
        .send({
          name: 'Курінь Підготовчий',
          gender: KurinGender.MALE,
          stanytsia: 'Львів',
          probyProgramId: program.id,
          zvyazkovyi: zvyazkovyi(),
        })
        .expect(201);

      expect(response.body.kurinNumber).toBeNull();
    });

    it('returns 409 when an explicitly provided kurinNumber is already taken, and creates neither kurin nor zvyazkovyi', async () => {
      const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
      await request(app.getHttpServer())
        .post('/admin/kurins')
        .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
        .send({
          name: 'Перший',
          kurinNumber: '75',
          gender: KurinGender.MALE,
          stanytsia: 'Львів',
          probyProgramId: program.id,
          zvyazkovyi: zvyazkovyi(),
        })
        .expect(201);

      const secondZv = zvyazkovyi({ email: 'second-zvyazkovyi@example.com' });
      await request(app.getHttpServer())
        .post('/admin/kurins')
        .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
        .send({
          name: 'Другий',
          kurinNumber: '75',
          gender: KurinGender.MALE,
          stanytsia: 'Львів',
          probyProgramId: program.id,
          zvyazkovyi: secondZv,
        })
        .expect(409);

      expect(await prisma.user.findUnique({ where: { email: secondZv.email } })).toBeNull();
    });

    it('returns 409 when the zvyazkovyi email is already in use, and does not create the kurin (atomic)', async () => {
      const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
      const dupeEmail = 'dupe-zvyazkovyi@example.com';
      await request(app.getHttpServer())
        .post('/admin/kurins')
        .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
        .send({
          name: 'Перший',
          kurinNumber: '80',
          gender: KurinGender.MALE,
          stanytsia: 'Львів',
          probyProgramId: program.id,
          zvyazkovyi: zvyazkovyi({ email: dupeEmail }),
        })
        .expect(201);

      await request(app.getHttpServer())
        .post('/admin/kurins')
        .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
        .send({
          name: 'Другий',
          kurinNumber: '81',
          gender: KurinGender.MALE,
          stanytsia: 'Львів',
          probyProgramId: program.id,
          zvyazkovyi: zvyazkovyi({ email: dupeEmail }),
        })
        .expect(409);

      expect(await prisma.kurin.findUnique({ where: { kurinNumber: '81' } })).toBeNull();
    });

    it('returns 400 when an explicitly provided kurinNumber contains a slash', async () => {
      const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);

      await request(app.getHttpServer())
        .post('/admin/kurins')
        .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
        .send({
          name: 'Курінь Тестовий',
          kurinNumber: '/evil.com',
          gender: KurinGender.MALE,
          stanytsia: 'Львів',
          probyProgramId: program.id,
          zvyazkovyi: zvyazkovyi(),
        })
        .expect(400);
    });
  });

  describe('POST /admin/kurins/zvyazkovyi', () => {
    it('creates a zvyazkovyi for a kurin that has none yet, who can then log in', async () => {
      const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
      const kurin = await prisma.kurin.create({
        data: {
          name: 'Курінь',
          kurinNumber: '5',
          gender: KurinGender.MALE,
          stanytsia: 'Львів',
          probyProgramId: program.id,
        },
      });

      const response = await request(app.getHttpServer())
        .post('/admin/kurins/zvyazkovyi')
        .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
        .send({
          firstName: 'Іван',
          lastName: 'Франко',
          email: 'zvyazkovyi-bootstrap@example.com',
          password: 'secret123',
          kurinId: kurin.id,
        })
        .expect(201);

      expect(response.body.role).toBe('ZVYAZKOVYI');
      expect(response.body.passwordHash).toBeUndefined();

      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'zvyazkovyi-bootstrap@example.com', password: 'secret123' })
        .expect(201);
      expect(loginResponse.body.accessToken).toEqual(expect.any(String));
    });

    it('returns 404 when kurinId does not exist', async () => {
      await request(app.getHttpServer())
        .post('/admin/kurins/zvyazkovyi')
        .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
        .send({
          firstName: 'Іван',
          lastName: 'Франко',
          email: 'nobody@example.com',
          password: 'secret123',
          kurinId: '00000000-0000-0000-0000-000000000000',
        })
        .expect(404);
    });

    it('returns 409 when the kurin already has an active zvyazkovyi', async () => {
      const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
      const zv = zvyazkovyi();
      const createResponse = await request(app.getHttpServer())
        .post('/admin/kurins')
        .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
        .send({
          name: 'Курінь',
          kurinNumber: '90',
          gender: KurinGender.MALE,
          stanytsia: 'Львів',
          probyProgramId: program.id,
          zvyazkovyi: zv,
        })
        .expect(201);

      await request(app.getHttpServer())
        .post('/admin/kurins/zvyazkovyi')
        .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
        .send({
          firstName: 'Другий',
          lastName: 'Зв\'язковий',
          email: 'second@example.com',
          password: 'secret123',
          kurinId: createResponse.body.id,
        })
        .expect(409);
    });
  });

  describe('GET /admin/kurins', () => {
    it('lists all kurins with member/hurtok counts, ordered by kurinNumber', async () => {
      const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
      const kurinB = await createKurin(prisma, { probyProgramId: program.id, kurinNumber: 'B', name: 'Курінь Б' });
      await createKurin(prisma, { probyProgramId: program.id, kurinNumber: 'A', name: 'Курінь А' });
      await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurinB.id });

      const response = await request(app.getHttpServer())
        .get('/admin/kurins')
        .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
        .expect(200);

      expect(response.body.map((k: any) => k.kurinNumber)).toEqual(['A', 'B']);
      const b = response.body.find((k: any) => k.id === kurinB.id);
      expect(b.userCount).toBe(1);
      expect(b.hurtokCount).toBe(0);
    });

    it('returns 401 without admin credentials', async () => {
      await request(app.getHttpServer()).get('/admin/kurins').expect(401);
    });
  });

  describe('PATCH /admin/kurins/:id', () => {
    it("updates a kurin's name and number", async () => {
      const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
      const kurin = await createKurin(prisma, { probyProgramId: program.id, kurinNumber: '7' });

      const response = await request(app.getHttpServer())
        .patch(`/admin/kurins/${kurin.id}`)
        .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
        .send({ name: 'Новий Курінь', kurinNumber: '42' })
        .expect(200);

      expect(response.body.name).toBe('Новий Курінь');
      expect(response.body.kurinNumber).toBe('42');
    });

    it('returns 409 when the new kurinNumber is already taken by another kurin', async () => {
      const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
      await createKurin(prisma, { probyProgramId: program.id, kurinNumber: '1' });
      const kurin2 = await createKurin(prisma, { probyProgramId: program.id, kurinNumber: '2' });

      await request(app.getHttpServer())
        .patch(`/admin/kurins/${kurin2.id}`)
        .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
        .send({ kurinNumber: '1' })
        .expect(409);
    });

    it('returns 404 for a nonexistent kurin', async () => {
      await request(app.getHttpServer())
        .patch('/admin/kurins/00000000-0000-0000-0000-000000000000')
        .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
        .send({ name: 'X' })
        .expect(404);
    });
  });

  describe('DELETE /admin/kurins/:id', () => {
    it('deletes an empty kurin (no users, no hurtky)', async () => {
      const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
      const kurin = await createKurin(prisma, { probyProgramId: program.id });

      await request(app.getHttpServer())
        .delete(`/admin/kurins/${kurin.id}`)
        .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
        .expect(204);

      expect(await prisma.kurin.findUnique({ where: { id: kurin.id } })).toBeNull();
    });

    it('refuses to delete a kurin that still has members (409), and does not delete it', async () => {
      const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
      const kurin = await createKurin(prisma, { probyProgramId: program.id });
      await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });

      await request(app.getHttpServer())
        .delete(`/admin/kurins/${kurin.id}`)
        .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
        .expect(409);

      expect(await prisma.kurin.findUnique({ where: { id: kurin.id } })).not.toBeNull();
    });

    it('returns 404 for a nonexistent kurin', async () => {
      await request(app.getHttpServer())
        .delete('/admin/kurins/00000000-0000-0000-0000-000000000000')
        .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
        .expect(404);
    });
  });
});
