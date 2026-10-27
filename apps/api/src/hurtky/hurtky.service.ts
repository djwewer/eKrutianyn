import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, PositionType, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { CreateHurtokDto } from './dto/create-hurtok.dto';
import { UpdateHurtokDto } from './dto/update-hurtok.dto';
import { USER_SELECT_PUBLIC } from '../users/user-select.const';
import { generateUniqueSlug } from './slug.util';

@Injectable()
export class HurtkyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateHurtokDto, actor: CurrentUserPayload) {
    const kurinId = actor.kurinId;
    const slug = await generateUniqueSlug(this.prisma, kurinId, dto.name);
    const hurtok = await this.prisma.hurtok.create({ data: { name: dto.name, number: dto.number, kurinId, slug } });
    await this.audit.record({
      kurinId,
      actorId: actor.userId,
      action: AuditAction.HURTOK_CREATED,
      entityId: hurtok.id,
      details: { hurtokName: hurtok.name },
    });
    return hurtok;
  }

  async update(hurtokId: string, dto: UpdateHurtokDto, actor: CurrentUserPayload) {
    if (actor.role !== Role.ZVYAZKOVYI && !actor.positions.includes(PositionType.SUDDIA)) {
      throw new ForbiddenException('Insufficient permissions');
    }
    const hurtok = await this.prisma.hurtok.findUnique({ where: { id: hurtokId } });
    if (!hurtok || hurtok.kurinId !== actor.kurinId) {
      throw new NotFoundException('Hurtok not found in this kurin');
    }
    const updated = await this.prisma.hurtok.update({
      where: { id: hurtokId },
      data: { foundedAt: dto.foundedAt ? new Date(dto.foundedAt) : null },
    });
    await this.audit.record({
      kurinId: actor.kurinId,
      actorId: actor.userId,
      action: AuditAction.HURTOK_UPDATED,
      entityId: hurtokId,
      details: { hurtokName: updated.name, foundedAt: updated.foundedAt },
    });
    return updated;
  }

  async archiveHurtok(hurtokId: string, actor: CurrentUserPayload) {
    if (actor.role !== Role.ZVYAZKOVYI && !actor.positions.includes(PositionType.SUDDIA)) {
      throw new ForbiddenException('Insufficient permissions');
    }
    const hurtok = await this.prisma.hurtok.findUnique({ where: { id: hurtokId } });
    if (!hurtok || hurtok.kurinId !== actor.kurinId) {
      throw new NotFoundException('Hurtok not found in this kurin');
    }
    if (hurtok.archivedAt) {
      throw new BadRequestException('Уже архівовано');
    }
    const activeJunak = await this.prisma.user.findFirst({ where: { hurtokId } });
    if (activeJunak) {
      throw new BadRequestException('У гуртку ще є юнаки');
    }
    const activeVykhovnyk = await this.prisma.vykhovnykHurtok.findFirst({ where: { hurtokId } });
    if (activeVykhovnyk) {
      throw new BadRequestException('До гуртка ще прикріплені виховники');
    }
    const activePosition = await this.prisma.kurinPosition.findFirst({ where: { hurtokId, removedAt: null } });
    if (activePosition) {
      throw new BadRequestException('У гуртку є активна посада');
    }
    const archived = await this.prisma.hurtok.update({
      where: { id: hurtokId },
      data: { archivedAt: new Date(), archivedById: actor.userId },
    });
    await this.audit.record({
      kurinId: actor.kurinId,
      actorId: actor.userId,
      action: AuditAction.HURTOK_ARCHIVED,
      entityId: hurtokId,
      details: { hurtokName: archived.name },
    });
    return archived;
  }

  listForKurin(kurinId: string) {
    return this.prisma.hurtok.findMany({ where: { kurinId, archivedAt: null } });
  }

  async getMembersBySlug(slug: string, actor: CurrentUserPayload) {
    const hurtok = await this.prisma.hurtok.findFirst({ where: { kurinId: actor.kurinId, slug } });
    if (!hurtok) {
      throw new NotFoundException('Hurtok not found in this kurin');
    }

    const junaky = await this.prisma.user.findMany({
      where: { hurtokId: hurtok.id, role: Role.JUNAK, kurinId: actor.kurinId },
      select: USER_SELECT_PUBLIC,
    });
    const vykhovnykAssignments = await this.prisma.vykhovnykHurtok.findMany({
      where: { hurtokId: hurtok.id },
      include: { vykhovnyk: { select: USER_SELECT_PUBLIC } },
    });
    const vykhovnyky = vykhovnykAssignments.map((a) => a.vykhovnyk);

    const members = [...junaky, ...vykhovnyky].sort(
      (a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName),
    );

    const positions = await this.prisma.kurinPosition.findMany({
      where: { kurinId: actor.kurinId, removedAt: null, userId: { in: members.map((m) => m.id) } },
      select: { userId: true, positionType: true, scope: true, hurtokId: true },
    });
    const positionsByUserId = new Map<string, typeof positions>();
    for (const p of positions) {
      const list = positionsByUserId.get(p.userId) ?? [];
      list.push(p);
      positionsByUserId.set(p.userId, list);
    }

    return {
      hurtok: {
        id: hurtok.id,
        name: hurtok.name,
        slug: hurtok.slug,
        number: hurtok.number,
        foundedAt: hurtok.foundedAt,
        archivedAt: hurtok.archivedAt,
      },
      members: members.map((m) => ({
        ...m,
        positions: (positionsByUserId.get(m.id) ?? []).map((p) => ({
          positionType: p.positionType,
          scope: p.scope,
          hurtokId: p.hurtokId,
        })),
      })),
    };
  }
}
