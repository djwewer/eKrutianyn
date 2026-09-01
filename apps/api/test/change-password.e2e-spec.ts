import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as request from 'supertest';
import { PrismaClient, Role, ProbyProgramVersion } from '@prisma/client';
import * as argon2 from 'argon2';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser, issueTokenFor } from './utils/fixtures';

describe('PATCH /users/me/password (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_TEST } } });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    jwtService = moduleRef.get(JwtService);
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

  it('rejects the wrong current password with 403', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const user = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id, password: 'correct-pass' });
    const token = issueTokenFor(jwtService, user);

    await request(app.getHttpServer())
      .patch('/users/me/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'wrong-pass', newPassword: 'new-password-123' })
      .expect(403);
  });

  it('changes the password with the correct current password', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const user = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id, password: 'correct-pass' });
    const token = issueTokenFor(jwtService, user);

    await request(app.getHttpServer())
      .patch('/users/me/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'correct-pass', newPassword: 'new-password-123' })
      .expect(200);

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    await expect(argon2.verify(updated.passwordHash!, 'new-password-123')).resolves.toBe(true);
  });

  it('lets a Google-only user (no existing password) set a first password without currentPassword', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const user = await prisma.user.create({
      data: {
        firstName: 'Test',
        lastName: 'User',
        email: `google-only-${Date.now()}@example.com`,
        role: Role.ZVYAZKOVYI,
        kurinId: kurin.id,
        googleId: 'google-sub-123',
      },
    });
    const token = issueTokenFor(jwtService, user);

    await request(app.getHttpServer())
      .patch('/users/me/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ newPassword: 'first-password-123' })
      .expect(200);
  });
});
