import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { PrismaClient, Role, ProbyProgramVersion } from '@prisma/client';
import * as argon2 from 'argon2';
import { AppModule } from '../src/app.module';
import { MailService } from '../src/mail/mail.service';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser } from './utils/fixtures';

describe('Forgot / reset password (e2e)', () => {
  let app: INestApplication;
  let mailService: { sendPasswordReset: jest.Mock };
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_TEST } } });

  beforeAll(async () => {
    mailService = { sendPasswordReset: jest.fn() };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService)
      .useValue(mailService)
      .compile();
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
    mailService.sendPasswordReset.mockClear();
  });

  it('returns 200/201 for an unknown email without sending mail (no user enumeration)', async () => {
    await request(app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email: 'nobody@example.com' })
      .expect((res) => expect([200, 201]).toContain(res.status));

    expect(mailService.sendPasswordReset).not.toHaveBeenCalled();
  });

  it('completes the full forgot -> reset -> login-with-new-password cycle', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const user = await createUser(prisma, {
      role: Role.ZVYAZKOVYI,
      kurinId: kurin.id,
      email: 'zvyazkovyi@example.com',
      password: 'old-password-123',
    });

    await request(app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email: user.email })
      .expect((res) => expect([200, 201]).toContain(res.status));

    expect(mailService.sendPasswordReset).toHaveBeenCalledTimes(1);
    const [, resetUrl] = mailService.sendPasswordReset.mock.calls[0];
    const token = new URL(resetUrl).searchParams.get('token')!;

    await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send({ token, newPassword: 'brand-new-password-456' })
      .expect((res) => expect([200, 201]).toContain(res.status));

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    await expect(argon2.verify(updated.passwordHash!, 'brand-new-password-456')).resolves.toBe(true);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: user.email, password: 'brand-new-password-456' })
      .expect((res) => expect([200, 201]).toContain(res.status));
  });

  it('rejects reusing the same reset token twice', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const user = await createUser(prisma, {
      role: Role.ZVYAZKOVYI,
      kurinId: kurin.id,
      email: 'zvyazkovyi2@example.com',
      password: 'old-password-123',
    });

    await request(app.getHttpServer()).post('/auth/forgot-password').send({ email: user.email });
    const [, resetUrl] = mailService.sendPasswordReset.mock.calls[0];
    const token = new URL(resetUrl).searchParams.get('token')!;

    await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send({ token, newPassword: 'first-new-password' })
      .expect((res) => expect([200, 201]).toContain(res.status));

    await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send({ token, newPassword: 'second-new-password' })
      .expect(400);
  });

  it('rejects an unknown/garbage token with 400', async () => {
    await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send({ token: 'not-a-real-token', newPassword: 'whatever-123' })
      .expect(400);
  });
});
