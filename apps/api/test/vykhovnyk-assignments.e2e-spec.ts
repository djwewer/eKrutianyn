import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, Role, ProbyProgramVersion } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser, issueTokenFor } from './utils/fixtures';

describe('Vykhovnyk assignments (e2e)', () => {
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

  it('lets zvyazkovyi assign a vykhovnyk to a hurtok', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const hurtok = await prisma.hurtok.create({ data: { name: 'Орлики', kurinId: kurin.id } });
    const vykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    const response = await request(app.getHttpServer())
      .post('/vykhovnyk-assignments')
      .set('Authorization', `Bearer ${token}`)
      .send({ vykhovnykId: vykhovnyk.id, hurtokId: hurtok.id })
      .expect(201);

    expect(response.body.vykhovnykId).toBe(vykhovnyk.id);
    expect(response.body.hurtokId).toBe(hurtok.id);
  });

  it('allows multiple vykhovnyky on one hurtok, rejects the exact same pair twice', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const hurtok = await prisma.hurtok.create({ data: { name: 'Орлики', kurinId: kurin.id } });
    const vykhovnyk1 = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    const vykhovnyk2 = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    await request(app.getHttpServer())
      .post('/vykhovnyk-assignments')
      .set('Authorization', `Bearer ${token}`)
      .send({ vykhovnykId: vykhovnyk1.id, hurtokId: hurtok.id })
      .expect(201);

    await request(app.getHttpServer())
      .post('/vykhovnyk-assignments')
      .set('Authorization', `Bearer ${token}`)
      .send({ vykhovnykId: vykhovnyk2.id, hurtokId: hurtok.id })
      .expect(201);

    await request(app.getHttpServer())
      .post('/vykhovnyk-assignments')
      .set('Authorization', `Bearer ${token}`)
      .send({ vykhovnykId: vykhovnyk1.id, hurtokId: hurtok.id })
      .expect(409);
  });

  it('returns 404 when the vykhovnyk or hurtok belongs to another kurin', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurinA = await createKurin(prisma, { probyProgramId: program.id, name: 'A' });
    const kurinB = await createKurin(prisma, { probyProgramId: program.id, name: 'B' });
    const hurtokB = await prisma.hurtok.create({ data: { name: 'Hurtok B', kurinId: kurinB.id } });
    const vykhovnykB = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurinB.id });
    const zvyazkovyiA = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurinA.id });
    const token = issueTokenFor(jwtService, zvyazkovyiA);

    await request(app.getHttpServer())
      .post('/vykhovnyk-assignments')
      .set('Authorization', `Bearer ${token}`)
      .send({ vykhovnykId: vykhovnykB.id, hurtokId: hurtokB.id })
      .expect(404);
  });

  it('forbids a vykhovnyk from creating assignments', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const hurtok = await prisma.hurtok.create({ data: { name: 'Орлики', kurinId: kurin.id } });
    const vykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, vykhovnyk);

    await request(app.getHttpServer())
      .post('/vykhovnyk-assignments')
      .set('Authorization', `Bearer ${token}`)
      .send({ vykhovnykId: vykhovnyk.id, hurtokId: hurtok.id })
      .expect(403);
  });

  it('lets zvyazkovyi remove an assignment', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const hurtok = await prisma.hurtok.create({ data: { name: 'Орлики', kurinId: kurin.id } });
    const vykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    const assignment = await prisma.vykhovnykHurtok.create({
      data: { vykhovnykId: vykhovnyk.id, hurtokId: hurtok.id },
    });

    await request(app.getHttpServer())
      .delete(`/vykhovnyk-assignments/${assignment.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const remaining = await prisma.vykhovnykHurtok.findUnique({ where: { id: assignment.id } });
    expect(remaining).toBeNull();
  });
});
