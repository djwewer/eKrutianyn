import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, Role, ProbyProgramVersion, ProgressStatus, ProgressAction } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser, issueTokenFor } from './utils/fixtures';

describe('Proby progress unconfirm (e2e)', () => {
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
    const vykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    await prisma.vykhovnykHurtok.create({ data: { vykhovnykId: vykhovnyk.id, hurtokId: hurtok.id } });
    await prisma.junakProgress.create({
      data: {
        junakId: junak.id,
        pointId: points[0].id,
        status: ProgressStatus.DONE,
        confirmedById: vykhovnyk.id,
        confirmedAt: new Date(),
      },
    });
    return { kurin, hurtok, junak, points, vykhovnyk };
  }

  it('lets an assigned vykhovnyk undo a wrong confirmation and logs it', async () => {
    const { junak, points, vykhovnyk } = await setup();
    const token = issueTokenFor(jwtService, vykhovnyk);

    const response = await request(app.getHttpServer())
      .post(`/junaky/${junak.id}/progress/${points[0].id}/unconfirm`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    expect(response.body.status).toBe(ProgressStatus.NOT_DONE);
    expect(response.body.confirmedById).toBeNull();

    const auditEntries = await prisma.progressAuditLog.findMany({
      where: { junakId: junak.id, action: ProgressAction.UNCONFIRM },
    });
    expect(auditEntries).toHaveLength(1);
    expect(auditEntries[0].actorId).toBe(vykhovnyk.id);
  });

  it('forbids an unassigned vykhovnyk from unconfirming', async () => {
    const { junak, points, kurin } = await setup();
    const unassignedVykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, unassignedVykhovnyk);

    await request(app.getHttpServer())
      .post(`/junaky/${junak.id}/progress/${points[0].id}/unconfirm`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('returns 404 when the pointId does not exist', async () => {
    const { junak, vykhovnyk } = await setup();
    const token = issueTokenFor(jwtService, vykhovnyk);

    await request(app.getHttpServer())
      .post(`/junaky/${junak.id}/progress/00000000-0000-0000-0000-000000000000/unconfirm`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });
});
