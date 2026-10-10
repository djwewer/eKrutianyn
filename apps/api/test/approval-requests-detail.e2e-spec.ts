import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, Role, ProbyProgramVersion, ApprovalActionType, ApprovalStatus, PositionScope, PositionType } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser, createKurinniyUser, issueTokenFor } from './utils/fixtures';

describe('GET /approval-requests/:id (e2e)', () => {
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

  it('lets a zvyazkovyi view a pending request in their own kurin', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const kurinniy = await createKurinniyUser(prisma, { kurinId: kurin.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const req = await prisma.approvalRequest.create({
      data: {
        initiatedById: kurinniy.id,
        junakId: junak.id,
        actionType: ApprovalActionType.CHANGE_FULL_NAME,
        newData: { firstName: 'Нове', lastName: "Ім'я" },
        status: ApprovalStatus.PENDING,
      },
    });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    const response = await request(app.getHttpServer())
      .get(`/approval-requests/${req.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.id).toBe(req.id);
    expect(response.body.status).toBe(ApprovalStatus.PENDING);
  });

  it('lets a zvyazkovyi view an already-decided request', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const kurinniy = await createKurinniyUser(prisma, { kurinId: kurin.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const req = await prisma.approvalRequest.create({
      data: {
        initiatedById: kurinniy.id,
        junakId: junak.id,
        actionType: ApprovalActionType.CHANGE_FULL_NAME,
        newData: { firstName: 'Нове', lastName: "Ім'я" },
        status: ApprovalStatus.APPROVED,
        approvedById: zvyazkovyi.id,
        decidedAt: new Date(),
      },
    });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    const response = await request(app.getHttpServer())
      .get(`/approval-requests/${req.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.status).toBe(ApprovalStatus.APPROVED);
  });

  it('returns 404 for a request from another kurin', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurinA = await createKurin(prisma, { probyProgramId: program.id, name: 'A' });
    const kurinB = await createKurin(prisma, { probyProgramId: program.id, name: 'B' });
    const kurinniyB = await createKurinniyUser(prisma, { kurinId: kurinB.id });
    const junakB = await createUser(prisma, { role: Role.JUNAK, kurinId: kurinB.id });
    const req = await prisma.approvalRequest.create({
      data: {
        initiatedById: kurinniyB.id,
        junakId: junakB.id,
        actionType: ApprovalActionType.CHANGE_FULL_NAME,
        newData: { firstName: 'X', lastName: 'Y' },
        status: ApprovalStatus.PENDING,
      },
    });
    const zvyazkovyiA = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurinA.id });
    const token = issueTokenFor(jwtService, zvyazkovyiA);

    await request(app.getHttpServer())
      .get(`/approval-requests/${req.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('forbids kurinniy, vykhovnyk, and junak from viewing request detail', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const kurinniy = await createKurinniyUser(prisma, { kurinId: kurin.id });
    const vykhovnyk = await createUser(prisma, { role: Role.VYKHOVNYK, kurinId: kurin.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const req = await prisma.approvalRequest.create({
      data: {
        initiatedById: kurinniy.id,
        junakId: junak.id,
        actionType: ApprovalActionType.CHANGE_FULL_NAME,
        newData: { firstName: 'X', lastName: 'Y' },
        status: ApprovalStatus.PENDING,
      },
    });

    await request(app.getHttpServer())
      .get(`/approval-requests/${req.id}`)
      .set('Authorization', `Bearer ${issueTokenFor(jwtService, kurinniy)}`)
      .expect(403);

    await request(app.getHttpServer())
      .get(`/approval-requests/${req.id}`)
      .set('Authorization', `Bearer ${issueTokenFor(jwtService, vykhovnyk)}`)
      .expect(403);

    await request(app.getHttpServer())
      .get(`/approval-requests/${req.id}`)
      .set('Authorization', `Bearer ${issueTokenFor(jwtService, junak)}`)
      .expect(403);
  });

  it('returns 404 for a nonexistent id', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    await request(app.getHttpServer())
      .get('/approval-requests/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('resolves matchedUserId in a BULK_IMPORT_JUNAKY request to the junak\'s current data, scoped to the own kurin', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const otherKurin = await createKurin(prisma, { probyProgramId: program.id });
    const kurinniy = await createKurinniyUser(prisma, { kurinId: kurin.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const hurtok = await prisma.hurtok.create({ data: { name: 'Орлики', kurinId: kurin.id } });
    const target = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id, hurtokId: hurtok.id });
    await prisma.kurinPosition.create({
      data: {
        kurinId: kurin.id,
        scope: PositionScope.KURIN,
        positionType: PositionType.INTENDANT,
        userId: target.id,
        assignedById: kurinniy.id,
      },
    });
    const foreign = await createUser(prisma, { role: Role.JUNAK, kurinId: otherKurin.id });
    const req = await prisma.approvalRequest.create({
      data: {
        initiatedById: kurinniy.id,
        actionType: ApprovalActionType.BULK_IMPORT_JUNAKY,
        newData: {
          rows: [
            { rowIndex: 0, matchedUserId: target.id, firstName: target.firstName, lastName: target.lastName, email: 'x@example.com' },
            { rowIndex: 1, matchedUserId: foreign.id, firstName: 'Чужий', lastName: 'Юнак', email: 'y@example.com' },
            { rowIndex: 2, firstName: 'Новий', lastName: 'Юнак', email: 'z@example.com' },
          ],
        },
        status: ApprovalStatus.PENDING,
      },
    });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    const response = await request(app.getHttpServer())
      .get(`/approval-requests/${req.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const resolved = response.body.matchedJunaky;
    expect(Object.keys(resolved)).toEqual([target.id]);
    expect(resolved[target.id]).toMatchObject({
      firstName: target.firstName,
      lastName: target.lastName,
      email: target.email,
      hurtokName: 'Орлики',
      kurinPositionTypes: [PositionType.INTENDANT],
      hurtokPositionTypes: [],
    });
  });

  it('does not add matchedJunaky to non-bulk-import requests', async () => {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const kurinniy = await createKurinniyUser(prisma, { kurinId: kurin.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const req = await prisma.approvalRequest.create({
      data: {
        initiatedById: kurinniy.id,
        junakId: junak.id,
        actionType: ApprovalActionType.CHANGE_EMAIL,
        newData: { email: 'new@example.com' },
        status: ApprovalStatus.PENDING,
      },
    });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    const response = await request(app.getHttpServer())
      .get(`/approval-requests/${req.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.matchedJunaky).toBeUndefined();
  });
});
