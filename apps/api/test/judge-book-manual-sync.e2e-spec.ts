import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, ProbyProgramVersion, Role } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser, createKurinniyUser, issueTokenFor } from './utils/fixtures';
import { GoogleDriveService } from '../src/google-drive/google-drive.service';

describe('Книга судді — manual sync endpoint (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let fakeGoogleDrive: { readSheetValues: jest.Mock; updateCellValues: jest.Mock };
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_TEST } } });

  beforeAll(async () => {
    fakeGoogleDrive = { readSheetValues: jest.fn(), updateCellValues: jest.fn() };
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
    fakeGoogleDrive.readSheetValues.mockReset();
    fakeGoogleDrive.updateCellValues.mockReset().mockResolvedValue(undefined);
  });

  async function setup(options: { spreadsheet?: boolean; driveToken?: boolean; mapping?: boolean } = {}) {
    const { spreadsheet = true, driveToken = true, mapping = true } = options;
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    await prisma.kurin.update({
      where: { id: kurin.id },
      data: {
        judgeBookSpreadsheetId: spreadsheet ? 'sheet-1' : null,
        driveRefreshToken: driveToken ? 'refresh-token' : null,
      },
    });
    if (mapping) {
      await prisma.junakImportMapping.create({
        data: {
          kurinId: kurin.id,
          columnMapping: [
            { column: 'A', header: 'ПІБ', field: 'FIRST_LAST_NAME' },
            { column: 'B', header: 'Телефон', field: 'PHONE' },
          ],
          positionValueMapping: [],
        },
      });
    }
    return { kurin, zvyazkovyi, token: issueTokenFor(jwtService, zvyazkovyi) };
  }

  async function createNamedJunak(kurinId: string, firstName: string, lastName: string, data: object = {}) {
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId });
    return prisma.user.update({ where: { id: junak.id }, data: { firstName, lastName, ...data } });
  }

  const post = (kurinId: string, token: string) =>
    request(app.getHttpServer()).post(`/kurins/${kurinId}/junak-import/sync`).set('Authorization', `Bearer ${token}`);

  it('writes pending data to the sheet and reports what happened, including skipped and unlinked junaky', async () => {
    const { kurin, token } = await setup();
    await createNamedJunak(kurin.id, 'Іван', 'Петренко', { judgeBookRowNumber: 2, phone: '0501112233' });
    await createNamedJunak(kurin.id, 'Петро', 'Сидоренко', { judgeBookRowNumber: 3, phone: '0679998877' });
    await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id }); // never linked to a row
    fakeGoogleDrive.readSheetValues.mockResolvedValue([['ПІБ'], ['Іван Петренко'], ['Хтось Інший']]);

    const res = await post(kurin.id, token).expect((r) => expect([200, 201]).toContain(r.status));

    expect(fakeGoogleDrive.updateCellValues).toHaveBeenCalledWith(kurin.id, 'sheet-1', [
      { row: 2, column: 'B', value: '0501112233' },
    ]);
    expect(res.body).toMatchObject({ linkedJunaky: 2, syncedJunaky: 1, updatedCells: 1, unlinkedJunaky: 1 });
    expect(res.body.skipped).toEqual([
      { junakName: 'Петро Сидоренко', row: 3, reason: expect.stringContaining('Хтось Інший') },
    ]);
  });

  it('forbids anyone but the zvyazkovyi, including the kurinniy', async () => {
    const { kurin } = await setup();
    const kurinnyi = await createKurinniyUser(prisma, { kurinId: kurin.id });

    await post(kurin.id, issueTokenFor(jwtService, kurinnyi)).expect(403);
    expect(fakeGoogleDrive.updateCellValues).not.toHaveBeenCalled();
  });

  it("forbids a zvyazkovyi from triggering another kurin's sync", async () => {
    const { token } = await setup();
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const otherKurin = await createKurin(prisma, { probyProgramId: program.id });

    await post(otherKurin.id, token).expect(403);
  });

  it('returns 400 when no Книга судді is connected', async () => {
    const { kurin, token } = await setup({ spreadsheet: false });
    await post(kurin.id, token).expect(400);
  });

  it('returns 503 when Google Drive is not connected', async () => {
    const { kurin, token } = await setup({ driveToken: false });
    await post(kurin.id, token).expect(503);
  });

  it('returns 400 when the column mapping was never saved', async () => {
    const { kurin, token } = await setup({ mapping: false });
    await post(kurin.id, token).expect(400);
  });

  it('surfaces the real Google error as 503 instead of a generic 500', async () => {
    const { kurin, token } = await setup();
    await createNamedJunak(kurin.id, 'Іван', 'Петренко', { judgeBookRowNumber: 2, phone: '0501112233' });
    fakeGoogleDrive.readSheetValues.mockRejectedValue(new Error('Google Sheets API has not been used in project 123'));

    const res = await post(kurin.id, token).expect(503);

    expect(res.body.message).toContain('Google Sheets API has not been used');
  });
});
