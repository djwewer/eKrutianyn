import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { AssignVykhovnykDto } from './dto/assign-vykhovnyk.dto';

@Injectable()
export class VykhovnykAssignmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async assign(dto: AssignVykhovnykDto, actorKurinId: string) {
    const [vykhovnyk, hurtok] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: dto.vykhovnykId } }),
      this.prisma.hurtok.findUnique({ where: { id: dto.hurtokId } }),
    ]);
    if (!vykhovnyk || vykhovnyk.role !== Role.VYKHOVNYK || vykhovnyk.kurinId !== actorKurinId) {
      throw new NotFoundException('Vykhovnyk not found in this kurin');
    }
    if (!hurtok || hurtok.kurinId !== actorKurinId) {
      throw new NotFoundException('Hurtok not found in this kurin');
    }
    try {
      return await this.prisma.vykhovnykHurtok.create({
        data: { vykhovnykId: dto.vykhovnykId, hurtokId: dto.hurtokId },
      });
    } catch (err: any) {
      if (err.code === 'P2002') {
        throw new ConflictException('This vykhovnyk is already assigned to this hurtok');
      }
      throw err;
    }
  }

  async unassign(id: string, actorKurinId: string) {
    const assignment = await this.prisma.vykhovnykHurtok.findUnique({
      where: { id },
      include: { hurtok: true },
    });
    if (!assignment || assignment.hurtok.kurinId !== actorKurinId) {
      throw new NotFoundException('Assignment not found');
    }
    await this.prisma.vykhovnykHurtok.delete({ where: { id } });
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
      });
    }

    return this.prisma.vykhovnykHurtok.findMany({
      where: {
        hurtok: { kurinId: actor.kurinId },
        ...(hurtokId ? { hurtokId } : {}),
      },
    });
  }
}
