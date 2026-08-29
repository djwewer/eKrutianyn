import { Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { CreateHurtokDto } from './dto/create-hurtok.dto';
import { USER_SELECT } from '../users/user-select.const';

@Injectable()
export class HurtkyService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateHurtokDto, kurinId: string) {
    return this.prisma.hurtok.create({ data: { name: dto.name, number: dto.number, kurinId } });
  }

  listForKurin(kurinId: string) {
    return this.prisma.hurtok.findMany({ where: { kurinId } });
  }

  async getBoard(hurtokId: string, actor: CurrentUserPayload) {
    const hurtok = await this.prisma.hurtok.findUnique({ where: { id: hurtokId } });
    if (!hurtok || hurtok.kurinId !== actor.kurinId) {
      throw new NotFoundException('Hurtok not found in this kurin');
    }

    if (actor.role === Role.VYKHOVNYK) {
      const assigned = await this.prisma.vykhovnykHurtok.findFirst({
        where: { vykhovnykId: actor.userId, hurtokId },
      });
      if (!assigned) {
        throw new NotFoundException('Hurtok not found in this kurin');
      }
    }

    const junaky = await this.prisma.user.findMany({
      where: { hurtokId, role: Role.JUNAK, kurinId: actor.kurinId },
      select: USER_SELECT,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });

    const junakyWithProgress = await Promise.all(
      junaky.map(async (junak) => {
        const progress = await this.prisma.junakProgress.findMany({
          where: { junakId: junak.id },
          include: { point: true },
        });
        return { ...junak, progress };
      }),
    );

    return {
      hurtok: { id: hurtok.id, name: hurtok.name, number: hurtok.number },
      junaky: junakyWithProgress,
    };
  }
}
