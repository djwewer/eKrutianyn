import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, Role, ProbyProgramVersion } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser, issueTokenFor } from './utils/fixtures';

describe('Users (e2e)', () => {
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

  describe('POST /users', () => {
    it('lets zvyazkovyi create a vykhovnyk', async () => {
      const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
      const kurin = await createKurin(prisma, { probyProgramId: program.id });
      const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
      const token = issueTokenFor(jwtService, zvyazkovyi);

      const response = await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${token}`)
        .send({ firstName: 'Марія', lastName: 'Іванко', email: 'vykhovnyk@example.com', role: Role.VYKHOVNYK })
        .expect(201);

      expect(response.body.role).toBe(Role.VYKHOVNYK);
      expect(response.body.kurinId).toBe(kurin.id);
      expect(response.body.passwordHash).toBeUndefined();
    });

    it('requires hurtokId for JUNAK and rejects a hurtok from another kurin', async () => {
      const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
      const kurinA = await createKurin(prisma, { probyProgramId: program.id, name: 'A' });
      const kurinB = await createKurin(prisma, { probyProgramId: program.id, name: 'B' });
      const hurtokB = await prisma.hurtok.create({ data: { name: 'Hurtok B', kurinId: kurinB.id } });
      const zvyazkovyiA = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurinA.id });
      const token = issueTokenFor(jwtService, zvyazkovyiA);

      await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${token}`)
        .send({ firstName: 'Юн', lastName: 'Ак', email: 'junak-nohurtok@example.com', role: Role.JUNAK })
        .expect(400);

      await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${token}`)
        .send({
          firstName: 'Юн',
          lastName: 'Ак',
          email: 'junak-crosstenant@example.com',
          role: Role.JUNAK,
          hurtokId: hurtokB.id,
        })
        .expect(404);
    });

    it('forbids creating another ZVYAZKOVYI through this endpoint', async () => {
      const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
      const kurin = await createKurin(prisma, { probyProgramId: program.id });
      const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
      const token = issueTokenFor(jwtService, zvyazkovyi);

      await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${token}`)
        .send({ firstName: 'X', lastName: 'Y', email: 'x@example.com', role: Role.ZVYAZKOVYI })
        .expect(400);
    });

    it('forbids a vykhovnyk from creating users', async () => {
      const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
      const kurin = await createKurin(prisma, { probyProgramId: program.id });
      const vykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
      const token = issueTokenFor(jwtService, vykhovnyk);

      await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${token}`)
        .send({ firstName: 'X', lastName: 'Y', email: 'x2@example.com', role: Role.JUNAK })
        .expect(403);
    });
  });

  describe('GET /users/me', () => {
    it("returns the caller's own profile without the password hash", async () => {
      const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
      const kurin = await createKurin(prisma, { probyProgramId: program.id });
      const junak = await createUser(prisma, {
        role: Role.JUNAK,
        kurinId: kurin.id,
        email: 'me@example.com',
        password: 'secret123',
      });
      const token = issueTokenFor(jwtService, junak);

      const response = await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.email).toBe('me@example.com');
      expect(response.body.passwordHash).toBeUndefined();
    });
  });
});
