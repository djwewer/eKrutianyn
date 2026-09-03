import { isKurinniyForUser } from './kurinniy.util';

describe('isKurinniyForUser', () => {
  it('returns true when an active KURINNYI position exists', async () => {
    const prisma = {
      kurinPosition: { findFirst: jest.fn().mockResolvedValue({ id: 'pos-1' }) },
    };
    await expect(isKurinniyForUser(prisma as any, 'user-1')).resolves.toBe(true);
    expect(prisma.kurinPosition.findFirst).toHaveBeenCalledWith({
      where: { userId: 'user-1', positionType: 'KURINNYI', removedAt: null },
    });
  });

  it('returns false when no active KURINNYI position exists', async () => {
    const prisma = {
      kurinPosition: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    await expect(isKurinniyForUser(prisma as any, 'user-2')).resolves.toBe(false);
  });
});
