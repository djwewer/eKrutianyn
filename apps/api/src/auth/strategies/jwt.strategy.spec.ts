import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let prisma: any;

  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret';
    prisma = {
      user: { findUnique: jest.fn() },
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
});
