import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PositionType, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { CreateHurtokDto } from './dto/create-hurtok.dto';
import { UpdateHurtokDto } from './dto/update-hurtok.dto';
import { USER_SELECT } from '../users/user-select.const';
import { generateUniqueSlug } from './slug.util';

@Injectable()
export class HurtkyService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateHurtokDto, kurinId: string) {
    const slug = await generateUniqueSlug(this.prisma, kurinId, dto.name);
    return this.prisma.hurtok.create({ data: { name: dto.name, number: dto.number, kurinId, slug } });
  }

  async update(hurtokId: string, dto: UpdateHurtokDto, actor: CurrentUserPayload) {
    if (actor.role !== Role.ZVYAZKOVYI && !actor.positions.includes(PositionType.SUDDIA)) {
      throw new ForbiddenException('Insufficient permissions');
    }
    const hurtok = await this.prisma.hurtok.findUnique({ where: { id: hurtokId } });
    if (!hurtok || hurtok.kurinId !== actor.kurinId) {
      throw new NotFoundException('Hurtok not found in this kurin');
    }
    return this.prisma.hurtok.update({
      where: { id: hurtokId },
      data: { foundedAt: dto.foundedAt ? new Date(dto.foundedAt) : null },
    });
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
    return this.prisma.hurtok.update({
      where: { id: hurtokId },
      data: { archivedAt: new Date(), archivedById: actor.userId },
    });
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
      select: USER_SELECT,
    });
    const vykhovnykAssignments = await this.prisma.vykhovnykHurtok.findMany({
      where: { hurtokId: hurtok.id },
      include: { vykhovnyk: { select: USER_SELECT } },
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
