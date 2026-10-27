import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, PositionType, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { personLabel } from '../audit/audit.util';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { AssignVykhovnykDto } from './dto/assign-vykhovnyk.dto';

@Injectable()
export class VykhovnykAssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async assign(dto: AssignVykhovnykDto, actor: CurrentUserPayload) {
    if (actor.role !== Role.ZVYAZKOVYI && !actor.positions.includes(PositionType.SUDDIA)) {
      throw new ForbiddenException('Insufficient permissions');
    }
    const [vykhovnyk, hurtok] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: dto.vykhovnykId } }),
      this.prisma.hurtok.findUnique({ where: { id: dto.hurtokId } }),
    ]);
    if (!vykhovnyk || vykhovnyk.role !== Role.VYKHOVNYK || vykhovnyk.kurinId !== actor.kurinId) {
      throw new NotFoundException('Vykhovnyk not found in this kurin');
    }
    if (!hurtok || hurtok.kurinId !== actor.kurinId) {
      throw new NotFoundException('Hurtok not found in this kurin');
    }
    if (vykhovnyk.archivedAt) {
      throw new BadRequestException('Виховник архівований');
    }
    let created;
    try {
      created = await this.prisma.vykhovnykHurtok.create({
        data: { vykhovnykId: dto.vykhovnykId, hurtokId: dto.hurtokId },
      });
    } catch (err: any) {
      if (err.code === 'P2002') {
        throw new ConflictException('This vykhovnyk is already assigned to this hurtok');
      }
      throw err;
    }
    await this.audit.record({
      kurinId: actor.kurinId,
      actorId: actor.userId,
      action: AuditAction.VYKHOVNYK_ASSIGNED,
      subjectUserId: vykhovnyk.id,
      entityId: hurtok.id,
      details: { subjectName: personLabel(vykhovnyk), hurtokName: hurtok.name },
    });
    return created;
  }

  async unassign(id: string, actor: CurrentUserPayload) {
    if (actor.role !== Role.ZVYAZKOVYI && !actor.positions.includes(PositionType.SUDDIA)) {
      throw new ForbiddenException('Insufficient permissions');
    }
    const assignment = await this.prisma.vykhovnykHurtok.findUnique({
      where: { id },
      include: { hurtok: true },
    });
    if (!assignment || assignment.hurtok.kurinId !== actor.kurinId) {
      throw new NotFoundException('Assignment not found');
    }
    const vykhovnyk = await this.prisma.user.findUnique({ where: { id: assignment.vykhovnykId } });
    await this.prisma.vykhovnykHurtok.delete({ where: { id } });
    await this.audit.record({
      kurinId: actor.kurinId,
      actorId: actor.userId,
      action: AuditAction.VYKHOVNYK_UNASSIGNED,
      subjectUserId: assignment.vykhovnykId,
      entityId: assignment.hurtokId,
      details: {
        subjectName: vykhovnyk ? personLabel(vykhovnyk) : null,
        hurtokName: assignment.hurtok.name,
      },
    });
    return { success: true };
  }

  async list(actor: CurrentUserPayload, hurtokId?: string) {
    if (hurtokId) {
      const hurtok = await this.prisma.hurtok.findUnique({ where: { id: hurtokId } });
      if (!hurtok || hurtok.kurinId !== actor.kurinId) {
        throw new NotFoundException('Hurtok not found in this kurin');
      }
    }

    if (actor.role === Role.VYKHOVNYK) {
      return this.prisma.vykhovnykHurtok.findMany({
        where: {
          vykhovnykId: actor.userId,
          ...(hurtokId ? { hurtokId } : {}),
        },
        orderBy: { id: 'asc' },
      });
    }

    return this.prisma.vykhovnykHurtok.findMany({
      where: {
        hurtok: { kurinId: actor.kurinId },
        ...(hurtokId ? { hurtokId } : {}),
      },
      orderBy: { id: 'asc' },
    });
  }
}
