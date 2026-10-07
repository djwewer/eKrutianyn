import { PushNotificationsService } from './push-notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';

const sendNotificationMock = jest.fn();
jest.mock('web-push', () => ({
  setVapidDetails: jest.fn(),
  sendNotification: (...args: unknown[]) => sendNotificationMock(...args),
}));

const ACTOR: CurrentUserPayload = {
  userId: 'junak-1',
  role: 'JUNAK' as any,
  kurinId: 'kurin-1',
  isKurinniy: false,
  positions: [],
};

describe('PushNotificationsService', () => {
  let service: PushNotificationsService;
  let prisma: {
    pushSubscription: {
      upsert: jest.Mock;
      deleteMany: jest.Mock;
      delete: jest.Mock;
      findMany: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      pushSubscription: {
        upsert: jest.fn(),
        deleteMany: jest.fn(),
        delete: jest.fn().mockResolvedValue(undefined),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    service = new PushNotificationsService(prisma as unknown as PrismaService);
    sendNotificationMock.mockReset();
  });

  describe('subscribe', () => {
    it('upserts on endpoint with the subscribing actor as owner', async () => {
      await service.subscribe(
        { endpoint: 'https://push.example/abc', keys: { p256dh: 'p-key', auth: 'a-key' } },
        ACTOR,
      );

      expect(prisma.pushSubscription.upsert).toHaveBeenCalledWith({
        where: { endpoint: 'https://push.example/abc' },
        create: { userId: 'junak-1', endpoint: 'https://push.example/abc', p256dh: 'p-key', auth: 'a-key' },
        update: { userId: 'junak-1', p256dh: 'p-key', auth: 'a-key' },
      });
    });
  });

  describe('unsubscribe', () => {
    it('only deletes the subscription if it belongs to the requesting actor', async () => {
      await service.unsubscribe('https://push.example/abc', ACTOR);

      expect(prisma.pushSubscription.deleteMany).toHaveBeenCalledWith({
        where: { endpoint: 'https://push.example/abc', userId: 'junak-1' },
      });
    });
  });

  describe('sendTestPushToAll', () => {
    it('sends a push to every stored subscription', async () => {
      prisma.pushSubscription.findMany.mockResolvedValue([
        { id: 'sub-1', endpoint: 'https://push.example/1', p256dh: 'p1', auth: 'a1' },
        { id: 'sub-2', endpoint: 'https://push.example/2', p256dh: 'p2', auth: 'a2' },
      ]);
      sendNotificationMock.mockResolvedValue(undefined);

      await service.sendTestPushToAll();

      expect(sendNotificationMock).toHaveBeenCalledTimes(2);
      expect(sendNotificationMock).toHaveBeenCalledWith(
        { endpoint: 'https://push.example/1', keys: { p256dh: 'p1', auth: 'a1' } },
        expect.any(String),
      );
    });

    it('deletes a subscription whose push fails with 410 Gone instead of leaving it to fail forever', async () => {
      prisma.pushSubscription.findMany.mockResolvedValue([
        { id: 'sub-1', endpoint: 'https://push.example/1', p256dh: 'p1', auth: 'a1' },
      ]);
      sendNotificationMock.mockRejectedValue(Object.assign(new Error('Gone'), { statusCode: 410 }));

      await service.sendTestPushToAll();

      expect(prisma.pushSubscription.delete).toHaveBeenCalledWith({ where: { id: 'sub-1' } });
    });

    it('deletes a subscription whose push fails with 404 Not Found', async () => {
      prisma.pushSubscription.findMany.mockResolvedValue([
        { id: 'sub-1', endpoint: 'https://push.example/1', p256dh: 'p1', auth: 'a1' },
      ]);
      sendNotificationMock.mockRejectedValue(Object.assign(new Error('Not Found'), { statusCode: 404 }));

      await service.sendTestPushToAll();

      expect(prisma.pushSubscription.delete).toHaveBeenCalledWith({ where: { id: 'sub-1' } });
    });

    it('keeps a subscription whose push fails with a transient error (e.g. 500)', async () => {
      prisma.pushSubscription.findMany.mockResolvedValue([
        { id: 'sub-1', endpoint: 'https://push.example/1', p256dh: 'p1', auth: 'a1' },
      ]);
      sendNotificationMock.mockRejectedValue(Object.assign(new Error('Server Error'), { statusCode: 500 }));

      await service.sendTestPushToAll();

      expect(prisma.pushSubscription.delete).not.toHaveBeenCalled();
    });
  });
});
