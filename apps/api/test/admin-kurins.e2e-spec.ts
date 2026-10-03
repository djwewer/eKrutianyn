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

  describe('POST /admin/kurins', () => {
    it('creates a kurin when the admin key is correct', async () => {
      const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);

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
        })
        .expect(201);

      expect(response.body.id).toEqual(expect.any(String));
      expect(response.body.name).toBe('Курінь Тестовий');
    });

    it('returns 401 with a missing or wrong admin key', async () => {
      const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
      const payload = {
        name: 'Курінь Тестовий',
        kurinNumber: '5',
        gender: KurinGender.MALE,
        stanytsia: 'Львів',
        probyProgramId: program.id,
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
        })
        .expect(404);
    });

    it('auto-assigns "П-1" when kurinNumber is omitted', async () => {
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
        })
        .expect(201);

      expect(response.body.kurinNumber).toBe('П-1');
    });

    it('auto-assigns "П-2" when "П-1" already exists', async () => {
      const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
      await request(app.getHttpServer())
        .post('/admin/kurins')
        .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
        .send({ name: 'Перший', gender: KurinGender.MALE, stanytsia: 'Львів', probyProgramId: program.id })
        .expect(201);

      const response = await request(app.getHttpServer())
        .post('/admin/kurins')
        .set('x-admin-key', adminKey)
        .set('x-admin-username', adminUsername)
        .set('x-admin-password', adminPassword)
        .send({ name: 'Другий', gender: KurinGender.MALE, stanytsia: 'Львів', probyProgramId: program.id })
        .expect(201);

      expect(response.body.kurinNumber).toBe('П-2');
    });

    it('returns 409 when an explicitly provided kurinNumber is already taken', async () => {
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
        })
        .expect(201);

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
        })
        .expect(409);
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
        })
        .expect(400);
    });
  });

  describe('POST /admin/kurins/zvyazkovyi', () => {
    it('creates the first zvyazkovyi for a kurin, who can then log in', async () => {
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
