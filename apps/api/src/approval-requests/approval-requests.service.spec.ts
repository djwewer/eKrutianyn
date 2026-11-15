import { ApprovalRequestsService } from './approval-requests.service';

const ACTOR = { userId: 'z-1', role: 'ZVYAZKOVYI', kurinId: 'kurin-1', isKurinniy: false, positions: [] } as any;

describe('ApprovalRequestsService invites', () => {
  let service: ApprovalRequestsService;
  let prisma: any;
  let invite: any;
  let committed: boolean;
  let committedAtSend: boolean | undefined;

  beforeEach(() => {
    committed = false;
    committedAtSend = undefined;
    const request = {
      id: 'r-1',
      actionType: 'CREATE_JUNAK',
      status: 'PENDING',
      initiatedById: 'v-1',
      junakId: null,
      newData: { firstName: 'Іван', lastName: 'П', email: 'i@e.com', hurtokId: 'h-1' },
    };
    prisma = {
      approvalRequest: {
        findUnique: jest.fn().mockResolvedValue(request),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ ...request, status: 'APPROVED' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      user: { findUnique: jest.fn().mockResolvedValue({ kurinId: 'kurin-1' }), create: jest.fn().mockResolvedValue({ id: 'new-1' }) },
      hurtok: { findUnique: jest.fn().mockResolvedValue({ id: 'h-1', kurinId: 'kurin-1' }) },
      $transaction: jest.fn(async (fn: any) => {
        const r = await fn(prisma);
        committed = true;
        return r;
      }),
    };
    invite = {
      sendInvite: jest.fn().mockImplementation(async () => {
        committedAtSend = committed;
        return { sent: true };
      }),
    };
    service = new ApprovalRequestsService(
      prisma,
      {} as any,
      { appendNewJunak: jest.fn() } as any,
      {} as any,
      { record: jest.fn() } as any,
      invite,
    );
  });

  it('approving CREATE_JUNAK sends one invite after commit and returns inviteSent', async () => {
    const result: any = await service.approve('r-1', ACTOR);
    expect(invite.sendInvite.mock.calls).toEqual([['new-1', 'z-1']]);
    expect(result.inviteSent).toBe(true);
    expect(committedAtSend).toBe(true);
    expect(prisma.user.create.mock.calls[0][0].data.passwordHash).toBeUndefined();
  });

  it('rejecting sends no invite', async () => {
    await service.reject('r-1', ACTOR);
    expect(invite.sendInvite).not.toHaveBeenCalled();
  });
});
