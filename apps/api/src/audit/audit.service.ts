import { Injectable, Logger } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

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
}
