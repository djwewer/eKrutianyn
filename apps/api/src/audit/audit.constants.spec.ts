import { AuditAction } from '@prisma/client';
import { AUDIT_GROUPS } from './audit.constants';

describe('AUDIT_GROUPS', () => {
  it('covers every AuditAction exactly once', () => {
    const grouped = Object.values(AUDIT_GROUPS).flat();
    expect(new Set(grouped).size).toBe(grouped.length);
    expect([...grouped].sort()).toEqual(Object.values(AuditAction).sort());
  });
});
