import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as request from 'supertest';
import { PrismaClient, Role, ProbyProgramVersion } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { MailService } from '../src/mail/mail.service';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser, issueTokenFor } from './utils/fixtures';

describe('Email change (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let mailService: { sendEmailChangeConfirmation: jest.Mock };
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_TEST } } });

  beforeAll(async () => {
    mailService = { sendEmailChangeConfirmation: jest.fn() };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService)
      .useValue(mailService)
      .compile();
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
    mailService.sendEmailChangeConfirmation.mockClear();
  });

  it('rejects the wrong current password with 403 and sends no mail', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const user = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id, password: 'correct-pass' });
    const token = issueTokenFor(jwtService, user);

    await request(app.getHttpServer())
      .patch('/users/me/email')
      .set('Authorization', `Bearer ${token}`)
      .send({ newEmail: 'new@example.com', currentPassword: 'wrong-pass' })
      .expect(403);

    expect(mailService.sendEmailChangeConfirmation).not.toHaveBeenCalled();
  });

  it('does not change the email until the confirmation link is used', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const user = await createUser(prisma, {
      role: Role.ZVYAZKOVYI,
      kurinId: kurin.id,
      email: 'old@example.com',
      password: 'correct-pass',
    });
    const token = issueTokenFor(jwtService, user);

    await request(app.getHttpServer())
      .patch('/users/me/email')
      .set('Authorization', `Bearer ${token}`)
      .send({ newEmail: 'new@example.com', currentPassword: 'correct-pass' })
      .expect((res) => expect([200, 201]).toContain(res.status));

    const stillOld = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stillOld.email).toBe('old@example.com');
  });

  it('completes the full request -> confirm cycle and old email stops working for login', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const user = await createUser(prisma, {
      role: Role.ZVYAZKOVYI,
      kurinId: kurin.id,
      email: 'old2@example.com',
      password: 'correct-pass',
    });
    const token = issueTokenFor(jwtService, user);

    await request(app.getHttpServer())
      .patch('/users/me/email')
      .set('Authorization', `Bearer ${token}`)
      .send({ newEmail: 'new2@example.com', currentPassword: 'correct-pass' })
      .expect((res) => expect([200, 201]).toContain(res.status));

    const [, confirmUrl] = mailService.sendEmailChangeConfirmation.mock.calls[0];
    const confirmToken = new URL(confirmUrl).searchParams.get('token')!;

    await request(app.getHttpServer())
      .get(`/auth/confirm-email-change?token=${confirmToken}`)
      .expect((res) => expect([200, 201]).toContain(res.status));

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.email).toBe('new2@example.com');

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'old2@example.com', password: 'correct-pass' })
      .expect(401);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'new2@example.com', password: 'correct-pass' })
      .expect((res) => expect([200, 201]).toContain(res.status));
  });
});
