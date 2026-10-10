import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, ProbyProgramVersion, Role } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser, issueTokenFor } from './utils/fixtures';
import { GoogleDriveService } from '../src/google-drive/google-drive.service';
import { JudgeBookSyncService } from '../src/kurins/judge-book-sync.service';

describe('Книга судді — new junak write-back and row linkage (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let sync: JudgeBookSyncService;
  let fakeGoogleDrive: { appendSheetRow: jest.Mock; readSheetValues: jest.Mock; updateCellValues: jest.Mock };
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_TEST } } });

  beforeAll(async () => {
    fakeGoogleDrive = { appendSheetRow: jest.fn(), readSheetValues: jest.fn(), updateCellValues: jest.fn() };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GoogleDriveService)
      .useValue(fakeGoogleDrive)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    jwtService = moduleRef.get(JwtService, { strict: false });
    sync = moduleRef.get(JudgeBookSyncService);
  });

  afterAll(async () => {
    await cleanDatabase(prisma);
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
    fakeGoogleDrive.appendSheetRow.mockReset().mockResolvedValue(12);
    fakeGoogleDrive.readSheetValues.mockReset();
    fakeGoogleDrive.updateCellValues.mockReset().mockResolvedValue(undefined);
  });

  async function setup(options: { connected?: boolean } = {}) {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const hurtok = await prisma.hurtok.create({ data: { name: 'Орли', kurinId: kurin.id } });
    if (options.connected !== false) {
      await prisma.kurin.update({
        where: { id: kurin.id },
        data: { judgeBookSpreadsheetId: 'sheet-1', driveRefreshToken: 'refresh-token' },
      });
      await prisma.junakImportMapping.create({
        data: {
          kurinId: kurin.id,
          columnMapping: [
            { column: 'A', header: 'ПІБ', field: 'FIRST_LAST_NAME' },
            { column: 'B', header: 'Email', field: 'EMAIL' },
            { column: 'C', header: 'Телефон', field: 'PHONE' },
          ],
          positionValueMapping: [],
        },
      });
    }
    return { kurin, zvyazkovyi, hurtok, token: issueTokenFor(jwtService, zvyazkovyi) };
  }

  function createJunakViaApi(token: string, hurtokId: string, email: string, role: Role = Role.JUNAK) {
    return request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'Іван', lastName: 'Петренко', email, role, hurtokId });
  }

  it('appends a junak created directly by the zvyazkovyi and remembers the row it landed on', async () => {
    const { kurin, hurtok, token } = await setup();
    const email = `direct-${Date.now()}@example.com`;

    const res = await createJunakViaApi(token, hurtok.id, email).expect(201);

    expect(fakeGoogleDrive.appendSheetRow).toHaveBeenCalledWith(kurin.id, 'sheet-1', ['Іван Петренко', email, '']);
    const stored = await prisma.user.findUnique({ where: { id: res.body.id } });
    expect(stored?.judgeBookRowNumber).toBe(12);
  });

  it('does not touch the sheet when a non-junak (vykhovnyk) is created', async () => {
    const { hurtok, token } = await setup();

    await createJunakViaApi(token, hurtok.id, `vykh-${Date.now()}@example.com`, Role.VYKHOVNYK).expect(201);

    expect(fakeGoogleDrive.appendSheetRow).not.toHaveBeenCalled();
  });

  it('creates the junak without any Drive call when no Книга судді is connected', async () => {
    const { hurtok, token } = await setup({ connected: false });

    await createJunakViaApi(token, hurtok.id, `nobook-${Date.now()}@example.com`).expect(201);

    expect(fakeGoogleDrive.appendSheetRow).not.toHaveBeenCalled();
  });

  it('still creates the junak (without a row number) when the append fails', async () => {
    const { hurtok, token } = await setup();
    fakeGoogleDrive.appendSheetRow.mockRejectedValue(new Error('Google API down'));
    const email = `fail-${Date.now()}@example.com`;

    const res = await createJunakViaApi(token, hurtok.id, email).expect(201);

    const stored = await prisma.user.findUnique({ where: { id: res.body.id } });
    expect(stored).not.toBeNull();
    expect(stored?.judgeBookRowNumber).toBeNull();
  });

  it('leaves the row number empty when the append response does not say which row was written', async () => {
    const { hurtok, token } = await setup();
    fakeGoogleDrive.appendSheetRow.mockResolvedValue(undefined);

    const res = await createJunakViaApi(token, hurtok.id, `norow-${Date.now()}@example.com`).expect(201);

    const stored = await prisma.user.findUnique({ where: { id: res.body.id } });
    expect(stored?.judgeBookRowNumber).toBeNull();
  });

  it('end to end: a newly added junak gets later changes (phone) pushed into their own row by the nightly sync', async () => {
    const { kurin, hurtok, token } = await setup();
    const email = `cycle-${Date.now()}@example.com`;
    const res = await createJunakViaApi(token, hurtok.id, email).expect(201);
    await prisma.user.update({ where: { id: res.body.id }, data: { phone: '0671112233' } });
    // the sheet as a human sees it: 11 other rows, then our junak on row 12
    fakeGoogleDrive.readSheetValues.mockResolvedValue([
      ...Array.from({ length: 11 }, () => ['Хтось інший']),
      ['Іван Петренко', email, ''],
    ]);

    await sync.syncKurinToSheet(kurin.id);

    expect(fakeGoogleDrive.updateCellValues).toHaveBeenCalledTimes(1);
    // The email is already in the sheet (it was written when the row was appended),
    // so only the phone added since then is pushed.
    expect(fakeGoogleDrive.updateCellValues.mock.calls[0][2]).toEqual([
      { row: 12, column: 'C', value: '0671112233' },
    ]);
  });
});
