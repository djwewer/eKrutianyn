import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateContactInfoDto } from './dto/update-contact-info.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  async create(dto: CreateUserDto, actorKurinId: string) {
    if (dto.role === Role.ZVYAZKOVYI) {
      throw new BadRequestException('Cannot self-service create another zvyazkovyi');
    }
    if (dto.role === Role.JUNAK && !dto.hurtokId) {
      throw new BadRequestException('hurtokId is required for JUNAK role');
    }
    if (dto.hurtokId) {
      const hurtok = await this.prisma.hurtok.findUnique({ where: { id: dto.hurtokId } });
      if (!hurtok || hurtok.kurinId !== actorKurinId) {
        throw new NotFoundException('Hurtok not found in this kurin');
      }
    }
    const passwordHash = dto.password ? await this.authService.hashPassword(dto.password) : undefined;
    return this.prisma.user.create({
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        role: dto.role,
        passwordHash,
        kurinId: actorKurinId,
        hurtokId: dto.hurtokId,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        nickname: true,
        email: true,
        role: true,
        birthDate: true,
        kurinId: true,
        hurtokId: true,
      },
    });
  }

  async updateContactInfo(junakId: string, dto: UpdateContactInfoDto, actorKurinId: string) {
    const junak = await this.prisma.user.findUnique({ where: { id: junakId } });
    if (!junak || junak.role !== Role.JUNAK || junak.kurinId !== actorKurinId) {
      throw new NotFoundException('Junak not found');
    }
    return this.prisma.user.update({
      where: { id: junakId },
      data: { notes: dto.notes, phone: dto.phone },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        nickname: true,
        email: true,
        role: true,
        birthDate: true,
        kurinId: true,
        hurtokId: true,
        notes: true,
        phone: true,
      },
    });
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        nickname: true,
        email: true,
        role: true,
        birthDate: true,
        kurinId: true,
        hurtokId: true,
      },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async list(actor: CurrentUserPayload, filters: { role?: Role; hurtokId?: string }) {
    if (actor.role === Role.JUNAK) {
      throw new ForbiddenException('Junak cannot list users');
    }
    if (filters.role === Role.VYKHOVNYK && actor.role !== Role.ZVYAZKOVYI) {
      throw new ForbiddenException('Only zvyazkovyi can list vykhovnyky');
    }
    if (filters.hurtokId) {
      const hurtok = await this.prisma.hurtok.findUnique({ where: { id: filters.hurtokId } });
      if (!hurtok || hurtok.kurinId !== actor.kurinId) {
        throw new NotFoundException('Hurtok not found in this kurin');
      }
    }

    const select = {
      id: true,
      firstName: true,
      lastName: true,
      nickname: true,
      email: true,
      role: true,
      birthDate: true,
      kurinId: true,
      hurtokId: true,
    };

    if (actor.role === Role.VYKHOVNYK) {
      const assignments = await this.prisma.vykhovnykHurtok.findMany({
        where: { vykhovnykId: actor.userId },
        select: { hurtokId: true },
      });
      const assignedHurtokIds = assignments.map((a) => a.hurtokId);

      if (filters.hurtokId) {
        if (!assignedHurtokIds.includes(filters.hurtokId)) {
          throw new NotFoundException('Hurtok not found in this kurin');
        }
        return this.prisma.user.findMany({
          where: { kurinId: actor.kurinId, role: Role.JUNAK, hurtokId: filters.hurtokId },
          select,
        });
      }

      return this.prisma.user.findMany({
        where: {
          kurinId: actor.kurinId,
          role: Role.JUNAK,
          OR: [{ hurtokId: { in: assignedHurtokIds } }, { hurtokId: null }],
        },
        select,
      });
    }

    if (actor.role === Role.KURINNYI) {
      return this.prisma.user.findMany({
        where: {
          kurinId: actor.kurinId,
          role: Role.JUNAK,
          ...(filters.hurtokId ? { hurtokId: filters.hurtokId } : {}),
        },
        select,
      });
    }

    return this.prisma.user.findMany({
      where: {
        kurinId: actor.kurinId,
        role: filters.role ?? { in: [Role.JUNAK, Role.VYKHOVNYK] },
        ...(filters.hurtokId ? { hurtokId: filters.hurtokId } : {}),
      },
      select,
    });
  }

  async findScoped(id: string, actor: CurrentUserPayload) {
    if (actor.role === Role.JUNAK) {
      if (actor.userId !== id) {
        throw new NotFoundException('User not found');
      }
      return this.findById(id);
    }

    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        nickname: true,
        email: true,
        role: true,
        birthDate: true,
        kurinId: true,
        hurtokId: true,
      },
    });
    if (!user || user.kurinId !== actor.kurinId) {
      throw new NotFoundException('User not found');
    }

    const visible = await this.isVisibleTo(actor, user);
    if (!visible) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  private async isVisibleTo(
    actor: CurrentUserPayload,
    target: { role: Role; hurtokId: string | null },
  ): Promise<boolean> {
    if (actor.role === Role.ZVYAZKOVYI) {
      return target.role === Role.JUNAK || target.role === Role.VYKHOVNYK;
    }
    if (actor.role === Role.KURINNYI) {
      return target.role === Role.JUNAK;
    }
    if (actor.role === Role.VYKHOVNYK) {
      if (target.role !== Role.JUNAK) return false;
      if (target.hurtokId === null) return true;
      const assigned = await this.prisma.vykhovnykHurtok.findFirst({
        where: { vykhovnykId: actor.userId, hurtokId: target.hurtokId },
      });
      return !!assigned;
    }
    return false;
  }
}
