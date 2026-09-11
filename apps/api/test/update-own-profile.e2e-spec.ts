import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as request from 'supertest';
import { PrismaClient, Role, ProbyProgramVersion } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { MailService } from '../src/mail/mail.service';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser, issueTokenFor } from './utils/fixtures';

describe('PATCH /users/me (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let mailService: { sendProfileChangeNotification: jest.Mock };
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_TEST } } });

  beforeAll(async () => {
    mailService = { sendProfileChangeNotification: jest.fn() };
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
    mailService.sendProfileChangeNotification.mockClear();
  });

  it('lets anyone update nickname and phone with no log entry and no mail', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const user = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, user);

    await request(app.getHttpServer())
      .patch('/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ nickname: 'Сокіл', phone: '+380001112233' })
      .expect((res) => expect([200, 201]).toContain(res.status));

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.nickname).toBe('Сокіл');
    expect(updated.phone).toBe('+380001112233');
    expect(await prisma.profileChangeLog.count()).toBe(0);
    expect(mailService.sendProfileChangeNotification).not.toHaveBeenCalled();
  });

  it('lets a vykhovnyk change their own firstName with no log entry (not a tracked role)', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const user = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, user);

    await request(app.getHttpServer())
      .patch('/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'Новеім' })
      .expect((res) => expect([200, 201]).toContain(res.status));

    expect(await prisma.profileChangeLog.count()).toBe(0);
    expect(mailService.sendProfileChangeNotification).not.toHaveBeenCalled();
  });

  it('logs and notifies the assigned vykhovnyk when a junak changes their own firstName', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const hurtok = await prisma.hurtok.create({ data: { kurinId: kurin.id, name: 'Орлики' } });
    const vykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    await prisma.vykhovnykHurtok.create({ data: { vykhovnykId: vykhovnyk.id, hurtokId: hurtok.id } });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id, hurtokId: hurtok.id });
    const token = issueTokenFor(jwtService, junak);

    await request(app.getHttpServer())
      .patch('/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'Новеім\'я' })
      .expect((res) => expect([200, 201]).toContain(res.status));

    const logs = await prisma.profileChangeLog.findMany({ where: { userId: junak.id } });
    expect(logs).toHaveLength(1);
    expect(logs[0].field).toBe('firstName');
    expect(logs[0].oldValue).toBe(junak.firstName);
    expect(logs[0].newValue).toBe('Новеім\'я');

    expect(mailService.sendProfileChangeNotification).toHaveBeenCalledTimes(1);
    expect(mailService.sendProfileChangeNotification.mock.calls[0][0]).toBe(vykhovnyk.email);
  });

  it('logs but sends no mail for a junak with no assigned vykhovnyk', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, junak);

    await request(app.getHttpServer())
      .patch('/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ lastName: 'Новепрізвище' })
      .expect((res) => expect([200, 201]).toContain(res.status));

    expect(await prisma.profileChangeLog.count()).toBe(1);
    expect(mailService.sendProfileChangeNotification).not.toHaveBeenCalled();
  });

  it('does not log or notify when a junak resubmits their unchanged birthDate', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const junak = await prisma.user.create({
      data: {
        firstName: 'Тест',
        lastName: 'Юнак',
        email: `junak-birthdate-${Date.now()}@example.com`,
        role: Role.JUNAK,
        kurinId: kurin.id,
        birthDate: new Date('2010-05-15'),
      },
    });
    const token = issueTokenFor(jwtService, junak);

    await request(app.getHttpServer())
      .patch('/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ birthDate: '2010-05-15' })
      .expect((res) => expect([200, 201]).toContain(res.status));

    expect(await prisma.profileChangeLog.count()).toBe(0);
    expect(mailService.sendProfileChangeNotification).not.toHaveBeenCalled();
  });

  it('rejects a birthDate in the future', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, junak);

    await request(app.getHttpServer())
      .patch('/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ birthDate: '2999-01-01' })
      .expect(400);
  });

  it('still returns the updated profile even if the vykhovnyk notification email fails', async () => {
    mailService.sendProfileChangeNotification.mockRejectedValueOnce(new Error('Resend is down'));

    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const hurtok = await prisma.hurtok.create({ data: { kurinId: kurin.id, name: 'Соколи' } });
    const vykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    await prisma.vykhovnykHurtok.create({ data: { vykhovnykId: vykhovnyk.id, hurtokId: hurtok.id } });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id, hurtokId: hurtok.id });
    const token = issueTokenFor(jwtService, junak);

    const response = await request(app.getHttpServer())
      .patch('/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'Оновлене' })
      .expect((res) => expect([200, 201]).toContain(res.status));

    expect(response.body.firstName).toBe('Оновлене');
    const updated = await prisma.user.findUniqueOrThrow({ where: { id: junak.id } });
    expect(updated.firstName).toBe('Оновлене');
  });

  it('notifies every vykhovnyk assigned to the hurtok, not just one', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const hurtok = await prisma.hurtok.create({ data: { kurinId: kurin.id, name: 'Леви' } });
    const vykhovnyk1 = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id, email: `vykh1-${Date.now()}@example.com` });
    const vykhovnyk2 = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id, email: `vykh2-${Date.now()}@example.com` });
    await prisma.vykhovnykHurtok.create({ data: { vykhovnykId: vykhovnyk1.id, hurtokId: hurtok.id } });
    await prisma.vykhovnykHurtok.create({ data: { vykhovnykId: vykhovnyk2.id, hurtokId: hurtok.id } });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id, hurtokId: hurtok.id });
    const token = issueTokenFor(jwtService, junak);

    await request(app.getHttpServer())
      .patch('/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ lastName: 'Нове' })
      .expect((res) => expect([200, 201]).toContain(res.status));

    expect(mailService.sendProfileChangeNotification).toHaveBeenCalledTimes(2);
    const notifiedEmails = mailService.sendProfileChangeNotification.mock.calls.map((call) => call[0]);
    expect(notifiedEmails).toEqual(expect.arrayContaining([vykhovnyk1.email, vykhovnyk2.email]));
  });
});
