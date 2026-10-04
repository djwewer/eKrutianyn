import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { CreateCalendarEventDto } from './dto/create-calendar-event.dto';
import { UpdateCalendarEventDto } from './dto/update-calendar-event.dto';

@Injectable()
export class KurinCalendarService {
  constructor(private readonly prisma: PrismaService) {}

  private assertKurinMatches(kurinId: string, actor: CurrentUserPayload) {
    if (kurinId !== actor.kurinId) {
      throw new NotFoundException('Kurin not found');
    }
  }

  // Everyone in the kurin can see the shared plan — this is a calendar
  // meant to be looked at, not a privileged record like Скарбниця.
  private assertCanWrite(actor: CurrentUserPayload) {
    if (actor.role !== 'ZVYAZKOVYI' && !actor.isKurinniy) {
      throw new ForbiddenException('Insufficient role');
    }
  }

  async list(kurinId: string, actor: CurrentUserPayload) {
    this.assertKurinMatches(kurinId, actor);
    return this.prisma.kurinCalendarEvent.findMany({
      where: { kurinId },
      orderBy: { startDate: 'asc' },
    });
  }

  async create(kurinId: string, dto: CreateCalendarEventDto, actor: CurrentUserPayload) {
    this.assertKurinMatches(kurinId, actor);
    this.assertCanWrite(actor);
    return this.prisma.kurinCalendarEvent.create({
      data: {
        kurinId,
        title: dto.title,
        description: dto.description,
        startDate: new Date(dto.startDate),
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        createdById: actor.userId,
      },
    });
  }

  async update(kurinId: string, eventId: string, dto: UpdateCalendarEventDto, actor: CurrentUserPayload) {
    this.assertKurinMatches(kurinId, actor);
    this.assertCanWrite(actor);
    await this.findOrThrow(kurinId, eventId);
    return this.prisma.kurinCalendarEvent.update({
      where: { id: eventId },
      data: {
        title: dto.title,
        description: dto.description,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      },
    });
  }

  async remove(kurinId: string, eventId: string, actor: CurrentUserPayload) {
    this.assertKurinMatches(kurinId, actor);
    this.assertCanWrite(actor);
    await this.findOrThrow(kurinId, eventId);
    await this.prisma.kurinCalendarEvent.delete({ where: { id: eventId } });
    return { success: true };
  }

  private async findOrThrow(kurinId: string, eventId: string) {
    const event = await this.prisma.kurinCalendarEvent.findUnique({ where: { id: eventId } });
    if (!event || event.kurinId !== kurinId) {
      throw new NotFoundException('Event not found');
    }
    return event;
  }
}
