import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, Role, ProbyProgramVersion, PositionScope, PositionType } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser, createKurinniyUser, issueTokenFor } from './utils/fixtures';

describe('ARCHIVE_JUNAK approval flow (e2e)', () => {
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

  it('lets kurinniy create an ARCHIVE_JUNAK request and zvyazkovyi approve it', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const kurinniy = await createKurinniyUser(prisma, { kurinId: kurin.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const kurinniyToken = issueTokenFor(jwtService, kurinniy);
    const zvyazkovyiToken = issueTokenFor(jwtService, zvyazkovyi);

    const createResponse = await request(app.getHttpServer())
      .post('/approval-requests')
      .set('Authorization', `Bearer ${kurinniyToken}`)
      .send({ actionType: 'ARCHIVE_JUNAK', junakId: junak.id, newData: {} })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/approval-requests/${createResponse.body.id}/approve`)
      .set('Authorization', `Bearer ${zvyazkovyiToken}`)
      .expect(201);

    const updated = await prisma.user.findUnique({ where: { id: junak.id } });
    expect(updated?.archivedAt).not.toBeNull();
    expect(updated?.archivedById).toBe(zvyazkovyi.id);
  });

  it('lets a suddya-position-holder (not kurinniy) create an ARCHIVE_JUNAK request', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const suddya = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const anyZvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    await prisma.kurinPosition.create({
      data: {
        kurinId: kurin.id,
        scope: PositionScope.KURIN,
        positionType: PositionType.SUDDIA,
        userId: suddya.id,
        assignedById: anyZvyazkovyi.id,
      },
    });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const suddyaToken = issueTokenFor(jwtService, suddya);

    await request(app.getHttpServer())
      .post('/approval-requests')
      .set('Authorization', `Bearer ${suddyaToken}`)
      .send({ actionType: 'ARCHIVE_JUNAK', junakId: junak.id, newData: {} })
      .expect(201);
  });

  it('forbids a plain junak (no kurinniy, no suddya) from creating an ARCHIVE_JUNAK request', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const plainJunak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const targetJunak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, plainJunak);

    await request(app.getHttpServer())
      .post('/approval-requests')
      .set('Authorization', `Bearer ${token}`)
      .send({ actionType: 'ARCHIVE_JUNAK', junakId: targetJunak.id, newData: {} })
      .expect(403);
  });

  it('leaves the request PENDING if the junak gained a position after the request was created', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const kurinniy = await createKurinniyUser(prisma, { kurinId: kurin.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const kurinniyToken = issueTokenFor(jwtService, kurinniy);
    const zvyazkovyiToken = issueTokenFor(jwtService, zvyazkovyi);

    const createResponse = await request(app.getHttpServer())
      .post('/approval-requests')
      .set('Authorization', `Bearer ${kurinniyToken}`)
      .send({ actionType: 'ARCHIVE_JUNAK', junakId: junak.id, newData: {} })
      .expect(201);

    await prisma.kurinPosition.create({
      data: {
        kurinId: kurin.id,
        scope: PositionScope.KURIN,
        positionType: PositionType.PYSAR,
        userId: junak.id,
        assignedById: zvyazkovyi.id,
      },
    });

    await request(app.getHttpServer())
      .post(`/approval-requests/${createResponse.body.id}/approve`)
      .set('Authorization', `Bearer ${zvyazkovyiToken}`)
      .expect(400);

    const stillPending = await prisma.approvalRequest.findUnique({ where: { id: createResponse.body.id } });
    expect(stillPending?.status).toBe('PENDING');
    const unchangedJunak = await prisma.user.findUnique({ where: { id: junak.id } });
    expect(unchangedJunak?.archivedAt).toBeNull();
  });
});
