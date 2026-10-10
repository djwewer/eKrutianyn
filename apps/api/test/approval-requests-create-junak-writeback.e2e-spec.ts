import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, Role, ProbyProgramVersion, ApprovalActionType, ApprovalStatus } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser, createKurinniyUser, issueTokenFor } from './utils/fixtures';
import { GoogleDriveService } from '../src/google-drive/google-drive.service';

describe('CREATE_JUNAK approval — Книга судді write-back (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let fakeGoogleDrive: { appendSheetRow: jest.Mock };
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_TEST } } });

  beforeAll(async () => {
    fakeGoogleDrive = { appendSheetRow: jest.fn() };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GoogleDriveService)
      .useValue(fakeGoogleDrive)
      .compile();
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
    fakeGoogleDrive.appendSheetRow.mockReset().mockResolvedValue(undefined);
  });

  async function setup() {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const kurinnyi = await createKurinniyUser(prisma, { kurinId: kurin.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    return { kurin, kurinnyi, zvyazkovyi };
  }

  it('appends a new row to the connected sheet when a junak is created via approval', async () => {
    const { kurin, kurinnyi, zvyazkovyi } = await setup();
    await prisma.kurin.update({ where: { id: kurin.id }, data: { judgeBookSpreadsheetId: 'sheet-1' } });
    await prisma.junakImportMapping.create({
      data: {
        kurinId: kurin.id,
        columnMapping: [
          { column: 'A', header: 'ПІБ', field: 'FIRST_LAST_NAME' },
          { column: 'B', header: 'Email', field: 'EMAIL' },
        ],
        positionValueMapping: [],
      },
    });
    const hurtok = await prisma.hurtok.create({ data: { name: 'Test Hurtok', kurinId: kurin.id } });
    const email = `writeback-${Date.now()}@example.com`;
    const pending = await prisma.approvalRequest.create({
      data: {
        initiatedById: kurinnyi.id,
        actionType: ApprovalActionType.CREATE_JUNAK,
        newData: { firstName: 'Іван', lastName: 'Петренко', email, hurtokId: hurtok.id },
        status: ApprovalStatus.PENDING,
      },
    });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    await request(app.getHttpServer())
      .post(`/approval-requests/${pending.id}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .expect((res) => expect([200, 201]).toContain(res.status));

    expect(fakeGoogleDrive.appendSheetRow).toHaveBeenCalledWith(kurin.id, 'sheet-1', ['Іван Петренко', email]);
  });

  it('still creates the junak when the write-back call throws', async () => {
    const { kurin, kurinnyi, zvyazkovyi } = await setup();
    await prisma.kurin.update({ where: { id: kurin.id }, data: { judgeBookSpreadsheetId: 'sheet-1' } });
    await prisma.junakImportMapping.create({
      data: { kurinId: kurin.id, columnMapping: [], positionValueMapping: [] },
    });
    fakeGoogleDrive.appendSheetRow.mockRejectedValue(new Error('Google API down'));
    const hurtok = await prisma.hurtok.create({ data: { name: 'Test Hurtok', kurinId: kurin.id } });
    const email = `writeback-fail-${Date.now()}@example.com`;
    const pending = await prisma.approvalRequest.create({
      data: {
        initiatedById: kurinnyi.id,
        actionType: ApprovalActionType.CREATE_JUNAK,
        newData: { firstName: 'Петро', lastName: 'Сидоренко', email, hurtokId: hurtok.id },
        status: ApprovalStatus.PENDING,
      },
    });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    await request(app.getHttpServer())
      .post(`/approval-requests/${pending.id}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .expect((res) => expect([200, 201]).toContain(res.status));

    const created = await prisma.user.findUnique({ where: { email } });
    expect(created).not.toBeNull();
  });

  it('includes the hurtok name in the appended row when HURTOK is mapped', async () => {
    const { kurin, kurinnyi, zvyazkovyi } = await setup();
    await prisma.kurin.update({ where: { id: kurin.id }, data: { judgeBookSpreadsheetId: 'sheet-1' } });
    await prisma.junakImportMapping.create({
      data: {
        kurinId: kurin.id,
        columnMapping: [
          { column: 'A', header: 'ПІБ', field: 'FIRST_LAST_NAME' },
          { column: 'B', header: 'Гурток', field: 'HURTOK' },
        ],
        positionValueMapping: [],
      },
    });
    const hurtok = await prisma.hurtok.create({ data: { name: 'Орли', kurinId: kurin.id } });
    const email = `hurtok-writeback-${Date.now()}@example.com`;
    const pending = await prisma.approvalRequest.create({
      data: {
        initiatedById: kurinnyi.id,
        actionType: ApprovalActionType.CREATE_JUNAK,
        newData: { firstName: 'Іван', lastName: 'Петренко', email, hurtokId: hurtok.id },
        status: ApprovalStatus.PENDING,
      },
    });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    await request(app.getHttpServer())
      .post(`/approval-requests/${pending.id}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .expect((res) => expect([200, 201]).toContain(res.status));

    expect(fakeGoogleDrive.appendSheetRow).toHaveBeenCalledWith(kurin.id, 'sheet-1', ['Іван Петренко', 'Орли']);
  });

  it('remembers which sheet row the new junak was appended to, so later syncs can update it', async () => {
    const { kurin, kurinnyi, zvyazkovyi } = await setup();
    await prisma.kurin.update({ where: { id: kurin.id }, data: { judgeBookSpreadsheetId: 'sheet-1' } });
    await prisma.junakImportMapping.create({
      data: {
        kurinId: kurin.id,
        columnMapping: [{ column: 'A', header: 'ПІБ', field: 'FIRST_LAST_NAME' }],
        positionValueMapping: [],
      },
    });
    fakeGoogleDrive.appendSheetRow.mockResolvedValue(42);
    const hurtok = await prisma.hurtok.create({ data: { name: 'Test Hurtok', kurinId: kurin.id } });
    const email = `rownum-${Date.now()}@example.com`;
    const pending = await prisma.approvalRequest.create({
      data: {
        initiatedById: kurinnyi.id,
        actionType: ApprovalActionType.CREATE_JUNAK,
        newData: { firstName: 'Олег', lastName: 'Мельник', email, hurtokId: hurtok.id },
        status: ApprovalStatus.PENDING,
      },
    });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    await request(app.getHttpServer())
      .post(`/approval-requests/${pending.id}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .expect((res) => expect([200, 201]).toContain(res.status));

    const created = await prisma.user.findUnique({ where: { email } });
    expect(created?.judgeBookRowNumber).toBe(42);
  });
});
