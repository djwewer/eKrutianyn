import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, ProbyProgramVersion, Role, GuardianRelation } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createKurin, createUser, issueTokenFor } from './utils/fixtures';
import { GoogleDriveService } from '../src/google-drive/google-drive.service';
import { JudgeBookSyncService } from '../src/kurins/judge-book-sync.service';

describe('Книга судді — parents, residence, study place, degrees (e2e)', () => {
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
    fakeGoogleDrive.appendSheetRow.mockReset().mockResolvedValue(9);
    fakeGoogleDrive.readSheetValues.mockReset();
    fakeGoogleDrive.updateCellValues.mockReset().mockResolvedValue(undefined);
  });

  const COLUMNS: Record<string, string> = {
    FIRST_LAST_NAME: 'A',
    PHONE: 'B',
    RESIDENCE: 'C',
    STUDY_PLACE: 'D',
    FATHER_NAME: 'E',
    FATHER_PHONE: 'F',
    FATHER_EMAIL: 'G',
    MOTHER_NAME: 'H',
    MOTHER_PHONE: 'I',
    MOTHER_EMAIL: 'J',
    GUARDIAN_1_NAME: 'K',
    DEGREE_PRYHYLNYK_DATE: 'L',
    DEGREE_ROZVIDUVACH_DATE: 'M',
    DEGREE_SKOB_DATE: 'N',
    CURRENT_DEGREE: 'O',
  };

  async function setup(options: { fields?: string[] } = {}) {
    const fields = options.fields ?? Object.keys(COLUMNS);
    const program = await prisma.probyProgram.create({ data: { version: ProbyProgramVersion.OLD, name: 'P' } });
    const stages: Record<string, { id: string }> = {};
    for (const [i, [key, name]] of Object.entries({
      PRYHYLNYK: 'Проба прихильника (Відзнака)',
      UCHASNYK: 'Проба учасника (Скобине крило)',
      ROZVIDUVACH: 'Проба розвідувача (Скобиний хват)',
    }).entries()) {
      stages[key] = await prisma.probyStage.create({ data: { programId: program.id, order: i + 1, name } });
    }
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    await prisma.kurin.update({
      where: { id: kurin.id },
      data: { judgeBookSpreadsheetId: 'sheet-1', driveRefreshToken: 'refresh-token' },
    });
    await prisma.junakImportMapping.create({
      data: {
        kurinId: kurin.id,
        columnMapping: fields.map((field) => ({ column: COLUMNS[field], header: field, field })),
        positionValueMapping: [],
      },
    });
    const zvyazkovyi = await createUser(prisma, { role: Role.ZVYAZKOVYI, kurinId: kurin.id });
    return { kurin, stages, zvyazkovyi, token: issueTokenFor(jwtService, zvyazkovyi) };
  }

  async function linkedJunak(kurinId: string, row: number, data: object = {}) {
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId });
    return prisma.user.update({
      where: { id: junak.id },
      data: { firstName: 'Іван', lastName: 'Петренко', judgeBookRowNumber: row, ...data },
    });
  }

  describe('import', () => {
    const importRows = (kurinId: string, token: string, rows: object[]) =>
      request(app.getHttpServer()).post(`/kurins/${kurinId}/junak-import/rows`).set('Authorization', `Bearer ${token}`).send({ rows });

    it('stores father and mother with their relation, plus residence, study place and the Скоб date', async () => {
      const { kurin, token } = await setup();

      const res = await importRows(kurin.id, token, [
        {
          rowIndex: 0,
          firstName: 'Іван',
          lastName: 'Петренко',
          email: 'ivan@example.com',
          residence: 'Львів, Зелена 5',
          studyPlace: 'Ліцей №3',
          skobDate: '2026-01-15',
          guardians: [
            { name: 'Петро Петренко', phone: '+380501111111', email: 'dad@example.com', relation: 'FATHER' },
            { name: 'Марія Петренко', phone: '+380502222222', relation: 'MOTHER' },
            { name: 'Ольга', phone: '+380503333333' },
          ],
        },
      ]).expect((r) => expect([200, 201]).toContain(r.status));

      expect(res.body.results[0].error).toBeUndefined();
      const junak = await prisma.user.findUniqueOrThrow({ where: { email: 'ivan@example.com' } });
      expect(junak).toMatchObject({ residence: 'Львів, Зелена 5', studyPlace: 'Ліцей №3' });
      expect(junak.skobDate?.toISOString()).toBe('2026-01-15T00:00:00.000Z');
      const contacts = await prisma.guardianContact.findMany({ where: { junakId: junak.id } });
      expect(contacts.find((c) => c.relation === GuardianRelation.FATHER)).toMatchObject({ name: 'Петро Петренко', email: 'dad@example.com' });
      expect(contacts.find((c) => c.relation === GuardianRelation.MOTHER)).toMatchObject({ name: 'Марія Петренко', phone: '+380502222222' });
      expect(contacts.find((c) => c.relation === GuardianRelation.GUARDIAN)).toMatchObject({ name: 'Ольга' });
    });

    it('accepts a parent with a name only — the judge adds the phone and email later', async () => {
      const { kurin, token } = await setup();
      const res = await importRows(kurin.id, token, [
        { rowIndex: 0, firstName: 'Іван', lastName: 'Петренко', email: 'a@example.com', guardians: [{ name: 'Марія', relation: 'MOTHER' }] },
      ]).expect((r) => expect([200, 201]).toContain(r.status));
      expect(res.body.results[0].error).toBeUndefined();
      const mother = await prisma.guardianContact.findFirstOrThrow({ where: { relation: 'MOTHER' } });
      expect(mother.phone).toBe('');
    });

    it('refreshes the existing mother by relation on re-import instead of adding a second one', async () => {
      const { kurin, token } = await setup();
      const junak = await linkedJunak(kurin.id, 2);
      await prisma.guardianContact.create({ data: { junakId: junak.id, name: 'Марія', phone: '', relation: 'MOTHER' } });

      await importRows(kurin.id, token, [
        {
          rowIndex: 0,
          matchedUserId: junak.id,
          firstName: 'Іван',
          lastName: 'Петренко',
          email: junak.email,
          guardians: [{ name: 'Марія Іванівна Петренко', phone: '+380509999999', relation: 'MOTHER' }],
        },
      ]).expect((r) => expect([200, 201]).toContain(r.status));

      const mothers = await prisma.guardianContact.findMany({ where: { junakId: junak.id, relation: 'MOTHER' } });
      expect(mothers).toHaveLength(1);
      expect(mothers[0]).toMatchObject({ name: 'Марія Іванівна Петренко', phone: '+380509999999' });
    });

    it('keeps what the app already has for residence, study place and Скоб date', async () => {
      const { kurin, token } = await setup();
      const junak = await linkedJunak(kurin.id, 2, {
        residence: 'Як в застосунку',
        studyPlace: null,
        skobDate: new Date('2025-05-05T00:00:00.000Z'),
      });

      await importRows(kurin.id, token, [
        {
          rowIndex: 0,
          matchedUserId: junak.id,
          firstName: 'Іван',
          lastName: 'Петренко',
          email: junak.email,
          residence: 'З таблиці',
          studyPlace: 'Школа з таблиці',
          skobDate: '2026-06-06',
        },
      ]).expect((r) => expect([200, 201]).toContain(r.status));

      const after = await prisma.user.findUniqueOrThrow({ where: { id: junak.id } });
      expect(after.residence).toBe('Як в застосунку');
      expect(after.studyPlace).toBe('Школа з таблиці');
      expect(after.skobDate?.toISOString()).toBe('2025-05-05T00:00:00.000Z');
    });

    it('accepts the new mapping fields when saving a mapping', async () => {
      const { kurin, token } = await setup();
      await request(app.getHttpServer())
        .put(`/kurins/${kurin.id}/junak-import/mapping`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          columnMapping: [
            { column: 'A', header: 'Мама', field: 'MOTHER_NAME' },
            { column: 'B', header: 'Тато тел', field: 'FATHER_PHONE' },
            { column: 'C', header: 'Ступінь', field: 'CURRENT_DEGREE' },
            { column: 'D', header: 'Скоб', field: 'DEGREE_SKOB_DATE' },
            { column: 'E', header: 'Проживання', field: 'RESIDENCE' },
            { column: 'F', header: 'Навчання', field: 'STUDY_PLACE' },
          ],
          positionValueMapping: [],
        })
        .expect((r) => expect([200, 201]).toContain(r.status));
    });
  });

  describe('write-back to the sheet', () => {
    it('pushes parents, residence, study place, all degree dates and the current degree into the mapped columns', async () => {
      const { kurin, stages } = await setup();
      const junak = await linkedJunak(kurin.id, 5, {
        phone: '0501112233',
        residence: 'Львів',
        studyPlace: 'Ліцей №3',
        skobDate: new Date('2026-02-01T00:00:00.000Z'),
      });
      for (const [key, iso] of [['PRYHYLNYK', '2023-05-10'], ['ROZVIDUVACH', '2025-06-21']]) {
        await prisma.junakStageProgress.create({
          data: { junakId: junak.id, stageId: stages[key].id, firstClosedAt: new Date(iso), closedAt: new Date(iso), closedById: junak.id },
        });
      }
      await prisma.guardianContact.createMany({
        data: [
          { junakId: junak.id, name: 'Петро', phone: '+380501111111', email: 'dad@example.com', relation: 'FATHER', createdAt: new Date(2026, 0, 1, 0, 0, 2) },
          { junakId: junak.id, name: 'Марія', phone: '+380502222222', relation: 'MOTHER', createdAt: new Date(2026, 0, 1, 0, 0, 1) },
          { junakId: junak.id, name: 'Бабуся Ольга', phone: '', role: 'бабуся', relation: 'GUARDIAN', createdAt: new Date(2026, 0, 1, 0, 0, 3) },
        ],
      });
      fakeGoogleDrive.readSheetValues.mockResolvedValue([[], [], [], [], ['Іван Петренко']]);

      const report = await sync.syncKurinToSheet(kurin.id);

      const updates = fakeGoogleDrive.updateCellValues.mock.calls[0][2] as { row: number; column: string; value: string }[];
      const byColumn = Object.fromEntries(updates.map((u) => [u.column, u.value]));
      expect(updates.every((u) => u.row === 5)).toBe(true);
      expect(byColumn).toEqual({
        B: '0501112233',
        C: 'Львів',
        D: 'Ліцей №3',
        E: 'Петро',
        F: '+380501111111',
        G: 'dad@example.com',
        H: 'Марія',
        I: '+380502222222',
        // mother has no email, the guardian has no phone/email: nothing written for those, never blanks
        K: 'Бабуся Ольга',
        L: '10.05.2023',
        M: '21.06.2025',
        N: '01.02.2026',
        O: 'Скоб',
      });
      expect(report.syncedJunaky).toBe(1);
    });

    it('shows a Розвідувач as Розвідувач in the current-degree column when there is no Скоб date', async () => {
      const { kurin, stages } = await setup({ fields: ['FIRST_LAST_NAME', 'CURRENT_DEGREE'] });
      const junak = await linkedJunak(kurin.id, 2);
      await prisma.junakStageProgress.create({
        data: {
          junakId: junak.id,
          stageId: stages.ROZVIDUVACH.id,
          firstClosedAt: new Date('2025-06-21'),
          closedAt: new Date('2025-06-21'),
          closedById: junak.id,
        },
      });
      fakeGoogleDrive.readSheetValues.mockResolvedValue([[], ['Іван Петренко']]);

      await sync.syncKurinToSheet(kurin.id);

      expect(fakeGoogleDrive.updateCellValues.mock.calls[0][2]).toEqual([{ row: 2, column: 'O', value: 'Розвідувач' }]);
    });

    it('never pushes a field the kurin has no column for, and never writes blanks', async () => {
      const { kurin } = await setup({ fields: ['FIRST_LAST_NAME', 'MOTHER_NAME'] });
      await linkedJunak(kurin.id, 2, { phone: '0501112233', residence: 'Львів' });
      fakeGoogleDrive.readSheetValues.mockResolvedValue([[], ['Іван Петренко']]);

      await sync.syncKurinToSheet(kurin.id);

      // no mother in the app, and phone/residence have no mapped column: nothing to write
      expect(fakeGoogleDrive.updateCellValues).toHaveBeenCalledWith(kurin.id, 'sheet-1', []);
    });

    it('does not rewrite cells that already hold exactly the app value', async () => {
      const { kurin } = await setup({ fields: ['FIRST_LAST_NAME', 'PHONE', 'RESIDENCE'] });
      await linkedJunak(kurin.id, 2, { phone: '0501112233', residence: 'Львів' });
      fakeGoogleDrive.readSheetValues.mockResolvedValue([[], ['Іван Петренко', '0501112233', 'Старе місце']]);

      const report = await sync.syncKurinToSheet(kurin.id);

      expect(fakeGoogleDrive.updateCellValues.mock.calls[0][2]).toEqual([{ row: 2, column: 'C', value: 'Львів' }]);
      expect(report.updatedCells).toBe(1);
    });

    it('fills father, mother and the other new fields when a junak row is appended', async () => {
      const { kurin } = await setup();
      const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });
      await prisma.user.update({
        where: { id: junak.id },
        data: { firstName: 'Іван', lastName: 'Петренко', phone: '0501112233', residence: 'Львів', studyPlace: 'Ліцей №3' },
      });
      await prisma.guardianContact.createMany({
        data: [
          { junakId: junak.id, name: 'Петро', phone: '+380501111111', email: 'dad@example.com', relation: 'FATHER' },
          { junakId: junak.id, name: 'Марія', phone: '+380502222222', relation: 'MOTHER' },
        ],
      });

      await sync.appendNewJunak(kurin.id, junak.id);

      const row = fakeGoogleDrive.appendSheetRow.mock.calls[0][2] as string[];
      expect(row[0]).toBe('Іван Петренко'); // A
      expect(row.slice(1, 10)).toEqual(['0501112233', 'Львів', 'Ліцей №3', 'Петро', '+380501111111', 'dad@example.com', 'Марія', '+380502222222', '']);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: junak.id } })).judgeBookRowNumber).toBe(9);
    });
  });
});
