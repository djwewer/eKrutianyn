import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PositionType, ReactionEmoji, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';
import { detectSafeImageMimeType } from '../common/image-sniff.util';
import { PushNotificationsService } from '../push-notifications/push-notifications.service';

@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pushNotifications: PushNotificationsService,
  ) {}

  private assertKurinMatches(kurinId: string, actor: CurrentUserPayload) {
    if (kurinId !== actor.kurinId) {
      throw new NotFoundException('Kurin not found');
    }
  }

  // Every authenticated kurin member can read and react — only
  // publish/edit/delete is gated to писар/звʼязковий (assertCanWrite).
  private assertCanWrite(actor: CurrentUserPayload) {
    if (actor.role !== Role.ZVYAZKOVYI && !actor.positions.includes(PositionType.PYSAR)) {
      throw new ForbiddenException('Insufficient role');
    }
  }

  // Not a full ProseMirror schema validation — just enough to block the
  // obviously-malformed cases (e.g. `{}`, or a document built against some
  // other schema) that would otherwise crash generateHTML() client-side for
  // every viewer of the feed.
  private assertValidContent(content: Record<string, unknown>) {
    if ((content as { type?: unknown }).type !== 'doc') {
      throw new BadRequestException('Невалідний вміст оголошення');
    }
  }

  async list(kurinId: string, actor: CurrentUserPayload) {
    this.assertKurinMatches(kurinId, actor);
    return this.prisma.announcement.findMany({
      where: { kurinId },
      orderBy: { createdAt: 'desc' },
      include: {
        author: { select: { firstName: true, lastName: true } },
        images: { select: { id: true } },
        reactions: { select: { userId: true, emoji: true } },
      },
    });
  }

  async create(kurinId: string, dto: CreateAnnouncementDto, actor: CurrentUserPayload) {
    this.assertKurinMatches(kurinId, actor);
    this.assertCanWrite(actor);
    this.assertValidContent(dto.content);
    const announcement = await this.prisma.announcement.create({
      data: {
        kurinId,
        authorId: actor.userId,
        title: dto.title,
        content: dto.content as Prisma.InputJsonValue,
      },
    });
    if (dto.imageIds.length > 0) {
      await this.prisma.announcementImage.updateMany({
        // announcementId: null restricts this to images not yet linked to
        // any announcement, so an image id from another (already-published)
        // announcement can't be re-claimed by resending its id.
        where: { id: { in: dto.imageIds }, kurinId, announcementId: null },
        data: { announcementId: announcement.id },
      });
    }
    await this.pushNotifications.sendToKurin(kurinId, {
      title: 'Нове оголошення',
      body: announcement.title,
      url: '/news',
    });
    return announcement;
  }

  async update(kurinId: string, id: string, dto: UpdateAnnouncementDto, actor: CurrentUserPayload) {
    this.assertKurinMatches(kurinId, actor);
    this.assertCanWrite(actor);
    await this.findOrThrow(kurinId, id);
    this.assertValidContent(dto.content);
    const updated = await this.prisma.announcement.update({
      where: { id },
      data: { title: dto.title, content: dto.content as Prisma.InputJsonValue },
    });
    if (dto.imageIds.length > 0) {
      await this.prisma.announcementImage.updateMany({
        where: { id: { in: dto.imageIds }, kurinId, announcementId: null },
        data: { announcementId: id },
      });
    }
    return updated;
  }

  async remove(kurinId: string, id: string, actor: CurrentUserPayload) {
    this.assertKurinMatches(kurinId, actor);
    this.assertCanWrite(actor);
    await this.findOrThrow(kurinId, id);
    await this.prisma.announcement.delete({ where: { id } });
    return { success: true };
  }

  async uploadImage(kurinId: string, file: Express.Multer.File, actor: CurrentUserPayload) {
    this.assertKurinMatches(kurinId, actor);
    this.assertCanWrite(actor);
    const detectedMimeType = detectSafeImageMimeType(file.buffer);
    if (!detectedMimeType) {
      throw new BadRequestException('Файл не є дійсним зображенням (JPEG, PNG, WebP або GIF)');
    }
    return this.prisma.announcementImage.create({
      data: { kurinId, uploaderId: actor.userId, data: file.buffer, mimeType: detectedMimeType },
    });
  }

  async getImage(
    kurinId: string,
    imageId: string,
    actor: CurrentUserPayload,
  ): Promise<{ data: Buffer; mimeType: string } | null> {
    this.assertKurinMatches(kurinId, actor);
    const image = await this.prisma.announcementImage.findUnique({ where: { id: imageId } });
    if (!image || image.kurinId !== kurinId) {
      return null;
    }
    return { data: image.data as Buffer, mimeType: image.mimeType };
  }

  async setReaction(kurinId: string, announcementId: string, emoji: ReactionEmoji, actor: CurrentUserPayload) {
    this.assertKurinMatches(kurinId, actor);
    await this.findOrThrow(kurinId, announcementId);
    return this.prisma.announcementReaction.upsert({
      where: { announcementId_userId: { announcementId, userId: actor.userId } },
      create: { announcementId, userId: actor.userId, emoji },
      update: { emoji },
    });
  }

  async removeReaction(kurinId: string, announcementId: string, actor: CurrentUserPayload) {
    this.assertKurinMatches(kurinId, actor);
    await this.prisma.announcementReaction.deleteMany({
      where: { announcementId, userId: actor.userId },
    });
    return { success: true };
  }

  private async findOrThrow(kurinId: string, id: string) {
    const announcement = await this.prisma.announcement.findUnique({ where: { id } });
    if (!announcement || announcement.kurinId !== kurinId) {
      throw new NotFoundException('Announcement not found');
    }
    return announcement;
  }
}
