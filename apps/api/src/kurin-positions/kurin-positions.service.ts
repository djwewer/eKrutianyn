import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PositionScope, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { USER_SELECT } from '../users/user-select.const';
import { AssignPositionDto } from './dto/assign-position.dto';
import { KURIN_POSITIONS, HURTOK_POSITIONS } from './position-rules';

@Injectable()
export class KurinPositionsService {
  constructor(private readonly prisma: PrismaService) {}

  list(kurinId: string) {
    return this.prisma.kurinPosition.findMany({
      where: { kurinId, removedAt: null },
      select: {
        id: true,
        scope: true,
        positionType: true,
        hurtokId: true,
        assignedAt: true,
        user: { select: USER_SELECT },
      },
      orderBy: [{ scope: 'asc' }, { positionType: 'asc' }],
    });
  }

  async assign(dto: AssignPositionDto, actor: CurrentUserPayload) {
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
      const hurtok = await this.prisma.hurtok.findUnique({ where: { id: dto.hurtokId } });
      if (!hurtok || hurtok.kurinId !== actor.kurinId) {
        throw new NotFoundException('Hurtok not found in this kurin');
      }
    }

    const target = await this.prisma.user.findUnique({ where: { id: dto.userId } });
    if (!target || target.role !== Role.JUNAK || target.kurinId !== actor.kurinId) {
      throw new NotFoundException('Junak not found in this kurin');
    }
    if (dto.scope === PositionScope.HURTOK && target.hurtokId !== dto.hurtokId) {
      throw new BadRequestException('This junak does not belong to that hurtok');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.kurinPosition.updateMany({
        where: {
          kurinId: actor.kurinId,
          scope: dto.scope,
          positionType: dto.positionType,
          hurtokId: dto.hurtokId ?? null,
          removedAt: null,
        },
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
          user: { select: USER_SELECT },
        },
      });
    });
  }

  async remove(id: string, actor: CurrentUserPayload) {
    const position = await this.prisma.kurinPosition.findUnique({ where: { id } });
    if (!position || position.kurinId !== actor.kurinId || position.removedAt) {
      throw new NotFoundException('Position not found');
    }
    await this.prisma.kurinPosition.update({
      where: { id },
      data: { removedAt: new Date(), removedById: actor.userId },
    });
    return { success: true };
  }
}
