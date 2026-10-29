import { Role } from '@prisma/client';
import { canWriteJunakHistory } from './junak-history-access';

const actor = (role: Role) => ({ userId: 'actor-1', role, kurinId: 'kurin-1', isKurinniy: false, positions: [] });
const junak = { kurinId: 'kurin-1', hurtokId: 'hurtok-a', archivedAt: null };

describe('canWriteJunakHistory', () => {
  const prisma = (assigned: boolean) =>
    ({ vykhovnykHurtok: { findFirst: jest.fn().mockResolvedValue(assigned ? { id: 'a' } : null) } }) as any;

  it('lets the zvyazkovyi of the same kurin write', async () => {
    expect(await canWriteJunakHistory(prisma(false), junak, actor(Role.ZVYAZKOVYI))).toBe(true);
  });

  it('lets only a vykhovnyk assigned to the junak hurtok write', async () => {
    const assigned = prisma(true);
    expect(await canWriteJunakHistory(assigned, junak, actor(Role.VYKHOVNYK))).toBe(true);
    expect(assigned.vykhovnykHurtok.findFirst).toHaveBeenCalledWith({
      where: { vykhovnykId: 'actor-1', hurtokId: 'hurtok-a' },
    });
    expect(await canWriteJunakHistory(prisma(false), junak, actor(Role.VYKHOVNYK))).toBe(false);
  });

  it('refuses a vykhovnyk for a junak without hurtok, any junak, another kurin and archived junaks', async () => {
    expect(await canWriteJunakHistory(prisma(true), { ...junak, hurtokId: null }, actor(Role.VYKHOVNYK))).toBe(false);
    expect(await canWriteJunakHistory(prisma(true), junak, actor(Role.JUNAK))).toBe(false);
    expect(await canWriteJunakHistory(prisma(true), { ...junak, kurinId: 'kurin-2' }, actor(Role.ZVYAZKOVYI))).toBe(false);
    expect(await canWriteJunakHistory(prisma(true), { ...junak, archivedAt: new Date() }, actor(Role.ZVYAZKOVYI))).toBe(false);
  });
});
