import { Role, TokenPurpose, AuditAction } from '@prisma/client';
import { InviteService } from './invite.service';
import { hashToken } from '../common/token.util';

describe('InviteService', () => {
  let service: InviteService;
  let prisma: any;
  let mail: { sendWelcomeInvite: jest.Mock };
  let audit: { record: jest.Mock };
  const user = {
    id: 'u1',
    email: 'new@example.com',
    firstName: 'Олена',
    lastName: 'Коваль',
    nickname: null,
    role: Role.VYKHOVNYK,
    kurinId: 'k1',
    kurin: { name: 'Лісові Мавки', kurinNumber: '75' },
  };

  beforeEach(() => {
    process.env.FRONTEND_URL = 'http://web.test';
    prisma = {
      user: { findUniqueOrThrow: jest.fn().mockResolvedValue(user) },
      passwordResetToken: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValue({}),
      },
    };
    mail = { sendWelcomeInvite: jest.fn().mockResolvedValue(undefined) };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    service = new InviteService(prisma, mail as any, audit as any);
  });

  it('creates an INVITE token expiring in 7 days and invalidates earlier unused ones', async () => {
    await service.sendInvite('u1', 'admin1');
    expect(prisma.passwordResetToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', purpose: TokenPurpose.INVITE, usedAt: null },
      data: { usedAt: expect.any(Date) },
    });
    const data = prisma.passwordResetToken.create.mock.calls[0][0].data;
    expect(data.userId).toBe('u1');
    expect(data.purpose).toBe(TokenPurpose.INVITE);
    const expected = Date.now() + 7 * 24 * 60 * 60 * 1000;
    expect(Math.abs(data.expiresAt.getTime() - expected)).toBeLessThan(60 * 1000);
  });

  it('mails a /welcome link whose raw token hashes to the stored hash', async () => {
    const res = await service.sendInvite('u1', 'admin1');
    expect(res).toEqual({ sent: true });
    const [to, params] = mail.sendWelcomeInvite.mock.calls[0];
    expect(to).toBe('new@example.com');
    expect(params).toMatchObject({ firstName: 'Олена', kurinLabel: '№75 Лісові Мавки', roleLabel: 'виховник' });
    const raw = params.inviteUrl.replace('http://web.test/welcome?token=', '');
    expect(params.inviteUrl.startsWith('http://web.test/welcome?token=')).toBe(true);
    expect(prisma.passwordResetToken.create.mock.calls[0][0].data.tokenHash).toBe(hashToken(raw));
  });

  it('records USER_INVITED audit with subject and actor', async () => {
    await service.sendInvite('u1', 'admin1');
    expect(audit.record).toHaveBeenCalledWith({
      kurinId: 'k1',
      actorId: 'admin1',
      action: AuditAction.USER_INVITED,
      subjectUserId: 'u1',
      details: { subjectName: 'Олена Коваль' },
    });
  });

  it('returns sent:false, still audits and does not throw when mail fails', async () => {
    mail.sendWelcomeInvite.mockRejectedValue(new Error('smtp down'));
    await expect(service.sendInvite('u1', null)).resolves.toEqual({ sent: false });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.USER_INVITED, actorId: null, subjectUserId: 'u1' }),
    );
  });
});
