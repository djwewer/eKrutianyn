import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, Role, ProbyProgramVersion } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser, issueTokenFor } from './utils/fixtures';

describe('GET /users (e2e)', () => {
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

  it('forbids a junak from listing users', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, junak);

    await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('lets a vykhovnyk list only junaky from their assigned hurtok plus hurtokless junaky', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const hurtokA = await prisma.hurtok.create({ data: { name: 'A', kurinId: kurin.id } });
    const hurtokB = await prisma.hurtok.create({ data: { name: 'B', kurinId: kurin.id } });
    const vykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    await prisma.vykhovnykHurtok.create({ data: { vykhovnykId: vykhovnyk.id, hurtokId: hurtokA.id } });

    const junakA = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id, hurtokId: hurtokA.id });
    await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id, hurtokId: hurtokB.id });
    const junakNoHurtok = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });

    const token = issueTokenFor(jwtService, vykhovnyk);
    const response = await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const ids = response.body.map((u: any) => u.id).sort();
    expect(ids).toEqual([junakA.id, junakNoHurtok.id].sort());
  });

  it('forbids a vykhovnyk from filtering by role=VYKHOVNYK', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const vykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, vykhovnyk);

    await request(app.getHttpServer())
      .get('/users?role=VYKHOVNYK')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('lets a kurinniy list junaky by default and filter by role to see vykhovnyky/zvyazkovyi, but forbids listing other kurinni', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const kurinniy = await createUser(prisma, { role: Role.KURINNYI, kurinId: kurin.id });
    const kurinniy2 = await createUser(prisma, { role: Role.KURINNYI, kurinId: kurin.id });
    const junak1 = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const junak2 = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const vykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, kurinniy);

    const defaultList = await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(defaultList.body.map((u: any) => u.id).sort()).toEqual([junak1.id, junak2.id].sort());

    const vykhovnykyList = await request(app.getHttpServer())
      .get('/users?role=VYKHOVNYK')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(vykhovnykyList.body).toHaveLength(1);
    expect(vykhovnykyList.body[0].id).toBe(vykhovnyk.id);

    const zvyazkovyiList = await request(app.getHttpServer())
      .get('/users?role=ZVYAZKOVYI')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(zvyazkovyiList.body).toHaveLength(1);
    expect(zvyazkovyiList.body[0].id).toBe(zvyazkovyi.id);

    await request(app.getHttpServer())
      .get('/users?role=KURINNYI')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('lets a zvyazkovyi list all roles in their kurin with no filter, and filter by role', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const vykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    const kurinnyi = await createUser(prisma, { role: Role.KURINNYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    const all = await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(all.body.map((u: any) => u.id).sort()).toEqual([junak.id, vykhovnyk.id, kurinnyi.id].sort());

    const onlyVykhovnyky = await request(app.getHttpServer())
      .get('/users?role=VYKHOVNYK')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(onlyVykhovnyky.body).toHaveLength(1);
    expect(onlyVykhovnyky.body[0].id).toBe(vykhovnyk.id);

    const onlyKurinni = await request(app.getHttpServer())
      .get('/users?role=KURINNYI')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(onlyKurinni.body).toHaveLength(1);
    expect(onlyKurinni.body[0].id).toBe(kurinnyi.id);
  });

  it('returns 404 when hurtokId belongs to another kurin', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurinA = await createKurin(prisma, { probyProgramId: program.id, name: 'A' });
    const kurinB = await createKurin(prisma, { probyProgramId: program.id, name: 'B' });
    const hurtokB = await prisma.hurtok.create({ data: { name: 'B', kurinId: kurinB.id } });
    const zvyazkovyiA = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurinA.id });
    const token = issueTokenFor(jwtService, zvyazkovyiA);

    await request(app.getHttpServer())
      .get(`/users?hurtokId=${hurtokB.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('returns 401 without a token', async () => {
    await request(app.getHttpServer()).get('/users').expect(401);
  });
});
