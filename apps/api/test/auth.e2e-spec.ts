import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { PrismaClient, Role, ProbyProgramVersion } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser } from './utils/fixtures';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_TEST } } });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await cleanDatabase(prisma);
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
  });

  describe('POST /auth/login', () => {
    it('returns an access token for correct email+password', async () => {
      const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
      const kurin = await createKurin(prisma, { probyProgramId: program.id });
      await createUser(prisma, {
        role: Role.ZVYAZKOVYI,
        kurinId: kurin.id,
        email: 'zvyazkovyi@example.com',
        password: 'secret123',
      });

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'zvyazkovyi@example.com', password: 'secret123' })
        .expect(201);

      expect(response.body.accessToken).toEqual(expect.any(String));
    });

    it('returns 401 for a wrong password', async () => {
      const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
      const kurin = await createKurin(prisma, { probyProgramId: program.id });
      await createUser(prisma, {
        role: Role.ZVYAZKOVYI,
        kurinId: kurin.id,
        email: 'zvyazkovyi2@example.com',
        password: 'secret123',
      });

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'zvyazkovyi2@example.com', password: 'wrong-password' })
        .expect(401);
    });

    it('returns 401 for an unknown email', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'nobody@example.com', password: 'whatever1' })
        .expect(401);
    });

    it('returns 400 when the body fails validation', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'not-an-email', password: 'short' })
        .expect(400);
    });
  });
});
