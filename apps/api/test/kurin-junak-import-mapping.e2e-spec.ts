import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, Role, ProbyProgramVersion } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createProbyProgramTree, createKurin, createUser, createKurinniyUser, issueTokenFor } from './utils/fixtures';
import { GoogleDriveService } from '../src/google-drive/google-drive.service';

describe('Kurin Junak Import mapping (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let fakeGoogleDrive: { readSheetValues: jest.Mock; appendSheetRow: jest.Mock };
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_TEST } } });

  beforeAll(async () => {
    fakeGoogleDrive = { readSheetValues: jest.fn(), appendSheetRow: jest.fn() };
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
    fakeGoogleDrive.appendSheetRow.mockReset();
  });

  async function setup() {
    const { program } = await createProbyProgramTree(prisma, ProbyProgramVersion.OLD, ['Point 1']);
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    return { kurin };
  }

  it('reports no spreadsheet connected for a fresh kurin', async () => {
    const { kurin } = await setup();
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    const response = await request(app.getHttpServer())
      .get(`/kurins/${kurin.id}/junak-import/status`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toEqual({});
  });

  it('forbids a plain junak from accessing import status', async () => {
    const { kurin } = await setup();
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, junak);

    await request(app.getHttpServer())
      .get(`/kurins/${kurin.id}/junak-import/status`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('allows a kurinniy to read import status (not just zvyazkovyi)', async () => {
    const { kurin } = await setup();
    const kurinnyi = await createKurinniyUser(prisma, { kurinId: kurin.id });
    const token = issueTokenFor(jwtService, kurinnyi);

    await request(app.getHttpServer())
      .get(`/kurins/${kurin.id}/junak-import/status`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('sets the connected spreadsheet and reflects it in status', async () => {
    const { kurin } = await setup();
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    await request(app.getHttpServer())
      .patch(`/kurins/${kurin.id}/junak-import/spreadsheet`)
      .set('Authorization', `Bearer ${token}`)
      .send({ spreadsheetId: 'sheet-1', spreadsheetName: 'Книга судді' })
      .expect((res) => expect([200, 201]).toContain(res.status));

    const status = await request(app.getHttpServer())
      .get(`/kurins/${kurin.id}/junak-import/status`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(status.body.connectedSpreadsheetId).toBe('sheet-1');
    expect(status.body.connectedSpreadsheetName).toBe('Книга судді');
  });

  it('returns 403 for sheet-data when no spreadsheet is connected', async () => {
    const { kurin } = await setup();
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    await request(app.getHttpServer())
      .get(`/kurins/${kurin.id}/junak-import/sheet-data`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('returns the raw sheet grid once a spreadsheet is connected', async () => {
    const { kurin } = await setup();
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);
    await prisma.kurin.update({ where: { id: kurin.id }, data: { judgeBookSpreadsheetId: 'sheet-1' } });
    fakeGoogleDrive.readSheetValues.mockResolvedValue([['ПІБ', 'Псевдо'], ['Іван Петренко', 'Сокіл']]);

    const response = await request(app.getHttpServer())
      .get(`/kurins/${kurin.id}/junak-import/sheet-data`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.rows).toEqual([['ПІБ', 'Псевдо'], ['Іван Петренко', 'Сокіл']]);
  });

  it('surfaces the real Google API error instead of a generic 500 when readSheetValues throws', async () => {
    const { kurin } = await setup();
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);
    await prisma.kurin.update({ where: { id: kurin.id }, data: { judgeBookSpreadsheetId: 'sheet-1' } });
    fakeGoogleDrive.readSheetValues.mockRejectedValue(
      new Error('Google Sheets API has not been used in project 123 before or it is disabled'),
    );

    const response = await request(app.getHttpServer())
      .get(`/kurins/${kurin.id}/junak-import/sheet-data`)
      .set('Authorization', `Bearer ${token}`)
      .expect(503);

    expect(response.body.message).toContain('Google Sheets API has not been used in project 123');
  });

  it('saves and returns the mapping', async () => {
    const { kurin } = await setup();
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);
    const columnMapping = [{ column: 'B', header: 'ПІБ', field: 'FIRST_LAST_NAME' }];
    const positionValueMapping = [{ rawValue: 'Гуртковий', positionType: 'HURTKOVYI' }];

    await request(app.getHttpServer())
      .put(`/kurins/${kurin.id}/junak-import/mapping`)
      .set('Authorization', `Bearer ${token}`)
      .send({ columnMapping, positionValueMapping })
      .expect((res) => expect([200, 201]).toContain(res.status));

    const status = await request(app.getHttpServer())
      .get(`/kurins/${kurin.id}/junak-import/status`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(status.body.mapping.columnMapping).toEqual(columnMapping);
    expect(status.body.mapping.positionValueMapping).toEqual(positionValueMapping);
  });

  it('rejects a mapping with an invalid (oversized) column value', async () => {
    const { kurin } = await setup();
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    await request(app.getHttpServer())
      .put(`/kurins/${kurin.id}/junak-import/mapping`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        columnMapping: [{ column: 'ZZZZZZZZ', header: 'ПІБ', field: 'FIRST_LAST_NAME' }],
        positionValueMapping: [],
      })
      .expect(400);
  });

  it('rejects a mapping with an unknown field value', async () => {
    const { kurin } = await setup();
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    const token = issueTokenFor(jwtService, zvyazkovyi);

    await request(app.getHttpServer())
      .put(`/kurins/${kurin.id}/junak-import/mapping`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        columnMapping: [{ column: 'A', header: 'ПІБ', field: 'NOT_A_REAL_FIELD' }],
        positionValueMapping: [],
      })
      .expect(400);
  });
});
