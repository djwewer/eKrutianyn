import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as request from 'supertest';
import { PrismaClient, Role, ProbyProgramVersion } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser, createKurinniyUser, issueTokenFor } from './utils/fixtures';

describe('guardian-contacts (e2e)', () => {
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

  it('lets zvyazkovyi add, list, edit, and remove a guardian contact', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    const created = await request(app.getHttpServer())
      .post(`/users/${junak.id}/guardian-contacts`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Марія Петренко', phone: '+380501234567', role: 'Мама' })
      .expect((res) => expect([200, 201]).toContain(res.status));

    expect(created.body.name).toBe('Марія Петренко');
    expect(created.body.email).toBeNull();

    const list = await request(app.getHttpServer())
      .get(`/users/${junak.id}/guardian-contacts`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].id).toBe(created.body.id);

    const updated = await request(app.getHttpServer())
      .patch(`/users/${junak.id}/guardian-contacts/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '+380509999999' })
      .expect(200);
    expect(updated.body.phone).toBe('+380509999999');
    expect(updated.body.name).toBe('Марія Петренко');

    await request(app.getHttpServer())
      .delete(`/users/${junak.id}/guardian-contacts/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect((res) => expect([200, 201]).toContain(res.status));

    const listAfterDelete = await request(app.getHttpServer())
      .get(`/users/${junak.id}/guardian-contacts`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(listAfterDelete.body).toHaveLength(0);
  });

  it('lets a kurinniy holder manage guardian contacts too', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const kurinnyi = await createKurinniyUser(prisma, { kurinId: kurin.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, kurinnyi);

    await request(app.getHttpServer())
      .post(`/users/${junak.id}/guardian-contacts`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Іван Петренко', phone: '+380501111111' })
      .expect((res) => expect([200, 201]).toContain(res.status));
  });

  it('forbids a vykhovnyk from any access', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const vykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, vykhovnyk);

    await request(app.getHttpServer())
      .get(`/users/${junak.id}/guardian-contacts`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);

    await request(app.getHttpServer())
      .post(`/users/${junak.id}/guardian-contacts`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Хтось', phone: '+380500000000' })
      .expect(403);
  });

  it('returns 404 for a junak in another kurin', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurinA = await createKurin(prisma, { probyProgramId: program.id, name: 'A' });
    const kurinB = await createKurin(prisma, { probyProgramId: program.id, name: 'B' });
    const zvyazkovyiA = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurinA.id });
    const junakB = await createUser(prisma, { role: Role.JUNAK, kurinId: kurinB.id });
    const token = issueTokenFor(jwtService, zvyazkovyiA);

    await request(app.getHttpServer())
      .get(`/users/${junakB.id}/guardian-contacts`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('lets a zvyazkovyi clear the role of a guardian contact by patching it to null', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    const created = await request(app.getHttpServer())
      .post(`/users/${junak.id}/guardian-contacts`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Марія Петренко', phone: '+380501234567', role: 'Мама' })
      .expect((res) => expect([200, 201]).toContain(res.status));
    expect(created.body.role).toBe('Мама');

    const updated = await request(app.getHttpServer())
      .patch(`/users/${junak.id}/guardian-contacts/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role: null })
      .expect(200);
    expect(updated.body.role).toBeNull();
  });

  it('returns 404 when guardianId belongs to a different junak', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const junak1 = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const junak2 = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    const created = await request(app.getHttpServer())
      .post(`/users/${junak1.id}/guardian-contacts`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Хтось', phone: '+380500000000' })
      .expect((res) => expect([200, 201]).toContain(res.status));

    await request(app.getHttpServer())
      .patch(`/users/${junak2.id}/guardian-contacts/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '+380501111111' })
      .expect(404);

    await request(app.getHttpServer())
      .delete(`/users/${junak2.id}/guardian-contacts/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });
});
