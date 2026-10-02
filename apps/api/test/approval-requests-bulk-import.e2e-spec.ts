import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import {
  PrismaClient,
  Role,
  ProbyProgramVersion,
  ApprovalActionType,
  ApprovalStatus,
  PositionScope,
  PositionType,
} from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser, createKurinniyUser, issueTokenFor } from './utils/fixtures';

describe('Approval requests — BULK_IMPORT_JUNAKY (e2e)', () => {
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

  async function baseSetup() {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const kurinnyi = await createKurinniyUser(prisma, { kurinId: kurin.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    return { kurin, kurinnyi, zvyazkovyi };
  }

  it('lets kurinniy create a BULK_IMPORT_JUNAKY request', async () => {
    const { kurin, kurinnyi } = await baseSetup();
    const token = issueTokenFor(jwtService, kurinnyi);

    const response = await request(app.getHttpServer())
      .post('/approval-requests')
      .set('Authorization', `Bearer ${token}`)
      .send({
        actionType: ApprovalActionType.BULK_IMPORT_JUNAKY,
        newData: { rows: [{ rowIndex: 0, firstName: 'Іван', lastName: 'Петренко', email: `x-${Date.now()}@example.com` }] },
      })
      .expect((res) => expect([200, 201]).toContain(res.status));

    expect(response.body.actionType).toBe(ApprovalActionType.BULK_IMPORT_JUNAKY);
    expect(response.body.status).toBe(ApprovalStatus.PENDING);
  });

  it('lets a suddya create a BULK_IMPORT_JUNAKY request', async () => {
    const { kurin } = await baseSetup();
    const suddya = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    await prisma.kurinPosition.create({
      data: {
        kurinId: kurin.id,
        scope: PositionScope.KURIN,
        positionType: PositionType.SUDDIA,
        userId: suddya.id,
        assignedById: suddya.id,
      },
    });
    const token = issueTokenFor(jwtService, suddya);

    await request(app.getHttpServer())
      .post('/approval-requests')
      .set('Authorization', `Bearer ${token}`)
      .send({ actionType: ApprovalActionType.BULK_IMPORT_JUNAKY, newData: { rows: [] } })
      .expect((res) => expect([200, 201]).toContain(res.status));
  });

  it('forbids a plain junak (no kurinniy, no suddya) from creating a BULK_IMPORT_JUNAKY request', async () => {
    const { kurin } = await baseSetup();
    const plainJunak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, plainJunak);

    await request(app.getHttpServer())
      .post('/approval-requests')
      .set('Authorization', `Bearer ${token}`)
      .send({ actionType: ApprovalActionType.BULK_IMPORT_JUNAKY, newData: { rows: [] } })
      .expect(403);
  });

  it('processes all rows when zvyazkovyi approves the request', async () => {
    const { kurin, kurinnyi, zvyazkovyi } = await baseSetup();
    const email = `approved-${Date.now()}@example.com`;
    const pending = await prisma.approvalRequest.create({
      data: {
        initiatedById: kurinnyi.id,
        actionType: ApprovalActionType.BULK_IMPORT_JUNAKY,
        newData: { rows: [{ rowIndex: 0, firstName: 'Іван', lastName: 'Петренко', email }] },
        status: ApprovalStatus.PENDING,
      },
    });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    const response = await request(app.getHttpServer())
      .post(`/approval-requests/${pending.id}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .expect((res) => expect([200, 201]).toContain(res.status));

    expect(response.body.status).toBe(ApprovalStatus.APPROVED);
    const created = await prisma.user.findUnique({ where: { email } });
    expect(created).not.toBeNull();
    expect(created?.kurinId).toBe(kurin.id);
  });

  it('rejects approving a BULK_IMPORT_JUNAKY request a second time (already decided)', async () => {
    const { kurinnyi, zvyazkovyi } = await baseSetup();
    const pending = await prisma.approvalRequest.create({
      data: {
        initiatedById: kurinnyi.id,
        actionType: ApprovalActionType.BULK_IMPORT_JUNAKY,
        newData: { rows: [{ rowIndex: 0, firstName: 'Одна', lastName: 'Особа', email: `once-${Date.now()}@example.com` }] },
        status: ApprovalStatus.PENDING,
      },
    });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    await request(app.getHttpServer())
      .post(`/approval-requests/${pending.id}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .expect((res) => expect([200, 201]).toContain(res.status));

    await request(app.getHttpServer())
      .post(`/approval-requests/${pending.id}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('does not let an approved bulk import overwrite the kurinniy or grant KURINNYI', async () => {
    const { kurin, kurinnyi } = await baseSetup();
    const suddya = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    await prisma.kurinPosition.create({
      data: {
        kurinId: kurin.id,
        scope: PositionScope.KURIN,
        positionType: PositionType.SUDDIA,
        userId: suddya.id,
        assignedById: suddya.id,
      },
    });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const originalKurinniyEmail = kurinnyi.email;

    const pending = await prisma.approvalRequest.create({
      data: {
        initiatedById: suddya.id,
        actionType: ApprovalActionType.BULK_IMPORT_JUNAKY,
        newData: {
          rows: [
            { rowIndex: 0, matchedUserId: kurinnyi.id, firstName: kurinnyi.firstName, lastName: kurinnyi.lastName, email: 'evil@attacker.com' },
            { rowIndex: 1, matchedUserId: suddya.id, firstName: 'Attacker', lastName: 'Self', email: suddya.email, kurinPositionTypes: [PositionType.KURINNYI] },
          ],
        },
        status: ApprovalStatus.PENDING,
      },
    });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    await request(app.getHttpServer())
      .post(`/approval-requests/${pending.id}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .expect((res) => expect([200, 201]).toContain(res.status));

    const kurinniyAfter = await prisma.user.findUnique({ where: { id: kurinnyi.id } });
    expect(kurinniyAfter?.email).toBe(originalKurinniyEmail);

    const suddyaKurinPosition = await prisma.kurinPosition.findFirst({
      where: { userId: suddya.id, positionType: PositionType.KURINNYI, removedAt: null },
    });
    expect(suddyaKurinPosition).toBeNull();
  });
});
