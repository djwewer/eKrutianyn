import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PositionType, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';

@Injectable()
export class AnnouncementsService {
  constructor(private readonly prisma: PrismaService) {}

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
        where: { id: { in: dto.imageIds }, kurinId },
        data: { announcementId: announcement.id },
      });
    }
    return announcement;
  }

  async update(kurinId: string, id: string, dto: UpdateAnnouncementDto, actor: CurrentUserPayload) {
    this.assertKurinMatches(kurinId, actor);
    this.assertCanWrite(actor);
    await this.findOrThrow(kurinId, id);
    const updated = await this.prisma.announcement.update({
      where: { id },
      data: { title: dto.title, content: dto.content as Prisma.InputJsonValue },
    });
    if (dto.imageIds.length > 0) {
      await this.prisma.announcementImage.updateMany({
        where: { id: { in: dto.imageIds }, kurinId },
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

  private async findOrThrow(kurinId: string, id: string) {
    const announcement = await this.prisma.announcement.findUnique({ where: { id } });
    if (!announcement || announcement.kurinId !== kurinId) {
      throw new NotFoundException('Announcement not found');
    }
    return announcement;
  }
}
