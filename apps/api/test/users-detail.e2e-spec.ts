import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, Role, ProbyProgramVersion } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser, issueTokenFor } from './utils/fixtures';

describe('GET /users/:id (e2e)', () => {
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

  it('lets a junak fetch their own record but not another user', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const otherJunak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, junak);

    const self = await request(app.getHttpServer())
      .get(`/users/${junak.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(self.body.id).toBe(junak.id);
    expect(self.body.passwordHash).toBeUndefined();

    await request(app.getHttpServer())
      .get(`/users/${otherJunak.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('lets a vykhovnyk fetch an assigned or hurtokless junak but not one from another hurtok', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const hurtokA = await prisma.hurtok.create({ data: { name: 'A', kurinId: kurin.id } });
    const hurtokB = await prisma.hurtok.create({ data: { name: 'B', kurinId: kurin.id } });
    const vykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    await prisma.vykhovnykHurtok.create({ data: { vykhovnykId: vykhovnyk.id, hurtokId: hurtokA.id } });
    const junakA = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id, hurtokId: hurtokA.id });
    const junakB = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id, hurtokId: hurtokB.id });
    const junakNoHurtok = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, vykhovnyk);

    await request(app.getHttpServer())
      .get(`/users/${junakA.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/users/${junakNoHurtok.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/users/${junakB.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('forbids a vykhovnyk from fetching another vykhovnyk (404)', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const vykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    const otherVykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, vykhovnyk);

    await request(app.getHttpServer())
      .get(`/users/${otherVykhovnyk.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('lets a zvyazkovyi fetch a junak or a vykhovnyk in their kurin, and 404s cross-tenant', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurinA = await createKurin(prisma, { probyProgramId: program.id, name: 'A' });
    const kurinB = await createKurin(prisma, { probyProgramId: program.id, name: 'B' });
    const zvyazkovyiA = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurinA.id });
    const junakA = await createUser(prisma, { role: Role.JUNAK, kurinId: kurinA.id });
    const vykhovnykA = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurinA.id });
    const junakB = await createUser(prisma, { role: Role.JUNAK, kurinId: kurinB.id });
    const token = issueTokenFor(jwtService, zvyazkovyiA);

    await request(app.getHttpServer())
      .get(`/users/${junakA.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/users/${vykhovnykA.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/users/${junakB.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('returns 404 for a nonexistent id', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    await request(app.getHttpServer())
      .get('/users/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });
});
