import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { CreateKurinDto } from './dto/create-kurin.dto';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';

@Injectable()
export class KurinsAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

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
    const kurinNumber = dto.kurinNumber ?? (await this.nextPreparatoryNumber());
    return this.prisma.kurin.create({ data: { ...dto, kurinNumber } });
  }

  private async nextPreparatoryNumber(): Promise<string> {
    const preparatoryKurins = await this.prisma.kurin.findMany({
      where: { kurinNumber: { startsWith: 'П-' } },
      select: { kurinNumber: true },
    });
    const highestExisting = preparatoryKurins.reduce((max, k) => {
      const n = parseInt(k.kurinNumber.slice(2), 10);
      return Number.isFinite(n) && n > max ? n : max;
    }, 0);
    return `П-${highestExisting + 1}`;
  }

  async createFirstZvyazkovyi(dto: CreateAdminUserDto) {
    const kurin = await this.prisma.kurin.findUnique({ where: { id: dto.kurinId } });
    if (!kurin) {
      throw new NotFoundException('Kurin not found');
    }
    const passwordHash = await this.authService.hashPassword(dto.password);
    return this.prisma.user.create({
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        passwordHash,
        role: Role.ZVYAZKOVYI,
        kurinId: dto.kurinId,
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
  }
}
