import { JunakImportRowProcessorService } from './junak-import-row-processor.service';
import { ResolvedJunakRow } from './junak-import-row.types';

describe('JunakImportRowProcessorService', () => {
  let service: JunakImportRowProcessorService;
  let prisma: any;
  let hurtky: any;

  beforeEach(() => {
    prisma = {
      user: { create: jest.fn(), update: jest.fn() },
      guardianContact: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      $transaction: jest.fn(async (fn: (tx: any) => Promise<unknown>) => fn(prisma)),
    };
    hurtky = { listForKurin: jest.fn().mockResolvedValue([]), create: jest.fn() };
    service = new JunakImportRowProcessorService(prisma, hurtky);
  });

  function baseRow(overrides: Partial<ResolvedJunakRow> = {}): ResolvedJunakRow {
    return { firstName: 'Іван', lastName: 'Петренко', email: 'ivan@example.com', ...overrides };
  }

  it('creates a new junak when no matchedUserId is given', async () => {
    prisma.user.create.mockResolvedValue({ id: 'user-1' });

    const result = await service.processRow('kurin-1', baseRow(), 0, 'actor-1');

    expect(result.junakId).toBe('user-1');
    expect(result.created).toBe(true);
    expect(result.succeededSteps).toContain('user');
    expect(result.error).toBeUndefined();
  });

  it('updates an existing junak when matchedUserId is given, only with non-blank fields', async () => {
    prisma.user.update.mockResolvedValue({ id: 'user-2' });

    const result = await service.processRow(
      'kurin-1',
      baseRow({ matchedUserId: 'user-2', phone: undefined }),
      0,
      'actor-1',
    );

    expect(result.junakId).toBe('user-2');
    expect(result.created).toBe(false);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-2' },
      data: expect.not.objectContaining({ phone: expect.anything() }),
    });
  });

  it('creates a new hurtok when the named hurtok does not exist', async () => {
    hurtky.listForKurin.mockResolvedValue([{ id: 'h1', name: 'Вовки' }]);
    hurtky.create.mockResolvedValue({ id: 'h2' });
    prisma.user.create.mockResolvedValue({ id: 'user-1' });

    const result = await service.processRow('kurin-1', baseRow({ hurtokName: 'Орли' }), 0, 'actor-1');

    expect(hurtky.create).toHaveBeenCalledWith({ name: 'Орли', number: undefined }, 'kurin-1');
    expect(result.succeededSteps).toContain('hurtok');
  });

  it('reuses an existing hurtok by exact name match', async () => {
    hurtky.listForKurin.mockResolvedValue([{ id: 'h1', name: 'Вовки' }]);
    prisma.user.create.mockResolvedValue({ id: 'user-1' });

    await service.processRow('kurin-1', baseRow({ hurtokName: 'Вовки' }), 0, 'actor-1');

    expect(hurtky.create).not.toHaveBeenCalled();
  });

  it('creates a new guardian contact when none matches by name', async () => {
    prisma.user.create.mockResolvedValue({ id: 'user-1' });
    prisma.guardianContact.findFirst.mockResolvedValue(null);

    const result = await service.processRow(
      'kurin-1',
      baseRow({ guardians: [{ name: 'Марія Петренко', phone: '0501234567' }] }),
      0,
      'actor-1',
    );

    expect(prisma.guardianContact.create).toHaveBeenCalledWith({
      data: { junakId: 'user-1', name: 'Марія Петренко', phone: '0501234567', email: undefined },
    });
    expect(result.succeededSteps).toContain('contacts');
  });

  it('updates an existing guardian contact matched by name instead of duplicating it', async () => {
    prisma.user.create.mockResolvedValue({ id: 'user-1' });
    prisma.guardianContact.findFirst.mockResolvedValue({ id: 'contact-1', name: 'Марія Петренко' });

    await service.processRow(
      'kurin-1',
      baseRow({ guardians: [{ name: 'Марія Петренко', phone: '0501234567' }] }),
      0,
      'actor-1',
    );

    expect(prisma.guardianContact.update).toHaveBeenCalledWith({
      where: { id: 'contact-1' },
      data: { phone: '0501234567', email: undefined },
    });
    expect(prisma.guardianContact.create).not.toHaveBeenCalled();
  });

  it('records the error and stops when user creation throws, without throwing itself', async () => {
    prisma.user.create.mockRejectedValue(new Error('email already in use'));

    const result = await service.processRow('kurin-1', baseRow(), 0, 'actor-1');

    expect(result.error).toBe('email already in use');
    expect(result.junakId).toBeUndefined();
  });
});
