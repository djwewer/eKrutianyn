import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, PositionScope, PositionType, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { personLabel } from '../audit/audit.util';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { USER_SELECT_PUBLIC } from '../users/user-select.const';
import { AssignPositionDto } from './dto/assign-position.dto';
import { KURIN_POSITIONS, HURTOK_POSITIONS } from './position-rules';

@Injectable()
export class KurinPositionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(kurinId: string) {
    return this.prisma.kurinPosition.findMany({
      where: { kurinId, removedAt: null },
      select: {
        id: true,
        scope: true,
        positionType: true,
        hurtokId: true,
        assignedAt: true,
        user: { select: USER_SELECT_PUBLIC },
      },
      orderBy: [{ scope: 'asc' }, { positionType: 'asc' }],
    });
  }

  async assign(dto: AssignPositionDto, actor: CurrentUserPayload) {
    if (actor.role !== Role.ZVYAZKOVYI) {
      if (dto.scope === PositionScope.KURIN) {
        if (!actor.isKurinniy || dto.positionType === 'KURINNYI') {
          throw new ForbiddenException('Insufficient permissions to assign this position');
        }
        const targetHoldsKurinniy = await this.prisma.kurinPosition.findFirst({
          where: {
            userId: dto.userId,
            scope: PositionScope.KURIN,
            positionType: 'KURINNYI',
            removedAt: null,
          },
        });
        if (targetHoldsKurinniy) {
          throw new ForbiddenException('Cannot reassign the current Курінний to another position');
        }
      } else {
        if (!actor.positions.includes(PositionType.SUDDIA)) {
          throw new ForbiddenException('Insufficient permissions to assign this position');
        }
      }
    }
    let hurtok: { id: string; kurinId: string; name: string } | null = null;
    if (dto.scope === PositionScope.KURIN) {
      if (!KURIN_POSITIONS.includes(dto.positionType)) {
        throw new BadRequestException('This position is not valid at kurin scope');
      }
      if (dto.hurtokId) {
        throw new BadRequestException('hurtokId must not be set for a kurin-scoped position');
      }
    } else {
      if (!HURTOK_POSITIONS.includes(dto.positionType)) {
        throw new BadRequestException('This position is not valid at hurtok scope');
      }
      if (!dto.hurtokId) {
        throw new BadRequestException('hurtokId is required for a hurtok-scoped position');
      }
      hurtok = await this.prisma.hurtok.findUnique({ where: { id: dto.hurtokId } });
      if (!hurtok || hurtok.kurinId !== actor.kurinId) {
        throw new NotFoundException('Hurtok not found in this kurin');
      }
    }

    const target = await this.prisma.user.findUnique({ where: { id: dto.userId } });
    if (!target || target.role !== Role.JUNAK || target.kurinId !== actor.kurinId) {
      throw new NotFoundException('Junak not found in this kurin');
    }
    if (target.archivedAt) {
      throw new BadRequestException('Юнак архівований');
    }
    if (dto.scope === PositionScope.HURTOK && target.hurtokId !== dto.hurtokId) {
      throw new BadRequestException('This junak does not belong to that hurtok');
    }

    const replacedWhere = {
      kurinId: actor.kurinId,
      scope: dto.scope,
      removedAt: null,
      OR: [
        // the slot being filled, in case someone else currently holds it
        { positionType: dto.positionType, hurtokId: dto.hurtokId ?? null },
        // any other active position this junak holds in this scope
        { userId: dto.userId },
      ],
    };
    const replaced = await this.prisma.kurinPosition.findMany({
      where: replacedWhere,
      include: { user: true, hurtok: { select: { name: true } } },
    });

    const created = await this.prisma.$transaction(async (tx) => {
      await tx.kurinPosition.updateMany({
        where: replacedWhere,
        data: { removedAt: new Date(), removedById: actor.userId },
      });
      return tx.kurinPosition.create({
        data: {
          kurinId: actor.kurinId,
          hurtokId: dto.hurtokId,
          scope: dto.scope,
          positionType: dto.positionType,
          userId: dto.userId,
          assignedById: actor.userId,
        },
        select: {
          id: true,
          scope: true,
          positionType: true,
          hurtokId: true,
          assignedAt: true,
          user: { select: USER_SELECT_PUBLIC },
        },
      });
    });

    for (const old of replaced) {
      await this.audit.record({
        kurinId: actor.kurinId,
        actorId: actor.userId,
        action: AuditAction.POSITION_REMOVED,
        subjectUserId: old.userId,
        entityId: old.id,
        details: {
          subjectName: personLabel(old.user),
          positionType: old.positionType,
          scope: old.scope,
          hurtokName: old.hurtok?.name ?? null,
        },
      });
    }
    await this.audit.record({
      kurinId: actor.kurinId,
      actorId: actor.userId,
      action: AuditAction.POSITION_ASSIGNED,
      subjectUserId: dto.userId,
      entityId: created.id,
      details: {
        subjectName: personLabel(target),
        positionType: dto.positionType,
        scope: dto.scope,
        hurtokName: hurtok?.name ?? null,
      },
    });
    return created;
  }

  async remove(id: string, actor: CurrentUserPayload) {
    const position = await this.prisma.kurinPosition.findUnique({ where: { id } });
    if (!position || position.kurinId !== actor.kurinId || position.removedAt) {
      throw new NotFoundException('Position not found');
    }
    if (actor.role !== Role.ZVYAZKOVYI) {
      if (position.scope === PositionScope.KURIN) {
        if (!actor.isKurinniy || position.positionType === 'KURINNYI') {
          throw new ForbiddenException('Insufficient permissions to remove this position');
        }
      } else {
        if (!actor.positions.includes(PositionType.SUDDIA)) {
          throw new ForbiddenException('Insufficient permissions to remove this position');
        }
      }
    }
    const holder = await this.prisma.user.findUnique({ where: { id: position.userId } });
    const hurtok = position.hurtokId
      ? await this.prisma.hurtok.findUnique({ where: { id: position.hurtokId }, select: { name: true } })
      : null;
    await this.prisma.kurinPosition.update({
      where: { id },
      data: { removedAt: new Date(), removedById: actor.userId },
    });
    await this.audit.record({
      kurinId: actor.kurinId,
      actorId: actor.userId,
      action: AuditAction.POSITION_REMOVED,
      subjectUserId: position.userId,
      entityId: position.id,
      details: {
        subjectName: holder ? personLabel(holder) : null,
        positionType: position.positionType,
        scope: position.scope,
        hurtokName: hurtok?.name ?? null,
      },
    });
    return { success: true };
  }
}
