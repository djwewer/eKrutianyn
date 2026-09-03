import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, Role, ProbyProgramVersion, ProgressStatus } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser, createKurinniyUser, issueTokenFor } from './utils/fixtures';

describe('Proby progress GET (e2e)', () => {
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

  async function setup() {
    const { program, points } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const hurtok = await prisma.hurtok.create({ data: { name: 'Орлики', kurinId: kurin.id } });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id, hurtokId: hurtok.id });
    await prisma.junakProgress.create({
      data: { junakId: junak.id, pointId: points[0].id, status: ProgressStatus.DONE },
    });
    return { kurin, hurtok, junak, points };
  }

  it('lets a junak view their own progress', async () => {
    const { junak } = await setup();
    const token = issueTokenFor(jwtService, junak);

    const response = await request(app.getHttpServer())
      .get(`/junaky/${junak.id}/progress`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0].status).toBe(ProgressStatus.DONE);
  });

  it("forbids a junak from viewing another junak's progress", async () => {
    const { junak, kurin, hurtok } = await setup();
    const otherJunak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id, hurtokId: hurtok.id });
    const token = issueTokenFor(jwtService, otherJunak);

    await request(app.getHttpServer())
      .get(`/junaky/${junak.id}/progress`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('lets an assigned vykhovnyk view progress, forbids an unassigned one', async () => {
    const { junak, hurtok, kurin } = await setup();
    const assignedVykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    await prisma.vykhovnykHurtok.create({ data: { vykhovnykId: assignedVykhovnyk.id, hurtokId: hurtok.id } });
    const unassignedVykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });

    await request(app.getHttpServer())
      .get(`/junaky/${junak.id}/progress`)
      .set('Authorization', `Bearer ${issueTokenFor(jwtService, assignedVykhovnyk)}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/junaky/${junak.id}/progress`)
      .set('Authorization', `Bearer ${issueTokenFor(jwtService, unassignedVykhovnyk)}`)
      .expect(403);
  });

  it('lets zvyazkovyi view any junak in their own kurin', async () => {
    const { junak, kurin } = await setup();
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });

    await request(app.getHttpServer())
      .get(`/junaky/${junak.id}/progress`)
      .set('Authorization', `Bearer ${issueTokenFor(jwtService, zvyazkovyi)}`)
      .expect(200);
  });

  it("forbids a kurinnyi from viewing a junak's progress", async () => {
    const { junak, kurin } = await setup();
    const kurinnyi = await createKurinniyUser(prisma, { kurinId: kurin.id });

    await request(app.getHttpServer())
      .get(`/junaky/${junak.id}/progress`)
      .set('Authorization', `Bearer ${issueTokenFor(jwtService, kurinnyi)}`)
      .expect(403);
  });

  it('lets a kurinnyi view their own progress', async () => {
    const { program, points } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const kurinnyi = await createKurinniyUser(prisma, { kurinId: kurin.id });
    await prisma.junakProgress.create({
      data: { junakId: kurinnyi.id, pointId: points[0].id, status: ProgressStatus.DONE },
    });
    const token = issueTokenFor(jwtService, kurinnyi);

    const response = await request(app.getHttpServer())
      .get(`/junaky/${kurinnyi.id}/progress`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0].status).toBe(ProgressStatus.DONE);
  });

  it("forbids a kurinnyi from viewing another kurinnyi's progress", async () => {
    const { program, points } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const kurinnyi = await createKurinniyUser(prisma, { kurinId: kurin.id });
    const otherKurinnyi = await createKurinniyUser(prisma, { kurinId: kurin.id });
    await prisma.junakProgress.create({
      data: { junakId: kurinnyi.id, pointId: points[0].id, status: ProgressStatus.DONE },
    });
    const token = issueTokenFor(jwtService, otherKurinnyi);

    await request(app.getHttpServer())
      .get(`/junaky/${kurinnyi.id}/progress`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it("lets zvyazkovyi view a kurinnyi's progress", async () => {
    const { program, points } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const kurinnyi = await createKurinniyUser(prisma, { kurinId: kurin.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    await prisma.junakProgress.create({
      data: { junakId: kurinnyi.id, pointId: points[0].id, status: ProgressStatus.DONE },
    });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    const response = await request(app.getHttpServer())
      .get(`/junaky/${kurinnyi.id}/progress`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toHaveLength(1);
  });

  it('returns 404 for a junak in another kurin', async () => {
    const { junak } = await setup();
    const { program: otherProgram } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['P']);
    const otherKurin = await createKurin(prisma, { probyProgramId: otherProgram.id });
    const outsider = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: otherKurin.id });

    await request(app.getHttpServer())
      .get(`/junaky/${junak.id}/progress`)
      .set('Authorization', `Bearer ${issueTokenFor(jwtService, outsider)}`)
      .expect(404);
  });
});
