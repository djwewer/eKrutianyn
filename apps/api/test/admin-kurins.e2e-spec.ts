import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { PrismaClient, ProbyProgramVersion, KurinGender } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree } from './utils/fixtures';

describe('Admin kurins (e2e)', () => {
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

  describe('POST /admin/kurins', () => {
    it('creates a kurin when the admin key is correct', async () => {
      const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);

      const response = await request(app.getHttpServer())
        .post('/admin/kurins')
        .set('x-admin-key', adminKey)
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
        .send(payload)
        .expect(401);
    });

    it('returns 404 when probyProgramId does not exist', async () => {
      await request(app.getHttpServer())
        .post('/admin/kurins')
        .set('x-admin-key', adminKey)
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
        .send({ name: 'Перший', gender: KurinGender.MALE, stanytsia: 'Львів', probyProgramId: program.id })
        .expect(201);

      const response = await request(app.getHttpServer())
        .post('/admin/kurins')
        .set('x-admin-key', adminKey)
        .send({ name: 'Другий', gender: KurinGender.MALE, stanytsia: 'Львів', probyProgramId: program.id })
        .expect(201);

      expect(response.body.kurinNumber).toBe('П-2');
    });

    it('returns 409 when an explicitly provided kurinNumber is already taken', async () => {
      const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
      await request(app.getHttpServer())
        .post('/admin/kurins')
        .set('x-admin-key', adminKey)
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
});
