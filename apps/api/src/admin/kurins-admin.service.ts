import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { CreateKurinDto } from './dto/create-kurin.dto';
import { UpdateKurinDto } from './dto/update-kurin.dto';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';

@Injectable()
export class KurinsAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  async listKurins() {
    const kurins = await this.prisma.kurin.findMany({
      orderBy: { kurinNumber: 'asc' },
      include: { _count: { select: { users: true, hurtky: true } } },
    });
    return kurins.map((k) => ({
      id: k.id,
      name: k.name,
      kurinNumber: k.kurinNumber,
      gender: k.gender,
      stanytsia: k.stanytsia,
      probyProgramId: k.probyProgramId,
      createdAt: k.createdAt,
      userCount: k._count.users,
      hurtokCount: k._count.hurtky,
    }));
  }

  async updateKurin(id: string, dto: UpdateKurinDto) {
    const kurin = await this.prisma.kurin.findUnique({ where: { id } });
    if (!kurin) {
      throw new NotFoundException('Kurin not found');
    }
    if (dto.kurinNumber && dto.kurinNumber !== kurin.kurinNumber) {
      const existing = await this.prisma.kurin.findUnique({ where: { kurinNumber: dto.kurinNumber } });
      if (existing) {
        throw new ConflictException('This kurin number is already in use');
      }
    }
    return this.prisma.kurin.update({
      where: { id },
      data: { name: dto.name, kurinNumber: dto.kurinNumber },
    });
  }

  async deleteKurin(id: string): Promise<void> {
    const kurin = await this.prisma.kurin.findUnique({
      where: { id },
      include: { _count: { select: { users: true, hurtky: true } } },
    });
    if (!kurin) {
      throw new NotFoundException('Kurin not found');
    }
    // Deleting a kurin with members or hurtky would either orphan them (FK
    // violation, since neither relation cascades) or silently delete people's
    // accounts along with it — neither is a safe default for an admin button.
    // The operator has to empty it out first (archive/move its members) so a
    // delete here is always an intentional, inert cleanup.
    if (kurin._count.users > 0 || kurin._count.hurtky > 0) {
      throw new ConflictException(
        'This kurin still has members or hurtky attached — remove or reassign them before deleting it',
      );
    }
    await this.prisma.kurin.delete({ where: { id } });
  }

  async createKurin(dto: CreateKurinDto) {
    const program = await this.prisma.probyProgram.findUnique({ where: { id: dto.probyProgramId } });
    if (!program) {
      throw new NotFoundException('Proby program not found');
    }
    if (dto.kurinNumber) {
      const existing = await this.prisma.kurin.findUnique({ where: { kurinNumber: dto.kurinNumber } });
      if (existing) {
        throw new ConflictException('This kurin number is already in use');
      }
    }
    const { zvyazkovyi, ...kurinFields } = dto;
    const passwordHash = await this.authService.hashPassword(zvyazkovyi.password);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const kurin = await tx.kurin.create({
          data: { ...kurinFields, kurinNumber: kurinFields.kurinNumber ?? null },
        });
        await tx.user.create({
          data: {
            firstName: zvyazkovyi.firstName,
            lastName: zvyazkovyi.lastName,
            email: zvyazkovyi.email,
            passwordHash,
            role: Role.ZVYAZKOVYI,
            kurinId: kurin.id,
            mustChangePassword: true,
          },
        });
        return kurin;
      });
    } catch (err: any) {
      if (err.code === 'P2002') {
        throw new ConflictException('This email is already in use');
      }
      throw err;
    }
  }

  async createFirstZvyazkovyi(dto: CreateAdminUserDto) {
    const kurin = await this.prisma.kurin.findUnique({ where: { id: dto.kurinId } });
    if (!kurin) {
      throw new NotFoundException('Kurin not found');
    }
    const existingZvyazkovyi = await this.prisma.user.findFirst({
      where: { kurinId: dto.kurinId, role: Role.ZVYAZKOVYI, archivedAt: null },
    });
    if (existingZvyazkovyi) {
      throw new ConflictException('This kurin already has an active Зв\'язковий');
    }
    const passwordHash = await this.authService.hashPassword(dto.password);
    try {
      return await this.prisma.user.create({
        data: {
          firstName: dto.firstName,
          lastName: dto.lastName,
          email: dto.email,
          passwordHash,
          role: Role.ZVYAZKOVYI,
          kurinId: dto.kurinId,
          mustChangePassword: true,
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          role: true,
          kurinId: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    } catch (err: any) {
      if (err.code === 'P2002') {
        throw new ConflictException('This email is already in use');
      }
      throw err;
    }
  }
}
