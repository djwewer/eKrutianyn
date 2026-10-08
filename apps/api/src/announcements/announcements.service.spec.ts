import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AnnouncementsService } from './announcements.service';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';

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

describe('AnnouncementsService', () => {
  let service: AnnouncementsService;
  let prisma: {
    announcement: { findMany: jest.Mock; create: jest.Mock; update: jest.Mock; delete: jest.Mock; findUnique: jest.Mock };
    announcementImage: { updateMany: jest.Mock };
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
      announcementImage: { updateMany: jest.fn() },
    };
    service = new AnnouncementsService(prisma as unknown as PrismaService);
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
  });
});
