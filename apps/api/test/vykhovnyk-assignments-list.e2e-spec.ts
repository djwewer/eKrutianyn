import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, Role, ProbyProgramVersion } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser, issueTokenFor } from './utils/fixtures';

describe('GET /vykhovnyk-assignments (e2e)', () => {
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

  it('lets a zvyazkovyi list all assignments in their kurin, excluding other kurins', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurinA = await createKurin(prisma, { probyProgramId: program.id, name: 'A' });
    const kurinB = await createKurin(prisma, { probyProgramId: program.id, name: 'B' });
    const hurtokA = await prisma.hurtok.create({ data: { name: 'HA', kurinId: kurinA.id } });
    const hurtokB = await prisma.hurtok.create({ data: { name: 'HB', kurinId: kurinB.id } });
    const vykhovnykA = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurinA.id });
    const vykhovnykB = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurinB.id });
    const assignmentA = await prisma.vykhovnykHurtok.create({
      data: { vykhovnykId: vykhovnykA.id, hurtokId: hurtokA.id },
    });
    await prisma.vykhovnykHurtok.create({ data: { vykhovnykId: vykhovnykB.id, hurtokId: hurtokB.id } });

    const zvyazkovyiA = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurinA.id });
    const token = issueTokenFor(jwtService, zvyazkovyiA);

    const response = await request(app.getHttpServer())
      .get('/vykhovnyk-assignments')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0].id).toBe(assignmentA.id);
  });

  it('lets a vykhovnyk list only their own assignments', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const hurtokA = await prisma.hurtok.create({ data: { name: 'A', kurinId: kurin.id } });
    const hurtokB = await prisma.hurtok.create({ data: { name: 'B', kurinId: kurin.id } });
    const vykhovnyk1 = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    const vykhovnyk2 = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    const assignment1 = await prisma.vykhovnykHurtok.create({
      data: { vykhovnykId: vykhovnyk1.id, hurtokId: hurtokA.id },
    });
    await prisma.vykhovnykHurtok.create({ data: { vykhovnykId: vykhovnyk2.id, hurtokId: hurtokB.id } });

    const token = issueTokenFor(jwtService, vykhovnyk1);
    const response = await request(app.getHttpServer())
      .get('/vykhovnyk-assignments')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0].id).toBe(assignment1.id);
  });

  it('forbids a kurinniy and a junak from listing assignments', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const kurinniy = await createUser(prisma, { role: Role.KURINNYI, kurinId: kurin.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });

    await request(app.getHttpServer())
      .get('/vykhovnyk-assignments')
      .set('Authorization', `Bearer ${issueTokenFor(jwtService, kurinniy)}`)
      .expect(403);

    await request(app.getHttpServer())
      .get('/vykhovnyk-assignments')
      .set('Authorization', `Bearer ${issueTokenFor(jwtService, junak)}`)
      .expect(403);
  });

  it('returns 404 when hurtokId belongs to another kurin', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurinA = await createKurin(prisma, { probyProgramId: program.id, name: 'A' });
    const kurinB = await createKurin(prisma, { probyProgramId: program.id, name: 'B' });
    const hurtokB = await prisma.hurtok.create({ data: { name: 'HB', kurinId: kurinB.id } });
    const zvyazkovyiA = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurinA.id });
    const token = issueTokenFor(jwtService, zvyazkovyiA);

    await request(app.getHttpServer())
      .get(`/vykhovnyk-assignments?hurtokId=${hurtokB.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('returns 401 without a token', async () => {
    await request(app.getHttpServer()).get('/vykhovnyk-assignments').expect(401);
  });
});
