import { JunakImportRowProcessorService } from './junak-import-row-processor.service';
import { ResolvedJunakRow } from './junak-import-row.types';

const ACTOR = { userId: 'zvyazkovyi-1', role: 'ZVYAZKOVYI', kurinId: 'kurin-1', isKurinniy: false, positions: [] } as any;

describe('JunakImportRowProcessorService', () => {
  let service: JunakImportRowProcessorService;
  let prisma: any;
  let hurtky: any;
  let kurinPositions: any;
  let probyProgress: any;

  beforeEach(() => {
    prisma = {
      user: { create: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
      guardianContact: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      kurin: { findUnique: jest.fn() },
      kurinPosition: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
      probyStage: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(async (fn: (tx: any) => Promise<unknown>) => fn(prisma)),
    };
    hurtky = { listForKurin: jest.fn().mockResolvedValue([]), create: jest.fn() };
    kurinPositions = { assign: jest.fn() };
    probyProgress = { getProgressFor: jest.fn(), confirm: jest.fn(), closeStage: jest.fn() };
    service = new JunakImportRowProcessorService(prisma, hurtky, kurinPositions, probyProgress);
  });

  function baseRow(overrides: Partial<ResolvedJunakRow> = {}): ResolvedJunakRow {
    return { rowIndex: 0, firstName: 'Іван', lastName: 'Петренко', email: 'ivan@example.com', ...overrides };
  }

  it('creates a new junak when no matchedUserId is given', async () => {
    prisma.user.create.mockResolvedValue({ id: 'user-1' });

    const result = await service.processRow('kurin-1', baseRow(), 0, ACTOR);

    expect(result.junakId).toBe('user-1');
    expect(result.created).toBe(true);
    expect(result.succeededSteps).toContain('user');
    expect(result.error).toBeUndefined();
  });

  it('updates an existing junak when matchedUserId is given, only with non-blank fields', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-2', role: 'JUNAK', kurinId: 'kurin-1' });
    prisma.user.update.mockResolvedValue({ id: 'user-2' });

    const result = await service.processRow(
      'kurin-1',
      baseRow({ matchedUserId: 'user-2', phone: undefined }),
      0,
      ACTOR,
    );

    expect(result.junakId).toBe('user-2');
    expect(result.created).toBe(false);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-2' },
      data: expect.not.objectContaining({ phone: expect.anything() }),
    });
  });

  it('does not overwrite an existing phone/email with the sheet value on update (app wins)', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-2',
      role: 'JUNAK',
      kurinId: 'kurin-1',
      email: 'existing@example.com',
      phone: '0670000000',
    });
    prisma.user.update.mockResolvedValue({ id: 'user-2' });

    await service.processRow(
      'kurin-1',
      baseRow({ matchedUserId: 'user-2', email: 'from-sheet@example.com', phone: '0991111111' }),
      0,
      ACTOR,
    );

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-2' },
      data: expect.not.objectContaining({ email: expect.anything(), phone: expect.anything() }),
    });
  });

  it('applies the sheet value for phone/email on update when the target has none yet', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-2',
      role: 'JUNAK',
      kurinId: 'kurin-1',
      email: null,
      phone: null,
    });
    prisma.user.update.mockResolvedValue({ id: 'user-2' });

    await service.processRow(
      'kurin-1',
      baseRow({ matchedUserId: 'user-2', email: 'from-sheet@example.com', phone: '0991111111' }),
      0,
      ACTOR,
    );

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-2' },
      data: expect.objectContaining({ email: 'from-sheet@example.com', phone: '0991111111' }),
    });
  });

  it('sets judgeBookRowNumber from rowIndex on create (rowIndex + 2 for header + 1-based numbering)', async () => {
    prisma.user.create.mockResolvedValue({ id: 'user-1' });

    await service.processRow('kurin-1', baseRow(), 3, ACTOR);

    expect(prisma.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ judgeBookRowNumber: 5 }),
    });
  });

  it('sets judgeBookRowNumber from rowIndex on update (rowIndex + 2 for header + 1-based numbering)', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-2', role: 'JUNAK', kurinId: 'kurin-1' });
    prisma.user.update.mockResolvedValue({ id: 'user-2' });

    await service.processRow('kurin-1', baseRow({ matchedUserId: 'user-2' }), 3, ACTOR);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-2' },
      data: expect.objectContaining({ judgeBookRowNumber: 5 }),
    });
  });

  it('rejects an update when matchedUserId does not belong to this kurin or is not a JUNAK', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'other-zvyazkovyi', role: 'ZVYAZKOVYI', kurinId: 'kurin-2' });

    const result = await service.processRow(
      'kurin-1',
      baseRow({ matchedUserId: 'other-zvyazkovyi' }),
      0,
      ACTOR,
    );

    expect(result.error).toBeDefined();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('creates a new hurtok when the named hurtok does not exist', async () => {
    hurtky.listForKurin.mockResolvedValue([{ id: 'h1', name: 'Вовки' }]);
    hurtky.create.mockResolvedValue({ id: 'h2' });
    prisma.user.create.mockResolvedValue({ id: 'user-1' });

    const result = await service.processRow('kurin-1', baseRow({ hurtokName: 'Орли' }), 0, ACTOR);

    expect(hurtky.create).toHaveBeenCalledWith({ name: 'Орли', number: undefined }, 'kurin-1');
    expect(result.succeededSteps).toContain('hurtok');
  });

  it('reuses an existing hurtok by exact name match', async () => {
    hurtky.listForKurin.mockResolvedValue([{ id: 'h1', name: 'Вовки' }]);
    prisma.user.create.mockResolvedValue({ id: 'user-1' });

    await service.processRow('kurin-1', baseRow({ hurtokName: 'Вовки' }), 0, ACTOR);

    expect(hurtky.create).not.toHaveBeenCalled();
  });

  it('creates a new guardian contact when none matches by name', async () => {
    prisma.user.create.mockResolvedValue({ id: 'user-1' });
    prisma.guardianContact.findFirst.mockResolvedValue(null);

    const result = await service.processRow(
      'kurin-1',
      baseRow({ guardians: [{ name: 'Марія Петренко', phone: '0501234567' }] }),
      0,
      ACTOR,
    );

    expect(prisma.guardianContact.create).toHaveBeenCalledWith({
      data: { junakId: 'user-1', name: 'Марія Петренко', phone: '0501234567', email: undefined, relation: 'GUARDIAN' },
    });
    expect(result.succeededSteps).toContain('contacts');
  });

  it('matches a mother by relation (not by name) and refreshes her details', async () => {
    prisma.user.create.mockResolvedValue({ id: 'user-1' });
    prisma.guardianContact.findFirst.mockResolvedValue({ id: 'contact-mom', name: 'Марія' });

    await service.processRow(
      'kurin-1',
      baseRow({ guardians: [{ name: 'Марія Іванівна', phone: '0507777777', relation: 'MOTHER' }] }),
      0,
      ACTOR,
    );

    expect(prisma.guardianContact.findFirst).toHaveBeenCalledWith({ where: { junakId: 'user-1', relation: 'MOTHER' } });
    expect(prisma.guardianContact.update).toHaveBeenCalledWith({
      where: { id: 'contact-mom' },
      data: { name: 'Марія Іванівна', phone: '0507777777', email: undefined },
    });
  });

  it('creates a father with an empty phone when the sheet only has his name', async () => {
    prisma.user.create.mockResolvedValue({ id: 'user-1' });
    prisma.guardianContact.findFirst.mockResolvedValue(null);

    await service.processRow('kurin-1', baseRow({ guardians: [{ name: 'Петро', relation: 'FATHER' }] }), 0, ACTOR);

    expect(prisma.guardianContact.create).toHaveBeenCalledWith({
      data: { junakId: 'user-1', name: 'Петро', phone: '', email: undefined, relation: 'FATHER' },
    });
  });

  it('updates an existing guardian contact matched by name instead of duplicating it', async () => {
    prisma.user.create.mockResolvedValue({ id: 'user-1' });
    prisma.guardianContact.findFirst.mockResolvedValue({ id: 'contact-1', name: 'Марія Петренко' });

    await service.processRow(
      'kurin-1',
      baseRow({ guardians: [{ name: 'Марія Петренко', phone: '0501234567' }] }),
      0,
      ACTOR,
    );

    expect(prisma.guardianContact.update).toHaveBeenCalledWith({
      where: { id: 'contact-1' },
      data: { name: 'Марія Петренко', phone: '0501234567', email: undefined },
    });
    expect(prisma.guardianContact.create).not.toHaveBeenCalled();
  });

  it('records the error and stops when user creation throws, without throwing itself', async () => {
    prisma.user.create.mockRejectedValue(new Error('email already in use'));

    const result = await service.processRow('kurin-1', baseRow(), 0, ACTOR);

    expect(result.error).toBe('email already in use');
    expect(result.junakId).toBeUndefined();
  });

  it('assigns a kurin-scope position via KurinPositionsService', async () => {
    prisma.user.create.mockResolvedValue({ id: 'user-1' });

    const result = await service.processRow(
      'kurin-1',
      baseRow({ kurinPositionTypes: ['SUDDIA' as any] }),
      0,
      ACTOR,
    );

    expect(kurinPositions.assign).toHaveBeenCalledWith(
      { userId: 'user-1', scope: 'KURIN', positionType: 'SUDDIA', hurtokId: undefined },
      ACTOR,
    );
    expect(result.succeededSteps).toContain('positions');
  });

  it('assigns a hurtok-scope position only when the row resolved a hurtokId', async () => {
    prisma.user.create.mockResolvedValue({ id: 'user-1' });
    hurtky.listForKurin.mockResolvedValue([{ id: 'h1', name: 'Вовки' }]);

    await service.processRow(
      'kurin-1',
      baseRow({ hurtokName: 'Вовки', hurtokPositionTypes: ['HURTKOVYI' as any] }),
      0,
      ACTOR,
    );

    expect(kurinPositions.assign).toHaveBeenCalledWith(
      { userId: 'user-1', scope: 'HURTOK', positionType: 'HURTKOVYI', hurtokId: 'h1' },
      ACTOR,
    );
  });

  it('backfills proba progress for a degree stage that is not yet closed, in stage order', async () => {
    prisma.user.create.mockResolvedValue({ id: 'user-1' });
    prisma.kurin.findUnique.mockResolvedValue({ id: 'kurin-1', probyProgramId: 'program-1' });
    prisma.probyStage.findMany.mockResolvedValue([
      { id: 'stage-1', name: 'Проба прихильника (Відзнака прихильника)', order: 1, categories: [{ points: [{ id: 'p1' }, { id: 'p2' }] }] },
      { id: 'stage-2', name: 'Проба учасника (Скобине крило)', order: 2, categories: [{ points: [{ id: 'p3' }] }] },
    ]);
    probyProgress.getProgressFor.mockResolvedValue({ points: [], stages: [{ stageId: 'stage-1', status: 'OPEN', hasDebt: false }] });

    const result = await service.processRow(
      'kurin-1',
      baseRow({ degreeDates: { PRYHYLNYK: '2020-01-01' } }),
      0,
      ACTOR,
    );

    expect(probyProgress.confirm).toHaveBeenCalledWith('user-1', 'p1', ACTOR);
    expect(probyProgress.confirm).toHaveBeenCalledWith('user-1', 'p2', ACTOR);
    expect(probyProgress.closeStage).toHaveBeenCalledWith('user-1', 'stage-1', ACTOR, new Date('2020-01-01'));
    expect(result.succeededSteps).toContain('proba-progress');
  });

  it('closes the stage with the sheet\'s own historical date, not the import run\'s date (regression: the nightly sync later pushes this value back to the sheet, so stamping "now" here would silently overwrite the real degree date)', async () => {
    prisma.user.create.mockResolvedValue({ id: 'user-1' });
    prisma.kurin.findUnique.mockResolvedValue({ id: 'kurin-1', probyProgramId: 'program-1' });
    prisma.probyStage.findMany.mockResolvedValue([
      { id: 'stage-1', name: 'Проба прихильника (Відзнака прихильника)', order: 1, categories: [{ points: [{ id: 'p1' }] }] },
    ]);
    probyProgress.getProgressFor.mockResolvedValue({ points: [], stages: [{ stageId: 'stage-1', status: 'OPEN', hasDebt: false }] });

    await service.processRow('kurin-1', baseRow({ degreeDates: { PRYHYLNYK: '2018-05-20' } }), 0, ACTOR);

    const [, , , closedAt] = probyProgress.closeStage.mock.calls[0];
    expect(closedAt).toEqual(new Date('2018-05-20'));
    expect(closedAt.getUTCFullYear()).toBe(2018);
  });

  it('does not touch a stage that is already CLOSED', async () => {
    prisma.user.create.mockResolvedValue({ id: 'user-1' });
    prisma.kurin.findUnique.mockResolvedValue({ id: 'kurin-1', probyProgramId: 'program-1' });
    prisma.probyStage.findMany.mockResolvedValue([
      { id: 'stage-1', name: 'Проба прихильника (Відзнака прихильника)', order: 1, categories: [{ points: [{ id: 'p1' }] }] },
    ]);
    probyProgress.getProgressFor.mockResolvedValue({ points: [], stages: [{ stageId: 'stage-1', status: 'CLOSED', hasDebt: false }] });

    const result = await service.processRow(
      'kurin-1',
      baseRow({ degreeDates: { PRYHYLNYK: '2020-01-01' } }),
      0,
      ACTOR,
    );

    expect(probyProgress.confirm).not.toHaveBeenCalled();
    expect(probyProgress.closeStage).not.toHaveBeenCalled();
    expect(result.succeededSteps).not.toContain('proba-progress');
  });

  it('does not overwrite firstClosedAt when backfilling a degree date for an already-closed stage (regression)', async () => {
    prisma.user.create.mockResolvedValue({ id: 'user-1' });
    prisma.kurin.findUnique.mockResolvedValue({ id: 'kurin-1', probyProgramId: 'program-1' });
    prisma.probyStage.findMany.mockResolvedValue([
      { id: 'stage-1', name: 'Проба прихильника (Відзнака прихильника)', order: 1, categories: [{ points: [{ id: 'p1' }] }] },
    ]);
    const stageProgress = {
      stageId: 'stage-1',
      status: 'CLOSED',
      hasDebt: false,
      firstClosedAt: new Date('2024-01-15T00:00:00.000Z'),
    };
    probyProgress.getProgressFor.mockResolvedValue({ points: [], stages: [stageProgress] });
    // If the CLOSED guard were ever removed, closeStage would run and (as in the real
    // service) stamp a fresh firstClosedAt — simulate that here so the assertion below
    // actually fails if the regression resurfaces.
    probyProgress.closeStage.mockImplementation(() => {
      stageProgress.firstClosedAt = new Date('2026-10-02T00:00:00.000Z');
    });
    const originalFirstClosedAt = stageProgress.firstClosedAt;

    const result = await service.processRow(
      'kurin-1',
      // A different date than what's already closed — the sheet must not be able to
      // reopen/re-stamp a stage the app already confirmed.
      baseRow({ degreeDates: { PRYHYLNYK: '2020-06-01' } }),
      0,
      ACTOR,
    );

    expect(probyProgress.confirm).not.toHaveBeenCalled();
    expect(probyProgress.closeStage).not.toHaveBeenCalled();
    expect(stageProgress.firstClosedAt).toEqual(originalFirstClosedAt);
    expect(result.succeededSteps).not.toContain('proba-progress');
  });

  it('rejects assigning the KURINNYI position through import, regardless of restrictProtectedTargets', async () => {
    prisma.user.create.mockResolvedValue({ id: 'user-1' });

    const result = await service.processRow(
      'kurin-1',
      baseRow({ kurinPositionTypes: ['KURINNYI' as any] }),
      0,
      ACTOR,
    );

    expect(result.error).toBeDefined();
    expect(kurinPositions.assign).not.toHaveBeenCalled();
  });

  it('rejects updating a matched target who holds an active position, when restrictProtectedTargets is true', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-2', role: 'JUNAK', kurinId: 'kurin-1' });
    prisma.kurinPosition.findMany.mockResolvedValue([{ positionType: 'SUDDIA' }]);

    const result = await service.processRow(
      'kurin-1',
      baseRow({ matchedUserId: 'user-2' }),
      0,
      ACTOR,
      { restrictProtectedTargets: true },
    );

    expect(result.error).toBeDefined();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('rejects updating a matched target who is kurinniy, when restrictProtectedTargets is true', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-2', role: 'JUNAK', kurinId: 'kurin-1' });
    prisma.kurinPosition.findFirst.mockResolvedValue({ id: 'pos-1', positionType: 'KURINNYI' });

    const result = await service.processRow(
      'kurin-1',
      baseRow({ matchedUserId: 'user-2' }),
      0,
      ACTOR,
      { restrictProtectedTargets: true },
    );

    expect(result.error).toBeDefined();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('still allows updating a position-holding target when restrictProtectedTargets is not set (direct import)', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-2', role: 'JUNAK', kurinId: 'kurin-1' });
    prisma.user.update.mockResolvedValue({ id: 'user-2' });
    prisma.kurinPosition.findMany.mockResolvedValue([{ positionType: 'SUDDIA' }]);

    const result = await service.processRow('kurin-1', baseRow({ matchedUserId: 'user-2' }), 0, ACTOR);

    expect(result.error).toBeUndefined();
    expect(prisma.user.update).toHaveBeenCalled();
  });
});
