import { ConflictException, NotFoundException } from '@nestjs/common';
import { KurinsAdminService } from './kurins-admin.service';

describe('KurinsAdminService invites', () => {
  let service: KurinsAdminService;
  let prisma: any;
  let invite: any;
  let audit: any;
  let txResolved: boolean;

  beforeEach(() => {
    txResolved = false;
    prisma = {
      probyProgram: { findUnique: jest.fn().mockResolvedValue({ id: 'p-1' }) },
      kurin: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn().mockResolvedValue({}), create: jest.fn().mockResolvedValue({ id: 'k-1', name: 'Орлики' }) },
      user: { create: jest.fn().mockResolvedValue({ id: 'u-1' }), findFirst: jest.fn().mockResolvedValue(null), findUnique: jest.fn() },
      $transaction: jest.fn(async (fn: any) => {
        const r = await fn(prisma);
        txResolved = true;
        return r;
      }),
    };
    invite = {
      sendInvite: jest.fn().mockImplementation(async () => {
        expect(txResolved).toBe(true);
        return { sent: true };
      }),
    };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    service = new KurinsAdminService(prisma, invite, audit);
  });

  describe('setDeactivated', () => {
    it('sets deactivatedAt and records KURIN_DEACTIVATED', async () => {
      prisma.kurin.findUnique.mockResolvedValue({ id: 'k-1', deactivatedAt: null });
      const result = await service.setDeactivated('k-1', true);
      expect(result.id).toBe('k-1');
      expect(result.deactivatedAt).toBeInstanceOf(Date);
      expect(prisma.kurin.update).toHaveBeenCalledWith({ where: { id: 'k-1' }, data: { deactivatedAt: result.deactivatedAt } });
      expect(audit.record).toHaveBeenCalledWith({ kurinId: 'k-1', actorId: null, action: 'KURIN_DEACTIVATED' });
    });

    it('is a no-op when already deactivated: keeps the original date, no update, no audit', async () => {
      const original = new Date('2026-01-01');
      prisma.kurin.findUnique.mockResolvedValue({ id: 'k-1', deactivatedAt: original });
      const result = await service.setDeactivated('k-1', true);
      expect(result).toEqual({ id: 'k-1', deactivatedAt: original });
      expect(prisma.kurin.update).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('is a no-op when activating an already active kurin', async () => {
      prisma.kurin.findUnique.mockResolvedValue({ id: 'k-1', deactivatedAt: null });
      await expect(service.setDeactivated('k-1', false)).resolves.toEqual({ id: 'k-1', deactivatedAt: null });
      expect(prisma.kurin.update).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('clears deactivatedAt and records KURIN_ACTIVATED', async () => {
      prisma.kurin.findUnique.mockResolvedValue({ id: 'k-1', deactivatedAt: new Date() });
      await expect(service.setDeactivated('k-1', false)).resolves.toEqual({ id: 'k-1', deactivatedAt: null });
      expect(prisma.kurin.update).toHaveBeenCalledWith({ where: { id: 'k-1' }, data: { deactivatedAt: null } });
      expect(audit.record).toHaveBeenCalledWith({ kurinId: 'k-1', actorId: null, action: 'KURIN_ACTIVATED' });
    });

    it('404s for an unknown kurin without writing or auditing', async () => {
      prisma.kurin.findUnique.mockResolvedValue(null);
      await expect(service.setDeactivated('nope', true)).rejects.toThrow(NotFoundException);
      expect(prisma.kurin.update).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  it('createKurin creates an invite-only zvyazkovyi, sends after commit and returns inviteSent', async () => {
    const dto: any = {
      name: 'Орлики',
      gender: 'MALE',
      stanytsia: 'Київ',
      probyProgramId: 'p-1',
      zvyazkovyi: { firstName: 'А', lastName: 'Б', email: 'a@b.com' },
    };
    const result = await service.createKurin(dto);

    const data = prisma.user.create.mock.calls[0][0].data;
    expect(data.passwordHash).toBeNull();
    expect(data.mustChangePassword).toBe(false);
    expect(invite.sendInvite).toHaveBeenCalledWith('u-1', null);
    expect(result).toMatchObject({ id: 'k-1', inviteSent: true });
  });

  it('createKurin does not send an invite when the transaction fails (P2002 -> 409)', async () => {
    prisma.$transaction = jest.fn().mockRejectedValue({ code: 'P2002' });
    const dto: any = {
      name: 'О', gender: 'MALE', stanytsia: 'К', probyProgramId: 'p-1',
      zvyazkovyi: { firstName: 'А', lastName: 'Б', email: 'a@b.com' },
    };
    await expect(service.createKurin(dto)).rejects.toBeInstanceOf(ConflictException);
    expect(invite.sendInvite).not.toHaveBeenCalled();
  });

  it('createFirstZvyazkovyi sends an invite and returns inviteSent', async () => {
    prisma.kurin.findUnique.mockResolvedValue({ id: 'k-1' });
    txResolved = true; // no transaction on this path: a single insert
    const result = await service.createFirstZvyazkovyi({ firstName: 'А', lastName: 'Б', email: 'a@b.com', kurinId: 'k-1' });

    expect(prisma.user.create.mock.calls[0][0].data.passwordHash).toBeNull();
    expect(invite.sendInvite).toHaveBeenCalledWith('u-1', null);
    expect(result).toMatchObject({ id: 'u-1', inviteSent: true });
  });

  describe('resendInvite', () => {
    it('works for a non-activated zvyazkovyi', async () => {
      prisma.user.findUnique.mockResolvedValue({ passwordHash: null, googleId: null });
      txResolved = true;
      await expect(service.resendInvite('u-1')).resolves.toEqual({ inviteSent: true });
    });
    it('404 for an archived target', async () => {
      prisma.user.findUnique.mockResolvedValue({ passwordHash: null, googleId: null, archivedAt: new Date() });
      await expect(service.resendInvite('u-1')).rejects.toBeInstanceOf(NotFoundException);
      expect(invite.sendInvite).not.toHaveBeenCalled();
    });
    it('409 when activated, 404 when missing', async () => {
      prisma.user.findUnique.mockResolvedValue({ passwordHash: 'h', googleId: null });
      await expect(service.resendInvite('u-1')).rejects.toBeInstanceOf(ConflictException);
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.resendInvite('u-1')).rejects.toBeInstanceOf(NotFoundException);
    });
    it('409 for a Google-only user without a password', async () => {
      prisma.user.findUnique.mockResolvedValue({ passwordHash: null, googleId: 'g-1' });
      await expect(service.resendInvite('u-1')).rejects.toBeInstanceOf(ConflictException);
      expect(invite.sendInvite).not.toHaveBeenCalled();
    });
  });

  it('listKurins exposes the zvyazkovyi activation status', async () => {
    const createdAt = new Date('2026-11-01');
    prisma.kurin.findMany.mockResolvedValue([
      {
        id: 'k-1', name: 'Орлики', kurinNumber: '1', gender: 'MALE', stanytsia: 'Київ', probyProgramId: 'p', createdAt,
        _count: { users: 3, hurtky: 1 },
        users: [{ id: 'u-1', firstName: 'А', lastName: 'Б', email: 'a@b.com', passwordHash: null, googleId: null, passwordResetTokens: [{ createdAt }] }],
      },
      { id: 'k-2', name: 'Без', kurinNumber: '2', gender: 'MALE', stanytsia: 'Л', probyProgramId: 'p', createdAt, _count: { users: 0, hurtky: 0 }, users: [] },
    ]);
    const [a, b]: any[] = await service.listKurins();
    expect(a.zvyazkovyi).toEqual({ id: 'u-1', firstName: 'А', lastName: 'Б', email: 'a@b.com', activated: false, lastInviteAt: createdAt });
    expect(JSON.stringify(a)).not.toContain('passwordHash');
    expect(b.zvyazkovyi).toBeNull();
    prisma.kurin.findMany.mockResolvedValue([
      {
        id: 'k-3', name: 'Г', kurinNumber: '3', gender: 'MALE', stanytsia: 'К', probyProgramId: 'p', createdAt,
        _count: { users: 1, hurtky: 0 },
        users: [{ id: 'u-2', firstName: 'А', lastName: 'Б', email: 'g@b.com', passwordHash: null, googleId: 'g-1', passwordResetTokens: [] }],
      },
    ]);
    const [g]: any[] = await service.listKurins();
    expect(g.zvyazkovyi.activated).toBe(true);
  });
});
