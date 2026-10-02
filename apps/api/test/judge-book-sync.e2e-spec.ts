import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { PrismaClient, ProbyProgramVersion, Role } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { cleanDatabase } from './utils/clean-db';
import { createKurin, createUser } from './utils/fixtures';
import { GoogleDriveService } from '../src/google-drive/google-drive.service';
import { JudgeBookSyncService } from '../src/kurins/judge-book-sync.service';

describe('Judge book nightly sync (e2e)', () => {
  let app: INestApplication;
  let service: JudgeBookSyncService;
  let fakeGoogleDrive: { updateCellValues: jest.Mock };
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_TEST } } });

  beforeAll(async () => {
    fakeGoogleDrive = { updateCellValues: jest.fn().mockResolvedValue(undefined) };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GoogleDriveService)
      .useValue(fakeGoogleDrive)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    service = moduleRef.get(JudgeBookSyncService);
  });

  afterAll(async () => {
    await cleanDatabase(prisma);
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
    fakeGoogleDrive.updateCellValues.mockClear();
  });

  async function setupProgramWithPryhylnykStage() {
    const program = await prisma.probyProgram.create({
      data: { version: ProbyProgramVersion.OLD, name: 'Program' },
    });
    const stage = await prisma.probyStage.create({
      data: { programId: program.id, order: 1, name: 'Проба прихильника (Відзнака прихильника)' },
    });
    return { program, stage };
  }

  async function setupConnectedKurin(overrides: { driveRefreshToken?: string | null } = {}) {
    const { program, stage } = await setupProgramWithPryhylnykStage();
    const kurin = await createKurin(prisma, { probyProgramId: program.id });
    await prisma.kurin.update({
      where: { id: kurin.id },
      data: {
        judgeBookSpreadsheetId: 'sheet-1',
        driveRefreshToken: overrides.driveRefreshToken === undefined ? 'refresh-token' : overrides.driveRefreshToken,
      },
    });
    await prisma.junakImportMapping.create({
      data: {
        kurinId: kurin.id,
        columnMapping: [
          { column: 'E', header: 'Телефон', field: 'PHONE' },
          { column: 'F', header: 'Email', field: 'EMAIL' },
          { column: 'G', header: 'Прихильник', field: 'DEGREE_PRYHYLNYK_DATE' },
        ],
        positionValueMapping: [],
      },
    });
    return { kurin, program, stage };
  }

  it('pushes a closed degree date and contact info to the expected cells', async () => {
    const { kurin, stage } = await setupConnectedKurin();
    const junak = await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id, email: 'junak@example.com' });
    await prisma.user.update({
      where: { id: junak.id },
      data: { judgeBookRowNumber: 7, phone: '0671112233' },
    });
    await prisma.junakStageProgress.create({
      data: {
        junakId: junak.id,
        stageId: stage.id,
        closedAt: new Date('2024-02-10T00:00:00.000Z'),
        firstClosedAt: new Date('2024-02-10T00:00:00.000Z'),
        closedById: junak.id,
      },
    });

    await service.syncKurinToSheet(kurin.id);

    expect(fakeGoogleDrive.updateCellValues).toHaveBeenCalledTimes(1);
    const [calledKurinId, calledSpreadsheetId, updates] = fakeGoogleDrive.updateCellValues.mock.calls[0];
    expect(calledKurinId).toBe(kurin.id);
    expect(calledSpreadsheetId).toBe('sheet-1');
    expect(updates).toEqual(
      expect.arrayContaining([
        { row: 7, column: 'G', value: '2024-02-10' },
        { row: 7, column: 'E', value: '0671112233' },
        { row: 7, column: 'F', value: 'junak@example.com' },
      ]),
    );
    expect(updates).toHaveLength(3);
  });

  it('does not push for a junak never imported from the sheet (no judgeBookRowNumber)', async () => {
    const { kurin } = await setupConnectedKurin();
    await createUser(prisma, { role: Role.JUNAK, kurinId: kurin.id });

    await service.syncKurinToSheet(kurin.id);

    expect(fakeGoogleDrive.updateCellValues).toHaveBeenCalledWith(kurin.id, 'sheet-1', []);
  });

  it('syncAllKurins skips a kurin with no Drive connection and still processes the connected one', async () => {
    const { kurin: disconnectedKurin } = await setupConnectedKurin({ driveRefreshToken: null });
    const disconnectedJunak = await createUser(prisma, { role: Role.JUNAK, kurinId: disconnectedKurin.id });
    await prisma.user.update({ where: { id: disconnectedJunak.id }, data: { judgeBookRowNumber: 2, phone: '0001112233' } });

    const { kurin: connectedKurin } = await setupConnectedKurin();
    const connectedJunak = await createUser(prisma, { role: Role.JUNAK, kurinId: connectedKurin.id });
    await prisma.user.update({ where: { id: connectedJunak.id }, data: { judgeBookRowNumber: 3, phone: '0009998877' } });

    await expect(service.syncAllKurins()).resolves.toBeUndefined();

    expect(fakeGoogleDrive.updateCellValues).toHaveBeenCalledTimes(1);
    const [calledKurinId, , updates] = fakeGoogleDrive.updateCellValues.mock.calls[0];
    expect(calledKurinId).toBe(connectedKurin.id);
    expect(updates).toEqual(expect.arrayContaining([{ row: 3, column: 'E', value: '0009998877' }]));
  });
});
