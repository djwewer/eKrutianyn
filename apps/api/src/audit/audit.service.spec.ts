import { AuditAction } from '@prisma/client';
import { AuditService } from './audit.service';
import { personLabel } from './audit.util';

describe('personLabel', () => {
  it('prefers the nickname', () => {
    expect(personLabel({ firstName: 'Іван', lastName: 'Коваль', nickname: 'Орел' })).toBe('Орел');
  });
  it('falls back to the full name when there is no nickname', () => {
    expect(personLabel({ firstName: 'Іван', lastName: 'Коваль', nickname: '  ' })).toBe('Іван Коваль');
    expect(personLabel({ firstName: 'Іван', lastName: 'Коваль' })).toBe('Іван Коваль');
  });
});

describe('AuditService.record', () => {
  let prisma: { auditLog: { create: jest.Mock } };
  let service: AuditService;

  beforeEach(() => {
    prisma = { auditLog: { create: jest.fn().mockResolvedValue({}) } };
    service = new AuditService(prisma as any);
  });

  it('writes the event', async () => {
    await service.record({
      kurinId: 'k1',
      actorId: 'u1',
      action: AuditAction.PROBY_POINT_CONFIRMED,
      subjectUserId: 'j1',
      entityId: 'p1',
      details: { pointTitle: 'Точка' },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        kurinId: 'k1',
        actorId: 'u1',
        action: AuditAction.PROBY_POINT_CONFIRMED,
        subjectUserId: 'j1',
        entityId: 'p1',
        details: { pointTitle: 'Точка' },
      },
    });
  });

  it('does not throw when the write fails', async () => {
    prisma.auditLog.create.mockRejectedValue(new Error('db down'));
    await expect(
      service.record({ kurinId: 'k1', actorId: null, action: AuditAction.APD_CREATED }),
    ).resolves.toBeUndefined();
  });
});
