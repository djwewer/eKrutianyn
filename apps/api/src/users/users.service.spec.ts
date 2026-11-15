import { ConflictException, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';

const ACTOR = { userId: 'z-1', role: 'ZVYAZKOVYI', kurinId: 'kurin-1', isKurinniy: false, positions: [] } as any;

describe('UsersService invites', () => {
  let service: UsersService;
  let prisma: any;
  let invite: any;
  let audit: any;
  let judgeBookSync: any;

  beforeEach(() => {
    prisma = {
      user: { create: jest.fn(), findUnique: jest.fn() },
      hurtok: { findUnique: jest.fn().mockResolvedValue({ id: 'h-1', kurinId: 'kurin-1' }) },
    };
    invite = { sendInvite: jest.fn().mockResolvedValue({ sent: true }) };
    audit = { record: jest.fn() };
    judgeBookSync = { appendNewJunak: jest.fn() };
    service = new UsersService(prisma, {} as any, {} as any, judgeBookSync, audit, invite);
  });

  describe('create', () => {
    const dto = { firstName: 'Іван', lastName: 'Петренко', email: 'i@e.com', role: 'VYKHOVNYK' } as any;

    it('creates without a password, sends the invite after the audit and returns inviteSent', async () => {
      prisma.user.create.mockResolvedValue({ id: 'u-1', firstName: 'Іван', lastName: 'Петренко', role: 'VYKHOVNYK' });

      const result = await service.create(dto, ACTOR);

      const data = prisma.user.create.mock.calls[0][0].data;
      expect(data.passwordHash).toBeNull();
      expect(data.mustChangePassword).toBe(false);
      expect(invite.sendInvite).toHaveBeenCalledWith('u-1', 'z-1');
      expect(audit.record.mock.invocationCallOrder[0]).toBeLessThan(invite.sendInvite.mock.invocationCallOrder[0]);
      expect(result).toMatchObject({ id: 'u-1', inviteSent: true });
    });

    it('reports inviteSent=false when the mail failed', async () => {
      prisma.user.create.mockResolvedValue({ id: 'u-1', role: 'VYKHOVNYK' });
      invite.sendInvite.mockResolvedValue({ sent: false });
      expect((await service.create(dto, ACTOR)).inviteSent).toBe(false);
    });
  });

  describe('resendInvite', () => {
    it('sends for a non-activated user of the own kurin', async () => {
      prisma.user.findUnique.mockResolvedValue({ kurinId: 'kurin-1', passwordHash: null });
      await expect(service.resendInvite('u-1', ACTOR)).resolves.toEqual({ inviteSent: true });
      expect(invite.sendInvite).toHaveBeenCalledWith('u-1', 'z-1');
    });

    it('409 when the target is already activated', async () => {
      prisma.user.findUnique.mockResolvedValue({ kurinId: 'kurin-1', passwordHash: 'hash' });
      await expect(service.resendInvite('u-1', ACTOR)).rejects.toBeInstanceOf(ConflictException);
      expect(invite.sendInvite).not.toHaveBeenCalled();
    });

    it('404 for an archived target', async () => {
      prisma.user.findUnique.mockResolvedValue({ kurinId: 'kurin-1', passwordHash: null, archivedAt: new Date() });
      await expect(service.resendInvite('u-1', ACTOR)).rejects.toBeInstanceOf(NotFoundException);
      expect(invite.sendInvite).not.toHaveBeenCalled();
    });

    it('404 for a user of another kurin or a missing user', async () => {
      prisma.user.findUnique.mockResolvedValue({ kurinId: 'kurin-2', passwordHash: null });
      await expect(service.resendInvite('u-1', ACTOR)).rejects.toBeInstanceOf(NotFoundException);
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.resendInvite('u-1', ACTOR)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('findScoped', () => {
    it('adds activated and lastInviteAt and never exposes passwordHash or tokens', async () => {
      const createdAt = new Date('2026-11-01T10:00:00Z');
      prisma.user.findUnique.mockResolvedValue({
        id: 'u-1',
        kurinId: 'kurin-1',
        role: 'VYKHOVNYK',
        hurtokId: null,
        passwordHash: null,
        passwordResetTokens: [{ createdAt }],
      });

      const result: any = await service.findScoped('u-1', ACTOR);

      expect(result.activated).toBe(false);
      expect(result.lastInviteAt).toBe(createdAt);
      expect(result).not.toHaveProperty('passwordHash');
      expect(result).not.toHaveProperty('passwordResetTokens');
    });

    it('activated=true and lastInviteAt=null when there is a hash and no invite token', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u-1',
        kurinId: 'kurin-1',
        role: 'VYKHOVNYK',
        hurtokId: null,
        passwordHash: 'h',
        passwordResetTokens: [],
      });
      const result: any = await service.findScoped('u-1', ACTOR);
      expect(result.activated).toBe(true);
      expect(result.lastInviteAt).toBeNull();
    });
  });
});
