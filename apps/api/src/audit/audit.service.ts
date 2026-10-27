import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AUDIT_GROUPS } from './audit.constants';
import { personLabel } from './audit.util';
import { ListAuditLogDto } from './dto/list-audit-log.dto';

export interface AuditEvent {
  kurinId: string;
  actorId: string | null;
  action: AuditAction;
  subjectUserId?: string | null;
  entityId?: string | null;
  details?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Never throws: a failed audit write must not break the action that already succeeded. */
  async record(event: AuditEvent): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          kurinId: event.kurinId,
          actorId: event.actorId,
          action: event.action,
          subjectUserId: event.subjectUserId,
          entityId: event.entityId,
          details: event.details as Prisma.InputJsonValue | undefined,
        },
      });
    } catch (error) {
      this.logger.error(`Failed to record audit event ${event.action}: ${(error as Error).message}`);
    }
  }

  async list(kurinId: string, dto: ListAuditLogDto) {
    const limit = dto.limit ?? 50;
    const where: Prisma.AuditLogWhereInput = { kurinId };
    if (dto.group) where.action = { in: AUDIT_GROUPS[dto.group] };
    if (dto.actorId) where.actorId = dto.actorId;
    if (dto.subjectUserId) where.subjectUserId = dto.subjectUserId;
    if (dto.from || dto.to) {
      where.createdAt = {
        ...(dto.from ? { gte: new Date(dto.from) } : {}),
        // `to` is a date: include the whole day.
        ...(dto.to ? { lt: new Date(new Date(dto.to).getTime() + 24 * 60 * 60 * 1000) } : {}),
      };
    }
    if (dto.cursor) {
      const [createdAtIso, id] = dto.cursor.split('|');
      const cursorDate = new Date(createdAtIso);
      if (!id || Number.isNaN(cursorDate.getTime())) {
        throw new BadRequestException('Недійсний курсор');
      }
      where.AND = [
        {
          OR: [{ createdAt: { lt: cursorDate } }, { createdAt: cursorDate, id: { lt: id } }],
        },
      ];
    }

    const rows = await this.prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: { actor: { select: { id: true, firstName: true, lastName: true, nickname: true } } },
    });
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      items: page.map((row) => ({
        id: row.id,
        action: row.action,
        createdAt: row.createdAt.toISOString(),
        actor: row.actor ? { id: row.actor.id, name: personLabel(row.actor) } : null,
        subjectUserId: row.subjectUserId,
        entityId: row.entityId,
        details: row.details as Record<string, unknown> | null,
      })),
      nextCursor: rows.length > limit && last ? `${last.createdAt.toISOString()}|${last.id}` : null,
    };
  }
}
