import { Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { CreateHurtokDto } from './dto/create-hurtok.dto';
import { USER_SELECT } from '../users/user-select.const';
import { generateUniqueSlug } from './slug.util';

@Injectable()
export class HurtkyService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateHurtokDto, kurinId: string) {
    const slug = await generateUniqueSlug(this.prisma, kurinId, dto.name);
    return this.prisma.hurtok.create({ data: { name: dto.name, number: dto.number, kurinId, slug } });
  }

  listForKurin(kurinId: string) {
    return this.prisma.hurtok.findMany({ where: { kurinId } });
  }

  async getMembersBySlug(slug: string, actor: CurrentUserPayload) {
    const hurtok = await this.prisma.hurtok.findFirst({ where: { kurinId: actor.kurinId, slug } });
    if (!hurtok) {
      throw new NotFoundException('Hurtok not found in this kurin');
    }

    if (actor.role === Role.VYKHOVNYK) {
      const assigned = await this.prisma.vykhovnykHurtok.findFirst({
        where: { vykhovnykId: actor.userId, hurtokId: hurtok.id },
      });
      if (!assigned) {
        throw new NotFoundException('Hurtok not found in this kurin');
      }
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
      hurtok: { id: hurtok.id, name: hurtok.name, slug: hurtok.slug, number: hurtok.number },
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
