import { JudgeBookSyncService } from './judge-book-sync.service';

describe('JudgeBookSyncService', () => {
  let service: JudgeBookSyncService;
  let prisma: any;
  let googleDrive: any;

  beforeEach(() => {
    prisma = {
      kurin: { findUnique: jest.fn(), findMany: jest.fn() },
      junakImportMapping: { findUnique: jest.fn() },
      user: { findMany: jest.fn() },
      probyStage: { findMany: jest.fn() },
      junakStageProgress: { findMany: jest.fn() },
    };
    googleDrive = { updateCellValues: jest.fn() };
    service = new JudgeBookSyncService(prisma, googleDrive);
  });

  const KURIN = {
    id: 'kurin-1',
    judgeBookSpreadsheetId: 'sheet-1',
    probyProgramId: 'program-1',
  };

  const MAPPING = {
    columnMapping: [
      { column: 'B', header: 'ПІБ', field: 'FIRST_LAST_NAME' },
      { column: 'E', header: 'Телефон', field: 'PHONE' },
      { column: 'F', header: 'Email', field: 'EMAIL' },
      { column: 'G', header: 'Прихильник', field: 'DEGREE_PRYHYLNYK_DATE' },
      { column: 'H', header: 'Учасник', field: 'DEGREE_UCHASNYK_DATE' },
      { column: 'I', header: 'Розвідувач', field: 'DEGREE_ROZVIDUVACH_DATE' },
    ],
    positionValueMapping: [],
  };

  const STAGES = [
    { id: 'stage-pryhylnyk', programId: 'program-1', name: 'Проба прихильника (Відзнака прихильника)' },
    { id: 'stage-uchasnyk', programId: 'program-1', name: 'Проба учасника (Скобине крило)' },
    { id: 'stage-rozviduvach', programId: 'program-1', name: 'Проба розвідувача (Крок)' },
  ];

  it('builds one batched updateCellValues call for a kurin with a synced junak and an empty junak', async () => {
    prisma.kurin.findUnique.mockResolvedValue(KURIN);
    prisma.junakImportMapping.findUnique.mockResolvedValue(MAPPING);
    prisma.user.findMany.mockResolvedValue([
      { id: 'junak-1', judgeBookRowNumber: 5, phone: '0501112233', email: 'junak1@example.com' },
      { id: 'junak-2', judgeBookRowNumber: 6, phone: null, email: 'junak2@example.com' },
    ]);
    prisma.probyStage.findMany.mockResolvedValue(STAGES);
    prisma.junakStageProgress.findMany.mockResolvedValue([
      { junakId: 'junak-1', stageId: 'stage-pryhylnyk', firstClosedAt: new Date('2024-01-15T00:00:00.000Z') },
    ]);

    await service.syncKurinToSheet('kurin-1');

    expect(googleDrive.updateCellValues).toHaveBeenCalledTimes(1);
    const [kurinId, spreadsheetId, updates] = googleDrive.updateCellValues.mock.calls[0];
    expect(kurinId).toBe('kurin-1');
    expect(spreadsheetId).toBe('sheet-1');
    expect(updates).toEqual(
      expect.arrayContaining([
        { row: 5, column: 'G', value: '15.01.2024' },
        { row: 5, column: 'E', value: '0501112233' },
        { row: 5, column: 'F', value: 'junak1@example.com' },
        { row: 6, column: 'F', value: 'junak2@example.com' },
      ]),
    );
    // junak-2 contributes nothing for phone (null) or any degree (nothing closed) —
    // only its email entry should be present, never an empty-string placeholder.
    expect(updates).toHaveLength(4);
    expect(updates.find((u: any) => u.row === 6 && u.column === 'E')).toBeUndefined();
    expect(updates.every((u: any) => u.value !== '')).toBe(true);
  });

  it('does not call updateCellValues at all when the kurin has no JunakImportMapping', async () => {
    prisma.kurin.findUnique.mockResolvedValue(KURIN);
    prisma.junakImportMapping.findUnique.mockResolvedValue(null);

    await service.syncKurinToSheet('kurin-1');

    expect(googleDrive.updateCellValues).not.toHaveBeenCalled();
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('skips a field that has a value but no mapped column for this kurin', async () => {
    prisma.kurin.findUnique.mockResolvedValue(KURIN);
    prisma.junakImportMapping.findUnique.mockResolvedValue({
      columnMapping: [{ column: 'B', header: 'ПІБ', field: 'FIRST_LAST_NAME' }],
      positionValueMapping: [],
    });
    prisma.user.findMany.mockResolvedValue([
      { id: 'junak-1', judgeBookRowNumber: 5, phone: '0501112233', email: 'junak1@example.com' },
    ]);
    prisma.probyStage.findMany.mockResolvedValue(STAGES);
    prisma.junakStageProgress.findMany.mockResolvedValue([]);

    await service.syncKurinToSheet('kurin-1');

    expect(googleDrive.updateCellValues).toHaveBeenCalledWith('kurin-1', 'sheet-1', []);
  });

  it('does nothing when the kurin has no judgeBookSpreadsheetId', async () => {
    prisma.kurin.findUnique.mockResolvedValue({ ...KURIN, judgeBookSpreadsheetId: null });

    await service.syncKurinToSheet('kurin-1');

    expect(prisma.junakImportMapping.findUnique).not.toHaveBeenCalled();
    expect(googleDrive.updateCellValues).not.toHaveBeenCalled();
  });

  describe('syncAllKurins', () => {
    it('continues to the next kurin when one fails', async () => {
      prisma.kurin.findMany.mockResolvedValue([{ id: 'kurin-1' }, { id: 'kurin-2' }]);
      const spy = jest.spyOn(service, 'syncKurinToSheet');
      spy.mockRejectedValueOnce(new Error('Drive token expired')).mockResolvedValueOnce(undefined);

      await service.syncAllKurins();

      expect(spy).toHaveBeenCalledWith('kurin-1');
      expect(spy).toHaveBeenCalledWith('kurin-2');
      expect(spy).toHaveBeenCalledTimes(2);
    });

    it('queries only kurins with a drive connection, a spreadsheet, and a mapping', async () => {
      prisma.kurin.findMany.mockResolvedValue([]);

      await service.syncAllKurins();

      expect(prisma.kurin.findMany).toHaveBeenCalledWith({
        where: {
          driveRefreshToken: { not: null },
          judgeBookSpreadsheetId: { not: null },
          junakImportMapping: { isNot: null },
        },
        select: { id: true },
      });
    });
  });
});
