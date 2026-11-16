import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let prisma: any;

  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret';
    prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ archivedAt: null, role: 'ZVYAZKOVYI', kurin: { deactivatedAt: null }, positionsHeld: [] }) },
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
    prisma.user.findUnique.mockResolvedValue({ archivedAt: new Date('2026-01-01'), positionsHeld: [] });

    await expect(
      strategy.validate({ sub: 'user-1', role: 'ZVYAZKOVYI', kurinId: 'kurin-1' } as any),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a non-zvyazkovyi of a deactivated kurin with code KURIN_DEACTIVATED, using the DB role', async () => {
    prisma.user.findUnique.mockResolvedValue({
      archivedAt: null,
      role: 'JUNAK',
      kurin: { deactivatedAt: new Date() },
      positionsHeld: [],
    });
    // Stale token claims ZVYAZKOVYI; the DB says JUNAK.
    const err: any = await strategy
      .validate({ sub: 'user-1', role: 'ZVYAZKOVYI', kurinId: 'kurin-1' } as any)
      .catch((e) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect(err.getResponse()).toMatchObject({ code: 'KURIN_DEACTIVATED' });
  });

  it('lets the zvyazkovyi of a deactivated kurin through', async () => {
    prisma.user.findUnique.mockResolvedValue({
      archivedAt: null,
      role: 'ZVYAZKOVYI',
      kurin: { deactivatedAt: new Date() },
      positionsHeld: [],
    });
    await expect(
      strategy.validate({ sub: 'user-1', role: 'ZVYAZKOVYI', kurinId: 'kurin-1' } as any),
    ).resolves.toMatchObject({ userId: 'user-1' });
  });

  it('never loads photoData — this runs on every authenticated request', async () => {
    await strategy.validate({ sub: 'user-1', role: 'ZVYAZKOVYI', kurinId: 'kurin-1' } as any);

    const arg = prisma.user.findUnique.mock.calls[0][0];
    expect(arg.select.photoData).toBeUndefined();
    expect(arg.select.archivedAt).toBe(true);
  });

  it('uses a single DB query per request', async () => {
    await strategy.validate({ sub: 'user-1', role: 'VYKHOVNYK', kurinId: 'kurin-1' } as any);
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
  });

  it('derives isKurinniy from any active KURINNYI position and positions from KURIN scope in the token kurin', async () => {
    prisma.user.findUnique.mockResolvedValue({
      archivedAt: null,
      role: 'VYKHOVNYK',
      kurin: { deactivatedAt: null },
      positionsHeld: [
        { positionType: 'KURINNYI', scope: 'KURIN', kurinId: 'kurin-1' },
        { positionType: 'SECRETARY', scope: 'KURIN', kurinId: 'kurin-1' },
        { positionType: 'SECRETARY', scope: 'KURIN', kurinId: 'other-kurin' },
        { positionType: 'HURTKOVYI', scope: 'HURTOK', kurinId: 'kurin-1' },
      ],
    });
    const result = await strategy.validate({ sub: 'user-1', role: 'VYKHOVNYK', kurinId: 'kurin-1' } as any);
    expect(result.isKurinniy).toBe(true);
    expect(result.positions).toEqual(['KURINNYI', 'SECRETARY']);
  });
});
