import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let prisma: any;

  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret';
    prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ archivedAt: null }) },
      kurinPosition: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
    };
    strategy = new JwtStrategy(prisma);
  });

  it('rejects a payload with no sub (e.g. a replayed Google-Drive state token)', async () => {
    await expect(strategy.validate({ kurinId: 'kurin-1' } as any)).rejects.toThrow(UnauthorizedException);
  });

  it('accepts a normal payload with sub and returns the expected shape', async () => {
    const result = await strategy.validate({
      sub: 'user-1',
      role: 'ZVYAZKOVYI',
      kurinId: 'kurin-1',
    } as any);

    expect(result).toEqual({
      userId: 'user-1',
      role: 'ZVYAZKOVYI',
      kurinId: 'kurin-1',
      isKurinniy: false,
      positions: [],
    });
  });

  it('rejects a token for a user that no longer exists', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      strategy.validate({ sub: 'user-1', role: 'ZVYAZKOVYI', kurinId: 'kurin-1' } as any),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a token for an archived user, even before the JWT expires', async () => {
    prisma.user.findUnique.mockResolvedValue({ archivedAt: new Date('2026-01-01') });

    await expect(
      strategy.validate({ sub: 'user-1', role: 'ZVYAZKOVYI', kurinId: 'kurin-1' } as any),
    ).rejects.toThrow(UnauthorizedException);
  });
});
