import { hasAnyActivePosition } from './positions.util';

describe('hasAnyActivePosition', () => {
  it('returns true when the user holds any active position, regardless of scope', async () => {
    const prisma = { kurinPosition: { findFirst: jest.fn().mockResolvedValue({ id: 'pos-1' }) } } as any;

    const result = await hasAnyActivePosition(prisma, 'user-1');

    expect(result).toBe(true);
    expect(prisma.kurinPosition.findFirst).toHaveBeenCalledWith({
      where: { userId: 'user-1', removedAt: null },
    });
  });

  it('returns false when the user holds no active position', async () => {
    const prisma = { kurinPosition: { findFirst: jest.fn().mockResolvedValue(null) } } as any;

    const result = await hasAnyActivePosition(prisma, 'user-1');

    expect(result).toBe(false);
  });
});
