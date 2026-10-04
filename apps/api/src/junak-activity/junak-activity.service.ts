import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateActivityEntryDto } from './dto/create-activity-entry.dto';
import { UpdateActivityEntryDto } from './dto/update-activity-entry.dto';

@Injectable()
export class JunakActivityService {
  constructor(private readonly prisma: PrismaService) {}

  list(junakId: string) {
    return this.prisma.junakActivityEntry.findMany({
      where: { junakId },
      orderBy: { occurredAt: 'desc' },
    });
  }

  create(junakId: string, dto: CreateActivityEntryDto) {
    return this.prisma.junakActivityEntry.create({
      data: {
        junakId,
        title: dto.title,
        occurredAt: new Date(dto.occurredAt),
        role: dto.role,
        description: dto.description,
      },
    });
  }

  async update(junakId: string, entryId: string, dto: UpdateActivityEntryDto) {
    await this.findOwnedOrThrow(junakId, entryId);
    return this.prisma.junakActivityEntry.update({
      where: { id: entryId },
      data: {
        title: dto.title,
        occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : undefined,
        role: dto.role,
        description: dto.description,
      },
    });
  }

  async remove(junakId: string, entryId: string) {
    await this.findOwnedOrThrow(junakId, entryId);
    await this.prisma.junakActivityEntry.delete({ where: { id: entryId } });
    return { success: true };
  }

  private async findOwnedOrThrow(junakId: string, entryId: string) {
    const entry = await this.prisma.junakActivityEntry.findUnique({ where: { id: entryId } });
    // Same 404 whether the entry doesn't exist at all or belongs to someone
    // else — this is a junak's own private log, not something to confirm
    // the existence of to another account.
    if (!entry || entry.junakId !== junakId) {
      throw new NotFoundException('Activity entry not found');
    }
    return entry;
  }
}
