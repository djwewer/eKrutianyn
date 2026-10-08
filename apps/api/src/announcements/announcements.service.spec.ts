import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AnnouncementsService } from './announcements.service';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';

const sendToKurinMock = jest.fn();

const ZVYAZKOVYI: CurrentUserPayload = {
  userId: 'zvyazkovyi-1',
  role: 'ZVYAZKOVYI' as any,
  kurinId: 'kurin-1',
  isKurinniy: false,
  positions: [],
};
const PYSAR: CurrentUserPayload = {
  userId: 'pysar-1',
  role: 'JUNAK' as any,
  kurinId: 'kurin-1',
  isKurinniy: false,
  positions: ['PYSAR'] as any,
};
const PLAIN_JUNAK: CurrentUserPayload = {
  userId: 'junak-1',
  role: 'JUNAK' as any,
  kurinId: 'kurin-1',
  isKurinniy: false,
  positions: [],
};
const OTHER_KURIN_ZVYAZKOVYI: CurrentUserPayload = {
  userId: 'zvyazkovyi-2',
  role: 'ZVYAZKOVYI' as any,
  kurinId: 'kurin-2',
  isKurinniy: false,
  positions: [],
};
const OTHER_KURIN_JUNAK: CurrentUserPayload = {
  userId: 'junak-2',
  role: 'JUNAK' as any,
  kurinId: 'kurin-2',
  isKurinniy: false,
  positions: [],
};

describe('AnnouncementsService', () => {
  let service: AnnouncementsService;
  let prisma: {
    announcement: { findMany: jest.Mock; create: jest.Mock; update: jest.Mock; delete: jest.Mock; findUnique: jest.Mock };
    announcementImage: { updateMany: jest.Mock; create: jest.Mock; findUnique: jest.Mock };
    announcementReaction: { upsert: jest.Mock; deleteMany: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      announcement: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        findUnique: jest.fn(),
      },
      announcementImage: { updateMany: jest.fn(), create: jest.fn(), findUnique: jest.fn() },
      announcementReaction: { upsert: jest.fn(), deleteMany: jest.fn() },
    };
    sendToKurinMock.mockReset();
    service = new AnnouncementsService(
      prisma as unknown as PrismaService,
      { sendToKurin: sendToKurinMock } as unknown as import('../push-notifications/push-notifications.service').PushNotificationsService,
    );
  });

  describe('list', () => {
    it('lists announcements for the given kurin, newest first', async () => {
      await service.list('kurin-1', PLAIN_JUNAK);

      expect(prisma.announcement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { kurinId: 'kurin-1' },
          orderBy: { createdAt: 'desc' },
        }),
      );
    });

    it('404s when the route kurinId does not match the actor kurinId', async () => {
      await expect(service.list('kurin-1', OTHER_KURIN_ZVYAZKOVYI)).rejects.toThrow(NotFoundException);
      expect(prisma.announcement.findMany).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('allows a writer (PYSAR) to publish, and links the given images', async () => {
      prisma.announcement.create.mockResolvedValue({ id: 'ann-1', kurinId: 'kurin-1', title: 'Хі' });

      const result = await service.create(
        'kurin-1',
        { title: 'Хі', content: { type: 'doc' }, imageIds: ['img-1', 'img-2'] },
        PYSAR,
      );

      expect(prisma.announcement.create).toHaveBeenCalledWith({
        data: { kurinId: 'kurin-1', authorId: 'pysar-1', title: 'Хі', content: { type: 'doc' } },
      });
      expect(prisma.announcementImage.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['img-1', 'img-2'] }, kurinId: 'kurin-1' },
        data: { announcementId: 'ann-1' },
      });
      expect(sendToKurinMock).toHaveBeenCalledWith('kurin-1', {
        title: 'Нове оголошення',
        body: 'Хі',
        url: '/news',
      });
      expect(result).toEqual({ id: 'ann-1', kurinId: 'kurin-1', title: 'Хі' });
    });

    it('allows a zvyazkovyi to publish', async () => {
      prisma.announcement.create.mockResolvedValue({ id: 'ann-1' });

      await expect(
        service.create('kurin-1', { title: 'Хі', content: {}, imageIds: [] }, ZVYAZKOVYI),
      ).resolves.toBeDefined();
    });

    it('rejects a plain junak with no writer position', async () => {
      await expect(
        service.create('kurin-1', { title: 'Хі', content: {}, imageIds: [] }, PLAIN_JUNAK),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.announcement.create).not.toHaveBeenCalled();
    });

    it('404s when the route kurinId does not match the actor kurinId, even for a zvyazkovyi', async () => {
      await expect(
        service.create('kurin-1', { title: 'Хі', content: {}, imageIds: [] }, OTHER_KURIN_ZVYAZKOVYI),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.announcement.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('lets a writer edit an announcement authored by someone else', async () => {
      prisma.announcement.findUnique.mockResolvedValue({ id: 'ann-1', kurinId: 'kurin-1', authorId: 'some-other-writer' });
      prisma.announcement.update.mockResolvedValue({ id: 'ann-1' });

      await service.update('kurin-1', 'ann-1', { title: 'Нове', content: {}, imageIds: [] }, PYSAR);

      expect(prisma.announcement.update).toHaveBeenCalledWith({
        where: { id: 'ann-1' },
        data: { title: 'Нове', content: {} },
      });
    });

    it('404s on an announcement from a different kurin', async () => {
      prisma.announcement.findUnique.mockResolvedValue({ id: 'ann-1', kurinId: 'some-other-kurin' });

      await expect(
        service.update('kurin-1', 'ann-1', { title: 'Нове', content: {}, imageIds: [] }, PYSAR),
      ).rejects.toThrow(NotFoundException);
    });

    it('404s when the route kurinId does not match the actor kurinId, even for a zvyazkovyi', async () => {
      await expect(
        service.update('kurin-1', 'ann-1', { title: 'Нове', content: {}, imageIds: [] }, OTHER_KURIN_ZVYAZKOVYI),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.announcement.update).not.toHaveBeenCalled();
    });

    it('rejects a plain junak with no writer position', async () => {
      await expect(
        service.update('kurin-1', 'ann-1', { title: 'Нове', content: {}, imageIds: [] }, PLAIN_JUNAK),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.announcement.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('lets a zvyazkovyi delete any announcement in their kurin', async () => {
      prisma.announcement.findUnique.mockResolvedValue({ id: 'ann-1', kurinId: 'kurin-1' });

      await service.remove('kurin-1', 'ann-1', ZVYAZKOVYI);

      expect(prisma.announcement.delete).toHaveBeenCalledWith({ where: { id: 'ann-1' } });
    });

    it('rejects a plain junak', async () => {
      prisma.announcement.findUnique.mockResolvedValue({ id: 'ann-1', kurinId: 'kurin-1' });

      await expect(service.remove('kurin-1', 'ann-1', PLAIN_JUNAK)).rejects.toThrow(ForbiddenException);
      expect(prisma.announcement.delete).not.toHaveBeenCalled();
    });

    it('404s when the route kurinId does not match the actor kurinId, even for a zvyazkovyi', async () => {
      await expect(service.remove('kurin-1', 'ann-1', OTHER_KURIN_ZVYAZKOVYI)).rejects.toThrow(NotFoundException);
      expect(prisma.announcement.delete).not.toHaveBeenCalled();
    });
  });

  describe('uploadImage', () => {
    it('rejects a non-image buffer regardless of claimed mimetype', async () => {
      const notAnImage = Buffer.from('not an image');

      await expect(
        service.uploadImage('kurin-1', { buffer: notAnImage, mimetype: 'image/png' } as Express.Multer.File, PYSAR),
      ).rejects.toThrow('Файл не є дійсним зображенням');
      expect(prisma.announcementImage.create).not.toHaveBeenCalled();
    });

    it('stores a real PNG under the kurin and uploader, ignoring the claimed mimetype', async () => {
      const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
      prisma.announcementImage.create.mockResolvedValue({ id: 'img-1' });

      const result = await service.uploadImage(
        'kurin-1',
        { buffer: pngSignature, mimetype: 'application/octet-stream' } as Express.Multer.File,
        PYSAR,
      );

      expect(prisma.announcementImage.create).toHaveBeenCalledWith({
        data: { kurinId: 'kurin-1', uploaderId: 'pysar-1', data: pngSignature, mimeType: 'image/png' },
      });
      expect(result).toEqual({ id: 'img-1' });
    });

    it('rejects a plain junak (not писар/звʼязковий)', async () => {
      const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

      await expect(
        service.uploadImage('kurin-1', { buffer: pngSignature, mimetype: 'image/png' } as Express.Multer.File, PLAIN_JUNAK),
      ).rejects.toThrow(ForbiddenException);
    });

    it('404s when the route kurinId does not match the actor kurinId, even for a writer', async () => {
      const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

      await expect(
        service.uploadImage('kurin-1', { buffer: pngSignature, mimetype: 'image/png' } as Express.Multer.File, OTHER_KURIN_ZVYAZKOVYI),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.announcementImage.create).not.toHaveBeenCalled();
    });
  });

  describe('getImage', () => {
    it("returns the image's bytes and mimetype when it belongs to the actor's kurin", async () => {
      prisma.announcementImage.findUnique.mockResolvedValue({
        id: 'img-1',
        kurinId: 'kurin-1',
        data: Buffer.from('abc'),
        mimeType: 'image/png',
      });

      const result = await service.getImage('kurin-1', 'img-1', PLAIN_JUNAK);

      expect(result).toEqual({ data: Buffer.from('abc'), mimeType: 'image/png' });
    });

    it('returns null for an image belonging to a different kurin', async () => {
      prisma.announcementImage.findUnique.mockResolvedValue({ id: 'img-1', kurinId: 'some-other-kurin' });

      expect(await service.getImage('kurin-1', 'img-1', PLAIN_JUNAK)).toBeNull();
    });

    it('returns null for a non-existent image id', async () => {
      prisma.announcementImage.findUnique.mockResolvedValue(null);

      expect(await service.getImage('kurin-1', 'missing', PLAIN_JUNAK)).toBeNull();
    });

    it('404s when the route kurinId does not match the actor kurinId, before any DB lookup', async () => {
      await expect(service.getImage('kurin-1', 'img-1', OTHER_KURIN_ZVYAZKOVYI)).rejects.toThrow(NotFoundException);
      expect(prisma.announcementImage.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('setReaction', () => {
    it('upserts the reaction, one per (announcement, user)', async () => {
      prisma.announcement.findUnique.mockResolvedValue({ id: 'ann-1', kurinId: 'kurin-1' });

      await service.setReaction('kurin-1', 'ann-1', 'HEART' as any, PLAIN_JUNAK);

      expect(prisma.announcementReaction.upsert).toHaveBeenCalledWith({
        where: { announcementId_userId: { announcementId: 'ann-1', userId: 'junak-1' } },
        create: { announcementId: 'ann-1', userId: 'junak-1', emoji: 'HEART' },
        update: { emoji: 'HEART' },
      });
    });

    it('404s reacting to an announcement from a different kurin', async () => {
      prisma.announcement.findUnique.mockResolvedValue({ id: 'ann-1', kurinId: 'some-other-kurin' });

      await expect(service.setReaction('kurin-1', 'ann-1', 'HEART' as any, PLAIN_JUNAK)).rejects.toThrow(NotFoundException);
    });

    it('404s when the route kurinId does not match the actor kurinId', async () => {
      await expect(service.setReaction('kurin-1', 'ann-1', 'HEART' as any, OTHER_KURIN_JUNAK)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.announcementReaction.upsert).not.toHaveBeenCalled();
    });
  });

  describe('removeReaction', () => {
    it("removes only the actor's own reaction", async () => {
      await service.removeReaction('kurin-1', 'ann-1', PLAIN_JUNAK);

      expect(prisma.announcementReaction.deleteMany).toHaveBeenCalledWith({
        where: { announcementId: 'ann-1', userId: 'junak-1' },
      });
    });

    it('404s when the route kurinId does not match the actor kurinId', async () => {
      await expect(service.removeReaction('kurin-1', 'ann-1', OTHER_KURIN_JUNAK)).rejects.toThrow(NotFoundException);
      expect(prisma.announcementReaction.deleteMany).not.toHaveBeenCalled();
    });
  });
});
